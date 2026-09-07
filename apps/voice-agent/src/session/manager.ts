import { voice } from "@livekit/agents";
import type { llm as llmModule, stt as sttModule, tts as ttsModule } from "@livekit/agents";
import { getLogger } from "../logger.js";

export type DomainEvent =
  | { type: "session.started"; sessionId: string }
  | { type: "session.close"; sessionId: string; reason: string }
  | { type: "user_input_transcribed"; transcript: string; isFinal: boolean; sessionId: string }
  | { type: "agent_state_changed"; state: string; sessionId: string }
  | {
      type: "conversation_item_added";
      role: string;
      text: string | null;
      interrupted: boolean;
      sessionId: string;
    }
  | { type: "response.delta"; text: string; sessionId: string }
  | { type: "response.completed"; fullText: string; status: string; sessionId: string }
  | { type: "error"; error: string; sessionId: string };
  
export interface SessionManagerOptions {
  agent: voice.Agent;
  stt: sttModule.STT;
  llm: llmModule.LLM;
  tts: ttsModule.TTS;
  onEvent?: (ev: DomainEvent) => void;
}

export class SessionManager {
  readonly sessionId: string;
  private readonly session: voice.AgentSession;
  private agent: voice.Agent | null = null;
  private readonly onEvent: (ev: DomainEvent) => void;
  private fullText = "";

  constructor({ stt, llm, tts, onEvent }: Omit<SessionManagerOptions, "agent">) {
    this.sessionId = crypto.randomUUID();
    this.onEvent = onEvent ?? ((): void => {});

    this.session = new voice.AgentSession({
      stt,
      llm,
      tts,
    });

    const emit = (ev: DomainEvent): void =>
      this.onEvent(ev);

    this.session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      emit({
        type: "user_input_transcribed",
        transcript: ev.transcript,
        isFinal: ev.isFinal,
        sessionId: this.sessionId,
      });
    });

    this.session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      if (ev.newState === "thinking") {
        this.fullText = "";
      }
      emit({ type: "agent_state_changed", state: ev.newState, sessionId: this.sessionId });
    });

    this.session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
      const interrupted =
        "interrupted" in ev.item ? Boolean((ev.item as { interrupted?: boolean }).interrupted) : false;
      const item = ev.item;
      if ("role" in item && "content" in item) {
        const text = typeof item.content === "string" ? item.content : null;
        const role = String(item.role);
        if (role === "assistant" && interrupted) {
          emit({ type: "response.completed", fullText: this.fullText, status: "incomplete", sessionId: this.sessionId });
        }
        if (role === "assistant" && !interrupted && this.fullText.length > 0) {
          emit({ type: "response.completed", fullText: this.fullText, status: "completed", sessionId: this.sessionId });
        }
        emit({ type: "conversation_item_added", role, text, interrupted, sessionId: this.sessionId });
      }
    });

    this.session.on(voice.AgentSessionEventTypes.Error, (ev) => {
      const message = ev.error instanceof Error ? ev.error.message : String(ev.error);
      emit({ type: "error", error: message, sessionId: this.sessionId });
    });

    this.session.on(voice.AgentSessionEventTypes.Close, (ev) => {
      emit({ type: "session.close", reason: String(ev.reason), sessionId: this.sessionId });
    });
  }

  pushResponseText(text: string): void {
    this.fullText += text;
    this.onEvent({
      type: "response.delta",
      text,
      sessionId: this.sessionId,
    });
  }

  markResponseError(reason: string): void {
    this.onEvent({
      type: "response.completed",
      fullText: this.fullText,
      status: "failed",
      sessionId: this.sessionId,
    });
    this.onEvent({ type: "error", error: reason, sessionId: this.sessionId });
  }

  setAgent(agent: voice.Agent): void {
    this.agent = agent;
  }

  getAgent(): voice.Agent | null {
    return this.agent;
  }

  async start({ room }: { room: unknown }): Promise<this> {
    const agent = this.agent;
    if (!agent) {
      throw new Error("Agent not set. Call setAgent() before start().");
    }
    const logger = getLogger();
    logger.info({ sessionId: this.sessionId }, "starting agent session");
    await this.session.start({ agent, room: room as Parameters<voice.AgentSession["start"]>[0]["room"] });
    this.onEvent({ type: "session.started", sessionId: this.sessionId });
    return this;
  }

  async say(text: string): Promise<void> {
    await this.session.say(text);
  }

  async close(): Promise<void> {
    await this.session.close();
  }
}

export function createSessionManager(options: Omit<SessionManagerOptions, "agent">): SessionManager {
  return new SessionManager(options);
}