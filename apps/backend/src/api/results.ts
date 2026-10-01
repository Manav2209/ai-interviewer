import { Hono } from "hono";
import { evaluationRepo } from "../db/repositories/evaluation.repo.js";
import { interviewRepo } from "../db/repositories/interview.repo.js";
import { prisma } from "../db/client.js";

export function createResultsRouter(): Hono {
  const app = new Hono();
  app.get("/:interviewId/transcript", async (c) => {
    const turns = await prisma.conversationTurn.findMany({
      where: { interviewId: c.req.param("interviewId") },
      orderBy: [{ completedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        role: true,
        text: true,
        createdAt: true,
        completedAt: true,
      },
    });
    return c.json(
      turns.map((t) => ({
        id: t.id,
        role: t.role,
        text: t.text,
        timestamp: (t.completedAt ?? t.createdAt).getTime(),
        final: true,
      })),
    );
  });

  app.get("/:interviewId/result", async (c) => {
    const { interviewId } = c.req.param();

    const interview = await interviewRepo.getById(interviewId);
    if (!interview) {
      return c.json({ error: "Interview not found" }, 404);
    }

    const evaluation = await evaluationRepo.getForInterview(interviewId);
    if (!evaluation) {
      return c.json({
        status: interview.status,
        message: "Evaluation not available yet",
      });
    }

    return c.json({
      status: evaluation.status,
      score: evaluation.score,
      dimensions: evaluation.dimensions as unknown as Record<
        string,
        number | null
      >,
      evidence: evaluation.evidence,
      strengths: evaluation.strengths,
      weaknesses: evaluation.weaknesses,
      feedback: evaluation.feedback,
    });
  });

  return app;
}
