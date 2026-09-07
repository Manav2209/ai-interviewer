# AI Interviewer

AI Interviewer is a project-aware technical interview platform that interviews candidates based on the software they actually built.

The candidate provides a public GitHub repository. The system analyzes the repository, understands the project's architecture and technologies, generates a tailored interview plan, and then conducts a realtime voice interview using a LiveKit-based AI interviewer.

The core idea is simple:

> **Instead of asking generic interview questions, interview the candidate about their actual codebase.**

---

## Architecture

![AI Interviewer Architecture](assets/arch.png)

### High-level flow

```text
Candidate
   │
   ▼
Next.js Web App
   │
   │ Create Interview
   ▼
Hono Backend
   │
   ├── GitHub Scraper
   │      ├── Repository metadata
   │      ├── Languages
   │      ├── Source tree
   │      ├── Dependencies
   │      ├── README
   │      └── Recent commits
   │
   ├── GitHub Analyzer
   │      │
   │      ▼
   │   Project Context
   │
   ├── Interview Planner
   │      │
   │      ▼
   │   Interview Plan
   │
   └── System Prompt Builder
          │
          ▼
      PostgreSQL
          │
          ▼
     LiveKit Session
          │
          ▼
     Voice Agent
      ├── STT
      ├── LLM
      └── TTS
          │
          ▼
   Realtime Events
          │
          ▼
     Transcript
          │
          ▼
    Evaluation LLM
          │
          ▼
    Interview Result
```

---

# How It Works

## 1. Submit GitHub Repository

The candidate starts by providing a GitHub repository URL.

Example:

```text
https://github.com/user/project
```

The frontend sends the repository to the backend:

```http
POST /api/v1/interviews
```

The backend normalizes the repository URL and creates an interview.

---

## 2. GitHub Repository Scraping

Once the interview is created, the backend asynchronously analyzes the repository.

The scraper collects information such as:

* Repository metadata
* Default branch
* Programming languages
* Repository file tree
* Source files
* Dependency manifests
* README
* Recent commits

The repository tree is bounded to keep the analysis manageable, while important files such as dependency manifests and README content are prioritized.

The collected information becomes the evidence used by the AI analysis pipeline.

---

## 3. GitHub Project Analysis

The repository information is passed to an LLM to build a structured understanding of the project.

The analyzer identifies things such as:

```text
Project
├── Summary
├── Languages
├── Technologies
├── Dependencies
├── Architecture
├── Important Files
└── Evidence
```

The analyzer is designed to stay grounded in repository evidence rather than inventing details about the project.

The resulting project context is persisted in PostgreSQL.

---

## 4. Interview Plan Generation

The project context is then passed to the interview planner.

The planner generates a customized interview plan based on the actual project.

The plan contains:

* Target role
* Difficulty
* Interview topics
* Questions
* Target skills
* Project-specific follow-up questions

The questions are designed to focus on the candidate's actual implementation.

For example, instead of asking:

> "What is Redis?"

the interviewer can ask:

> "I noticed you are using Redis for message processing. Why did you choose Redis here instead of a database or Kafka?"

This allows the interview to evaluate whether the candidate actually understands the system they built.

---

# 5. Interview Preparation

While the repository is being analyzed, the frontend polls the interview status.

The interview moves through states such as:

```text
created
   │
   ▼
analyzing
   │
   ├──────────► failed
   │
   ▼
ready
```

Once the interview becomes `ready`, the candidate can start the realtime interview.

---

# 6. Live Voice Interview

When the candidate starts the interview, the frontend requests a realtime session:

```http
POST /api/v1/interviews/:interviewId/session
```

The backend:

1. Validates the interview state
2. Creates or reuses a LiveKit room
3. Generates a candidate access token
4. Dispatches the AI interviewer agent
5. Returns the session information to the frontend

The browser then connects to LiveKit.

```text
Browser
   │
   │ LiveKit
   ▼
Live Interview Room
   │
   ▼
AI Voice Agent
```

---

# Voice Agent

The realtime interviewer is implemented using LiveKit Agents.

The voice pipeline consists of:

```text
Candidate Voice
      │
      ▼
   Deepgram
      │
      ▼
     LLM
      │
      ▼
    Sarvam
      │
      ▼
Interviewer Voice
```

### Components

| Component          | Technology                  |
| ------------------ | --------------------------- |
| Realtime transport | LiveKit                     |
| Voice agent        | LiveKit Agents              |
| Speech-to-Text     | Deepgram                    |
| LLM                | OpenAI-compatible AI Router |
| Text-to-Speech     | Sarvam                      |

The interviewer receives the project-specific system prompt generated by the backend.

This gives the voice agent context about:

* The candidate's project
* Technologies used
* Architecture
* Important files
* Interview topics
* Planned questions

The interviewer can then ask questions and dynamically follow up based on the candidate's answers.

---

# Interviewer Behavior

The interviewer is designed to behave like a technical interviewer rather than a generic chatbot.

It should:

* Ask one question at a time
* Listen to the candidate's answer
* Ask relevant follow-up questions
* Go deeper when the candidate demonstrates knowledge
* Challenge unclear or contradictory answers
* Focus on the submitted project
* Avoid unnecessary generic trivia
* Adapt the interview based on the candidate's responses

The goal is to evaluate **actual engineering understanding**, not memorized answers.

---

# Realtime Event Flow

The voice agent sends important realtime events back to the backend.

```text
LiveKit Session
      │
      ▼
Voice Agent
      │
      ├── session.started
      ├── transcript.completed
      ├── session.completed
      └── session.failed
      │
      ▼
Backend
      │
      ▼
PostgreSQL
```

Candidate and interviewer messages are persisted as conversation turns.

The system also stores realtime events.

This gives the backend a durable representation of the interview instead of relying only on the live session.

---

# Idempotent Event Processing

Realtime systems can deliver duplicate events, so the backend treats event persistence as idempotent.

Events have unique IDs:

```text
event_id
```

and conversation turns also have unique identifiers.

This prevents duplicate realtime events from producing duplicate transcript records.

---

# Interview Completion

When the candidate finishes the interview:

```http
POST /api/v1/interviews/:interviewId/end
```

the backend moves the interview into the completion pipeline.

```text
active
  │
  ▼
completing
  │
  ▼
evaluation
  │
  ▼
completed
```

The stored transcript is then passed to the evaluation pipeline.

---

# AI Evaluation

The evaluator receives:

```text
GitHub Project Context
        +
Interview Plan
        +
Interview Transcript
        │
        ▼
   Evaluation LLM
        │
        ▼
     Evaluation
```

The evaluator analyzes whether the candidate actually understands the project they submitted.

It produces an overall score and multiple evaluation dimensions.

### Evaluation dimensions

| Dimension             | Description                                                     |
| --------------------- | --------------------------------------------------------------- |
| Technical Knowledge   | Understanding of relevant engineering concepts and technologies |
| Problem Solving       | Ability to reason through technical problems                    |
| Communication         | Clarity and effectiveness of explanations                       |
| Project Understanding | Understanding of the submitted implementation                   |
| Depth                 | Ability to explain design decisions and trade-offs              |

The result also includes:

* Overall score
* Strengths
* Weaknesses
* Feedback
* Detailed evaluation

The evaluator is also instructed to identify contradictions between repository evidence and candidate claims.

---

# Backend API

## Public APIs

| Method | Endpoint                                  | Description                     |
| ------ | ----------------------------------------- | ------------------------------- |
| `GET`  | `/health`                                 | Backend health check            |
| `POST` | `/api/v1/interviews`                      | Create an interview             |
| `GET`  | `/api/v1/interviews/:id`                  | Get interview state and context |
| `POST` | `/api/v1/interviews/:interviewId/session` | Start LiveKit session           |
| `POST` | `/api/v1/interviews/:interviewId/end`     | End interview and evaluate      |
| `GET`  | `/api/v1/interviews/:interviewId/result`  | Get evaluation result           |

## Internal APIs

The voice agent communicates with the backend through internal endpoints:

```http
GET  /internal/context/:interviewId
POST /internal/realtime/events
```

These endpoints are protected using an internal bearer token.

---

# Repository Structure

```text
ai-interviewer/
│
├── apps/
│   │
│   ├── web/
│   │   └── Next.js candidate application
│   │
│   ├── backend/
│   │   └── Hono API + interview orchestration
│   │
│   └── voice-agent/
│       └── LiveKit realtime interviewer
│
├── packages/
│   │
│   ├── providers/
│   │   └── Shared STT / LLM / TTS providers
│   │
│   ├── ui/
│   │   └── Shared React UI
│   │
│   └── ...
│
├── package.json
├── turbo.json
└── bun.lock
```

---

# Web Application

The web application is located in:

```text
apps/web
```

It contains the candidate-facing experience.

Main responsibilities:

* GitHub repository submission
* Interview preparation
* Interview status polling
* LiveKit connection
* Microphone controls
* Interview UI
* Live transcript
* Interview completion
* Evaluation result

### Stack

* Next.js
* React
* LiveKit Client SDK
* TypeScript

---

# Backend

The backend is located in:

```text
apps/backend
```

It is responsible for orchestrating the entire interview lifecycle.

Main responsibilities:

* Interview creation
* GitHub scraping
* GitHub analysis
* Interview planning
* System prompt generation
* LiveKit session creation
* Voice-agent coordination
* Realtime event ingestion
* Transcript persistence
* Interview evaluation
* Result retrieval

### Stack

* Hono
* Bun
* TypeScript
* Prisma
* PostgreSQL
* Zod
* OpenAI-compatible LLM API

---

# Voice Agent

The realtime agent is located in:

```text
apps/voice-agent
```

The voice agent owns the realtime conversational loop.

Responsibilities include:

* Connecting to LiveKit
* Receiving candidate audio
* Speech-to-text
* LLM response generation
* Text-to-speech
* Sending interviewer audio back to the candidate
* Sending realtime events to the backend

---

# Database Model

The main data relationship is:

```text
Interview
│
├── GithubContext
│
├── InterviewPlan
│
├── InterviewSession
│   │
│   ├── ConversationTurn
│   │
│   └── RealtimeEvent
│
└── Evaluation
```

### Interview

Stores the overall interview lifecycle.

### GithubContext

Stores the structured understanding of the candidate's repository.

### InterviewPlan

Stores the generated interview questions, topics, role, and difficulty.

### InterviewSession

Represents a realtime interview session.

### ConversationTurn

Stores the persisted interview transcript.

### RealtimeEvent

Stores realtime events received from the voice agent.

### Evaluation

Stores the final AI-generated assessment.

---

# Interview Lifecycle

The complete lifecycle can be represented as:

```text
                  ┌──────────────┐
                  │   Candidate  │
                  └──────┬───────┘
                         │
                         ▼
                Submit GitHub URL
                         │
                         ▼
                    ┌─────────┐
                    │ Created │
                    └────┬────┘
                         │
                         ▼
                   GitHub Scrape
                         │
                         ▼
                    LLM Analysis
                         │
                         ▼
                 Interview Planning
                         │
                         ▼
                    ┌────────┐
                    │ Ready  │
                    └───┬────┘
                        │
                        ▼
                 Start LiveKit
                        │
                        ▼
                    ┌────────┐
                    │ Active │
                    └───┬────┘
                        │
                        ▼
                  Voice Interview
                        │
                        ▼
                  Store Transcript
                        │
                        ▼
                  ┌────────────┐
                  │ Completing │
                  └─────┬──────┘
                        │
                        ▼
                   AI Evaluation
                        │
                        ▼
                  ┌───────────┐
                  │ Completed │
                  └─────┬─────┘
                        │
                        ▼
                  Interview Result
```

---

# Technology Stack

| Layer           | Technology                  |
| --------------- | --------------------------- |
| Monorepo        | Turborepo                   |
| Package Manager | Bun                         |
| Language        | TypeScript                  |
| Frontend        | Next.js + React             |
| Backend         | Hono                        |
| Database        | PostgreSQL                  |
| ORM             | Prisma                      |
| Realtime        | LiveKit                     |
| Voice Agent     | LiveKit Agents              |
| STT             | Deepgram                    |
| LLM             | OpenAI-compatible AI Router |
| TTS             | Sarvam                      |
| Validation      | Zod                         |

---

# Getting Started

## Prerequisites

Make sure you have:

* Bun
* Node.js 24+
* PostgreSQL or Docker
* LiveKit credentials
* GitHub API access
* Deepgram API key
* Sarvam API key
* OpenAI-compatible LLM API credentials

---

## Install Dependencies

From the repository root:

```bash
bun install
```

---

## Start PostgreSQL

The backend includes a Docker Compose configuration for PostgreSQL.

```bash
cd apps/backend

docker compose up -d
```

---

## Backend Environment Variables

Create:

```text
apps/backend/.env
```

based on:

```text
apps/backend/.env.example
```

Example:

```env
PORT=8080

DATABASE_URL=postgresql://ai_interview:ai_interview@localhost:5432/ai_interview

AI_ROUTER_BASE_URL=
AI_ROUTER_API_KEY=
AI_ROUTER_MODEL=

LLM_TEMPERATURE=0.4

LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

INTERNAL_API_TOKEN=

CORS_ALLOWED_ORIGINS=http://localhost:3000
```

---

## Database Migration

```bash
cd apps/backend

bun run db:migrate
```

Generate Prisma client if required:

```bash
bun run db:generate
```

---

# Voice Agent Configuration

Create:

```text
apps/voice-agent/.env
```

based on:

```text
apps/voice-agent/.env.example
```

Example:

```env
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

DEEPGRAM_API_KEY=
DEEPGRAM_MODEL=nova-3
DEEPGRAM_UTTERANCE_END_MS=800

AI_ROUTER_BASE_URL=
AI_ROUTER_API_KEY=
AI_ROUTER_MODEL=

LLM_TEMPERATURE=0.4

SARVAM_API_KEY=
SARVAM_MODEL=bulbul:v3
SARVAM_SPEAKER=shubh
SARVAM_TARGET_LANGUAGE=en-IN

AGENT_LANGUAGE=en

BACKEND_BASE_URL=http://localhost:8080
INTERNAL_API_TOKEN=
```

---

# Web Configuration

The frontend communicates with the backend through:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
```

---

# Running the Application

From the root:

```bash
bun run dev
```

Start the voice agent:

```bash
bun run agent:start
```

The system should then consist of:

```text
Web
 │
 ├── Next.js
 │
 ▼
Backend
 │
 ├── GitHub Analysis
 ├── Interview Planning
 ├── PostgreSQL
 │
 ▼
LiveKit
 │
 ▼
Voice Agent
 │
 ├── Deepgram
 ├── LLM
 └── Sarvam
```

---

# Development Commands

## Root

```bash
bun run dev
bun run build
bun run lint
bun run check-types
bun run agent:start
```

## Backend

```bash
cd apps/backend

bun run dev
bun run build
bun run lint
bun run check-types

bun run db:generate
bun run db:migrate
bun run db:migrate:deploy
bun run db:studio
```

## Web

```bash
cd apps/web

bun run dev
bun run build
bun run start
bun run lint
bun run check-types
```

## Voice Agent

```bash
cd apps/voice-agent

bun run dev
bun run start
bun run build
bun run check-types
bun run lint
bun run agent:start
```

---

# Design Principles

## Project-Grounded Interviews

The interview is generated from the candidate's actual repository.

This allows the system to ask questions about:

* Architecture
* Design decisions
* Dependencies
* Data flow
* APIs
* Trade-offs
* Implementation details
* AI logic
* Infrastructure

---

## Evidence-Based AI

The GitHub analyzer is instructed to make claims based on repository evidence.

The evaluator also receives repository context so that it can compare:

```text
What the repository contains
          vs
What the candidate claims
```

This helps identify shallow understanding and inconsistencies.

---

## Async Interview Preparation

Repository analysis and interview planning happen asynchronously.

This prevents the initial API request from having to wait for the entire LLM pipeline.

```text
Create Interview
      │
      ▼
Return analyzing
      │
      ├── GitHub scraping
      ├── Project analysis
      └── Interview planning
              │
              ▼
            ready
```

---

## Realtime Separation

The backend does not directly handle the raw voice conversation.

Instead:

```text
Frontend
   │
   ▼
LiveKit
   │
   ▼
Voice Agent
```

The backend handles durable application state, while the voice agent handles the realtime conversational loop.

This keeps realtime infrastructure and business logic separated.

---

## Event-Driven Transcript Persistence

The voice agent emits domain-level events instead of requiring the backend to process raw audio.

For example:

```text
session.started
transcript.completed
session.completed
session.failed
```

The backend persists these events and converts completed transcript events into durable conversation turns.

---

# Security

The browser does not receive LiveKit server credentials.

Instead:

```text
Browser
   │
   │ Candidate token
   ▼
LiveKit
```

The backend is responsible for generating candidate access tokens.

The backend-to-voice-agent communication is protected through:

```text
INTERNAL_API_TOKEN
```

Sensitive credentials should never be committed to the repository.

---

# Current Limitations

The current implementation has several intentional boundaries:

* GitHub scraping is focused on public GitHub repositories.
* GitHub API requests are subject to GitHub rate limits.
* Repository trees are bounded to keep analysis manageable.
* README and manifest content is truncated before LLM processing.
* LLM outputs are expected to follow structured JSON schemas.
* The current application focuses primarily on the candidate interview experience.
* Authentication and recruiter-facing workflows are outside the current core flow.

---

# Future Improvements

Potential areas for expansion include:

* Private repository support
* GitHub OAuth
* Candidate profiles
* Interview history
* Recruiter dashboard
* Multiple interview types
* Coding rounds
* Screen sharing
* Code-specific questions
* Multi-agent interviewing
* Better adaptive questioning
* Interview analytics
* Advanced evaluation rubrics
* Observability and tracing
* Automated evaluation datasets

---

# Project Philosophy

Traditional technical interviews mostly evaluate candidates through predefined questions.

AI Interviewer takes a different approach:

```text
Traditional Interview

Candidate
    │
    ▼
Generic Questions
    │
    ▼
Answers
    │
    ▼
Evaluation
```

versus:

```text
AI Interviewer

Candidate
    │
    ▼
Real GitHub Project
    │
    ▼
Repository Understanding
    │
    ▼
Project-Specific Questions
    │
    ▼
Realtime Follow-ups
    │
    ▼
Transcript
    │
    ▼
Evidence-Based Evaluation
```

The goal is to make the interview **more representative of the candidate's real engineering ability** by grounding the conversation in software they actually built.

---

## License

No license is currently declared in the repository.
