CREATE TABLE "InterviewRuntime" (
    "interviewId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InterviewRuntime_pkey" PRIMARY KEY ("interviewId")
);

ALTER TABLE "InterviewRuntime" ADD CONSTRAINT "InterviewRuntime_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Evaluation" ALTER COLUMN "score" DROP NOT NULL;
ALTER TABLE "Evaluation" ADD COLUMN "evidence" JSONB;
ALTER TABLE "InterviewPlan" ADD COLUMN "objectives" JSONB;
ALTER TABLE "Interview" ADD COLUMN "evaluationLeaseUntil" TIMESTAMP(3);
