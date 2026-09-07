import type { InterviewResult, InterviewView, SessionInfo } from "../types/interview";

const BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
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

export function startSession(interviewId: string): Promise<SessionInfo> {
  return request<SessionInfo>(`/api/v1/interviews/${interviewId}/session`, { method: "POST" });
}

export function endInterview(interviewId: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/api/v1/interviews/${interviewId}/end`, { method: "POST" });
}

export function getResult(interviewId: string): Promise<InterviewResult> {
  return request<InterviewResult>(`/api/v1/interviews/${interviewId}/result`);
}
