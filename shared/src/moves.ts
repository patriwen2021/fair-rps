import { MAX_PLAYS_PER_MATCH } from "./constants.js";

export const MOVES = ["rock", "paper", "scissors"] as const;
export type Move = (typeof MOVES)[number];

export type Side = 0 | 1;
export type PlayIndex = 0 | 1;

export type PlayOutcome =
  | { kind: "win"; winner: Side }
  | { kind: "forfeit"; winner: Side }
  | { kind: "draw" }
  | { kind: "double_forfeit" };

export const DECISION_REASONS = [
  "win",
  "opponent_forfeit",
  "double_forfeit_lot",
  "tiebreak_draw_lot",
] as const;
export type DecisionReason = (typeof DECISION_REASONS)[number];

export const DECISION_REASON_LABEL: Record<DecisionReason, string> = {
  win: "出拳勝出",
  opponent_forfeit: "對手未出拳",
  double_forfeit_lot: "雙方棄權，抽籤晉級",
  tiebreak_draw_lot: "加賽仍平手，抽籤晉級",
};

export const MOVE_LABEL: Record<Move, string> = {
  rock: "石頭",
  paper: "布",
  scissors: "剪刀",
};

export type PlayResolution =
  | { type: "decided"; winner: Side; reason: "win" | "opponent_forfeit" }
  | { type: "lot"; reason: "double_forfeit_lot" | "tiebreak_draw_lot" }
  | { type: "tiebreak" };

const BEATS: Record<Move, Move> = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

export function isMove(value: unknown): value is Move {
  return typeof value === "string" && (MOVES as readonly string[]).includes(value);
}

export function compareMoves(a: Move, b: Move): Side | "draw" {
  if (a === b) return "draw";
  return BEATS[a] === b ? 0 : 1;
}

export function judgePlay(a: Move | null, b: Move | null): PlayOutcome {
  if (a === null && b === null) return { kind: "double_forfeit" };
  if (a === null) return { kind: "forfeit", winner: 1 };
  if (b === null) return { kind: "forfeit", winner: 0 };
  const result = compareMoves(a, b);
  return result === "draw" ? { kind: "draw" } : { kind: "win", winner: result };
}

export function resolvePlay(outcome: PlayOutcome, playIndex: PlayIndex): PlayResolution {
  switch (outcome.kind) {
    case "win":
      return { type: "decided", winner: outcome.winner, reason: "win" };
    case "forfeit":
      return { type: "decided", winner: outcome.winner, reason: "opponent_forfeit" };
    case "double_forfeit":
      return { type: "lot", reason: "double_forfeit_lot" };
    case "draw":
      return playIndex + 1 < MAX_PLAYS_PER_MATCH
        ? { type: "tiebreak" }
        : { type: "lot", reason: "tiebreak_draw_lot" };
  }
}

export function isLotReason(reason: DecisionReason): boolean {
  return reason === "double_forfeit_lot" || reason === "tiebreak_draw_lot";
}
