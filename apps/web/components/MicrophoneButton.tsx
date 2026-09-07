"use client";

export default function MicrophoneButton({
  isMuted,
  onToggle,
  disabled,
}: {
  isMuted: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="mic-button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={isMuted}
    >
      {isMuted ? "Unmute" : "Mute"}
    </button>
  );
}