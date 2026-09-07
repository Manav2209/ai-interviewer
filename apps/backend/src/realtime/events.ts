import { realtimeEventRepo, type RealtimeEventInput } from "../db/repositories/realtime-event.repo.js";
import { turnRepo } from "../db/repositories/turn.repo.js";
import { sessionRepo } from "../db/repositories/session.repo.js";
import { interviewRepo } from "../db/repositories/interview.repo.js";
import type { TurnRole } from "@prisma/client";

export interface RealtimeEventPayload {
  role?: "user" | "assistant";
  text?: string;
  turnId?: string;
  turnIndex?: number;
  completedAt?: string;
  error?: string;
}

export type ProcessResult =
  | { outcome: "created"; turnCreated?: boolean }
  | { outcome: "duplicate" };

const isFinalTranscript = (type: string, payload: RealtimeEventPayload): boolean =>
  type === "transcript.completed";

export class RealtimeEventService {
  async process(input: RealtimeEventInput): Promise<ProcessResult> {
    const created = await realtimeEventRepo.create(input);
    if (!created) {
      return { outcome: "duplicate" };
    }

    const payload = (input.payload ?? {}) as RealtimeEventPayload;

    if (isFinalTranscript(input.type, payload)) {
      const role = payload.role === "assistant" ? ("assistant" as TurnRole) : ("user" as TurnRole);
      const text = payload.text?.trim() ?? "";
      if (text.length > 0 && payload.turnId) {
        try {
          await turnRepo.create({
            id: payload.turnId,
            interviewId: input.interviewId,
            sessionId: input.sessionId,
            turnIndex: payload.turnIndex ?? 0,
            role,
            text,
            completedAt: payload.completedAt ? new Date(payload.completedAt) : undefined,
          });
          return { outcome: "created", turnCreated: true };
        } catch (err) {
          // Duplicate turnId already stored -> final transcript already persisted.
          if (
            typeof err === "object" &&
            err !== null &&
            "code" in err &&
            (err as { code?: string }).code === "P2002"
          ) {
            return { outcome: "created" };
          }
          throw err;
        }
      }
    }

    if (input.type === "session.started") {
      await sessionRepo.registerStarted(input.sessionId).catch(() => {});
    } else if (input.type === "session.completed") {
      await sessionRepo.registerCompleted(input.sessionId).catch(() => {});
    } else if (input.type === "session.failed") {
      await sessionRepo.registerFailed(input.sessionId).catch(() => {});
      await interviewRepo
        .updateStatus(input.interviewId, {
          status: "failed",
          error: payload.error ?? "voice agent reported a session failure",
        })
        .catch(() => {});
    }

    return { outcome: "created" };
  }
}