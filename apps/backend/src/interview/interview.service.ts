import { prisma } from "../db/client.js";
import { Prisma } from "@prisma/client";
import { GithubScraper } from "../github/github.scraper.js";
import { GithubAnalyzer } from "../github/github.analyzer.js";
import { InterviewPlanner } from "./interview.planner.js";
import type { LlmClient } from "../llm/llm.client.js";
import { newId } from "../lib/ids.js";
import { interviewRepo } from "../db/repositories/interview.repo.js";
import type { InterviewStatus } from "@prisma/client";
import { storeKnowledge } from "../github/knowledge.js";
import { withTrace } from "../observability/events.js";

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

  async create(
    githubUrl: string,
    userId: string,
  ): Promise<{ id: string; status: InterviewStatus }> {
    const { owner, name, url } = GithubScraper.parseGithubUrl(githubUrl);

    const interview = await prisma.$transaction(async (tx) => {
      const row = await tx.interview.create({
        data: {
          id: newId("int"),
          githubUrl: url,
          owner,
          name,
          userId,
          status: "analyzing",
        },
      });
      await tx.interviewJob.create({
        data: {
          id: newId("job"),
          interviewId: row.id,
          kind: "PREPARE",
          key: `PREPARE:${row.id}`,
          payload: {},
        },
      });
      return row;
    });

    return { id: interview.id, status: "analyzing" };
  }

  async getById(id: string): Promise<InterviewWithContext | null> {
    return interviewRepo.getWithContext(id);
  }

  async runPipeline(id: string): Promise<void> {
    try {
      const interview = await interviewRepo.getById(id);
      if (!interview) throw new Error(`Interview ${id} not found`);
      if (interview.status !== "analyzing") return;

      const scraped = await withTrace(id, "repository_retrieval", () =>
        this.scraper.scrape(interview.owner, interview.name),
      );
      const context = await withTrace(id, "repository_analysis", () =>
        this.analyzer.analyze(scraped),
      );
      await storeKnowledge(id, scraped, context);

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

      const plan = await withTrace(id, "interview_planning", () =>
        this.planner.plan(context),
      );

      await prisma.interviewPlan.upsert({
        where: { interviewId: id },
        create: {
          interviewId: id,
          role: plan.role,
          difficulty: plan.difficulty,
          topics: plan.topics as unknown as Prisma.InputJsonValue,
          questions: [],
          objectives: plan.objectives as unknown as Prisma.InputJsonValue,
        },
        update: {
          role: plan.role,
          difficulty: plan.difficulty,
          topics: plan.topics as unknown as Prisma.InputJsonValue,
          questions: [],
          objectives: plan.objectives as unknown as Prisma.InputJsonValue,
        },
      });

      await interviewRepo.markReady(id, "");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[interview:${id}] pipeline failed: ${message}`);
      throw err;
    }
  }
}
