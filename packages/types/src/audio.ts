export interface TranscriptEvent {
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export interface AudioChunk {
  data: Buffer;
  sampleRate: number;
  channels: number;
  format: "pcm16" | "mp3" | "wav" | "opus";
  timestamp: number;
}
