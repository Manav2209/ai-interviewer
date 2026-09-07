import type { LlmClient } from "../llm/llm.client.js";
import type { Evaluation, EvaluationContext } from "./evaluation.types.js";

const SYSTEM_PROMPT = `You are a technical hiring manager evaluating a candidate's live interview performance
about their own GitHub project.

Evaluate the candidate against the interview that was actually conducted. Use the repository
evidence (project summary, technologies, architecture, important files, evidence claims) to
distinguish candidates who genuinely understand their project from those giving generic answers.
Detect mismatches, e.g. the repository evidence says the system uses Redis for queues, but the
candidate claims Redis is used for caching.

Scores are 0-100. The overall "score" is a single 0-100 number. Be fair and evidence-based.

Respond with valid JSON only.`;

function buildUserPrompt(ctx: EvaluationContext): string {
  const transcript = ctx.transcript.length
    ? ctx.transcript.map((t) => `${t.role === "user" ? "Candidate" : "Interviewer"}: ${t.text}`).join("\n\n")
    : "(no transcript collected — the candidate did not participate)";

  const questions = ctx.plan.questions.map((q, i) => `Q${i + 1}. ${q.text}`).join("\n");

  return `# Project context
- owner/name: ${ctx.projectContext.owner}/${ctx.projectContext.name}
- summary: ${ctx.projectContext.projectSummary}
- technologies: ${ctx.projectContext.technologies.join(", ")}
- architecture: ${ctx.projectContext.architecture}
- important files:
${ctx.projectContext.importantFiles.map((f) => `  - ${f.path}: ${f.reason}`).join("\n")}
- evidence:
${ctx.projectContext.evidence.map((e) => `  - ${e.claim} (source: ${e.source})`).join("\n")}

# Interview plan
- role: ${ctx.plan.role}
- difficulty: ${ctx.plan.difficulty}
- topics: ${ctx.plan.topics.join(", ")}
- planned questions:
${questions}

# Transcript
${transcript}

Produce the evaluation. Required JSON shape (no extra keys):
{
  "score": number,
  "dimensions": {
    "technicalKnowledge": number,
    "problemSolving": number,
    "communication": number,
    "projectUnderstanding": number,
    "depth": number
  },
  "strengths": string[],
  "weaknesses": string[],
  "feedback": string
}`;
}

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export class Evaluator {
  constructor(private readonly llm: LlmClient) {}

  async evaluate(ctx: EvaluationContext): Promise<Evaluation> {
    const raw = await this.llm.completeJson<{
      score?: unknown;
      dimensions?: {
        technicalKnowledge?: unknown;
        problemSolving?: unknown;
        communication?: unknown;
        projectUnderstanding?: unknown;
        depth?: unknown;
      };
      strengths?: unknown;
      weaknesses?: unknown;
      feedback?: unknown;
    }>(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(ctx) },
      ],
      { maxTokens: 4096 },
    );

    return {
      score: clampScore(raw.score),
      dimensions: {
        technicalKnowledge: clampScore(raw.dimensions?.technicalKnowledge),
        problemSolving: clampScore(raw.dimensions?.problemSolving),
        communication: clampScore(raw.dimensions?.communication),
        projectUnderstanding: clampScore(raw.dimensions?.projectUnderstanding),
        depth: clampScore(raw.dimensions?.depth),
      },
      strengths: Array.isArray(raw.strengths) ? raw.strengths.map(String) : [],
      weaknesses: Array.isArray(raw.weaknesses) ? raw.weaknesses.map(String) : [],
      feedback: typeof raw.feedback === "string" ? raw.feedback : "",
    };
  }
}