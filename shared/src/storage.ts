import type { Avatar } from "./avatar.js";
import type { PlayIndex } from "./moves.js";
import type { Hash, MatchId, PlayerId } from "./state.js";

export interface StoredSession {
  playerId: PlayerId;
  sessionToken: string;
  nickname: string;
  avatar: Avatar;
}

export interface StoredCommit {
  matchId: MatchId;
  playIndex: PlayIndex;
  hash: Hash;
  preimage: string;
}

export type StoredCommits = Record<string, StoredCommit>;

export function commitStorageKey(matchId: MatchId, playIndex: PlayIndex): string {
  return `${matchId}#${playIndex}`;
}
