import type { EXTEND_SECONDS_OPTIONS } from "@fair-rps/shared";
import type {
  Avatar,
  Empty,
  JoinResult,
  Move,
  PlayIndex,
  RoomSnapshot,
  SessionInfo,
  StoredCommits,
} from "@fair-rps/shared";
import type { ActionError } from "./lib/messages.js";
import type { ConnStatus } from "./lib/view.js";

export type ExtendSeconds = (typeof EXTEND_SECONDS_OPTIONS)[number];

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export interface CommitInput {
  matchId: string;
  playIndex: PlayIndex;
  move: Move;
  answer: string;
}

export interface RoomModel {
  conn: ConnStatus;
  session: SessionInfo | null;
  snapshot: RoomSnapshot | null;
  clockOffset: number;
  frozenNow: number | null;
  commits: StoredCommits;
  join(nickname: string, avatar: Avatar): Promise<ActionResult<JoinResult>>;
  commit(input: CommitInput): Promise<ActionResult<Empty>>;
  hostStart(commitSeconds: number): Promise<ActionResult<Empty>>;
  hostStartRound(question: string): Promise<ActionResult<Empty>>;
  hostNext(): Promise<ActionResult<Empty>>;
  hostReset(): Promise<ActionResult<Empty>>;
  hostExtend(seconds: ExtendSeconds): Promise<ActionResult<Empty>>;
  hostEndEarly(): Promise<ActionResult<Empty>>;
  leaveHost(): void;
  initialCommitError?: ActionError;
  initialAvatar?: Avatar;
  initialQuestion?: string;
}
