import { expect, test } from "bun:test";
import { Evaluator, emptyEvaluation } from "./evaluator.js";
import type { EvaluationContext } from "./evaluation.types.js";
import type { LlmClient } from "../llm/llm.client.js";

const context: EvaluationContext = {
  projectContext: {
    owner: "example",
    name: "project",
    projectSummary: "",
    technologies: [],
    architecture: "",
    importantFiles: [],
    evidence: [],
  },
  plan: { role: "Engineer", difficulty: "MEDIUM", topics: [], objectives: [] },
  transcript: [],
  candidateEvidence: [],
  questionHistory: [],
};
test("invented evidence IDs cannot produce scores or unsupported strengths", async () => {
  const fake = {
    async completeJson() {
      const result = emptyEvaluation();
      result.score = 100;
      result.strengths = ["Expert"];
      result.weaknesses = ["Did not discuss debugging"];
      for (const item of Object.values(result.evidence))
        Object.assign(item, {
          level: "ADVANCED",
          evidenceIds: ["invented"],
          confidence: 1,
        });
      return result;
    },
  } as unknown as LlmClient;
  const result = await new Evaluator(fake).evaluate(context);
  expect(result.score).toBeNull();
  expect(result.strengths).toEqual([]);
  expect(result.weaknesses).toEqual([]);
  expect(
    Object.values(result.evidence).every(
      (e) => e.level === "INSUFFICIENT_EVIDENCE",
    ),
  ).toBe(true);
});

test("a single strong example cannot support an advanced assessment", async () => {
  const fake = {
    async completeJson() {
      const result = emptyEvaluation();
      result.score = 80;
      result.evidence.technicalDepth = {
        level: "ADVANCED",
        evidenceIds: ["ev_1"],
        confidence: 1,
        explanation: "One example",
      };
      return result;
    },
  } as unknown as LlmClient;
  const result = await new Evaluator(fake).evaluate({
    ...context,
    candidateEvidence: [
      {
        id: "ev_1",
        objectiveId: "obj_1",
        skill: "technicalDepth",
        topic: "cache",
        evidence: "Explained cache eviction",
        sourceTurnId: "turn_1",
        strength: "STRONG",
        confidence: 0.7,
      },
    ],
  });
  expect(result.evidence.technicalDepth!.level).toBe("INTERMEDIATE");
  expect(result.evidence.technicalDepth!.confidence).toBe(0.7);
});
