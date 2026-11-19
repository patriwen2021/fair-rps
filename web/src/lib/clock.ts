import { REVEAL_GRACE_MS, commitDurationMs, isValidCommitSeconds, type Phase } from "@fair-rps/shared";

export const URGENT_THRESHOLD_MS = 5_000;

export function clockOffset(serverNow: number, localNow: number): number {
  return serverNow - localNow;
}

export function remainingMs(deadline: number | null, offset: number, localNow: number): number | null {
  if (deadline === null) return null;
  return Math.max(0, deadline - (localNow + offset));
}

export function secondsLeft(remaining: number): number {
  return Math.ceil(remaining / 1000);
}

export function phaseDurationMs(phase: Phase, commitSeconds: number): number | null {
  switch (phase) {
    case "commit":
      return isValidCommitSeconds(commitSeconds) ? commitDurationMs(commitSeconds) : null;
    case "reveal":
      return REVEAL_GRACE_MS;
    default:
      return null;
  }
}

export function progressFraction(remaining: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, remaining / total));
}

export function isUrgent(phase: Phase, remaining: number | null): boolean {
  return phase === "commit" && remaining !== null && remaining <= URGENT_THRESHOLD_MS;
}

export interface TotalTrack {
  key: string;
  deadline: number;
  total: number;
}

export function trackTotal(prev: TotalTrack | null, key: string, deadline: number, baseTotal: number, remaining: number): TotalTrack {
  if (prev === null || prev.key !== key) return { key, deadline, total: Math.max(baseTotal, remaining) };
  if (deadline > prev.deadline) return { key, deadline, total: prev.total + (deadline - prev.deadline) };
  if (deadline < prev.deadline) return { key, deadline, total: prev.total };
  return prev;
}
