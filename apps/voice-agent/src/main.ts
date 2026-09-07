import "dotenv/config";
import { defineAgent, type JobContext, ServerOptions, cli } from "@livekit/agents";
import { loadConfig } from "@repo/providers";
import { buildProviders } from "@repo/providers";
import { fileURLToPath } from "node:url";
import { buildAgent } from "./agent.js";
import { createSessionManager } from "./session/manager.js";
import { getLogger } from "./logger.js";

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const cfg = loadConfig();
    const providers = buildProviders(cfg);
    const logger = getLogger();

    logger.info({ event: "session.created", roomName: ctx.room.name }, "agent job started");

    const session = createSessionManager({
      stt: providers.stt,
      llm: providers.llm,
      tts: providers.tts,
      onEvent: (ev) => {
        logger.info(ev, "realtime event");
      },
    });

    const agent = buildAgent({
      instructions: `You are an AI technical interviewer conducting a realtime voice interview. Be concise, warm, and professional. Ask one question at a time and wait for the candidate to answer. Use the conversation history to keep your questions relevant to what the candidate has already said.`,
      onResponseDelta: (text) => session.pushResponseText(text),
      onResponseError: (reason) => session.markResponseError(reason),
    });

    session.setAgent(agent);

    await session.start({ room: ctx.room });
    await ctx.connect();

    logger.info({ event: "session.connected" }, "agent connected to room");

    try {
      await session.say(
        "Hi, I'm your AI interviewer. Let's get started with a quick technical conversation. When you are ready, tell me a little about your background.",
      );
    } catch (err) {
      logger.error({ event: "error", error: String(err) }, "initial greeting failed");
    }

    ctx.addShutdownCallback(async () => {
      await session.close().catch(() => {});
      logger.info({ event: "session.closed" }, "agent session closed");
    });
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));