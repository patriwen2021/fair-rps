import type { Avatar } from "./avatar.js";
import type { DecisionReason, Move, PlayIndex, PlayOutcome } from "./moves.js";
import { isValidHash, verifyCommit, type RevealRecord } from "./preimage.js";

export const PHASES = ["lobby", "bracket", "commit", "reveal", "result", "finished"] as const;
export type Phase = (typeof PHASES)[number];

export type PlayerId = string;
export type MatchId = string;
export type GameId = string;
export type Hash = string;
export type EpochMs = number;

export const TIMED_PHASES: readonly Phase[] = ["commit", "reveal"];
export const HOST_PACED_PHASES: readonly Phase[] = ["bracket", "result"];

export const NEXT_STEPS = ["tiebreak", "next_round", "champion"] as const;
export type NextStep = (typeof NEXT_STEPS)[number];

export const NEXT_STEP_LABEL: Record<NextStep, string> = {
  tiebreak: "開始加賽",
  next_round: "下一輪",
  champion: "揭曉冠軍",
};

export type Role = "host" | "player" | "spectator";

export type PlayerStatus = "waiting" | "active" | "eliminated" | "champion";

export interface PlayerPublic {
  id: PlayerId;
  nickname: string;
  avatar: Avatar;
  connected: boolean;
  status: PlayerStatus;
}

export interface HiddenPlay {
  index: PlayIndex;
  revealed: false;
  commits: [Hash | null, Hash | null];
}

export interface RevealedPlay {
  index: PlayIndex;
  revealed: true;
  commits: [Hash | null, Hash | null];
  reveals: [RevealRecord, RevealRecord];
  outcome: PlayOutcome;
}

export type Play = HiddenPlay | RevealedPlay;

export type MatchStatus = "pending" | "playing" | "awaiting_tiebreak" | "decided";

export interface Match {
  id: MatchId;
  round: number;
  index: number;
  playerIds: [PlayerId, PlayerId];
  status: MatchStatus;
  plays: Play[];
  winnerId: PlayerId | null;
  reason: DecisionReason | null;
}

export interface Round {
  index: number;
  question: string | null;
  matches: Match[];
  byePlayerId: PlayerId | null;
}

export interface Bracket {
  rounds: Round[];
}

export interface RoomSnapshot {
  seq: number;
  serverNow: EpochMs;
  phase: Phase;
  deadline: EpochMs | null;
  nextStep: NextStep | null;
  commitSeconds: number;
  hostConnected: boolean;
  players: PlayerPublic[];
  gameId: GameId | null;
  bracket: Bracket | null;
  round: number | null;
  playIndex: PlayIndex | null;
  championId: PlayerId | null;
}

export type PlayerSource = { kind: "match"; matchIndex: number } | { kind: "bye" };

export type CommitStatus = { locked: false; hash: null } | { locked: true; hash: Hash };

export function currentPlay(match: Match): Play | null {
  return match.plays[match.plays.length - 1] ?? null;
}

export function sideOf(match: Match, playerId: PlayerId): 0 | 1 | null {
  if (match.playerIds[0] === playerId) return 0;
  if (match.playerIds[1] === playerId) return 1;
  return null;
}

export function currentRound(snapshot: RoomSnapshot): Round | null {
  if (snapshot.bracket === null || snapshot.round === null) return null;
  return snapshot.bracket.rounds[snapshot.round] ?? null;
}

export function currentQuestion(snapshot: RoomSnapshot): string | null {
  return currentRound(snapshot)?.question ?? null;
}

export function findActiveMatch(snapshot: RoomSnapshot, playerId: PlayerId): Match | null {
  const round = currentRound(snapshot);
  if (!round) return null;
  return (
    round.matches.find((match) => match.status !== "decided" && sideOf(match, playerId) !== null) ??
    null
  );
}

export function playingMatches(snapshot: RoomSnapshot): Match[] {
  return currentRound(snapshot)?.matches.filter((match) => match.status === "playing") ?? [];
}

export function commitStatuses(match: Match): [CommitStatus, CommitStatus] | null {
  const play = currentPlay(match);
  if (match.status !== "playing" || play === null || play.revealed) return null;
  const toStatus = (hash: Hash | null): CommitStatus =>
    hash === null ? { locked: false, hash: null } : { locked: true, hash };
  return [toStatus(play.commits[0]), toStatus(play.commits[1])];
}

export function lastRevealedPlay(match: Match): RevealedPlay | null {
  for (let position = match.plays.length - 1; position >= 0; position -= 1) {
    const play = match.plays[position]!;
    if (play.revealed) return play;
  }
  return null;
}

export function finalMoves(match: Match): [Move | null, Move | null] | null {
  const play = lastRevealedPlay(match);
  return play === null ? null : [play.reveals[0].move, play.reveals[1].move];
}

export function advancingCount(round: Round): number {
  return round.matches.length + (round.byePlayerId === null ? 0 : 1);
}

export function computeNextStep(round: Round): NextStep {
  if (round.matches.some((match) => match.status === "awaiting_tiebreak")) return "tiebreak";
  return advancingCount(round) === 1 ? "champion" : "next_round";
}

export function participantCount(bracket: Bracket): number {
  const first = bracket.rounds[0];
  return first ? first.matches.length * 2 + (first.byePlayerId === null ? 0 : 1) : 0;
}

export function expectedRoundCount(participants: number): number {
  let remaining = Math.max(0, Math.trunc(participants));
  let rounds = 0;
  while (remaining > 1) {
    remaining = Math.ceil(remaining / 2);
    rounds += 1;
  }
  return rounds;
}

export function playerSource(
  bracket: Bracket,
  roundIndex: number,
  playerId: PlayerId,
): PlayerSource | null {
  const previous = bracket.rounds[roundIndex - 1];
  if (!previous) return null;
  const match = previous.matches.find((candidate) => candidate.winnerId === playerId);
  if (match) return { kind: "match", matchIndex: match.index };
  return previous.byePlayerId === playerId ? { kind: "bye" } : null;
}

export function makeMatchId(gameId: GameId, round: number, index: number): MatchId {
  return `${gameId}:r${round}:m${index}`;
}

const SNAPSHOT_KEYS = [
  "seq",
  "serverNow",
  "phase",
  "deadline",
  "nextStep",
  "commitSeconds",
  "hostConnected",
  "players",
  "gameId",
  "bracket",
  "round",
  "playIndex",
  "championId",
];
const PLAYER_KEYS = ["id", "nickname", "avatar", "connected", "status"];
const BRACKET_KEYS = ["rounds"];
const ROUND_KEYS = ["index", "question", "matches", "byePlayerId"];
const MATCH_KEYS = ["id", "round", "index", "playerIds", "status", "plays", "winnerId", "reason"];
const HIDDEN_PLAY_KEYS = ["index", "revealed", "commits"];

function unexpectedKeys(value: object, allowed: readonly string[]): string[] {
  return Object.keys(value).filter((key) => !allowed.includes(key));
}

export function snapshotLeaks(snapshot: RoomSnapshot): string[] {
  const issues: string[] = [];
  const { phase, bracket } = snapshot;
  const hiding = phase === "commit" || phase === "reveal";

  for (const key of unexpectedKeys(snapshot, SNAPSHOT_KEYS)) {
    issues.push(`snapshot carries unexpected field ${key}`);
  }
  for (const player of snapshot.players) {
    for (const key of unexpectedKeys(player, PLAYER_KEYS)) {
      issues.push(`player ${player.id} carries unexpected field ${key}`);
    }
  }
  if (hiding !== (snapshot.deadline !== null)) {
    issues.push(`${phase} snapshot has a wrong deadline presence`);
  }
  if ((phase === "result") !== (snapshot.nextStep !== null)) {
    issues.push(`${phase} snapshot has a wrong nextStep presence`);
  }

  if (phase === "lobby") {
    if (bracket !== null) issues.push("lobby snapshot must not carry a bracket");
    return issues;
  }
  if (bracket === null) {
    issues.push(`${phase} snapshot requires a bracket`);
    return issues;
  }
  for (const key of unexpectedKeys(bracket, BRACKET_KEYS)) {
    issues.push(`bracket carries unexpected field ${key}`);
  }
  for (const round of bracket.rounds) {
    for (const key of unexpectedKeys(round, ROUND_KEYS)) {
      issues.push(`round ${round.index} carries unexpected field ${key}`);
    }
    const started = round.matches.some((match) => match.status !== "pending");
    if (started && typeof round.question !== "string") {
      issues.push(`round ${round.index} started without a question`);
    }
    if (!started && round.question !== null) {
      issues.push(`round ${round.index} carries a question before it started`);
    }
    for (const match of round.matches) {
      const last = currentPlay(match);
      for (const key of unexpectedKeys(match, MATCH_KEYS)) {
        issues.push(`${match.id}: match carries unexpected field ${key}`);
      }
      match.plays.forEach((play, position) => {
        if (play.revealed) {
          play.reveals.forEach((record, side) => {
            const where = `${match.id}: play ${play.index} side ${side}`;
            if (record.status === "hash_mismatch") {
              const carried = [record.preimage, record.move, record.answer, record.nonce].some(
                (value) => value !== null,
              );
              if (carried) issues.push(`${where} publishes the text of a hash mismatch`);
            }
            const commit = play.commits[side as 0 | 1] ?? null;
            if (record.status === "valid" || record.status === "malformed") {
              if (record.status === "valid" && record.preimage === null) {
                issues.push(`${where} is valid without a preimage`);
              }
              if (
                record.preimage !== null &&
                (commit === null || !verifyCommit(commit, record.preimage))
              ) {
                issues.push(`${where} publishes a preimage that does not match its commit`);
              }
            } else if (record.preimage !== null) {
              issues.push(`${where} carries a preimage with status ${record.status}`);
            }
          });
          return;
        }
        if (position !== match.plays.length - 1) {
          issues.push(`${match.id}: hidden play ${play.index} is not the latest play`);
        }
        for (const key of unexpectedKeys(play, HIDDEN_PLAY_KEYS)) {
          issues.push(`${match.id}: hidden play ${play.index} carries ${key}`);
        }
        const commits: unknown = play.commits;
        const wellFormed =
          Array.isArray(commits) &&
          commits.length === 2 &&
          commits.every((hash) => hash === null || isValidHash(hash));
        if (!wellFormed) {
          issues.push(`${match.id}: hidden play ${play.index} commits are not hashes`);
        }
      });
      if (match.status === "pending" && match.plays.length > 0) {
        issues.push(`${match.id}: pending match must not have plays`);
      }
      if (match.status !== "decided" && (match.winnerId !== null || match.reason !== null)) {
        issues.push(`${match.id}: undecided match exposes a winner or reason`);
      }
      if (match.status === "playing") {
        if (!hiding) issues.push(`${match.id}: playing status outside commit/reveal`);
        if (last === null || last.revealed) {
          issues.push(`${match.id}: playing match exposes its current play`);
        }
      }
      if (!hiding && last !== null && !last.revealed) {
        issues.push(`${match.id}: unrevealed play outside commit/reveal`);
      }
    }
  }
  return issues;
}
