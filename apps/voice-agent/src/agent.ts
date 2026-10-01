import { voice, type ChatContext } from "@livekit/agents";

export interface AgentOptions {
  instructions: string;
  nextQuestion: (turnId: string, answer: string) => Promise<string>;
  onResponseDelta?: (text: string) => void;
  onResponseError?: (reason: string) => void;
}

export function buildAgent({
  instructions,
  nextQuestion,
  onResponseDelta,
  onResponseError,
}: AgentOptions): voice.Agent {
  return voice.Agent.create({
    instructions,

    async *llmNode(
      _ctx: voice.AgentContext,
      chatCtx: ChatContext,
    ): AsyncGenerator<string> {
      try {
        const last = [...chatCtx.items]
          .reverse()
          .find((item) => item.type === "message" && item.role === "user");
        if (!last || last.type !== "message" || !last.textContent?.trim())
          return;
        const question = await nextQuestion(last.id, last.textContent.trim());
        onResponseDelta?.(question);
        yield question;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        onResponseError?.(reason);
        yield "Sorry, I couldn't process that answer. Please repeat it in a moment.";
      }
    },
  });
}
