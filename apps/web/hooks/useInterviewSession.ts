"use client";

import { useEffect, useRef, useState } from "react";
import type { ConnectionStatus, TranscriptMessage } from "../types/interview";
import type { AgentSpeakingState, InterviewSession } from "../lib/livekit";
import { createInterviewSession } from "../lib/livekit";
import { endInterview, startSession } from "../lib/api";

export interface UseInterviewSessionResult {
  status: ConnectionStatus;
  transcript: TranscriptMessage[];
  isMuted: boolean;
  isAISpeaking: boolean;
  agentState: AgentSpeakingState;
  mute: () => Promise<void>;
  unmute: () => Promise<void>;
  endInterview: () => Promise<void>;
}

export function useInterviewSession(interviewId: string): UseInterviewSessionResult {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [agentState, setAgentState] = useState<AgentSpeakingState>("unknown");
  const sessionRef = useRef<InterviewSession | null>(null);
  const transcriptRef = useRef<TranscriptMessage[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function init(): Promise<void> {
      try {
        setStatus("connecting");
        const session = await startSession(interviewId);

        if (cancelled) return;
        sessionRef.current = createInterviewSession(session.serverUrl, session.token, {
          onTranscript: (msg) => {
            const existingIdx = transcriptRef.current.findIndex((m) => m.id === msg.id);
            let next: TranscriptMessage[];
            if (existingIdx >= 0) {
              next = transcriptRef.current.slice();
              next[existingIdx] = { ...next[existingIdx], ...msg };
            } else {
              next = [...transcriptRef.current, msg];
            }
            transcriptRef.current = next;
            if (!cancelled) setTranscript(next);
          },
          onConnectionChange: (s) => {
            if (!cancelled) setStatus(s as ConnectionStatus);
          },
          onAgentState: (s) => {
            if (!cancelled) setAgentState(s);
          },
        });

        await sessionRef.current.connect();
      } catch (err) {
        if (!cancelled) {
          setStatus("failed");
          console.error("interview session failed", err);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
      void sessionRef.current?.disconnect().catch(() => {});
    };
  }, [interviewId]);

  const isAISpeaking = agentState === "speaking";

  return {
    status,
    transcript,
    isMuted,
    isAISpeaking,
    agentState,
    mute: async () => {
      await sessionRef.current?.mute();
      setIsMuted(true);
    },
    unmute: async () => {
      await sessionRef.current?.unmute();
      setIsMuted(false);
    },
    endInterview: async () => {
      await sessionRef.current?.disconnect();
      await endInterview(interviewId);
    },
  };
}