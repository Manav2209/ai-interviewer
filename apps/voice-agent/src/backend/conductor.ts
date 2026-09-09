import type { BackendGateway } from "./gateway.js";
import { newEventId, newTurnId } from "./gateway.js";
import type { DomainEvent } from "../session/manager.js";

export interface LoggerLike {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
}

/**
 * Maps local SessionManager domain events to the backend control path
 * (`/internal/realtime/events`) with per-event ids so the backend can
 * deduplicate and build the persisted transcript.
 */
export class InterviewConductor {
  private turnSeq = 0;

  constructor(
    private readonly gateway: BackendGateway,
    private readonly interviewId: string,
    private readonly sessionId: string,
    private readonly logger: LoggerLike,
  ) {}

  private post(type: string, payload: Record<string, unknown>): void {
    this.gateway
      .postRealtimeEvent({
        eventId: newEventId(),
        interviewId: this.interviewId,
        sessionId: this.sessionId,
        type,
        timestamp: new Date().toISOString(),
        payload,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          { event: "backend_event_failed", type, error: String(err) },
          "failed to post realtime event",
        );
      });
  }

  onSessionEvent(ev: DomainEvent): void {
    switch (ev.type) {
      case "session.started":
        this.post("session.started", {});
        break;
      case "user_input_transcribed":
        if (ev.isFinal && ev.transcript.length > 0) {
          this.post("transcript.completed", {
            turnId: newTurnId(),
            role: "user",
            turnIndex: this.turnSeq++,
            text: ev.transcript,
          });
        }
        break;
      case "response.completed":
        if (ev.status === "completed" && ev.fullText.length > 0) {
          this.post("transcript.completed", {
            turnId: newTurnId(),
            role: "assistant",
            turnIndex: this.turnSeq++,
            text: ev.fullText,
            completedAt: new Date().toISOString(),
          });
        }
        break;
      case "session.close":
        this.post("session.completed", {});
        break;
      case "error":
        this.post("error", {
          error: ev.error,
          detail: ev.detail,
          source: ev.source,
        });
        break;
      default:
        break;
    }
  }
}