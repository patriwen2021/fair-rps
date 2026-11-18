import { COMMIT_SECONDS_MAX, COMMIT_SECONDS_MIN } from "./constants.js";

export function isValidCommitSeconds(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= COMMIT_SECONDS_MIN &&
    value <= COMMIT_SECONDS_MAX
  );
}

export function commitDurationMs(commitSeconds: number): number {
  if (!isValidCommitSeconds(commitSeconds)) throw new RangeError("invalid commit seconds");
  return commitSeconds * 1000;
}
