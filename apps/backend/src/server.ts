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
import { InterviewOrchestrator } from "./interview/orchestrator.js";
import { browserAuthRouter, browserOwnership } from "./api/auth.js";
import { JobWorker } from "./jobs/queue.js";
import { exportTraces } from "./observability/events.js";
import { prisma } from "./db/client.js";

const config = loadConfig();

const llm = new LlmClient(config);
const interviewService = new InterviewService(llm);
const sessionService = new SessionService(config);
const evaluationService = new EvaluationService(llm);
const realtimeEvents = new RealtimeEventService();
const orchestrator = new InterviewOrchestrator(
  llm,
  config.INTERVIEW_DURATION_MINUTES,
);

const worker = new JobWorker({
  PREPARE: (id) => interviewService.runPipeline(id),
  END: (id, payload) =>
    evaluationService.prepareFinalization(
      id,
      String(payload.reason ?? "completed"),
    ),
  ANALYZE: (id, payload) =>
    orchestrator.recoverAnalysis(id, String(payload.turnId)),
  VERIFY: (id, payload) =>
    orchestrator.verifyClaims(id, payload.claimIds as string[]),
  EVALUATE: async (id) => {
    await orchestrator.prepareEvaluation(id);
    await evaluationService.evaluateAndStore(id);
  },
});
setInterval(() => {
  void worker
    .tick()
    .catch((err: unknown) => console.error("job worker failed", err));
}, 1000);
setInterval(() => {
  void evaluationService
    .finalizeExpired(config.RECONNECT_WINDOW_SECONDS)
    .catch((err: unknown) =>
      console.error("deadline finalization failed", err),
    );
  void exportTraces().catch((err: unknown) =>
    console.error("trace export failed", err),
  );
  void prisma.rateLimitBucket
    .deleteMany({ where: { resetAt: { lt: new Date() } } })
    .catch(() => {});
  void prisma.interviewSession
    .updateMany({
      where: {
        status: "active",
        disconnectedAt: null,
        heartbeatAt: { lt: new Date(Date.now() - 60_000) },
      },
      data: { disconnectedAt: new Date() },
    })
    .catch(() => {});
}, 10_000);

const app = new Hono();

app.use(
  "*",
  cors({
    origin: config.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim()),
  }),
);

app.get("/health", (c) => c.json({ ok: true }));
app.route("/api/v1/auth", browserAuthRouter());
app.use("/api/v1/interviews", browserOwnership);
app.use("/api/v1/interviews/*", browserOwnership);

app.route("/api/v1/interviews", createInterviewsRouter(interviewService));
app.route("/api/v1/interviews", createSessionsRouter(sessionService));
app.route("/api/v1/interviews", createCompletionRouter(evaluationService));
app.route("/api/v1/interviews", createResultsRouter());
app.route(
  "/internal",
  createInternalRouter(config, realtimeEvents, orchestrator, evaluationService),
);

export const server = Bun.serve({
  port: config.PORT,
  fetch: (request, server) =>
    app.fetch(request, { remoteAddress: server.requestIP(request)?.address }),
});

console.log(`[backend] listening on http://localhost:${config.PORT}`);
console.log(`[backend] LLM model: ${config.AI_ROUTER_MODEL}`);
