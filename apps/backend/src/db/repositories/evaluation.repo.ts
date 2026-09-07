import type { Evaluation } from "@prisma/client";
import { prisma } from "../client.js";

export type EvaluationDimensions = {
  technicalKnowledge: number;
  problemSolving: number;
  communication: number;
  projectUnderstanding: number;
  depth: number;
};

export interface CreateEvaluationInput {
  interviewId: string;
  score: number;
  dimensions: EvaluationDimensions;
  strengths: string[];
  weaknesses: string[];
  feedback: string;
  status?: string;
}

export class EvaluationRepo {
  async create(input: CreateEvaluationInput): Promise<Evaluation> {
    return prisma.evaluation.create({
      data: {
        interviewId: input.interviewId,
        score: input.score,
        dimensions: input.dimensions,
        strengths: input.strengths,
        weaknesses: input.weaknesses,
        feedback: input.feedback,
        status: input.status ?? "completed",
      },
    });
  }

  async getForInterview(interviewId: string): Promise<Evaluation | null> {
    return prisma.evaluation.findUnique({ where: { interviewId } });
  }
}

export const evaluationRepo = new EvaluationRepo();