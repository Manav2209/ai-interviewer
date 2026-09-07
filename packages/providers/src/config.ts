export interface VoiceProviderConfig {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  deepgramApiKey: string;
  deepgramModel: string;
  aiRouterBaseUrl: string;
  aiRouterApiKey: string;
  aiRouterModel: string;
  sarvamApiKey: string;
  sarvamModel: string;
  sarvamSpeaker: string;
  sarvamTargetLanguage: string;
  language: string;
  roomName: string;
  deepgramUtteranceEndMs: number | null;
  llmTemperature: number | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): VoiceProviderConfig {
  const required = [
    "LIVEKIT_URL",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "DEEPGRAM_API_KEY",
    "AI_ROUTER_BASE_URL",
    "AI_ROUTER_API_KEY",
    "AI_ROUTER_MODEL",
    "SARVAM_API_KEY",
  ] as const;

  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Copy apps/voice-agent/.env.example to .env and fill in the values.`,
    );
  }

  return {
    livekitUrl: env.LIVEKIT_URL!,
    livekitApiKey: env.LIVEKIT_API_KEY!,
    livekitApiSecret: env.LIVEKIT_API_SECRET!,
    deepgramApiKey: env.DEEPGRAM_API_KEY!,
    deepgramModel: env.DEEPGRAM_MODEL ?? "nova-3",
    aiRouterBaseUrl: env.AI_ROUTER_BASE_URL!,
    aiRouterApiKey: env.AI_ROUTER_API_KEY!,
    aiRouterModel: env.AI_ROUTER_MODEL!,
    sarvamApiKey: env.SARVAM_API_KEY!,
    sarvamModel: env.SARVAM_MODEL ?? "bulbul:v3",
    sarvamSpeaker: env.SARVAM_SPEAKER ?? "shubh",
    sarvamTargetLanguage: env.SARVAM_TARGET_LANGUAGE ?? "en-IN",
    language: env.AGENT_LANGUAGE ?? "en",
    roomName: env.ROOM_NAME ?? "realtime-test-001",
    deepgramUtteranceEndMs: env.DEEPGRAM_UTTERANCE_END_MS
      ? Number(env.DEEPGRAM_UTTERANCE_END_MS)
      : null,
    llmTemperature: env.LLM_TEMPERATURE ? Number(env.LLM_TEMPERATURE) : null,
  };
}
