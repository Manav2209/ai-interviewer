import { prisma } from "../db/client.js";
import { Prisma } from "@prisma/client";
import { GithubScraper } from "../github/github.scraper.js";
import { GithubAnalyzer } from "../github/github.analyzer.js";
import { InterviewPlanner } from "./interview.planner.js";
import { buildSystemPrompt } from "./interview.prompt.js";
import type { LlmClient } from "../llm/llm.client.js";
import { newId } from "../lib/ids.js";
import { interviewRepo } from "../db/repositories/interview.repo.js";
import type { InterviewStatus } from "@prisma/client";

type InterviewWithContext = Prisma.InterviewGetPayload<{
  include: { githubContext: true; interviewPlan: true };
}>;

export class InterviewService {
  private readonly scraper = new GithubScraper();
  private readonly analyzer: GithubAnalyzer;
  private readonly planner: InterviewPlanner;

  constructor(llm: LlmClient) {
    this.analyzer = new GithubAnalyzer(llm);
    this.planner = new InterviewPlanner(llm);
  }

  async create(githubUrl: string): Promise<{ id: string; status: InterviewStatus }> {
    const { owner, name, url } = GithubScraper.parseGithubUrl(githubUrl);

    const interview = await interviewRepo.create({
      id: newId("int"),
      githubUrl: url,
      owner,
      name,
    });

    void this.runPipeline(interview.id);

    return { id: interview.id, status: "analyzing" };
  }

  async getById(id: string): Promise<InterviewWithContext | null> {
    return interviewRepo.getWithContext(id);
  }

  private async runPipeline(id: string): Promise<void> {
    try {
      await interviewRepo.updateStatus(id, { status: "analyzing" });

      const interview = await interviewRepo.getById(id);
      if (!interview) throw new Error(`Interview ${id} not found`);

      const scraped = await this.scraper.scrape(interview.owner, interview.name);
      const context = await this.analyzer.analyze(scraped);

      await prisma.githubContext.upsert({
        where: { interviewId: id },
        create: {
          interviewId: id,
          repository: context.repository,
          languages: context.languages,
          technologies: context.technologies,
          dependencies: context.dependencies,
          architecture: context.architecture,
          importantFiles: context.importantFiles,
          projectSummary: context.projectSummary,
          evidence: context.evidence,
        },
        update: {
          repository: context.repository,
          languages: context.languages,
          technologies: context.technologies,
          dependencies: context.dependencies,
          architecture: context.architecture,
          importantFiles: context.importantFiles,
          projectSummary: context.projectSummary,
          evidence: context.evidence,
        },
      });

      const plan = await this.planner.plan(context);
      const systemPrompt = buildSystemPrompt(context, plan);

      await prisma.interviewPlan.upsert({
        where: { interviewId: id },
        create: {
          interviewId: id,
          role: plan.role,
          difficulty: plan.difficulty,
          topics: plan.topics as unknown as Prisma.InputJsonValue,
          questions: plan.questions as unknown as Prisma.InputJsonValue,
        },
        update: {
          role: plan.role,
          difficulty: plan.difficulty,
          topics: plan.topics as unknown as Prisma.InputJsonValue,
          questions: plan.questions as unknown as Prisma.InputJsonValue,
        },
      });

      await interviewRepo.markReady(id, systemPrompt);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[interview:${id}] pipeline failed: ${message}`);
      await interviewRepo.updateStatus(id, { status: "failed", error: message });
    }
  }
}