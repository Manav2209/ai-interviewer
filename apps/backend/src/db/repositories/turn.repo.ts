import type { ConversationTurn, TurnRole } from "@prisma/client";
import { prisma } from "../client.js";

export class TurnRepo {
  async create(input: {
    id: string;
    interviewId: string;
    sessionId: string;
    turnIndex: number;
    role: TurnRole;
    text: string;
    completedAt?: Date;
  }): Promise<ConversationTurn> {
    return prisma.conversationTurn.create({
      data: {
        id: input.id,
        interviewId: input.interviewId,
        sessionId: input.sessionId,
        turnIndex: input.turnIndex,
        role: input.role,
        text: input.text,
        completedAt: input.completedAt,
      },
    });
  }

  async listForInterview(interviewId: string): Promise<ConversationTurn[]> {
    return prisma.conversationTurn.findMany({
      where: { interviewId },
      orderBy: { turnIndex: "asc" },
    });
  }
}

export const turnRepo = new TurnRepo();