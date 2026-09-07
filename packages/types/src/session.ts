export type RealtimeSessionState =
  | "created"
  | "connecting"
  | "connected"
  | "listening"
  | "transcribing"
  | "generating_response"
  | "synthesizing_audio"
  | "publishing_audio"
  | "error"
  | "closed";

export type MessageRole = "system" | "user" | "assistant";

export interface Message {
  role: MessageRole;
  content: string;
}

export interface RealtimeSession {
  id: string;
  roomName: string;
  state: RealtimeSessionState;
  startedAt: number;
  messages: Message[];
  metadata?: Record<string, unknown>;
}
