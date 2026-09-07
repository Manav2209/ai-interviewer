import {
  voice,
  type ChatContext,
  type ChatChunk,
  type ModelSettings,
  type ToolContext,
} from "@livekit/agents";

export interface AgentOptions {
  instructions: string;
  onResponseDelta?: (text: string) => void;
  onResponseError?: (reason: string) => void;
}

export function buildAgent({
  instructions,
  onResponseDelta,
  onResponseError,
}: AgentOptions): voice.Agent {
  return voice.Agent.create({
    instructions,

    async *llmNode(
      ctx: voice.AgentContext,
      chatCtx: ChatContext,
      toolCtx: ToolContext,
      modelSettings: ModelSettings,
    ): AsyncGenerator<ChatChunk | string> {
      const stream = await voice.Agent.default.llmNode(
        ctx.agent,
        chatCtx,
        toolCtx,
        modelSettings,
      );
      if (!stream) {
        onResponseError?.("llmNode returned no stream");
        return;
      }

      const reader = stream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          if (typeof value === "string") {
            if (value.length > 0) {
              onResponseDelta?.(value);
            }
            yield value;
            continue;
          }

          const text = value.delta?.content;
          if (text) {
            onResponseDelta?.(text);
          }
          yield value;
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        onResponseError?.(reason);
        throw err;
      } finally {
        reader.releaseLock();
      }
    },
  });
}