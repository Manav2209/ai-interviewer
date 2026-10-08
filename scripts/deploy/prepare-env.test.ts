import { expect, test } from "bun:test";
import { prepareEnv } from "./prepare-env.mjs";

const shared = `LIVEKIT_URL=wss://example.livekit.cloud
LIVEKIT_API_KEY=test-key
LIVEKIT_API_SECRET=test-secret
AI_ROUTER_BASE_URL=https://router.example.com/v1
AI_ROUTER_API_KEY=test-router-key
AI_ROUTER_MODEL=test-model
INTERNAL_API_TOKEN=shared-test-token`;
const backend = `${shared}\nDATABASE_URL="postgresql://test:test@localhost/test?sslmode=require"`;
const voice = `${shared}\nDEEPGRAM_API_KEY=test-deepgram-key`;
const origin = "https://example.com";

test("converts Windows dotenv files and quoted Langfuse values into Docker env syntax", () => {
  const result = prepareEnv(
    (
      backend +
      '\nLANGFUSE_BASE_URL="https://us.cloud.langfuse.com" # region\nLANGFUSE_PUBLIC_KEY="public"\nLANGFUSE_SECRET_KEY="secret"'
    ).replaceAll("\n", "\r\n"),
    voice,
    origin,
  );
  expect(result.backend).toContain(
    "DATABASE_URL=postgresql://test:test@localhost/test?sslmode=require\n",
  );
  expect(result.backend).toContain(
    "LANGFUSE_BASE_URL=https://us.cloud.langfuse.com\n",
  );
  expect(result.backend).toContain(`CORS_ALLOWED_ORIGINS=${origin}\n`);
  expect(result.voice).toContain("BACKEND_BASE_URL=http://backend:8080\n");
});

test("optional empty tracing configuration is omitted, but partial tracing fails", () => {
  expect(
    prepareEnv(backend + '\nLANGFUSE_BASE_URL=""', voice, origin).backend,
  ).not.toContain("LANGFUSE_BASE_URL");
  expect(() =>
    prepareEnv(backend + "\nLANGFUSE_SECRET_KEY=secret", voice, origin),
  ).toThrow("LANGFUSE_BASE_URL is required");
});

test("rejects mismatched credentials and invalid database URLs without disclosing values", () => {
  expect(() =>
    prepareEnv(
      backend,
      voice.replace("shared-test-token", "different-sensitive-token"),
      origin,
    ),
  ).toThrow("INTERNAL_API_TOKEN must match");
  expect(() =>
    prepareEnv(
      backend.replace(
        "postgresql://test:test@localhost/test?sslmode=require",
        "sensitive-but-invalid",
      ),
      voice,
      origin,
    ),
  ).toThrow("DATABASE_URL must be a valid URL");
});

test("rejects multiline secrets and origins that would change proxy routing", () => {
  expect(() =>
    prepareEnv(backend + '\nGITHUB_TOKEN="line1\\nline2"', voice, origin),
  ).toThrow("GITHUB_TOKEN cannot contain line breaks");
  expect(() => prepareEnv(backend, voice, "https://example.com/api")).toThrow(
    "PUBLIC_ORIGIN must be an HTTPS origin",
  );
});
