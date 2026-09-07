"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useInterviewSession } from "../hooks/useInterviewSession";
import ConnectionStatus from "./ConnectionStatus";
import Transcript from "./Transcript";
import MicrophoneButton from "./MicrophoneButton";

export default function InterviewRoom({ interviewId }: { interviewId: string }) {
  const router = useRouter();
  const {
    status,
    transcript,
    isMuted,
    isAISpeaking,
    agentState,
    mute,
    unmute,
    endInterview,
  } = useInterviewSession(interviewId);

  const [ending, setEnding] = useState(false);

  async function handleEnd(): Promise<void> {
    setEnding(true);
    try {
      await endInterview();
      router.push(`/interview/${interviewId}/result`);
    } catch {
      setEnding(false);
    }
  }

  return (
    <div className="interview-room">
      <h1>AI Technical Interview</h1>

      <div className="avatar" aria-hidden="true">
        <div className="avatar-circle">{isAISpeaking ? "🔊" : "🎤"}</div>
        <ConnectionStatus status={status} agentState={agentState} isAISpeaking={isAISpeaking} />
      </div>

      <Transcript messages={transcript} />

      <div className="controls">
        <MicrophoneButton
          isMuted={isMuted}
          onToggle={isMuted ? unmute : mute}
          disabled={status !== "connected"}
        />
        <button type="button" className="end-button" onClick={handleEnd} disabled={ending}>
          {ending ? "Ending..." : "End Interview"}
        </button>
      </div>
    </div>
  );
}