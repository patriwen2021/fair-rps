import type { Avatar } from "./avatar.js";
import type { PlayIndex } from "./moves.js";
import type { Hash, MatchId, PlayerId, Role, RoomSnapshot } from "./state.js";

export const ERROR_CODES = [
  "INVALID_PAYLOAD",
  "RATE_LIMITED",
  "WRONG_PHASE",
  "NOT_HOST",
  "NOT_PLAYER",
  "HOST_CANNOT_PLAY",
  "ALREADY_JOINED",
  "ROOM_FULL",
  "TOO_MANY_PLAYERS_FROM_IP",
  "INVALID_NICKNAME",
  "INVALID_AVATAR",
  "INVALID_COMMIT_SECONDS",
  "INVALID_QUESTION",
  "NOT_ENOUGH_PLAYERS",
  "NOT_IN_MATCH",
  "MATCH_NOT_ACTIVE",
  "INVALID_HASH",
  "ALREADY_COMMITTED",
  "DUPLICATE_HASH",
  "NOT_COMMITTED",
  "ALREADY_REVEALED",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const CONNECT_ERROR_CODES = [
  "INVALID_HOST_TOKEN",
  "INVALID_HANDSHAKE",
  "HOST_TOKEN_LOCKED",
  "TOO_MANY_CONNECTIONS",
] as const;
export type ConnectErrorCode = (typeof CONNECT_ERROR_CODES)[number];

export type AckOk<T> = { ok: true; data: T };
export type AckError = { ok: false; error: ErrorCode };
export type Ack<T> = AckOk<T> | AckError;
export type AckCallback<T> = (response: Ack<T>) => void;

export type Empty = Record<string, never>;

export interface HandshakeAuth {
  hostToken?: string;
  sessionToken?: string;
}

export interface JoinPayload {
  nickname: string;
  avatar: Avatar;
}

export interface JoinResult {
  playerId: PlayerId;
  sessionToken: string;
  nickname: string;
  avatar: Avatar;
}

export interface HostStartPayload {
  commitSeconds: number;
}

export interface HostStartRoundPayload {
  question: string;
}

export interface CommitPayload {
  matchId: MatchId;
  playIndex: PlayIndex;
  hash: Hash;
}

export interface RevealPayload {
  matchId: MatchId;
  playIndex: PlayIndex;
  preimage: string;
}

export interface SessionInfo {
  role: Role;
  playerId: PlayerId | null;
  nickname: string | null;
  avatar: Avatar | null;
}

export interface ClientToServerEvents {
  join: (payload: JoinPayload, ack: AckCallback<JoinResult>) => void;
  commit: (payload: CommitPayload, ack: AckCallback<Empty>) => void;
  reveal: (payload: RevealPayload, ack: AckCallback<Empty>) => void;
  "host:start": (payload: HostStartPayload, ack: AckCallback<Empty>) => void;
  "host:startRound": (payload: HostStartRoundPayload, ack: AckCallback<Empty>) => void;
  "host:next": (payload: Empty, ack: AckCallback<Empty>) => void;
  "host:reset": (payload: Empty, ack: AckCallback<Empty>) => void;
}

export interface ServerToClientEvents {
  session: (info: SessionInfo) => void;
  state: (snapshot: RoomSnapshot) => void;
  superseded: () => void;
}

export type InterServerEvents = Record<string, never>;

export interface SocketData {
  role: Role;
  playerId: PlayerId | null;
}
