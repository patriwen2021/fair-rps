import { randomBytes, randomInt } from "node:crypto";
import {
  COMMIT_SECONDS_DEFAULT,
  GAME_ID_HEX_LENGTH,
  CONNECTION_BROADCAST_COALESCE_MS,
  LOBBY_DISCONNECT_GRACE_MS,
  MAX_MATCH_ID_LENGTH,
  MAX_PLAYERS,
  MAX_PREIMAGE_UTF16_LENGTH,
  MIN_PLAYERS_TO_START,
  PLAYER_ID_HEX_LENGTH,
  REVEAL_GRACE_MS,
  SESSION_TOKEN_HEX_LENGTH,
  commitDurationMs,
  computeNextStep,
  currentPlay,
  dedupeNickname,
  evaluateReveal,
  isAvatar,
  isValidCommitSeconds,
  isValidHash,
  judgePlay,
  makeMatchId,
  normalizeNickname,
  normalizeQuestion,
  resolvePlay,
  sideOf,
  snapshotLeaks,
  type Ack,
  type Avatar,
  type Bracket,
  type DecisionReason,
  type Empty,
  type ErrorCode,
  type HiddenPlay,
  type JoinResult,
  type Match,
  type MatchId,
  type NextStep,
  type Phase,
  type PlayIndex,
  type PlayerId,
  type PlayerStatus,
  type RevealedPlay,
  type Role,
  type RoomSnapshot,
  type Round,
  type Side,
} from "@fair-rps/shared";

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface Rng {
  int(maxExclusive: number): number;
  hex(length: number): string;
}

export interface Timings {
  revealMs: number;
  lobbyGraceMs: number;
  connectionCoalesceMs: number;
}

export interface GameOptions {
  clock?: Clock;
  rng?: Rng;
  timings?: Partial<Timings>;
  onError?: (error: unknown) => void;
}

export interface Actor {
  role: Role;
  playerId: PlayerId | null;
}

interface PlayerRecord {
  id: PlayerId;
  nickname: string;
  avatar: Avatar;
  sessionToken: string;
  connected: boolean;
  status: PlayerStatus;
  graceTimer: unknown;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

export const cryptoRng: Rng = {
  int: (maxExclusive) => randomInt(maxExclusive),
  hex: (length) =>
    randomBytes(Math.ceil(length / 2))
      .toString("hex")
      .slice(0, length),
};

export const DEFAULT_TIMINGS: Timings = {
  revealMs: REVEAL_GRACE_MS,
  lobbyGraceMs: LOBBY_DISCONNECT_GRACE_MS,
  connectionCoalesceMs: CONNECTION_BROADCAST_COALESCE_MS,
};

const OK: Ack<Empty> = { ok: true, data: {} };

function fail(error: ErrorCode): { ok: false; error: ErrorCode } {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlayIndex(value: unknown): value is PlayIndex {
  return value === 0 || value === 1;
}

export class Game {
  private readonly clock: Clock;
  private readonly rng: Rng;
  private readonly timings: Timings;
  private readonly onError: (error: unknown) => void;
  private readonly listeners = new Set<() => void>();
  private readonly players = new Map<PlayerId, PlayerRecord>();
  private readonly tokens = new Map<string, PlayerId>();
  private readonly received = new Map<MatchId, [string | null, string | null]>();
  private phase: Phase = "lobby";
  private deadline: number | null = null;
  private commitSeconds: number = COMMIT_SECONDS_DEFAULT;
  private gameId: string | null = null;
  private bracket: Bracket | null = null;
  private round: number | null = null;
  private playIndex: PlayIndex | null = null;
  private championId: PlayerId | null = null;
  private phaseTimer: unknown = null;
  private connectionTimer: unknown = null;
  private connectionPending = false;
  private hostConnections = 0;
  private seq = 0;

  constructor(options: GameOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.rng = options.rng ?? cryptoRng;
    this.timings = { ...DEFAULT_TIMINGS, ...options.timings };
    this.onError = options.onError ?? (() => {});
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  snapshot(): RoomSnapshot {
    const snapshot: RoomSnapshot = {
      seq: this.seq + 1,
      serverNow: this.clock.now(),
      phase: this.phase,
      deadline: this.deadline,
      nextStep: this.nextStep(),
      commitSeconds: this.commitSeconds,
      hostConnected: this.hostConnections > 0,
      players: [...this.players.values()].map(({ id, nickname, avatar, connected, status }) => ({
        id,
        nickname,
        avatar,
        connected,
        status,
      })),
      gameId: this.gameId,
      bracket: this.bracket === null ? null : structuredClone(this.bracket),
      round: this.round,
      playIndex: this.playIndex,
      championId: this.championId,
    };
    const leaks = snapshotLeaks(snapshot);
    if (leaks.length > 0) throw new Error(`snapshot leak: ${leaks.join("; ")}`);
    this.seq += 1;
    return snapshot;
  }

  resumeSession(sessionToken: string): PlayerId | null {
    return this.tokens.get(sessionToken) ?? null;
  }

  nicknameOf(playerId: PlayerId): string | null {
    return this.players.get(playerId)?.nickname ?? null;
  }

  avatarOf(playerId: PlayerId): Avatar | null {
    return this.players.get(playerId)?.avatar ?? null;
  }

  hasPlayer(playerId: PlayerId): boolean {
    return this.players.has(playerId);
  }

  hostJoined(): void {
    this.hostConnections += 1;
    if (this.hostConnections === 1) this.notify();
  }

  hostLeft(): void {
    if (this.hostConnections === 0) return;
    this.hostConnections -= 1;
    if (this.hostConnections === 0) this.notify();
  }

  setPlayerConnected(playerId: PlayerId, connected: boolean): void {
    const player = this.players.get(playerId);
    if (!player || player.connected === connected) return;
    player.connected = connected;
    this.clearGrace(player);
    if (!connected && this.phase === "lobby") this.startGrace(player);
    this.notifyConnection();
  }

  join(actor: Actor, payload: unknown, admit?: () => ErrorCode | null): Ack<JoinResult> {
    if (
      !isRecord(payload) ||
      typeof payload.nickname !== "string" ||
      typeof payload.avatar !== "string"
    ) {
      return fail("INVALID_PAYLOAD");
    }
    if (actor.role === "host") return fail("HOST_CANNOT_PLAY");
    if (actor.role === "player") return fail("ALREADY_JOINED");
    if (this.phase !== "lobby") return fail("WRONG_PHASE");
    const normalized = normalizeNickname(payload.nickname);
    if (!normalized.ok) return fail("INVALID_NICKNAME");
    const avatar = payload.avatar;
    if (!isAvatar(avatar)) return fail("INVALID_AVATAR");
    if (this.players.size >= MAX_PLAYERS) return fail("ROOM_FULL");
    const refused = admit ? admit() : null;
    if (refused !== null) return fail(refused);
    const nickname = dedupeNickname(
      normalized.nickname,
      [...this.players.values()].map((player) => player.nickname),
    );
    let id = this.rng.hex(PLAYER_ID_HEX_LENGTH);
    while (this.players.has(id)) id = this.rng.hex(PLAYER_ID_HEX_LENGTH);
    let sessionToken = this.rng.hex(SESSION_TOKEN_HEX_LENGTH);
    while (this.tokens.has(sessionToken)) sessionToken = this.rng.hex(SESSION_TOKEN_HEX_LENGTH);
    this.players.set(id, {
      id,
      nickname,
      avatar,
      sessionToken,
      connected: true,
      status: "waiting",
      graceTimer: null,
    });
    this.tokens.set(sessionToken, id);
    this.notify();
    return { ok: true, data: { playerId: id, sessionToken, nickname, avatar } };
  }

  hostStart(actor: Actor, payload: unknown): Ack<Empty> {
    if (!isRecord(payload) || typeof payload.commitSeconds !== "number") {
      return fail("INVALID_PAYLOAD");
    }
    if (actor.role !== "host") return fail("NOT_HOST");
    if (this.phase !== "lobby") return fail("WRONG_PHASE");
    const commitSeconds = payload.commitSeconds;
    if (!isValidCommitSeconds(commitSeconds)) return fail("INVALID_COMMIT_SECONDS");
    const online = [...this.players.values()].filter((player) => player.connected);
    if (online.length < MIN_PLAYERS_TO_START) return fail("NOT_ENOUGH_PLAYERS");
    this.commitSeconds = commitSeconds;
    this.dropOffline();
    for (const player of online) player.status = "active";
    this.gameId = this.rng.hex(GAME_ID_HEX_LENGTH);
    this.bracket = { rounds: [] };
    this.championId = null;
    this.openRound(this.shuffle(online.map((player) => player.id)));
    this.notify();
    return OK;
  }

  hostStartRound(actor: Actor, payload: unknown): Ack<Empty> {
    if (!isRecord(payload) || typeof payload.question !== "string") return fail("INVALID_PAYLOAD");
    if (actor.role !== "host") return fail("NOT_HOST");
    if (this.phase !== "bracket") return fail("WRONG_PHASE");
    const normalized = normalizeQuestion(payload.question);
    if (!normalized.ok) return fail("INVALID_QUESTION");
    const round = this.currentRound();
    if (round === null) throw new Error("no current round");
    round.question = normalized.question;
    this.beginPlay(0);
    this.notify();
    return OK;
  }

  hostNext(actor: Actor, payload: unknown): Ack<Empty> {
    if (!isRecord(payload)) return fail("INVALID_PAYLOAD");
    if (actor.role !== "host") return fail("NOT_HOST");
    if (this.phase !== "result") return fail("WRONG_PHASE");
    const round = this.currentRound();
    if (round === null) throw new Error("no current round");
    const step = computeNextStep(round);
    if (step === "tiebreak") {
      this.beginPlay(1);
    } else {
      const advancers = round.matches.map((match) => match.winnerId as PlayerId);
      if (round.byePlayerId !== null) advancers.push(round.byePlayerId);
      if (step === "next_round") this.openRound(advancers);
      else this.crown(advancers[0] ?? null);
    }
    this.notify();
    return OK;
  }

  hostReset(actor: Actor, payload: unknown): Ack<Empty> {
    if (!isRecord(payload)) return fail("INVALID_PAYLOAD");
    if (actor.role !== "host") return fail("NOT_HOST");
    this.cancelPhaseTimer();
    this.dropOffline();
    for (const player of this.players.values()) player.status = "waiting";
    this.received.clear();
    this.phase = "lobby";
    this.deadline = null;
    this.commitSeconds = COMMIT_SECONDS_DEFAULT;
    this.gameId = null;
    this.bracket = null;
    this.round = null;
    this.playIndex = null;
    this.championId = null;
    this.notify();
    return OK;
  }

  commit(actor: Actor, payload: unknown): Ack<Empty> {
    if (
      !isRecord(payload) ||
      typeof payload.matchId !== "string" ||
      payload.matchId.length > MAX_MATCH_ID_LENGTH ||
      !isPlayIndex(payload.playIndex)
    ) {
      return fail("INVALID_PAYLOAD");
    }
    const playerId = this.playerIdOf(actor);
    if (playerId === null) return fail("NOT_PLAYER");
    if (this.phase !== "commit") return fail("WRONG_PHASE");
    const located = this.locate(playerId, payload.matchId);
    if (located === null) return fail("NOT_IN_MATCH");
    const { match, side } = located;
    const play = this.activePlay(match, payload.playIndex);
    if (play === null) return fail("MATCH_NOT_ACTIVE");
    const hash = payload.hash;
    if (!isValidHash(hash)) return fail("INVALID_HASH");
    if (play.commits[side] !== null) return fail("ALREADY_COMMITTED");
    const opponent = side === 0 ? 1 : 0;
    if (match.plays.some((previous) => previous.commits[opponent] === hash)) {
      return fail("DUPLICATE_HASH");
    }
    play.commits[side] = hash;
    this.notify();
    return OK;
  }

  reveal(actor: Actor, payload: unknown): Ack<Empty> {
    if (
      !isRecord(payload) ||
      typeof payload.matchId !== "string" ||
      payload.matchId.length > MAX_MATCH_ID_LENGTH ||
      !isPlayIndex(payload.playIndex) ||
      typeof payload.preimage !== "string" ||
      payload.preimage.length > MAX_PREIMAGE_UTF16_LENGTH
    ) {
      return fail("INVALID_PAYLOAD");
    }
    const playerId = this.playerIdOf(actor);
    if (playerId === null) return fail("NOT_PLAYER");
    if (this.phase !== "reveal") return fail("WRONG_PHASE");
    const located = this.locate(playerId, payload.matchId);
    if (located === null) return fail("NOT_IN_MATCH");
    const { match, side } = located;
    const play = this.activePlay(match, payload.playIndex);
    if (play === null) return fail("MATCH_NOT_ACTIVE");
    if (play.commits[side] === null) return fail("NOT_COMMITTED");
    const slot = this.received.get(match.id) ?? [null, null];
    if (slot[side] !== null) return fail("ALREADY_REVEALED");
    slot[side] = payload.preimage;
    this.received.set(match.id, slot);
    return OK;
  }

  dispose(): void {
    this.cancelPhaseTimer();
    this.cancelConnectionTimer();
    for (const player of this.players.values()) this.clearGrace(player);
    this.listeners.clear();
  }

  private notify(): void {
    this.cancelConnectionTimer();
    this.fireListeners();
  }

  private notifyConnection(): void {
    if (this.connectionTimer !== null) {
      this.connectionPending = true;
      return;
    }
    this.fireListeners();
    const timer = setTimeout(() => {
      this.connectionTimer = null;
      if (!this.connectionPending) return;
      this.connectionPending = false;
      this.notify();
    }, this.timings.connectionCoalesceMs);
    timer.unref();
    this.connectionTimer = timer;
  }

  private cancelConnectionTimer(): void {
    if (this.connectionTimer === null) return;
    clearTimeout(this.connectionTimer as NodeJS.Timeout);
    this.connectionTimer = null;
    this.connectionPending = false;
  }

  private fireListeners(): void {
    for (const listener of this.listeners) listener();
  }

  private playerIdOf(actor: Actor): PlayerId | null {
    if (actor.role !== "player" || actor.playerId === null) return null;
    return this.players.has(actor.playerId) ? actor.playerId : null;
  }

  private nextStep(): NextStep | null {
    if (this.phase !== "result") return null;
    const round = this.currentRound();
    return round === null ? null : computeNextStep(round);
  }

  private currentRound(): Round | null {
    if (this.bracket === null || this.round === null) return null;
    return this.bracket.rounds[this.round] ?? null;
  }

  private locate(playerId: PlayerId, matchId: MatchId): { match: Match; side: Side } | null {
    const match = this.currentRound()?.matches.find((candidate) => candidate.id === matchId);
    if (!match) return null;
    const side = sideOf(match, playerId);
    return side === null ? null : { match, side };
  }

  private activePlay(match: Match, playIndex: PlayIndex): HiddenPlay | null {
    if (match.status !== "playing" || playIndex !== this.playIndex) return null;
    const play = currentPlay(match);
    return play !== null && !play.revealed && play.index === playIndex ? play : null;
  }

  private shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = this.rng.int(i + 1);
      const a = result[i] as T;
      result[i] = result[j] as T;
      result[j] = a;
    }
    return result;
  }

  private startGrace(player: PlayerRecord): void {
    player.graceTimer = this.clock.setTimeout(() => {
      player.graceTimer = null;
      if (this.phase !== "lobby" || player.connected) return;
      this.removePlayer(player);
      this.notify();
    }, this.timings.lobbyGraceMs);
  }

  private clearGrace(player: PlayerRecord): void {
    if (player.graceTimer === null) return;
    this.clock.clearTimeout(player.graceTimer);
    player.graceTimer = null;
  }

  private removePlayer(player: PlayerRecord): void {
    this.clearGrace(player);
    this.players.delete(player.id);
    this.tokens.delete(player.sessionToken);
  }

  private dropOffline(): void {
    for (const player of [...this.players.values()]) {
      if (!player.connected) this.removePlayer(player);
    }
  }

  private cancelPhaseTimer(): void {
    if (this.phaseTimer === null) return;
    this.clock.clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
  }

  private enter(phase: Phase, durationMs: number | null, next?: () => void): void {
    this.cancelPhaseTimer();
    this.phase = phase;
    if (durationMs === null || !next) {
      this.deadline = null;
      return;
    }
    this.deadline = this.clock.now() + durationMs;
    this.phaseTimer = this.clock.setTimeout(() => {
      this.phaseTimer = null;
      try {
        next();
        this.notify();
      } catch (error) {
        this.onError(error);
      }
    }, durationMs);
  }

  private openRound(entrants: PlayerId[]): void {
    if (this.bracket === null || this.gameId === null) throw new Error("no game in progress");
    const index = this.bracket.rounds.length;
    const queue = [...entrants];
    let byePlayerId: PlayerId | null = null;
    if (queue.length % 2 === 1) {
      byePlayerId = queue.splice(this.rng.int(queue.length), 1)[0] ?? null;
    }
    const matches: Match[] = [];
    for (let i = 0; i + 1 < queue.length; i += 2) {
      const matchIndex = i / 2;
      matches.push({
        id: makeMatchId(this.gameId, index, matchIndex),
        round: index,
        index: matchIndex,
        playerIds: [queue[i] as PlayerId, queue[i + 1] as PlayerId],
        status: "pending",
        plays: [],
        winnerId: null,
        reason: null,
      });
    }
    this.bracket.rounds.push({ index, question: null, matches, byePlayerId });
    this.round = index;
    this.playIndex = null;
    this.enter("bracket", null);
  }

  private beginPlay(playIndex: PlayIndex): void {
    const round = this.currentRound();
    if (round === null) throw new Error("no current round");
    const waiting = playIndex === 0 ? "pending" : "awaiting_tiebreak";
    this.received.clear();
    for (const match of round.matches) {
      if (match.status !== waiting) continue;
      match.status = "playing";
      match.plays.push({ index: playIndex, revealed: false, commits: [null, null] });
    }
    this.playIndex = playIndex;
    this.enter("commit", commitDurationMs(this.commitSeconds), () =>
      this.enter("reveal", this.timings.revealMs, () => this.settle()),
    );
  }

  private settle(): void {
    const round = this.currentRound();
    if (round === null) throw new Error("no current round");
    for (const match of round.matches) {
      if (match.status !== "playing") continue;
      const hidden = currentPlay(match);
      if (hidden === null || hidden.revealed) throw new Error(`${match.id}: no hidden play`);
      const slot = this.received.get(match.id) ?? [null, null];
      const reveals: RevealedPlay["reveals"] = [
        evaluateReveal(hidden.commits[0], slot[0] ?? undefined),
        evaluateReveal(hidden.commits[1], slot[1] ?? undefined),
      ];
      const outcome = judgePlay(reveals[0].move, reveals[1].move);
      match.plays[match.plays.length - 1] = {
        index: hidden.index,
        revealed: true,
        commits: hidden.commits,
        reveals,
        outcome,
      };
      const resolution = resolvePlay(outcome, hidden.index);
      if (resolution.type === "tiebreak") {
        match.status = "awaiting_tiebreak";
      } else if (resolution.type === "decided") {
        this.decide(match, resolution.winner, resolution.reason);
      } else {
        this.decide(match, this.rng.int(2) === 0 ? 0 : 1, resolution.reason);
      }
    }
    this.received.clear();
    this.enter("result", null);
  }

  private decide(match: Match, winner: Side, reason: DecisionReason): void {
    match.status = "decided";
    match.winnerId = match.playerIds[winner];
    match.reason = reason;
    const loser = this.players.get(match.playerIds[winner === 0 ? 1 : 0]);
    if (loser) loser.status = "eliminated";
  }

  private crown(championId: PlayerId | null): void {
    this.championId = championId;
    const champion = championId === null ? undefined : this.players.get(championId);
    if (champion) champion.status = "champion";
    this.playIndex = null;
    this.enter("finished", null);
  }
}
