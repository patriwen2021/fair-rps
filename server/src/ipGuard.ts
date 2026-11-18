import { isIPv6 } from "node:net";
import { RateLimiter } from "./rateLimiter.js";

export function parseTrustProxy(value: string | undefined): number {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "" || raw === "0" || raw === "false" || raw === "off" || raw === "no") return 0;
  if (raw === "true" || raw === "on" || raw === "yes") return 1;
  if (/^[1-9]\d?$/.test(raw)) return Number(raw);
  throw new Error(`TRUST_PROXY must be 0/false (off) or the number of trusted proxy hops (1-99), got "${value}"`);
}

function parseIpv6(raw: string): number[] | null {
  if (!isIPv6(raw)) return null;
  let text = raw;
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const octets = tail.split(".").map(Number);
    const hi = ((octets[0] as number) << 8) | (octets[1] as number);
    const lo = ((octets[2] as number) << 8) | (octets[3] as number);
    text = `${text.slice(0, lastColon + 1)}${hi.toString(16)}:${lo.toString(16)}`;
  }
  const halves = text.split("::");
  const head = halves[0] === "" ? [] : (halves[0] as string).split(":");
  const rest = halves.length === 2 && halves[1] !== "" ? (halves[1] as string).split(":") : [];
  const fill = halves.length === 2 ? new Array<string>(8 - head.length - rest.length).fill("0") : [];
  const groups = [...head, ...fill, ...rest].map((group) => parseInt(group, 16));
  return groups.length === 8 ? groups : null;
}

export function normalizeIp(address: string | undefined): string {
  const raw = (address ?? "").trim().toLowerCase().split("%")[0] ?? "";
  if (raw === "") return "unknown";
  const groups = parseIpv6(raw);
  if (groups === null) return raw;
  const mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (mapped) {
    const hi = groups[6] as number;
    const lo = groups[7] as number;
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":")}::/64`;
}

export function clientIp(
  remoteAddress: string | undefined,
  forwardedFor: string | string[] | undefined,
  trustedHops: number,
): string {
  if (trustedHops <= 0 || forwardedFor === undefined) return normalizeIp(remoteAddress);
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor;
  const forwarded = header
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .reverse();
  const chain = [remoteAddress, ...forwarded];
  return normalizeIp(chain[Math.min(trustedHops, chain.length - 1)]);
}

export class IpCounter {
  private readonly counts = new Map<string, number>();

  get(ip: string): number {
    return this.counts.get(ip) ?? 0;
  }

  add(ip: string): void {
    this.counts.set(ip, this.get(ip) + 1);
  }

  remove(ip: string): void {
    const next = this.get(ip) - 1;
    if (next <= 0) this.counts.delete(ip);
    else this.counts.set(ip, next);
  }
}

export class IpRateLimiter {
  private readonly limiters = new Map<string, { limiter: RateLimiter; last: number }>();
  private sweptAt: number;

  constructor(
    private readonly windowMs: number,
    private readonly maxEvents: number,
    private readonly now: () => number = Date.now,
  ) {
    this.sweptAt = now();
  }

  allow(ip: string): boolean {
    const current = this.now();
    if (current - this.sweptAt >= this.windowMs) {
      this.sweptAt = current;
      for (const [key, entry] of this.limiters) {
        if (current - entry.last >= this.windowMs) this.limiters.delete(key);
      }
    }
    let entry = this.limiters.get(ip);
    if (!entry) {
      entry = { limiter: new RateLimiter(this.windowMs, this.maxEvents, this.now), last: current };
      this.limiters.set(ip, entry);
    }
    entry.last = current;
    return entry.limiter.allow();
  }

  size(): number {
    return this.limiters.size;
  }
}

export interface HostAuthPolicy {
  freeFailures: number;
  baseLockMs: number;
  maxLockMs: number;
  failureTtlMs: number;
  attemptWindowMs: number;
  maxAttemptsPerWindow: number;
}

export class HostAuthGuard {
  private readonly records = new Map<string, { failures: number; lockedUntil: number; last: number }>();

  private readonly attempts: IpRateLimiter;

  constructor(
    private readonly policy: HostAuthPolicy,
    private readonly now: () => number = Date.now,
  ) {
    this.attempts = new IpRateLimiter(policy.attemptWindowMs, policy.maxAttemptsPerWindow, now);
  }

  allowAttempt(ip: string): boolean {
    return this.attempts.allow(ip);
  }

  lockRemainingMs(ip: string): number {
    const record = this.live(ip);
    return record ? Math.max(0, record.lockedUntil - this.now()) : 0;
  }

  recordFailure(ip: string): number {
    const current = this.now();
    this.sweep(current);
    const record = this.live(ip) ?? { failures: 0, lockedUntil: 0, last: current };
    record.failures += 1;
    record.last = current;
    const over = record.failures - this.policy.freeFailures;
    const lockMs = over <= 0 ? 0 : Math.min(this.policy.baseLockMs * 2 ** Math.min(over - 1, 30), this.policy.maxLockMs);
    record.lockedUntil = current + lockMs;
    this.records.set(ip, record);
    return lockMs;
  }

  private live(ip: string) {
    const record = this.records.get(ip);
    if (!record) return null;
    if (this.now() - record.last >= this.policy.failureTtlMs) {
      this.records.delete(ip);
      return null;
    }
    return record;
  }

  private sweep(current: number): void {
    if (this.records.size < 1024) return;
    for (const [key, record] of this.records) {
      if (current - record.last >= this.policy.failureTtlMs) this.records.delete(key);
    }
  }
}
