import type { Context, Next } from "hono";
import type { BackendConfig } from "../config.js";
import { Hono } from "hono";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@repo/db";
import { newId } from "../lib/ids.js";

declare module "hono" {
  interface ContextVariableMap {
    userId: string;
  }
}

export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const window = Math.floor(Date.now() / windowMs);
  const row = await prisma.rateLimitBucket.upsert({
    where: { id: `${key}:${window}` },
    create: {
      id: `${key}:${window}`,
      count: 1,
      resetAt: new Date((window + 1) * windowMs),
    },
    update: { count: { increment: 1 } },
  });
  return row.count <= limit;
}

export function browserAuthRouter(): Hono {
  const app = new Hono();
  app.post("/session", async (c) => {
    const ip =
      (c.env as { remoteAddress?: string } | undefined)?.remoteAddress ??
      "unknown";
    if (!(await rateLimit(`bootstrap:${ip}`, 20, 60_000)))
      return c.json({ error: "Too many requests" }, 429);
    const token = randomBytes(32).toString("base64url");
    const userId = newId("user");
    const expiresAt = new Date(Date.now() + 30 * 86400_000);
    await prisma.browserUser.create({
      data: {
        id: userId,
        sessions: {
          create: {
            id: newId("access"),
            tokenHash: tokenHash(token),
            expiresAt,
          },
        },
      },
    });
    c.header("Cache-Control", "no-store");
    return c.json({ token, expiresAt }, 201);
  });
  return app;
}

export async function browserOwnership(
  c: Context,
  next: Next,
): Promise<Response | void> {
  const token = (c.req.header("authorization") ?? "").replace(/^Bearer /, "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    return c.json({ error: "Access session required" }, 401);
  const access = await prisma.browserAccessSession.findUnique({
    where: { tokenHash: tokenHash(token) },
  });
  if (!access || access.expiresAt <= new Date())
    return c.json({ error: "Access session expired" }, 401);
  c.set("userId", access.userId);
  const id = c.req.path.replace(/^\/api\/v1\/interviews\/?/, "").split("/")[0];
  if (id) {
    const interview = await prisma.interview.findFirst({
      where: { id, userId: access.userId },
      select: { id: true },
    });
    if (!interview) return c.json({ error: "Interview not found" }, 404);
  }
  const operation = c.req.path.endsWith("/session")
    ? "session"
    : c.req.method === "POST" && !id
      ? "create"
      : "read";
  if (
    !(await rateLimit(
      `${access.userId}:${operation}`,
      operation === "create" ? 10 : 120,
      operation === "create" ? 3600_000 : 60_000,
    ))
  )
    return c.json({ error: "Too many requests" }, 429);
  c.header("Cache-Control", "no-store");
  await next();
}

export function createAuthMiddleware(token: string) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const header = c.req.header("authorization") ?? "";
    const prefix = "Bearer ";
    const provided = header.startsWith(prefix)
      ? header.slice(prefix.length)
      : "";
    if (
      !provided ||
      !timingSafeEqual(
        Buffer.from(tokenHash(provided)),
        Buffer.from(tokenHash(token)),
      )
    ) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  };
}

export function internalAuthFromConfig(cfg: BackendConfig) {
  return createAuthMiddleware(cfg.INTERNAL_API_TOKEN);
}
