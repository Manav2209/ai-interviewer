import type { LlmClient } from "../llm/llm.client.js";
import type { GithubContext } from "../github/github.types.js";
import type { InterviewPlan } from "./interview.types.js";

const SYSTEM_PROMPT = `You are a senior software engineering interviewer building a question bank for a candidate.
Given a candidate's GitHub project context, design a tailored technical interview.
Pick a role that matches the project, a difficulty calibrated to the project's complexity, and
topics/concrete questions that let the candidate demonstrate understanding of the code they built.
Questions must be specific to the repository's technologies and architecture, not generic trivia.

Respond with valid JSON only.`;

const USER_PROMPT = (context: GithubContext): string => `Candidate project context:
${JSON.stringify(context, null, 2)}

Produce a tailored interview plan.

Required JSON shape (no extra keys):
{
  "role": string,
  "difficulty": "junior" | "mid" | "senior",
  "topics": string[],
  "questions": [{ "text": string, "targetSkills": string[] }]
}
Include 6-10 questions. At least half must be follow-up questions anchored on the project's
actual architecture, data model, or AI logic.`;

export class InterviewPlanner {
  constructor(private readonly llm: LlmClient) {}

  async plan(context: GithubContext): Promise<InterviewPlan> {
    const plan = await this.llm.completeJson<InterviewPlan>(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: USER_PROMPT(context) },
      ],
      { maxTokens: 8192 },
    );

    const difficulty =
      plan.difficulty === "junior" || plan.difficulty === "mid" || plan.difficulty === "senior"
        ? plan.difficulty
        : "mid";

    return {
      role: plan.role ?? "Software Engineer",
      difficulty,
      topics: Array.isArray(plan.topics) ? plan.topics : [],
      questions: Array.isArray(plan.questions) ? plan.questions : [],
    };
  }
}