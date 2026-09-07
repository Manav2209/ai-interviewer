import type { GithubContext } from "../github/github.types.js";

export type InterviewDifficulty = "junior" | "mid" | "senior";

export interface InterviewQuestion {
  text: string;
  targetSkills: string[];
}

export interface InterviewPlan {
  role: string;
  difficulty: InterviewDifficulty;
  topics: string[];
  questions: InterviewQuestion[];
}

export interface PlannedInterview {
  context: GithubContext;
  plan: InterviewPlan;
  systemPrompt: string;
}