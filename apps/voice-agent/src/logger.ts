import { log } from "@livekit/agents";

let cached: ReturnType<typeof log> | null = null;

// The CLI initializes the pino logger in the child process before importing
// this module, so `log()` returns the configured singleton there. Access is
// lazily resolved so importing this module outside the CLI does not throw.
export function getLogger(): ReturnType<typeof log> {
  if (!cached) {
    cached = log();
  }
  return cached;
}
