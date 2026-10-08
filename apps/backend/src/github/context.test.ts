import { expect, test } from "bun:test";
import { readGithubContext } from "./context.js";

const legacyContext = {
  repository: {
    owner: "example",
    name: "project",
    url: "https://github.com/example/project",
  },
  languages: ["TypeScript"],
  technologies: ["Hono"],
  dependencies: ["hono"],
  architecture: { summary: "HTTP API", components: ["backend"] },
  importantFiles: [{ path: "src/server.ts", reason: "Request handling" }],
  projectSummary: "An HTTP service",
  evidence: [{ claim: "Uses Hono", source: "src/server.ts" }],
};

test("legacy repository analysis remains readable without newer optional fields", () => {
  const context = readGithubContext(legacyContext)!;
  expect(context.projectSummary).toBe(legacyContext.projectSummary);
  expect(context.technologies).toEqual(["Hono"]);
  expect(context.architecture).toEqual(legacyContext.architecture);
  expect(context.services).toEqual([]);
  expect(context.interestingTopics).toEqual([]);
});

test("stored repository analysis preserves commit references and richer facts", () => {
  const context = readGithubContext({
    ...legacyContext,
    repository: { ...legacyContext.repository, commitSha: "a".repeat(40) },
    services: ["backend"],
    databases: ["PostgreSQL"],
    APIs: ["GET /health"],
    infrastructure: ["Docker"],
    interestingTopics: [
      { topic: "Retries", reason: "Durable jobs", difficulty: "HARD" },
    ],
  })!;
  expect(context.repository.commitSha).toBe("a".repeat(40));
  expect(context.databases).toEqual(["PostgreSQL"]);
  expect(context.interestingTopics?.[0]?.topic).toBe("Retries");
});

test("missing analysis is distinct from malformed persisted data", () => {
  expect(readGithubContext(undefined)).toBeNull();
  expect(readGithubContext(null)).toBeNull();
  expect(() => readGithubContext({ projectSummary: "incomplete" })).toThrow();
});
