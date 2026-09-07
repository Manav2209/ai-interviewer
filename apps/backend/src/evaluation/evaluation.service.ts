import { interviewRepo } from "../db/repositories/interview.repo.js";
import { turnRepo } from "../db/repositories/turn.repo.js";
import { sessionRepo } from "../db/repositories/session.repo.js";
import { evaluationRepo, type EvaluationDimensions } from "../db/repositories/evaluation.repo.js";
import { Evaluator } from "./evaluator.js";
import type { LlmClient } from "../llm/llm.client.js";
import type { TurnRole } from "@prisma/client";

export class EvaluationService {
  private readonly evaluator: Evaluator;

  constructor(llm: LlmClient) {
    this.evaluator = new Evaluator(llm);
  }

  /**
   * Runs evaluation for a completed interview. Never throws for evaluation
   * failures — the interview result is preserved and the evaluation is stored
   * with status "failed" (retryable).
   */
  async evaluateAndStore(interviewId: string): Promise<{ status: "completed" | "failed" }> {
    try {
      const interview = await interviewRepo.getWithContext(interviewId);
      if (!interview) {
        return { status: "failed" };
      }

      const turns = await turnRepo.listForInterview(interviewId);
      if (turns.length < 2) {
        await this.storeFailure(interviewId, "Not enough conversation to evaluate.");
        return { status: "failed" };
      }

      const context = interview.githubContext;
      const plan = interview.interviewPlan;
      if (!context || !plan) {
        await this.storeFailure(interviewId, "Missing project context or interview plan.");
        return { status: "failed" };
      }

      const evaluation = await this.evaluator.evaluate({
        projectContext: {
          owner: (context.repository as { owner?: string }).owner ?? interview.owner,
          name: (context.repository as { name?: string }).name ?? interview.name,
          projectSummary: context.projectSummary,
          technologies: context.technologies,
          architecture: JSON.stringify(context.architecture),
          importantFiles: (
            context.importantFiles as unknown as { path: string; reason: string }[]
          ).map((f) => ({ path: f.path, reason: f.reason })),
          evidence: (context.evidence as unknown as { claim: string; source: string }[]).map(
            (e) => ({ claim: e.claim, source: e.source }),
          ),
        },
        plan: {
          role: plan.role,
          difficulty: plan.difficulty,
          topics: plan.topics as unknown as string[],
          questions: (
            plan.questions as unknown as { text: string; targetSkills: string[] }[]
          ).map((q) => ({ text: q.text, targetSkills: q.targetSkills })),
        },
        transcript: turns.map((t) => ({
          role: t.role as TurnRole === "user" ? "user" : "assistant",
          text: t.text,
        })),
      });

      await evaluationRepo.create({
        interviewId,
        score: evaluation.score,
        dimensions: evaluation.dimensions as EvaluationDimensions,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses,
        feedback: evaluation.feedback,
      });
      return { status: "completed" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.storeFailure(interviewId, message);
      return { status: "failed" };
    }
  }

  private async storeFailure(interviewId: string, reason: string): Promise<void> {
    const existing = await evaluationRepo.getForInterview(interviewId);
    if (existing) return;
    try {
      await evaluationRepo.create({
        interviewId,
        score: 0,
        dimensions: {
          technicalKnowledge: 0,
          problemSolving: 0,
          communication: 0,
          projectUnderstanding: 0,
          depth: 0,
        },
        strengths: [],
        weaknesses: [],
        feedback: `Evaluation failed: ${reason}`,
        status: "failed",
      });
    } catch {
      // never throw from this path
    }
  }

  async completeInterview(interviewId: string): Promise<void> {
    await interviewRepo.updateStatus(interviewId, { status: "completed" });
    const sessions = await sessionRepo.getActiveForInterview(interviewId);
    if (sessions) {
      await sessionRepo.registerCompleted(sessions.id).catch(() => {});
    }
  }
}