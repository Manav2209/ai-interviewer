import { Hono } from "hono";
import { z } from "zod";
import type { InterviewService } from "../interview/interview.service.js";

const createInterviewSchema = z.object({
  githubUrl: z.string().min(1).max(2048),
});

export function createInterviewsRouter(service: InterviewService): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createInterviewSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        400,
      );
    }

    try {
      const { id, status } = await service.create(parsed.data.githubUrl);
      return c.json({ interviewId: id, status }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });

  app.get("/:id", async (c) => {
    const { id } = c.req.param();
    const interview = await service.getById(id);
    if (!interview) {
      return c.json({ error: "Interview not found" }, 404);
    }
    return c.json({
      interviewId: interview.id,
      status: interview.status,
      githubUrl: interview.githubUrl,
      error: interview.error ?? undefined,
      githubContext: interview.githubContext,
      interviewPlan: interview.interviewPlan,
      systemPrompt: interview.systemPrompt,
      createdAt: interview.createdAt,
    });
  });

  return app;
}