import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as openai from "@livekit/agents-plugin-openai";
import * as sarvam from "@livekit/agents-plugin-sarvam";
import { loadConfig } from "./config.js";
import type { VoiceProviderConfig } from "./config.js";
export { loadConfig };
export type { VoiceProviderConfig } from "./config.js";

export interface ProviderSet {
  stt: deepgram.STT;
  llm: openai.LLM;
  tts: sarvam.TTS;
}

export function buildProviders(cfg: VoiceProviderConfig): ProviderSet {
  const stt = new deepgram.STT({
    apiKey: cfg.deepgramApiKey,
    model: cfg.deepgramModel,
    language: cfg.language,
    utteranceEndMs: cfg.deepgramUtteranceEndMs,
  });

  const llm = new openai.LLM({
    baseURL: cfg.aiRouterBaseUrl,
    apiKey: cfg.aiRouterApiKey,
    model: cfg.aiRouterModel,
    ...(cfg.llmTemperature !== null ? { temperature: cfg.llmTemperature } : {}),
  });

  const tts = new sarvam.TTS({
    apiKey: cfg.sarvamApiKey,
    model: cfg.sarvamModel as "bulbul:v2" | "bulbul:v3",
    speaker: cfg.sarvamSpeaker,
    targetLanguageCode: cfg.sarvamTargetLanguage,
  });

  return { stt, llm, tts };
}