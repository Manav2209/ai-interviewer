import type { LlmClient } from "../llm/llm.client.js";
import type { ScrapedGithubRepo, GithubContext } from "./github.types.js";

const SYSTEM_PROMPT = `You are a senior software engineer analyzing a candidate's GitHub repository for a technical interview.
Produce a structured project context. Be specific and evidence-based. Do not invent claims about the project.
Only report technologies, dependencies, and architecture details that are supported by the provided repository data.

Respond with valid JSON only.`;

function buildUserPrompt(scraped: ScrapedGithubRepo): string {
  const sections: string[] = [];

  sections.push(`# Repository
${JSON.stringify(scraped.repository, null, 2)}`);

  if (scraped.languages.length > 0) {
    sections.push(`# Languages (by byte count)
${scraped.languages.join(", ")}`);
  }

  if (scraped.tree.length > 0) {
    sections.push(`# Source tree (first ${scraped.tree.length} files)
${scraped.tree.map((f) => f.path).join("\n")}`);
  }

  if (scraped.manifests.length > 0) {
    sections.push(`# Dependency / config manifests
${scraped.manifests.map((m) => `### ${m.path}\n${m.content.slice(0, 4000)}`).join("\n\n")}`);
  }

  if (scraped.readme) {
    sections.push(`# README
${scraped.readme.slice(0, 4000)}`);
  }

  if (scraped.recentCommits.length > 0) {
    sections.push(`# Recent commits
${scraped.recentCommits
  .map((c) => `- ${c.date} ${c.author}: ${c.message}`)
  .join("\n")}`);
  }

  const prompt = `Analyze this GitHub repository for an engineering interview. Identify the technologies,
the high-level architecture, the most important source files that reveal business logic, data flow,
AI logic, database logic, API design, auth, or infrastructure; and generate a project summary and
evidence-based claims.

Required JSON shape (no extra keys):
{
  "repository": { "owner": string, "name": string, "url": string, "description"?: string },
  "languages": string[],
  "technologies": string[],
  "dependencies": string[],
  "architecture": { "summary": string, "components": string[] },
  "importantFiles": [{ "path": string, "reason": string, "content"?: string }],
  "projectSummary": string,
  "evidence": [{ "claim": string, "source": string }]
}

Repository data:
${sections.join("\n\n")}`;

  return prompt;
}

export class GithubAnalyzer {
  constructor(private readonly llm: LlmClient) {}

  async analyze(scraped: ScrapedGithubRepo): Promise<GithubContext> {
    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      { role: "user" as const, content: buildUserPrompt(scraped) },
    ];
    const context = await this.llm.completeJson<GithubContext>(messages, { maxTokens: 8192 });

    return {
      repository: {
        owner: scraped.repository.owner,
        name: scraped.repository.name,
        url: scraped.repository.url,
        description: context.repository.description ?? scraped.repository.description,
      },
      languages: Array.isArray(context.languages) ? context.languages : [],
      technologies: Array.isArray(context.technologies) ? context.technologies : [],
      dependencies: Array.isArray(context.dependencies) ? context.dependencies : [],
      architecture: context.architecture ?? { summary: "", components: [] },
      importantFiles: Array.isArray(context.importantFiles) ? context.importantFiles : [],
      projectSummary: context.projectSummary ?? "",
      evidence: Array.isArray(context.evidence) ? context.evidence : [],
    };
  }
}