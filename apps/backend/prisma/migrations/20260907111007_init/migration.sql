-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('created', 'analyzing', 'ready', 'active', 'completing', 'completed', 'failed', 'evaluation_failed');

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "githubUrl" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'created',
    "systemPrompt" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GithubContext" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "repository" JSONB NOT NULL,
    "languages" TEXT[],
    "technologies" TEXT[],
    "dependencies" TEXT[],
    "architecture" JSONB NOT NULL,
    "importantFiles" JSONB NOT NULL,
    "projectSummary" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,

    CONSTRAINT "GithubContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewPlan" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "topics" JSONB NOT NULL,
    "questions" JSONB NOT NULL,

    CONSTRAINT "InterviewPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Interview_githubUrl_idx" ON "Interview"("githubUrl");

-- CreateIndex
CREATE UNIQUE INDEX "GithubContext_interviewId_key" ON "GithubContext"("interviewId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewPlan_interviewId_key" ON "InterviewPlan"("interviewId");

-- AddForeignKey
ALTER TABLE "GithubContext" ADD CONSTRAINT "GithubContext_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewPlan" ADD CONSTRAINT "InterviewPlan_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
