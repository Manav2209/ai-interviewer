import {
  AccessToken,
  AgentDispatchClient,
  RoomServiceClient,
} from "livekit-server-sdk";
import type { BackendConfig } from "../config.js";

export interface StartedLiveKitSession {
  roomName: string;
  serverUrl: string;
  candidateToken: string;
  dispatchId: string;
}

/**
 * Wraps the LiveKit server SDK for room creation, candidate tokens and
 * starting the voice-agent job for an interview session.
 *
 * NOTE: this service only coordinates; it never operates on realtime audio.
 */
export class LiveKitService {
  private readonly rooms: RoomServiceClient;
  private readonly dispatcher: AgentDispatchClient;
  private readonly livekitUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(cfg: Pick<BackendConfig, "LIVEKIT_URL" | "LIVEKIT_API_KEY" | "LIVEKIT_API_SECRET">) {
    this.livekitUrl = cfg.LIVEKIT_URL;
    this.apiKey = cfg.LIVEKIT_API_KEY;
    this.apiSecret = cfg.LIVEKIT_API_SECRET;
    this.rooms = new RoomServiceClient(
      cfg.LIVEKIT_URL,
      cfg.LIVEKIT_API_KEY,
      cfg.LIVEKIT_API_SECRET,
    );
    this.dispatcher = new AgentDispatchClient(
      cfg.LIVEKIT_URL,
      cfg.LIVEKIT_API_KEY,
      cfg.LIVEKIT_API_SECRET,
    );
  }

  serverUrl(): string {
    return this.livekitUrl.replace(/^wss?:\/\//, "https://");
  }

  private async ensureRoom(roomName: string): Promise<void> {
    const existing = await this.rooms.listRooms([roomName]);
    if (existing.length === 0) {
      await this.rooms.createRoom({
        name: roomName,
        emptyTimeout: 10 * 60,
        departureTimeout: 20,
      });
    }
  }

  async issueCandidateToken(roomName: string, identity: string, ttlSeconds = 30 * 60): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      ttl: `${ttlSeconds}s`,
      identity,
      name: "Candidate",
    });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });
    return token.toJwt();
  }

  async startAgentDispatch(options: {
    roomName: string;
    interviewId: string;
    sessionId: string;
    agentName: string;
  }): Promise<string> {
    const { roomName, interviewId, sessionId, agentName } = options;
    // Tell the running voice-agent worker to pick up this interview.
    const dispatch = await this.dispatcher.createDispatch(roomName, agentName, {
      metadata: JSON.stringify({ interviewId, sessionId }),
    });
    return dispatch.id;
  }

  async createSession(options: {
    roomName: string;
    interviewId: string;
    identity: string;
    sessionId: string;
    agentName: string;
    ttlSeconds?: number;
  }): Promise<StartedLiveKitSession> {
    const { roomName, interviewId, sessionId, identity, agentName, ttlSeconds } = options;

    await this.ensureRoom(roomName);
    const candidateToken = await this.issueCandidateToken(roomName, identity, ttlSeconds);
    const dispatchId = await this.startAgentDispatch({
      roomName,
      interviewId,
      sessionId,
      agentName,
    });

    return {
      roomName,
      serverUrl: this.serverUrl(),
      candidateToken,
      dispatchId,
    };
  }
}