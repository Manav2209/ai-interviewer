# AI Interviewer

A repository-aware technical interviewer with a cascaded voice pipeline and a durable interview orchestrator.

## Architecture

- `apps/backend`: Hono API, GitHub analysis, interview objectives and policies, PostgreSQL state, repository tools, durable jobs, and evidence-backed evaluation.
- `apps/voice-agent`: LiveKit voice worker, Silero VAD, Deepgram STT/TTS, playback interruptions, final answers, and spoken transcript events.
- `apps/web`: Next.js candidate flow, live transcripts, reconnect, and interview results.
- `packages/providers`: provider configuration and construction.
- `packages/db`: Prisma schema, migration history, generated client, and shared database connection, exposed through `@repo/db`.

The backend owns interview progression. Models extract information and generate questions; application code controls phases, objectives, difficulty, deadlines, and state changes. The voice worker speaks backend questions and cancels playback locally when candidate speech interrupts it.

The implementation specification is in [spec/improvement-spec.md](spec/improvement-spec.md). Its October 1 delivery decisions supersede the original first-release scope.

## Response latency

During an interview, a final candidate turn follows:

```text
STT → persist answer → lightweight answer analysis → select action → generate question → TTS
```

Answer analysis and question generation each have a four-second request limit and one attempt. If analysis fails, the transcript stays durable and the interviewer asks a clarification. Question generation has a safe fallback. These limits bound model requests; they are not a guarantee of total end-to-end latency.

Detailed repository claim checks, failed analysis recovery, and scoring run after the interview:

```text
END job → recover pending analysis → VERIFY jobs → EVALUATE job → result
```

Claim verification checks whether fetched code supports or contradicts a factual statement. Missing code in a partial index is not a contradiction. Repository implementation alone never demonstrates candidate competence.

## State and recovery

- Objective plans replace static question banks. Each question records its objective, phase, difficulty, reason, and code references when available.
- Final answers are persisted before reasoning. Stable turn IDs deduplicate retries. Runtime leases and version checks serialize state changes across backend processes.
- The clock starts when the voice session is allocated. It survives reconnects and worker restarts.
- Session allocation is serialized in PostgreSQL. The session row exists before LiveKit dispatch.
- Disconnects allow a configured reconnect window. Heartbeats detect stale workers. Reconnecting restores the pending question and persisted transcript.
- The browser End action immediately stops further progression. Finalization and evaluation use unique durable job keys, expiring leases, and bounded retries.
- Failed evaluations can be retried from the result page.
- Voice events are journaled until the backend acknowledges them. For durable recovery across container replacement, mount `VOICE_OUTBOX_DIR` on persistent storage. Its default OS temporary directory covers process restarts on the same host.

## Repository knowledge and limits

Only HTTPS GitHub repository URLs are accepted. Fetches are pinned to a commit SHA. The index contains up to 1,500 paths and 24 selected text files, at most 10,000 characters per file and 120,000 characters overall. Repositories over 100 MB are rejected. This is a partial index, not a full code audit.

Read tools expose project context, architecture, bounded file excerpts, lexical symbol lookup, code search, dependency lookup, candidate state, and the current objective. Code references include path, commit SHA, and line range. Symbol lookup uses lexical declarations rather than a language-specific AST. Dependency lookup currently supports `package.json`; other manifests contribute to repository analysis and can be inspected with file/search tools.

Repository analysis and indexed source excerpts are stored together in `RepositoryKnowledge`. The consolidation migration copies legacy `GithubContext` analysis into that record before dropping the duplicate table. Existing source indexes and richer analysis are preserved. The unused `Interview.systemPrompt` and `InterviewPlan.questions` columns are removed; actual question history remains in interview runtime state.

Repository text and candidate answers are untrusted data. All structured model outputs are validated with Zod. Model-proposed tools cannot directly mutate interview state. Limits include 40 questions, five tool calls per registry operation, 200 tool calls per interview, 60,000 input characters per model request, and bounded output tokens.

## Evaluation

The evaluation includes technical depth, architecture, debugging, implementation, tradeoff reasoning, and communication. Final grading reads the recorded candidate answers directly, including adjacent speech fragments, instead of trusting speculative live summaries. Every assessed category includes a numeric score, confidence, and quotes checked against the originating candidate turns. Confidence expresses certainty of the assessment, not candidate ability: a clearly weak answer can receive a low score with high confidence. Unsupported categories and scores remain `INSUFFICIENT_EVIDENCE` / `null`; pipeline failures and unexplored objectives are not candidate weaknesses. Overall and dimension scores are calculated from assessed categories, excluding unassessed areas.

The responsive result view includes a skill breakdown, supporting answer quotes, session details, transcript review, and an option to regenerate an assessment of the saved answers.

## Access and security

The browser automatically obtains a random, 30-day anonymous access token. Only its hash is stored on the server. Interviews belong to the corresponding browser user; every public interview operation checks ownership. Browser tokens are stored locally, so clearing browser storage removes access to those interviews. This flow does not include account signup or cross-device recovery.

Interviews created before ownership was introduced have no browser owner and are inaccessible through the protected public API. Create a new interview after upgrading; migration does not assign old interviews to an arbitrary user.

The voice worker uses a separate internal bearer token and must supply a session belonging to the interview. The browser never receives server credentials. Database-backed rate limits cover access bootstrap, interview creation, public operations, internal events, and candidate turns.

## Setup

Requirements: Bun 1.4.2, Node.js 24+, a PostgreSQL instance (local or managed), LiveKit, Deepgram, and an OpenAI-compatible model endpoint.

```bash
bun install
```

Copy each app's `.env.example` to `.env` and fill in credentials. Copy `packages/db/.env.example` to `packages/db/.env` and set its `DATABASE_URL` to your database's direct PostgreSQL connection URL. Set the backend's `DATABASE_URL` to the same database; the application may use a pooled connection URL. The backend and voice worker must share `INTERNAL_API_TOKEN`. The web app uses `NEXT_PUBLIC_BACKEND_URL`. From the repository root, generate the Prisma client and run migrations yourself against that database:

```bash
bun run db:generate
bun run db:migrate:deploy
bun run db:migrate:status
```

Database commands are root aliases for scripts in `packages/db`; Prisma dependencies and files live in that package. Prisma loads `packages/db/.env` for these commands. Alternatively, export `DATABASE_URL` in your shell. Development migrations use `db:migrate`; deployments use `db:migrate:deploy`.

When applying the repository-context consolidation to an existing deployment, stop the backend and voice workers first, take a database backup, apply the migration manually, and start images built from the updated code. The previous backend requires the removed table and cannot run against the new schema.

The backend defaults to a 30-minute interview and a 300-second reconnect window. Optional `GITHUB_TOKEN` authenticates public GitHub API requests. Silero controls answer boundaries with a 1-second silence window, while Deepgram final segments accumulate within an answer (500 ms provider endpointing). Silero also detects interruptions; its defaults require 400 ms of speech and two transcribed words for interruption, reducing accidental cancellation from brief noises.

Start the backend and web app from the repository root:

```bash
bun run dev
```

Start the voice worker separately:

```bash
bun run agent:start
```

The worker dispatch name is `ai-interviewer`. Silero is preloaded once per worker process and reused for its session.

## Docker

Run Docker commands from the repository root (`my-turborepo`), since all three apps depend on workspace packages. Each app has its own multi-stage Dockerfile. Containers run as an unprivileged user, and `.dockerignore` excludes local dependencies, build outputs, and environment files.

Fill in `apps/backend/.env` and `apps/voice-agent/.env` using their examples. Set `DATABASE_URL` in `apps/backend/.env` to your managed PostgreSQL connection URL, with the TLS settings required by your provider. Use the same LiveKit project, model endpoint, and `INTERNAL_API_TOKEN` in both. PostgreSQL, LiveKit, Deepgram, and the model endpoint remain external services.

Run migrations yourself from a machine that can reach the managed database, before starting the application. After installing workspace dependencies, run this command from the repository root to apply migrations from `packages/db/prisma/migrations` using `packages/db/.env`:

```bash
bun run db:migrate:deploy
```

The backend image generates the Prisma client during its build. Client generation creates application code from the schema; it does not apply migrations or copy database data. Migration files remain in the repository for your manual migration workflow. The application containers do not run migrations on startup.

`NEXT_PUBLIC_BACKEND_URL` must be reachable by the candidate's browser and is embedded during the web image build. Pass the public API URL with `--build-arg NEXT_PUBLIC_BACKEND_URL=...` when building the web image, and add the frontend origin to `CORS_ALLOWED_ORIGINS` in `apps/backend/.env`. Setting the URL only when running a built container does not change the browser bundle.

If a provider runs on the Docker host, use `host.docker.internal` instead of `localhost` in its configured URL on Docker Desktop. A self-hosted LiveKit URL must also be reachable by the browser, since it is returned with the session token.

Build individual images from the same root:

```bash
docker build -f apps/backend/Dockerfile -t ai-interview-backend:local .
docker build -f apps/voice-agent/Dockerfile -t ai-interview-voice-agent:local .
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_BACKEND_URL=http://localhost:8080 -t ai-interview-web:local .
```

Run the images individually with Docker or your deployment platform. Supply the backend and voice worker environment variables at runtime. The voice worker's `BACKEND_BASE_URL` must resolve to the backend from inside its container. Publish port 8080 for the backend and port 3000 for the web app when running locally, and wait for the backend's `/health` endpoint before starting the voice worker.

The voice image runs the worker in LiveKit's production `start` mode. Its health endpoint is on internal port 8081; it needs no published audio port because it connects to LiveKit. Mount persistent storage at `/app/data/voice-outbox` to preserve unacknowledged voice events across container replacement. Allow up to 65 minutes for active interviews to drain when stopping the voice container, for example with Docker's `--stop-timeout 3900` option when creating it.

Your managed database has its own lifecycle and backups, independent of the application containers.

## Observability

Interview events and timings are recorded in PostgreSQL, including retrieval, planning, candidate turns, analysis, action selection, tools, question generation, voice timings, interruptions, claim checks, and evaluation.

To export traces, configure `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_SECRET_KEY` in the backend. The exporter uses [Langfuse's OTLP endpoint](https://langfuse.com/docs/observability/get-started) and retries unacknowledged events from the database. Candidate answers and source excerpts are omitted from exported trace metadata. Without credentials, events remain local.

## Checks

GitHub Actions runs code checks and builds all three Docker images on pull requests, pushes to `main`, and manual runs. After code checks pass on a `main` push, it publishes images to Docker Hub under `manav2854` with `sha-<full commit SHA>` tags. Publishing requires the `DOCKERHUB_TOKEN` repository secret. Follow [docs/ci-practice.md](docs/ci-practice.md) to configure credentials, trigger runs, diagnose a deliberate failure, and require CI before merging. The workflow does not deploy or apply database migrations.

```bash
bun run check-types
bun run lint
bun run build
cd apps/backend
bun run test
```

Unit checks cover objective selection, phase transitions, repository references and path validation, evaluation evidence validation, and trace metadata. No integration test suite is included, as requested. A production build and a successful local Silero load do not establish live microphone, provider, or Langfuse delivery behavior; verify those with the configured services before deployment.
