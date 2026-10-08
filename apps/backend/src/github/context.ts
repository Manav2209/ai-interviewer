import { z } from "zod";
import type { GithubContext } from "./github.types.js";

export const contextSchema = z.object({
  repository: z.object({
    owner: z.string(),
    name: z.string(),
    url: z.string(),
    description: z.string().optional(),
    commitSha: z.string().optional(),
  }),
  languages: z.array(z.string()),
  technologies: z.array(z.string()),
  dependencies: z.array(z.string()),
  architecture: z.object({
    summary: z.string(),
    components: z.array(z.string()),
  }),
  importantFiles: z.array(
    z.object({
      path: z.string(),
      reason: z.string(),
      content: z.string().optional(),
    }),
  ),
  projectSummary: z.string(),
  evidence: z.array(z.object({ claim: z.string(), source: z.string() })),
  services: z.array(z.string()).max(15).default([]),
  databases: z.array(z.string()).max(10).default([]),
  APIs: z.array(z.string()).max(20).default([]),
  infrastructure: z.array(z.string()).max(15).default([]),
  interestingTopics: z
    .array(
      z.object({
        topic: z.string(),
        reason: z.string(),
        difficulty: z.enum(["EASY", "MEDIUM", "HARD", "EXPERT"]),
      }),
    )
    .max(12)
    .default([]),
});

export function readGithubContext(facts: unknown): GithubContext | null {
  return facts == null ? null : contextSchema.parse(facts);
}
