import { Hono } from "hono";
import { z } from "zod";
import type { BackendConfig } from "../config.js";
import { internalAuthFromConfig } from "./auth.js";
import { RealtimeEventService } from "../realtime/events.js";
import { interviewRepo } from "../db/repositories/interview.repo.js";

const realtimeEventSchema = z.object({
  eventId: z.string().min(1),
  interviewId: z.string().min(1),
  sessionId: z.string().min(1),
  type: z.string().min(1),
  timestamp: z.string().min(1),
  payload: z.unknown().optional(),
});

export function createInternalRouter(config: BackendConfig, events: RealtimeEventService): Hono {
  const app = new Hono();
  app.use("*", internalAuthFromConfig(config));

  app.get("/context/:interviewId", async (c) => {
    const interview = await interviewRepo.getWithContext(c.req.param("interviewId"));
    if (!interview) {
      return c.json({ error: "Interview not found" }, 404);
    }
    return c.json({
      interviewId: interview.id,
      sessionId: c.req.query("sessionId") ?? undefined,
      systemPrompt: interview.systemPrompt,
      githubContext: interview.githubContext,
      interviewPlan: interview.interviewPlan,
      interview: {
        status: interview.status,
        githubUrl: interview.githubUrl,
      },
    });
  });

  app.post("/realtime/events", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = realtimeEventSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid event", details: parsed.error.flatten() }, 400);
    }

    const result = await events.process({
      eventId: parsed.data.eventId,
      interviewId: parsed.data.interviewId,
      sessionId: parsed.data.sessionId,
      type: parsed.data.type,
      timestamp: parsed.data.timestamp,
      payload: parsed.data.payload,
    });

    return c.json(
      { ok: true, outcome: result.outcome, turnCreated: "turnCreated" in result ? result.turnCreated : undefined },
      200,
    );
  });

  return app;
}