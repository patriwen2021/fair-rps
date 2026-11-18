import {
  NEXT_STEP_LABEL,
  commitStatuses,
  currentPlay,
  currentRound,
  playingMatches,
  sideOf,
  type CommitStatus,
  type Match,
  type PlayerPublic,
  type RoomSnapshot,
  type SessionInfo,
} from "@fair-rps/shared";

export type ConnStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "superseded"
  | "host_rejected"
  | "host_locked"
  | "too_many_connections"
  | "handshake_rejected";

export type Notice = "seed" | "advanced" | "eliminated" | "spectator" | null;

export type View =
  | { kind: "connecting" }
  | { kind: "superseded" }
  | { kind: "host_rejected" }
  | { kind: "host_locked" }
  | { kind: "too_many_connections" }
  | { kind: "handshake_rejected" }
  | { kind: "entry" }
  | { kind: "lobby" }
  | { kind: "host" }
  | { kind: "bracket"; notice: Notice }
  | { kind: "duel"; matchId: string }
  | { kind: "watch"; notice: Notice }
  | { kind: "results"; notice: Notice }
  | { kind: "champion" };

export interface ViewInput {
  conn: ConnStatus;
  session: SessionInfo | null;
  snapshot: RoomSnapshot | null;
}

export function findSelf(session: SessionInfo | null, snapshot: RoomSnapshot | null): PlayerPublic | null {
  if (!session || !snapshot || session.role !== "player" || session.playerId === null) return null;
  return snapshot.players.find((player) => player.id === session.playerId) ?? null;
}

export function findDuelMatch(snapshot: RoomSnapshot, playerId: string): Match | null {
  const { phase } = snapshot;
  if (phase !== "commit" && phase !== "reveal" && phase !== "result") return null;
  for (const match of currentRound(snapshot)?.matches ?? []) {
    if (sideOf(match, playerId) === null) continue;
    if (phase === "result") {
      const play = currentPlay(match);
      if (play !== null && play.revealed && play.index === snapshot.playIndex) return match;
    } else if (match.status === "playing") {
      return match;
    }
  }
  return null;
}

function noticeFor(snapshot: RoomSnapshot, me: PlayerPublic): Notice {
  if (me.status === "eliminated") return "eliminated";
  const round = currentRound(snapshot);
  if (!round) return null;
  if (round.byePlayerId === me.id) return "seed";
  const mine = round.matches.find((match) => sideOf(match, me.id) !== null);
  if (mine && mine.status === "decided" && mine.winnerId === me.id) return "advanced";
  return null;
}

export function selectView({ conn, session, snapshot }: ViewInput): View {
  if (conn === "superseded") return { kind: "superseded" };
  if (conn === "host_rejected") return { kind: "host_rejected" };
  if (conn === "host_locked") return { kind: "host_locked" };
  if (conn === "too_many_connections") return { kind: "too_many_connections" };
  if (conn === "handshake_rejected") return { kind: "handshake_rejected" };
  if (!session || !snapshot) return { kind: "connecting" };
  if (session.role === "host") return { kind: "host" };
  const me = findSelf(session, snapshot);
  if (snapshot.phase === "lobby") return me ? { kind: "lobby" } : { kind: "entry" };
  if (snapshot.phase === "finished") return { kind: "champion" };
  const notice: Notice = me ? noticeFor(snapshot, me) : "spectator";
  if (snapshot.phase === "bracket") return { kind: "bracket", notice };
  const duel = me ? findDuelMatch(snapshot, me.id) : null;
  if (duel) return { kind: "duel", matchId: duel.id };
  return snapshot.phase === "result" ? { kind: "results", notice } : { kind: "watch", notice };
}

export interface BoardSide {
  playerId: string;
  player: PlayerPublic | null;
  status: CommitStatus;
}

export interface BoardMatch {
  match: Match;
  sides: [BoardSide, BoardSide];
}

export interface Board {
  matches: BoardMatch[];
  locked: number;
  total: number;
}

export function boardOf(snapshot: RoomSnapshot): Board {
  const players = new Map(snapshot.players.map((player) => [player.id, player]));
  const matches: BoardMatch[] = [];
  let locked = 0;
  for (const match of playingMatches(snapshot)) {
    const statuses = commitStatuses(match);
    if (statuses === null) continue;
    const side = (index: 0 | 1): BoardSide => ({
      playerId: match.playerIds[index],
      player: players.get(match.playerIds[index]) ?? null,
      status: statuses[index],
    });
    const sides: [BoardSide, BoardSide] = [side(0), side(1)];
    locked += sides.filter((entry) => entry.status.locked).length;
    matches.push({ match, sides });
  }
  return { matches, locked, total: matches.length * 2 };
}

export type HostAction =
  | { kind: "start"; label: string }
  | { kind: "startRound"; label: string }
  | { kind: "next"; label: string };

export function hostAction(snapshot: RoomSnapshot): HostAction | null {
  switch (snapshot.phase) {
    case "lobby":
      return { kind: "start", label: "開始分配賽程" };
    case "bracket":
      return { kind: "startRound", label: "開始猜拳" };
    case "result":
      return snapshot.nextStep === null ? null : { kind: "next", label: NEXT_STEP_LABEL[snapshot.nextStep] };
    default:
      return null;
  }
}

export function waitingForHostText(snapshot: RoomSnapshot): string | null {
  if (snapshot.phase === "bracket") {
    return snapshot.hostConnected ? "等待裁判出題" : "裁判暫時離線，等裁判回來出題";
  }
  if (snapshot.phase === "result") {
    const step = snapshot.nextStep === null ? "" : `（${NEXT_STEP_LABEL[snapshot.nextStep]}）`;
    return snapshot.hostConnected ? `等待裁判進行下一步${step}` : `裁判暫時離線，等待裁判回來進行下一步${step}`;
  }
  return null;
}
