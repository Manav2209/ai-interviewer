export type InterviewStatus =
  | "preparing"
  | "ready"
  | "connecting"
  | "active"
  | "ending"
  | "completed"
  | "failed";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export interface TranscriptMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  final: boolean;
}

export interface SessionInfo {
  interviewId: string;
  sessionId: string;
  roomName: string;
  serverUrl: string;
  token: string;
}

export interface InterviewResult {
  status: string;
  score: number;
  dimensions: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  feedback: string;
  message?: string;
}

export interface InterviewView {
  interviewId: string;
  status: InterviewStatus;
  githubUrl?: string;
  error?: string;
}
