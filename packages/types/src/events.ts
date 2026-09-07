export type ResponseStatus = "completed" | "incomplete" | "failed";
export type ResponseFailureReason = "provider_error" | "client_cancelled";

export type RealtimeEvent =
  | SessionEvent
  | InputEvent
  | TranscriptEvent2
  | ResponseEvent
  | ErrorEvent;

export interface EventBase {
  sessionId: string;
  timestamp: number;
}

export type SessionEvent =
  | ({ type: "session.created" } & EventBase)
  | ({ type: "session.connected" } & EventBase)
  | ({ type: "session.closed" } & EventBase);

export type InputEvent =
  | ({ type: "input.speech_started" } & EventBase)
  | ({ type: "input.speech_stopped" } & EventBase);

export type TranscriptEvent2 =
  | ({ type: "transcript.delta"; text: string } & EventBase)
  | ({ type: "transcript.completed"; text: string } & EventBase);

export type ResponseEvent =
  | ({ type: "response.started" } & EventBase)
  | ({ type: "response.text.delta"; text: string } & EventBase)
  | ({ type: "response.audio.delta"; sampleRate: number; channels: number } & EventBase)
  | ({
      type: "response.completed";
      status: ResponseStatus;
      reason?: ResponseFailureReason;
      fullText: string;
    } & EventBase);

export interface ErrorEvent extends EventBase {
  type: "error";
  error: string;
  recoverable: boolean;
}
