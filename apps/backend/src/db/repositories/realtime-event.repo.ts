import { prisma } from "../client.js";

export interface RealtimeEventInput {
  eventId: string;
  interviewId: string;
  sessionId: string;
  type: string;
  timestamp: string;
  payload: unknown;
}

export class RealtimeEventRepo {
  async exists(eventId: string): Promise<boolean> {
    const found = await prisma.realtimeEvent.findUnique({
      where: { eventId },
      select: { id: true },
    });
    return found !== null;
  }

  async create(input: RealtimeEventInput): Promise<boolean> {
    try {
      await prisma.realtimeEvent.create({
        data: {
          eventId: input.eventId,
          interviewId: input.interviewId,
          sessionId: input.sessionId,
          type: input.type,
          timestamp: new Date(input.timestamp),
          payload: input.payload as object,
        },
      });
      return true;
    } catch (err) {
      // UNIQUE(eventId) violation => already processed, treat as duplicate
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        return false;
      }
      throw err;
    }
  }
}

export const realtimeEventRepo = new RealtimeEventRepo();