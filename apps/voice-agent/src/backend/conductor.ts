import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { BackendGateway, RealtimeEventInput } from "./gateway.js";
import { newEventId, newTurnId } from "./gateway.js";
import type { DomainEvent } from "../session/manager.js";
export interface LoggerLike {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
}

/** Local journal preserves unacknowledged voice events across worker restarts. */
export class InterviewConductor {
  private queue: RealtimeEventInput[] = [];
  private pending: Promise<void>;
  private draining = false;
  private stopped = false;
  private questionId: string | null = null;
  private readonly journal: string;
  constructor(
    private readonly gateway: BackendGateway,
    private readonly interviewId: string,
    private readonly sessionId: string,
    private readonly logger: LoggerLike,
  ) {
    if (
      !/^[\w-]{1,100}$/.test(interviewId) ||
      !/^[\w-]{1,100}$/.test(sessionId)
    )
      throw new Error("Invalid journal identity");
    this.journal = join(
      process.env.VOICE_OUTBOX_DIR ?? join(tmpdir(), "ai-interview-voice"),
      `${interviewId}-${sessionId}.json`,
    );
    this.pending = this.restore();
  }
  private async restore(): Promise<void> {
    await mkdir(join(this.journal, ".."), { recursive: true });
    try {
      const rows: unknown = JSON.parse(await readFile(this.journal, "utf8"));
      if (
        !Array.isArray(rows) ||
        rows.length > 1000 ||
        rows.some(
          (e) =>
            !e ||
            e.interviewId !== this.interviewId ||
            e.sessionId !== this.sessionId ||
            typeof e.eventId !== "string",
        )
      )
        throw new Error("Invalid event journal");
      this.queue = rows as RealtimeEventInput[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    void this.drain();
  }
  private async persist(): Promise<void> {
    await writeFile(`${this.journal}.tmp`, JSON.stringify(this.queue));
    await rename(`${this.journal}.tmp`, this.journal);
  }
  private post(type: string, payload: Record<string, unknown>): void {
    const event: RealtimeEventInput = {
      eventId: newEventId(),
      interviewId: this.interviewId,
      sessionId: this.sessionId,
      type,
      timestamp: new Date().toISOString(),
      payload,
    };
    this.pending = this.pending
      .then(async () => {
        this.queue.push(event);
        await this.persist();
      })
      .then(() => {
        void this.drain();
      })
      .catch((err: unknown) => {
        this.logger.warn({ error: String(err) }, "Voice journal write failed");
      });
  }
  private async drain(): Promise<void> {
    if (this.draining || this.stopped) return;
    this.draining = true;
    try {
      while (this.queue.length && !this.stopped) {
        const event = this.queue[0]!;
        try {
          await this.gateway.postRealtimeEvent(event);
          this.pending = this.pending.then(async () => {
            this.queue = this.queue.filter((e) => e.eventId !== event.eventId);
            await this.persist();
          });
          await this.pending;
        } catch (err) {
          this.logger.warn(
            { type: event.type, error: String(err) },
            "Voice event retained for retry",
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    } finally {
      this.draining = false;
    }
  }
  setNextQuestionId(id: string | null): void {
    this.questionId = id;
  }
  heartbeat(connected: boolean): void {
    this.post(connected ? "session.heartbeat" : "session.disconnected", {});
  }
  async flush(): Promise<void> {
    await this.pending;
    const deadline = Date.now() + 20_000;
    while ((this.draining || this.queue.length) && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 100));
    this.stopped = true;
  }
  onSessionEvent(event: DomainEvent): void {
    switch (event.type) {
      case "session.started":
        this.post("session.started", {});
        break;
      case "conversation_item_added":
        if (event.role === "assistant" && event.text)
          this.post("transcript.completed", {
            turnId: newTurnId(),
            questionId: this.questionId ?? undefined,
            role: "assistant",
            text: event.text.slice(0, 1000),
            interrupted: event.interrupted,
            completedAt: new Date().toISOString(),
          });
        break;
      case "session.close":
        this.post("session.disconnected", {});
        break;
      case "speech.interrupted":
        this.post("speech.interrupted", {});
        break;
      case "voice.metrics":
        this.post("voice.metrics", {
          source: event.source,
          durationMs: event.durationMs,
          firstAudioMs: event.firstAudioMs,
        });
        break;
      case "error":
        this.post(event.recoverable === false ? "session.failed" : "error", {
          error: event.error.slice(0, 1000),
          source: event.source?.slice(0, 100),
          detail: event.detail?.slice(0, 2000),
        });
        break;
      default:
        break;
    }
  }
}
