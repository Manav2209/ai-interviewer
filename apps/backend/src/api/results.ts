import { Hono } from "hono";
import { evaluationRepo } from "../db/repositories/evaluation.repo.js";
import { interviewRepo } from "../db/repositories/interview.repo.js";

export function createResultsRouter(): Hono {
  const app = new Hono();

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
      dimensions: evaluation.dimensions as unknown as Record<string, number>,
      strengths: evaluation.strengths,
      weaknesses: evaluation.weaknesses,
      feedback: evaluation.feedback,
    });
  });

  return app;
}