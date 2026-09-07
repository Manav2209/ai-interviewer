import type { Interview, InterviewStatus } from "@prisma/client";
import { prisma } from "../client.js";

export interface CreateInterviewInput {
  id: string;
  githubUrl: string;
  owner: string;
  name: string;
}

export interface UpdateInterviewStatusInput {
  status: InterviewStatus;
  error?: string;
}

export class InterviewRepo {
  async create(input: CreateInterviewInput): Promise<Interview> {
    return prisma.interview.create({ data: input });
  }

  async getById(id: string): Promise<Interview | null> {
    return prisma.interview.findUnique({ where: { id } });
  }

  async getWithContext(id: string) {
    return prisma.interview.findUnique({
      where: { id },
      include: { githubContext: true, interviewPlan: true },
    });
  }

  async updateStatus(id: string, input: UpdateInterviewStatusInput): Promise<Interview> {
    return prisma.interview.update({
      where: { id },
      data: {
        status: input.status,
        error: input.error,
        startedAt: input.status === "analyzing" ? new Date() : undefined,
        completedAt:
          input.status === "ready" || input.status === "failed" ? new Date() : undefined,
      },
    });
  }

  async markReady(id: string, systemPrompt: string): Promise<Interview> {
    return prisma.interview.update({
      where: { id },
      data: {
        status: "ready",
        systemPrompt,
        error: null,
        completedAt: new Date(),
      },
    });
  }
}

export const interviewRepo = new InterviewRepo();