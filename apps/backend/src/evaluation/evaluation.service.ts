import { Prisma, prisma } from "@repo/db";
import { Evaluator, emptyEvaluation } from "./evaluator.js";
import type { LlmClient } from "../llm/llm.client.js";
import { stateSchema } from "../interview/schemas.js";
import { withInterviewLock } from "../interview/runtime-lock.js";
import { domainEvent, withTrace } from "../observability/events.js";
import { enqueue } from "../jobs/queue.js";
import { newId } from "../lib/ids.js";
import { readGithubContext } from "../github/context.js";

export class EvaluationService {
  private readonly evaluator: Evaluator;
  constructor(llm: LlmClient) {
    this.evaluator = new Evaluator(llm);
  }

  async finalize(
    interviewId: string,
  ): Promise<{ status: "completed" | "failed" | "pending" }> {
    const result = await prisma.evaluation.findUnique({
      where: { interviewId },
    });
    if (result?.status === "completed") return { status: "completed" };
    const interview = await prisma.interview.findUniqueOrThrow({
      where: { id: interviewId },
    });
    if (interview.status === "evaluation_failed") return { status: "failed" };
    await prisma.$transaction(async (tx) => {
      await tx.interview.updateMany({
        where: { id: interviewId, status: "active" },
        data: { status: "completing" },
      });
      await tx.interviewJob.upsert({
        where: { key: `END:${interviewId}` },
        create: {
          id: newId("job"),
          interviewId,
          kind: "END",
          key: `END:${interviewId}`,
          payload: { reason: "candidate_requested" },
        },
        update: {},
      });
    });
    return { status: "pending" };
  }

  async prepareFinalization(
    interviewId: string,
    reason = "completed",
  ): Promise<void> {
    await withInterviewLock(interviewId, async (token) => {
      const runtime = await prisma.interviewRuntime.findUniqueOrThrow({
        where: { interviewId },
      });
      const state = stateSchema.parse(runtime.data);
      state.ended = true;
      state.endReason ??= reason;
      state.phase = "FINAL";
      await prisma.$transaction(async (tx) => {
        const changed = await tx.interview.updateMany({
          where: { id: interviewId, status: { in: ["active", "completing"] } },
          data: { status: "completing" },
        });
        if (!changed.count) return;
        const saved = await tx.interviewRuntime.updateMany({
          where: { interviewId, leaseToken: token, version: runtime.version },
          data: {
            data: state as unknown as Prisma.InputJsonValue,
            version: { increment: 1 },
          },
        });
        if (!saved.count)
          throw new Error("Interview state changed during finalization");
        await tx.interviewSession.updateMany({
          where: { interviewId, status: { in: ["active", "created"] } },
          data: { status: "completed", endedAt: new Date() },
        });
        await tx.interviewJob.upsert({
          where: { key: `EVALUATE:${interviewId}` },
          create: {
            id: newId("job"),
            interviewId,
            kind: "EVALUATE",
            key: `EVALUATE:${interviewId}`,
            payload: {},
          },
          update: {},
        });
        await tx.interviewEvent.create({
          data: domainEvent(interviewId, "interview.ended", {
            reason: state.endReason,
          }),
        });
      });
    });
  }

  async evaluateAndStore(
    interviewId: string,
  ): Promise<{ status: "completed" }> {
    return withInterviewLock(interviewId, () =>
      this.runEvaluation(interviewId),
    );
  }
  private async runEvaluation(
    interviewId: string,
  ): Promise<{ status: "completed" }> {
    const previous = await prisma.evaluation.findUnique({
      where: { interviewId },
    });
    if (previous?.status === "completed") return { status: "completed" };
    const interview = await prisma.interview.findUniqueOrThrow({
      where: { id: interviewId },
      include: {
        knowledge: { select: { facts: true } },
        interviewPlan: true,
        runtime: true,
      },
    });
    if (interview.status !== "completing")
      throw new Error("Interview is not ready for evaluation");
    const state = stateSchema.parse(interview.runtime?.data);
    const turns = await prisma.conversationTurn.findMany({
      where: { interviewId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
    });
    const candidateIds = new Set(
      turns
        .filter((t) => t.role === "user" && t.analysisStatus === "completed")
        .map((t) => t.id),
    );
    const evidence = state.evidence
      .filter((e) => candidateIds.has(e.sourceTurnId))
      .slice(-80);
    const context = readGithubContext(interview.knowledge?.facts);
    const result = turns.some((t) => t.role === "user" && t.text.trim())
      ? await withTrace(interviewId, "evaluation", () =>
          this.evaluator.evaluate({
            projectContext: {
              owner: interview.owner,
              name: interview.name,
              projectSummary: context?.projectSummary.slice(0, 2500) ?? "",
              technologies: context?.technologies ?? [],
              architecture: JSON.stringify(context?.architecture ?? {}).slice(
                0,
                2500,
              ),
              importantFiles: [],
              evidence: [],
            },
            plan: {
              role: interview.interviewPlan?.role ?? "Software Engineer",
              difficulty: state.difficulty,
              topics: [],
              objectives: state.objectives.map((o) => ({
                id: o.id,
                topic: o.topic,
                description: o.description.slice(0, 200),
                status: o.status,
              })),
            },
            transcript: turns
              .map((t) => ({
                id: t.id,
                role:
                  t.role === "user"
                    ? ("user" as const)
                    : ("assistant" as const),
                text: t.text.slice(0, t.role === "user" ? 2000 : 500),
                questionId: t.questionId,
              }))
              .filter(
                ((budget) => (turn) => {
                  budget -= turn.text.length;
                  return budget >= 0;
                })(36000),
              ),
            candidateEvidence: evidence.map((e) => ({
              ...e,
              evidence: e.evidence.slice(0, 220),
            })),
            claims: state.claims
              .slice(-20)
              .map((c) => ({ ...c, statement: c.statement.slice(0, 250) })),
            skills: {},
            questionHistory: state.questions.map((q) => ({
              ...q,
              text: q.text.slice(0, 200),
            })),
          }),
        )
      : emptyEvaluation();
    await prisma.$transaction(async (tx) => {
      const data = { ...result, dimensions: { ...result.dimensions } };
      await tx.evaluation.upsert({
        where: { interviewId },
        create: { interviewId, ...data },
        update: { ...data, status: "completed" },
      });
      await tx.interview.update({
        where: { id: interviewId },
        data: {
          status: "completed",
          error: null,
          evaluationLeaseUntil: null,
          completedAt:
            interview.completedAt ?? previous?.createdAt ?? new Date(),
        },
      });
      state.phase = "COMPLETED";
      await tx.interviewRuntime.update({
        where: { interviewId },
        data: {
          data: state as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      await tx.interviewEvent.create({
        data: domainEvent(interviewId, "evaluation.completed", {
          score: result.score,
          evidenceCount: evidence.length,
        }),
      });
    });
    return { status: "completed" };
  }

  async retry(interviewId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.interview.updateMany({
        where: {
          id: interviewId,
          status: { in: ["evaluation_failed", "completed"] },
        },
        data: { status: "completing", error: null },
      });
      if (!changed.count) return;
      await tx.evaluation.updateMany({
        where: { interviewId },
        data: { status: "pending" },
      });
      const runtime = await tx.interviewRuntime.findUnique({
        where: { interviewId },
      });
      if (runtime) {
        const state = stateSchema.parse(runtime.data);
        state.phase = "FINAL";
        await tx.interviewRuntime.update({
          where: { interviewId },
          data: {
            data: state as unknown as Prisma.InputJsonValue,
            version: { increment: 1 },
          },
        });
      }
      await tx.interviewJob.updateMany({
        where: {
          interviewId,
          kind: { in: ["END", "EVALUATE"] },
          status: { in: ["failed", "completed"] },
        },
        data: {
          status: "pending",
          attempts: 0,
          runAt: new Date(),
          error: null,
        },
      });
    });
  }

  async finalizeExpired(reconnectSeconds = 300): Promise<void> {
    const now = new Date();
    const expired = await prisma.interview.findMany({
      where: {
        status: "active",
        OR: [
          { runtime: { deadlineAt: { lte: now } } },
          {
            sessions: {
              some: {
                disconnectedAt: {
                  lte: new Date(now.getTime() - reconnectSeconds * 1000),
                },
              },
            },
          },
        ],
      },
      select: { id: true },
      take: 50,
    });
    for (const row of expired)
      await enqueue(row.id, "END", undefined, {
        reason: "time_or_reconnect_limit",
      });
  }
}
