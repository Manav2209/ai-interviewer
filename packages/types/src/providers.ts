import type { AudioChunk, TranscriptEvent } from "./audio.js";
import type { Message } from "./session.js";

export type { AudioChunk, Message, TranscriptEvent };

export interface STTProvider {
  start(): Promise<void>;
  sendAudio(audio: Buffer): Promise<void>;
  onTranscript(handler: (event: TranscriptEvent) => void): void;
  stop(): Promise<void>;
}

export interface LLMProvider {
  generate(messages: Message[]): AsyncIterable<string>;
}

export interface TTSProvider {
  synthesize(text: AsyncIterable<string>): AsyncIterable<AudioChunk>;
}

export interface PipelineInfo {
  stt: string;
  llm: string;
  tts: string;
}
