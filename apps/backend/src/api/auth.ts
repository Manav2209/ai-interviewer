import type { Context, Next } from "hono";
import type { BackendConfig } from "../config.js";

export function createAuthMiddleware(token: string) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const header = c.req.header("authorization") ?? "";
    const prefix = "Bearer ";
    const provided = header.startsWith(prefix) ? header.slice(prefix.length) : "";
    if (!provided || provided !== token) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  };
}

export function internalAuthFromConfig(cfg: BackendConfig) {
  return createAuthMiddleware(cfg.INTERNAL_API_TOKEN);
}