import { Hono } from "hono";
import type { EvaluationService } from "../evaluation/evaluation.service.js";
import { interviewRepo } from "../db/repositories/interview.repo.js";

export function createCompletionRouter(evaluations: EvaluationService): Hono {
  const app = new Hono();

  /**
   * Ends an interview: marks it completing, runs (+stores) evaluation, then
   * marks the interview completed and closes the realtime session.
   */
  app.post("/:interviewId/end", async (c) => {
    const { interviewId } = c.req.param();

    const interview = await interviewRepo.getById(interviewId);
    if (!interview) {
      return c.json({ error: "Interview not found" }, 404);
    }
    if (interview.status !== "active") {
      return c.json(
        { error: `Interview cannot be ended from status=${interview.status}` },
        409,
      );
    }

    await interviewRepo.updateStatus(interviewId, { status: "completing" });

    const evaluation = await evaluations.evaluateAndStore(interviewId);
    await evaluations.completeInterview(interviewId);

    return c.json({
      interviewId,
      status: "completed",
      evaluationStatus: evaluation.status,
    });
  });

  return app;
}