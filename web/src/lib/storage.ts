import {
  STORAGE_KEY_COMMITS,
  STORAGE_KEY_SESSION,
  SESSION_TOKEN_HEX_LENGTH,
  commitStorageKey,
  isAvatar,
  isValidHash,
  type StoredCommit,
  type StoredCommits,
  type StoredSession,
} from "@fair-rps/shared";

export const STORAGE_KEY_HOST_TOKEN = "fair-rps:host-token";

const TOKEN_PATTERN = new RegExp(`^[0-9a-f]{${SESSION_TOKEN_HEX_LENGTH}}$`);

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    return;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function loadSession(): StoredSession | null {
  const value = read(STORAGE_KEY_SESSION);
  if (!isRecord(value)) return null;
  const { playerId, sessionToken, nickname, avatar } = value;
  if (typeof playerId !== "string" || typeof nickname !== "string") return null;
  if (typeof sessionToken !== "string" || !TOKEN_PATTERN.test(sessionToken)) return null;
  if (!isAvatar(avatar)) return null;
  return { playerId, sessionToken, nickname, avatar };
}

export function saveSession(session: StoredSession): void {
  write(STORAGE_KEY_SESSION, session);
}

export function clearSession(): void {
  remove(STORAGE_KEY_SESSION);
}

function isStoredCommit(value: unknown): value is StoredCommit {
  return (
    isRecord(value) &&
    typeof value.matchId === "string" &&
    (value.playIndex === 0 || value.playIndex === 1) &&
    isValidHash(value.hash) &&
    typeof value.preimage === "string"
  );
}

export function loadCommits(): StoredCommits {
  const value = read(STORAGE_KEY_COMMITS);
  if (!isRecord(value)) return {};
  const commits: StoredCommits = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isStoredCommit(entry) && key === commitStorageKey(entry.matchId, entry.playIndex)) commits[key] = entry;
  }
  return commits;
}

export function saveCommits(commits: StoredCommits): void {
  if (Object.keys(commits).length === 0) remove(STORAGE_KEY_COMMITS);
  else write(STORAGE_KEY_COMMITS, commits);
}

export function clearCommits(): void {
  remove(STORAGE_KEY_COMMITS);
}

export function withCommit(commits: StoredCommits, commit: StoredCommit): StoredCommits {
  return { ...commits, [commitStorageKey(commit.matchId, commit.playIndex)]: commit };
}

export function withoutCommit(commits: StoredCommits, key: string): StoredCommits {
  const next = { ...commits };
  delete next[key];
  return next;
}

export function pruneCommits(commits: StoredCommits, gameId: string | null): StoredCommits {
  const next: StoredCommits = {};
  if (gameId === null) return next;
  for (const [key, commit] of Object.entries(commits)) {
    if (commit.matchId.startsWith(`${gameId}:`)) next[key] = commit;
  }
  return next;
}

export function loadHostToken(): string | null {
  const value = read(STORAGE_KEY_HOST_TOKEN);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function saveHostToken(token: string): void {
  write(STORAGE_KEY_HOST_TOKEN, token);
}

export function clearHostToken(): void {
  remove(STORAGE_KEY_HOST_TOKEN);
}
