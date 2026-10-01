import { describe, expect, test } from "bun:test";
import { adaptDifficulty, selectObjective } from "./orchestrator.js";
import type { InterviewObjective, InterviewState } from "./interview.types.js";
import { selectNextAction, transition } from "./policies.js";

function objective(
  id: string,
  phase: InterviewObjective["phase"],
  priority: InterviewObjective["priority"],
  status: InterviewObjective["status"] = "NOT_STARTED",
): InterviewObjective {
  return {
    id,
    phase,
    priority,
    status,
    topic: id,
    description: id,
    targetEvidence: [id],
    evidenceIds: [],
    attempts: 0,
  };
}

describe("objective engine", () => {
  test("selects the earliest unfinished phase and highest priority within it", () => {
    const state: InterviewState = {
      phase: "ARCHITECTURE",
      difficulty: "MEDIUM",
      objectives: [
        objective("impl", "IMPLEMENTATION", "HIGH"),
        objective("arch-low", "ARCHITECTURE", "LOW"),
        objective("arch-high", "ARCHITECTURE", "HIGH"),
      ],
      claims: [],
      evidence: [],
      questions: [],
      processedTurns: {},
      ended: false,
    };
    expect(selectObjective(state)?.id).toBe("arch-high");
    state.objectives[2]!.status = "SATISFIED";
    expect(selectObjective(state)?.id).toBe("arch-low");
    state.objectives[1]!.status = "INSUFFICIENT";
    expect(selectObjective(state)?.id).toBe("impl");
  });

  test("changes difficulty by one step and respects bounds", () => {
    expect(adaptDifficulty("MEDIUM", "STRONG")).toBe("HARD");
    expect(adaptDifficulty("MEDIUM", "WEAK")).toBe("EASY");
    expect(adaptDifficulty("EXPERT", "STRONG")).toBe("EXPERT");
    expect(adaptDifficulty("EASY", "WEAK")).toBe("EASY");
  });
  test("completed phases cannot reopen and exhausted time ends the interview", () => {
    const state: InterviewState = {
      phase: "IMPLEMENTATION",
      difficulty: "MEDIUM",
      objectives: [objective("debugging", "DEBUGGING", "HIGH")],
      claims: [],
      evidence: [],
      questions: [],
      processedTurns: {},
      ended: false,
    };
    expect(() => transition(state, "ARCHITECTURE")).toThrow("backward");
    expect(selectNextAction(state, 0)).toEqual({ type: "END_INTERVIEW" });
    expect(selectNextAction(state, 10).type).toBe("ASK_DEBUGGING");
    transition(state, "COMPLETED");
    expect(() => transition(state, "INTRO")).toThrow();
  });
});
