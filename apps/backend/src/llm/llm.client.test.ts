import { expect, test } from "bun:test";
import { z } from "zod";
import { structured, type LlmClient, type LlmMessage } from "./llm.client.js";

const schema = z.object({ targetEvidence: z.array(z.string()).min(1) });

test("structured retry explains empty evidence to the model and preserves validation", async () => {
  const requests: LlmMessage[][] = [];
  const llm = {
    async completeJson(messages: LlmMessage[]) {
      requests.push(messages);
      return requests.length === 1
        ? { targetEvidence: [] }
        : { targetEvidence: ["Explains the project's request flow"] };
    },
  } as unknown as LlmClient;
  const messages: LlmMessage[] = [
    { role: "user", content: "Plan an interview" },
  ];
  const result = await structured(llm, schema, messages);
  expect(result.targetEvidence).toHaveLength(1);
  expect(requests[1]?.at(-1)?.content).toContain("targetEvidence");
  expect(requests[1]?.at(-1)?.content).toContain("at least 1");
  expect(messages).toHaveLength(1);
});

test("exhausted retries reject invalid evidence instead of accepting a broken plan", async () => {
  const llm = {
    async completeJson() {
      return { targetEvidence: [] };
    },
  } as unknown as LlmClient;
  await expect(structured(llm, schema, [])).rejects.toBeInstanceOf(z.ZodError);
});
