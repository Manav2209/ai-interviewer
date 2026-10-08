BEGIN;

-- Preserve legacy analysis, including interviews created before the code index
-- existed. Existing indexed files, symbols, commit SHAs and richer facts win.
INSERT INTO "RepositoryKnowledge" ("interviewId", "commitSha", "files", "symbols", "facts")
SELECT
    "interviewId",
    COALESCE(NULLIF("repository"->>'commitSha', ''), 'unknown'),
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_object(
        'repository', "repository",
        'languages', COALESCE(to_jsonb("languages"), '[]'::jsonb),
        'technologies', COALESCE(to_jsonb("technologies"), '[]'::jsonb),
        'dependencies', COALESCE(to_jsonb("dependencies"), '[]'::jsonb),
        'architecture', "architecture",
        'importantFiles', "importantFiles",
        'projectSummary', "projectSummary",
        'evidence', "evidence"
    )
FROM "GithubContext"
ON CONFLICT ("interviewId") DO UPDATE
SET "facts" = EXCLUDED."facts" || CASE
    WHEN jsonb_typeof("RepositoryKnowledge"."facts") = 'object'
        THEN "RepositoryKnowledge"."facts"
    ELSE '{}'::jsonb
END;

DROP TABLE "GithubContext";
ALTER TABLE "Interview" DROP COLUMN "systemPrompt";
ALTER TABLE "InterviewPlan" DROP COLUMN "questions";

COMMIT;
