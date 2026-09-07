import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadConfig } from "./config.js";
import { LlmClient } from "./llm/llm.client.js";
import { InterviewService } from "./interview/interview.service.js";
import { createInterviewsRouter } from "./api/interviews.js";
import { SessionService } from "./realtime/session.service.js";
import { createSessionsRouter } from "./api/sessions.js";
import { EvaluationService } from "./evaluation/evaluation.service.js";
import { createCompletionRouter } from "./api/completion.js";
import { createResultsRouter } from "./api/results.js";
import { RealtimeEventService } from "./realtime/events.js";
import { createInternalRouter } from "./api/internal.js";

const config = loadConfig();

const llm = new LlmClient(config);
const interviewService = new InterviewService(llm);
const sessionService = new SessionService(config);
const evaluationService = new EvaluationService(llm);
const realtimeEvents = new RealtimeEventService();

const app = new Hono();

app.use(
  "*",
  cors({
    origin: config.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim()),
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

app.route("/api/v1/interviews", createInterviewsRouter(interviewService));
app.route("/api/v1/interviews", createSessionsRouter(sessionService));
app.route("/api/v1/interviews", createCompletionRouter(evaluationService));
app.route("/api/v1/interviews", createResultsRouter());
app.route("/internal", createInternalRouter(config, realtimeEvents));

export const server = Bun.serve({
  port: config.PORT,
  fetch: app.fetch,
});

console.log(`[backend] listening on http://localhost:${config.PORT}`);
console.log(`[backend] LLM model: ${config.AI_ROUTER_MODEL}`);