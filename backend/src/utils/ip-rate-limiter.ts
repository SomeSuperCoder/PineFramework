/**
 * ipRateLimiter — per-IP sliding-window request limiter for a single route.
 *
 * Exists because the contract for `GET /api/backtest/dex-fee` requires a 429 +
 * Retry-After rejection (openspec/changes/renovate-backtest-panel/api-contract.md
 * §6). The only existing limiter (backend/src/bybit/rate-limiter.ts) WAITS
 * instead of rejecting — correct for throttling outbound Bybit calls, wrong
 * for an HTTP 429 contract — so a tiny middleware lives here instead of
 * stretching the bybit one.
 *
 * Memory is bounded: an IP's entry is deleted once its window slides past, so
 * the map holds at most one entry per IP active in the last `windowMs`.
 */

import type { NextFunction, Request, Response } from 'express';

interface IpRateLimiterOptions {
  max: number;
  windowMs: number;
}

export function ipRateLimiter({ max, windowMs }: IpRateLimiterOptions) {
  const hits = new Map<string, number[]>();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip ?? 'unknown';
    const now = Date.now();
    const cutoff = now - windowMs;

    const timestamps = (hits.get(ip) ?? []).filter((t) => t > cutoff);
    if (timestamps.length === 0) {
      hits.delete(ip); // window fully expired — drop the stale entry
    }

    if (timestamps.length >= max) {
      // RFC 7231 Retry-After: seconds until the oldest hit leaves the window.
      const oldest = timestamps[0]!;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({ error: 'Too many requests, try again later', code: 'RATE_LIMITED' });
      return;
    }

    timestamps.push(now);
    hits.set(ip, timestamps);
    next();
  };
}
