export interface VoiceProviderConfig {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  deepgramApiKey: string;
  deepgramModel: string;
  deepgramTtsModel: string;
  aiRouterBaseUrl: string;
  aiRouterApiKey: string;
  aiRouterModel: string;
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
    deepgramTtsModel: env.DEEPGRAM_TTS_MODEL ?? "aura-2-andromeda-en",
    aiRouterBaseUrl: env.AI_ROUTER_BASE_URL!,
    aiRouterApiKey: env.AI_ROUTER_API_KEY!,
    aiRouterModel: env.AI_ROUTER_MODEL!,
    language: env.AGENT_LANGUAGE ?? "en",
    roomName: env.ROOM_NAME ?? "realtime-test-001",
    deepgramUtteranceEndMs: env.DEEPGRAM_UTTERANCE_END_MS
      ? Number(env.DEEPGRAM_UTTERANCE_END_MS)
      : null,
    llmTemperature: env.LLM_TEMPERATURE ? Number(env.LLM_TEMPERATURE) : null,
  };
}
