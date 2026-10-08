import { type Evaluation, prisma } from "@repo/db";

export type EvaluationDimensions =
  import("../../evaluation/evaluation.types.js").EvaluationDimensions;

export interface CreateEvaluationInput {
  interviewId: string;
  score: number | null;
  dimensions: EvaluationDimensions;
  strengths: string[];
  weaknesses: string[];
  feedback: string;
  evidence?: Record<
    string,
    { level: string; evidenceIds: string[]; explanation: string }
  >;
  status?: string;
}

export class EvaluationRepo {
  async create(input: CreateEvaluationInput): Promise<Evaluation> {
    return prisma.evaluation.create({
      data: {
        interviewId: input.interviewId,
        score: input.score,
        dimensions: { ...input.dimensions },
        strengths: input.strengths,
        weaknesses: input.weaknesses,
        feedback: input.feedback,
        evidence: input.evidence,
        status: input.status ?? "completed",
      },
    });
  }

  async getForInterview(interviewId: string): Promise<Evaluation | null> {
    return prisma.evaluation.findUnique({ where: { interviewId } });
  }
}

export const evaluationRepo = new EvaluationRepo();
