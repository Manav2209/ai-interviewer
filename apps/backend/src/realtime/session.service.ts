import { interviewRepo } from "../db/repositories/interview.repo.js";
import { sessionRepo } from "../db/repositories/session.repo.js";
import { LiveKitService } from "./livekit.service.js";
import { newSessionId } from "../lib/ids.js";
import type { BackendConfig } from "../config.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface StartSessionResult {
  interviewId: string;
  sessionId: string;
  roomName: string;
  serverUrl: string;
  token: string;
}

export class SessionService {
  private readonly livekit: LiveKitService;
  private readonly agentName: string;

  constructor(
    cfg: Pick<BackendConfig, "LIVEKIT_URL" | "LIVEKIT_API_KEY" | "LIVEKIT_API_SECRET">,
    agentName = "ai-interviewer",
  ) {
    this.livekit = new LiveKitService(cfg);
    this.agentName = agentName;
  }

  async startForInterview(interviewId: string): Promise<StartSessionResult> {
    const interview = await interviewRepo.getById(interviewId);
    if (!interview) {
      throw new SessionError("Interview not found", 404);
    }
    if (interview.status !== "ready") {
      throw new SessionError(
        `Interview is not ready for a session (status=${interview.status})`,
        409,
      );
    }

    // Reuse an existing active/created session for the same interview.
    const existing = await sessionRepo.getActiveForInterview(interviewId);
    if (existing) {
      const token = await this.livekit.issueCandidateToken(
        existing.roomName,
        `candidate-${interviewId}`,
      );
      return {
        interviewId,
        sessionId: existing.id,
        roomName: existing.roomName,
        serverUrl: existing.serverUrl,
        token,
      };
    }

    const sessionId = newSessionId();
    const roomName = `interview-${interviewId}`;

    const created = await this.livekit.createSession({
      roomName,
      interviewId,
      sessionId,
      identity: `candidate-${interviewId}`,
      agentName: this.agentName,
    });

    await sessionRepo.create({
      id: sessionId,
      interviewId,
      roomName: created.roomName,
      serverUrl: created.serverUrl,
    });

    await interviewRepo.updateStatus(interviewId, { status: "active" });

    return {
      interviewId,
      sessionId,
      roomName: created.roomName,
      serverUrl: created.serverUrl,
      token: created.candidateToken,
    };
  }
}

export class SessionError extends Error {
  constructor(message: string, readonly status?: ContentfulStatusCode) {
    super(message);
    this.name = "SessionError";
  }
}