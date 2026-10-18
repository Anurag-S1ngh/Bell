import type { NextFunction, Request, Response } from "express";
import { ENV } from "./env.server";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`);
  });
  next();
}

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip || "unknown";
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    next();
    return;
  }
  if (bucket.count >= 60) {
    res.status(429).json({ error: "Rate limit exceeded" });
    return;
  }
  bucket.count += 1;
  next();
}

export function authToken(req: Request, res: Response, next: NextFunction): void {
  const required = (ENV as { BELL_AUTH_TOKEN?: string }).BELL_AUTH_TOKEN;
  if (!required) {
    next();
    return;
  }
  if (req.get("authorization") !== `Bearer ${required}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
