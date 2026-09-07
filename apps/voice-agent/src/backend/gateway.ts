import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghjkmnpqrstuvwxyz";
const random = customAlphabet(alphabet, 16);

export function newEventId(): string {
  return `evt_${random()}`;
}

export function newTurnId(): string {
  return `turn_${random()}`;
}

export interface InterviewContextResponse {
  interviewId: string;
  sessionId?: string;
  systemPrompt: string | null;
  githubContext: {
    repository: { owner: string; name: string };
    projectSummary: string;
    technologies: string[];
    architecture: { summary: string; components: string[] };
    languages: string[];
    importantFiles: { path: string; reason: string; content?: string }[];
  } | null;
  interviewPlan: {
    role: string;
    difficulty: string;
    topics: string[];
    questions: { text: string; targetSkills: string[] }[];
  } | null;
}

export interface RealtimeEventInput {
  eventId: string;
  interviewId: string;
  sessionId: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export class BackendGateway {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`backend ${init?.method ?? "GET"} ${path} -> ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  async fetchInterviewContext(interviewId: string, sessionId?: string): Promise<InterviewContextResponse> {
    const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    return this.request<InterviewContextResponse>(`/internal/context/${interviewId}${query}`);
  }

  async postRealtimeEvent(ev: RealtimeEventInput): Promise<{ outcome: string }> {
    return this.request<{ outcome: string }>("/internal/realtime/events", {
      method: "POST",
      body: JSON.stringify(ev),
    });
  }
}