import { expect, test } from "bun:test";
import { otlpSpan } from "./events.js";
test("trace spans correlate by interview and omit candidate content", () => {
  const base = {
    interviewId: "int_1",
    type: "answer_analysis",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    payload: {
      text: "Private candidate answer",
      startedAt: 1000,
      durationMs: 25,
      failed: true,
    },
  };
  const span = otlpSpan({ ...base, id: "event_1" });
  expect(span.traceId).toBe(otlpSpan({ ...base, id: "event_2" }).traceId);
  expect(span.spanId).not.toBe(otlpSpan({ ...base, id: "event_2" }).spanId);
  expect(span.startTimeUnixNano).toBe("1000000000");
  expect(span.endTimeUnixNano).toBe("1025000000");
  expect(span.status.code).toBe(2);
  expect(JSON.stringify(span)).not.toContain("Private candidate answer");
});
