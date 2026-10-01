export type InterviewStatus =
  | "preparing"
  | "created"
  | "analyzing"
  | "ready"
  | "connecting"
  | "active"
  | "ending"
  | "completing"
  | "evaluation_failed"
  | "completed"
  | "failed";

export type ConnectionStatus =
  "disconnected" | "connecting" | "connected" | "reconnecting" | "failed";

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
  score: number | null;
  dimensions: Record<string, number | null>;
  strengths: string[];
  weaknesses: string[];
  feedback: string;
  evidence?: Record<
    string,
    {
      level: string;
      confidence: number;
      evidenceIds: string[];
      explanation: string;
    }
  >;
  message?: string;
}

export interface InterviewView {
  interviewId: string;
  status: InterviewStatus;
  githubUrl?: string;
  error?: string;
}
