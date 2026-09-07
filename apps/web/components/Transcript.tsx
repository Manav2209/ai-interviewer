import type { TranscriptMessage } from "../types/interview";

export default function Transcript({ messages }: { messages: TranscriptMessage[] }) {
  return (
    <div className="transcript" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className={`message ${m.role}`}>
          <span className="message-label">{m.role === "user" ? "You" : "AI"}:</span>
          <span className="message-text">
            {m.text}
            {!m.final ? "…" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}