import type { InterviewSession, SessionStatus } from "@prisma/client";
import type { Interview } from "@prisma/client";
import { prisma } from "../client.js";

export interface CreateSessionInput {
  id: string;
  interviewId: string;
  roomName: string;
  serverUrl: string;
}

export class SessionRepo {
  async create(input: CreateSessionInput): Promise<InterviewSession> {
    return prisma.interviewSession.create({
      data: { ...input },
    });
  }

  async getById(id: string): Promise<InterviewSession | null> {
    return prisma.interviewSession.findUnique({ where: { id } });
  }

  async getActiveForInterview(interviewId: string): Promise<InterviewSession | null> {
    return prisma.interviewSession.findFirst({
      where: { interviewId, status: { in: ["created", "active"] as SessionStatus[] } },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateStatus(id: string, status: SessionStatus): Promise<InterviewSession> {
    return prisma.interviewSession.update({
      where: { id },
      data: {
        status,
        startedAt: status === "active" ? new Date() : undefined,
        endedAt: status === "completed" || status === "failed" ? new Date() : undefined,
      },
    });
  }

  async registerStarted(id: string): Promise<InterviewSession> {
    return prisma.interviewSession.update({
      where: { id },
      data: { status: "active", startedAt: new Date() },
    });
  }

  async registerCompleted(id: string): Promise<InterviewSession> {
    return prisma.interviewSession.update({
      where: { id },
      data: { status: "completed", endedAt: new Date() },
    });
  }

  async registerFailed(id: string): Promise<InterviewSession> {
    return prisma.interviewSession.update({
      where: { id },
      data: { status: "failed", endedAt: new Date() },
    });
  }
}

export const sessionRepo = new SessionRepo();

export type SessionWithInterview = InterviewSession & { interview: Interview };