import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().min(1),
  AI_ROUTER_BASE_URL: z.string().url(),
  AI_ROUTER_API_KEY: z.string().min(1),
  AI_ROUTER_MODEL: z.string().min(1),
  LLM_TEMPERATURE: z.coerce.number().default(0.4),
  LIVEKIT_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  INTERNAL_API_TOKEN: z.string().min(1),
  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
});

export type BackendConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw new Error(
      `Missing or invalid backend environment variables (${issues}). ` +
        `Copy apps/backend/.env.example to apps/backend/.env and fill in the values.`,
    );
  }
  return parsed.data;
}