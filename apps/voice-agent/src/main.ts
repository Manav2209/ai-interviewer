import "dotenv/config";
import { defineAgent, type JobContext, ServerOptions, cli } from "@livekit/agents";
import { loadConfig } from "@repo/providers";
import { buildProviders } from "@repo/providers";
import { fileURLToPath } from "node:url";
import { buildAgent } from "./agent.js";
import { createSessionManager } from "./session/manager.js";
import { getLogger } from "./logger.js";
import { BackendGateway } from "./backend/gateway.js";
import { InterviewConductor } from "./backend/conductor.js";

interface DispatchMetadata {
  interviewId?: string;
  sessionId?: string;
}

const DEFAULT_INSTRUCTIONS = `You are an AI technical interviewer conducting a realtime voice interview. Be concise, warm, and professional. Ask one question at a time and wait for the candidate to answer. Use the conversation history to keep your questions relevant to what the candidate has already said.`;

const DEFAULT_GREETING =
  "Hi, I'm your AI interviewer. Let's get started with a quick technical conversation. When you are ready, tell me a little about your background.";

function parseMetadata(raw: string): DispatchMetadata {
  try {
    const parsed = JSON.parse(raw) as DispatchMetadata;
    if (parsed?.interviewId) return parsed;
  } catch {
    // ignore malformed metadata; fall through to defaults
  }
  return {};
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const cfg = loadConfig();
    const providers = buildProviders(cfg);
    const logger = getLogger();

    const meta = parseMetadata(ctx.job.metadata);
    logger.info(
      { event: "session.created", roomName: ctx.room.name, interviewId: meta.interviewId, sessionId: meta.sessionId },
      "agent job started",
    );

    const backendBaseUrl = process.env.BACKEND_BASE_URL ?? "http://localhost:8080";
    const internalToken = process.env.INTERNAL_API_TOKEN ?? "";

    const gateway =
      meta.interviewId && meta.sessionId && internalToken.length > 0
        ? new BackendGateway(backendBaseUrl, internalToken)
        : null;

    // Fetch the interview context produced by the backend (Phase 4 contract).
    let instructions = DEFAULT_INSTRUCTIONS;
    let greeting = DEFAULT_GREETING;
    let conductor: InterviewConductor | null = null;

    if (gateway) {
      try {
        const ctxData = await gateway.fetchInterviewContext(meta.interviewId!, meta.sessionId!);
        if (ctxData.systemPrompt) instructions = ctxData.systemPrompt;

        const repo = ctxData.githubContext?.repository;
        const summary = ctxData.githubContext?.projectSummary;
        if (repo && summary) {
          const firstSentence = summary.split(".")[0]?.trim() ?? summary;
          greeting =
            `Hi, I'm your AI interviewer. We're going to walk through your project ${repo.owner}/${repo.name} — ${firstSentence}. ` +
            `When you're ready, start by telling me about your background and your role in this project.`;
        }

        conductor = new InterviewConductor(gateway, meta.interviewId!, meta.sessionId!, logger);
        logger.info({ event: "interview_context_loaded" }, "loaded interview context from backend");
      } catch (err) {
        logger.warn({ event: "context_fetch_failed", error: String(err) }, "falling back to default instructions");
      }
    }

    const session = createSessionManager({
      stt: providers.stt,
      llm: providers.llm,
      tts: providers.tts,
      onEvent: (ev) => {
        if (conductor) conductor.onSessionEvent(ev);
        logger.info(ev, "realtime event");
      },
    });

    const agent = buildAgent({
      instructions,
      onResponseDelta: (text) => session.pushResponseText(text),
      onResponseError: (reason) => session.markResponseError(reason),
    });

    session.setAgent(agent);

    await session.start({ room: ctx.room });
    await ctx.connect();

    logger.info({ event: "session.connected" }, "agent connected to room");

    try {
      await session.say(greeting);
    } catch (err) {
      logger.error(
        {
          event: "error",
          error: err instanceof Error ? err.message : String(err),
          data: describeSafely(err),
        },
        "initial greeting failed",
      );
    }

    ctx.addShutdownCallback(async () => {
      await session.close().catch(() => {});
      logger.info({ event: "session.closed" }, "agent session closed");
    });
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));

function describeSafely(value: unknown): string {
  try {
    if (value instanceof Error) {
      const extra = (value as Error & { cause?: unknown }).cause;
      return JSON.stringify({
        name: value.name,
        message: value.message,
        stack: value.stack,
        cause: extra instanceof Error ? extra.message : extra,
      });
    }
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}