export interface EvaluationDimensions {
  technicalKnowledge: number;
  problemSolving: number;
  communication: number;
  projectUnderstanding: number;
  depth: number;
}

export interface Evaluation {
  score: number;
  dimensions: EvaluationDimensions;
  strengths: string[];
  weaknesses: string[];
  feedback: string;
}

export interface EvaluationContext {
  projectContext: {
    owner: string;
    name: string;
    projectSummary: string;
    technologies: string[];
    architecture: string;
    importantFiles: { path: string; reason: string }[];
    evidence: { claim: string; source: string }[];
  };
  plan: {
    role: string;
    difficulty: string;
    topics: string[];
    questions: { text: string; targetSkills: string[] }[];
  };
  transcript: { role: "user" | "assistant"; text: string }[];
}