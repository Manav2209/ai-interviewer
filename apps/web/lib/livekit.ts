import { Room, RoomEvent, Track } from "livekit-client";
import { Transcription } from "@livekit/protocol";
import type { TranscriptMessage } from "../types/interview";

const TOPIC_TRANSCRIPTION = "lk.transcription";
const ATTRIBUTE_AGENT_STATE = "lk.agent.state";

export type AgentSpeakingState = "listening" | "thinking" | "speaking" | "unknown";

export interface LivekitCallbacks {
  onTranscript: (msg: TranscriptMessage) => void;
  onConnectionChange: (status: string) => void;
  onAgentState: (state: AgentSpeakingState) => void;
}

export interface InterviewSession {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  mute(): Promise<void>;
  unmute(): Promise<void>;
  isConnected(): boolean;
}

function agentStateOf(p: { attributes?: Readonly<Record<string, string>> } | null | undefined): AgentSpeakingState | null {
  const attrs = p?.attributes;
  if (!attrs) return null;
  const state = attrs[ATTRIBUTE_AGENT_STATE];
  return state ? (state as AgentSpeakingState) : null;
}

export function createInterviewSession(
  url: string,
  token: string,
  callbacks: LivekitCallbacks,
): InterviewSession {
  const room = new Room();
  let tracks: MediaStreamTrack[] = [];

  room.on(RoomEvent.DataReceived, (_payload, _participant, _kind, topic) => {
    if (topic !== TOPIC_TRANSCRIPTION) return;
    try {
      const transcription = Transcription.fromBinary(new Uint8Array(_payload));
      const localIdentity = room.localParticipant?.identity ?? "";

      for (const segment of transcription.segments) {
        const isUser = transcription.transcribedParticipantIdentity.startsWith("candidate");
        callbacks.onTranscript({
          id: segment.id,
          role: isUser ? "user" : "assistant",
          text: segment.text,
          timestamp: Date.now(),
          final: segment.final,
        });
      }
    } catch {
      // ignore malformed transcription payloads
    }
  });

  room.on(RoomEvent.Disconnected, () => callbacks.onConnectionChange("disconnected"));
  room.on(RoomEvent.Reconnecting, () => callbacks.onConnectionChange("reconnecting"));
  room.on(RoomEvent.Reconnected, () => callbacks.onConnectionChange("connected"));

  room.on(RoomEvent.ParticipantAttributesChanged, (p) => {
    const state = agentStateOf(p);
    if (state) {
      callbacks.onAgentState(state);
    }
  });

  room.on(RoomEvent.ParticipantConnected, (p) => {
    const state = agentStateOf(p);
    if (state) {
      callbacks.onAgentState(state);
    }
  });

  async function connect(): Promise<void> {
    await room.connect(url, token);
    await startMicrophone();
    callbacks.onConnectionChange("connected");
  }

  async function startMicrophone(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    tracks = stream.getAudioTracks();
    await Promise.all(
      tracks.map((track) =>
        room.localParticipant.publishTrack(track, {
          source: Track.Source.Microphone,
          name: "candidate.microphone",
        }),
      ),
    );
  }

  async function setMuted(mute: boolean): Promise<void> {
    for (const track of tracks) {
      track.enabled = !mute;
    }
  }

  return {
    connect,
    async disconnect() {
      for (const track of tracks) {
        track.stop();
      }
      tracks = [];
      await room.disconnect();
    },
    async mute() {
      await setMuted(true);
    },
    async unmute() {
      await setMuted(false);
    },
    isConnected: () => room.state === "connected",
  };
}