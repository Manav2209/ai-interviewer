import type {
  InterviewResult,
  InterviewView,
  SessionInfo,
} from "../types/interview";

const BASE_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080"
).replace(/\/$/, "");
let accessPromise: Promise<string> | null = null;
async function accessToken(): Promise<string> {
  const saved = localStorage.getItem("interview-access");
  if (saved) return saved;
  if (!accessPromise)
    accessPromise = fetch(`${BASE_URL}/api/v1/auth/session`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok)
          throw new Error("Unable to create an interview access session");
        const data = (await res.json()) as { token: string };
        localStorage.setItem("interview-access", data.token);
        return data.token;
      })
      .finally(() => {
        accessPromise = null;
      });
  return accessPromise;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await accessToken()}`,
      ...(init?.headers ?? {}),
    },
  });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const message =
      (body &&
      typeof body === "object" &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : null) ?? `Request failed (${res.status})`;
    throw new Error(message);
  }

  return body as T;
}

export function createInterview(githubUrl: string): Promise<InterviewView> {
  return request<InterviewView>("/api/v1/interviews", {
    method: "POST",
    body: JSON.stringify({ githubUrl }),
  });
}

export function getInterview(interviewId: string): Promise<InterviewView> {
  return request<InterviewView>(`/api/v1/interviews/${interviewId}`);
}

const inFlightSessions = new Map<string, Promise<SessionInfo>>();

export function startSession(interviewId: string): Promise<SessionInfo> {
  const existing = inFlightSessions.get(interviewId);
  if (existing) return existing;
  const promise = request<SessionInfo>(
    `/api/v1/interviews/${interviewId}/session`,
    { method: "POST" },
  ).finally(() => inFlightSessions.delete(interviewId));
  inFlightSessions.set(interviewId, promise);
  return promise;
}

export function endInterview(interviewId: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/api/v1/interviews/${interviewId}/end`, {
    method: "POST",
  });
}

export function getResult(interviewId: string): Promise<InterviewResult> {
  return request<InterviewResult>(`/api/v1/interviews/${interviewId}/result`);
}
export function getTranscript(
  interviewId: string,
): Promise<import("../types/interview").TranscriptMessage[]> {
  return request(`/api/v1/interviews/${interviewId}/transcript`);
}
export function retryEvaluation(
  interviewId: string,
): Promise<{ status: string }> {
  return request(`/api/v1/interviews/${interviewId}/evaluation/retry`, {
    method: "POST",
  });
}
