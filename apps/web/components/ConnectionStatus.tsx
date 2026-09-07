import type { AgentSpeakingState } from "../lib/livekit";

export default function ConnectionStatus({
  status,
  agentState,
  isAISpeaking,
}: {
  status: string;
  agentState: AgentSpeakingState;
  isAISpeaking: boolean;
}) {
  let label: string;
  let state = status;

  if (status === "connected") {
    if (isAISpeaking) {
      label = "AI is speaking";
      state = "speaking";
    } else if (agentState === "thinking") {
      label = "Thinking...";
      state = "thinking";
    } else {
      label = "Listening...";
      state = "listening";
    }
  } else {
    label = status === "reconnecting" ? "Reconnecting..." : status === "connecting" ? "Connecting..." : status;
  }

  return (
    <div className={`connection-status ${state}`}>
      <span className="dot" />
      <span>{label}</span>
    </div>
  );
}