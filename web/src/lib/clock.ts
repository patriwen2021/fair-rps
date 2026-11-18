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
