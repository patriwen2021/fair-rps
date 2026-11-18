import {
  HOST_QUERY_PARAM,
  NONCE_BYTES,
  buildPreimage,
  commitStorageKey,
  currentPlay,
  hashPreimage,
  nonceFromBytes,
  sideOf,
  type Avatar,
  type ClientToServerEvents,
  type Empty,
  type HandshakeAuth,
  type JoinResult,
  type RoomSnapshot,
  type ServerToClientEvents,
  type SessionInfo,
  type StoredCommit,
  type StoredCommits,
} from "@fair-rps/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { clockOffset } from "../lib/clock.js";
import {
  clearCommits,
  clearHostToken,
  clearSession,
  loadCommits,
  loadHostToken,
  loadSession,
  pruneCommits,
  saveCommits,
  saveHostToken,
  saveSession,
  withCommit,
  withoutCommit,
} from "../lib/storage.js";
import { findDuelMatch, findSelf, type ConnStatus } from "../lib/view.js";
import type { ActionResult, CommitInput, RoomModel } from "../model.js";

type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const ACK_TIMEOUT_MS = 5_000;
const MAX_REVEAL_TRIES = 3;

interface RevealAttempt {
  done: boolean;
  inflight: boolean;
  tries: number;
}

function readHostTokenFromUrl(): string | null {
  const token = new URLSearchParams(window.location.search).get(HOST_QUERY_PARAM);
  return token !== null && token.length > 0 ? token : null;
}

function stripHostTokenFromUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(HOST_QUERY_PARAM)) return;
  url.searchParams.delete(HOST_QUERY_PARAM);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

const TIMEOUT: ActionResult<never> = { ok: false, error: "TIMEOUT" };

export function useRoom(): RoomModel {
  const [conn, setConn] = useState<ConnStatus>("connecting");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [offset, setOffset] = useState(0);
  const [commits, setCommitsState] = useState<StoredCommits>(() => loadCommits());
  const [revealTick, setRevealTick] = useState(0);

  const socketRef = useRef<RoomSocket | null>(null);
  const commitsRef = useRef(commits);
  const hostTokenRef = useRef<string | null>(null);
  const seenSeqRef = useRef(0);
  const supersededRef = useRef(false);
  const revealsRef = useRef(new Map<string, RevealAttempt>());

  const setCommits = useCallback((next: StoredCommits) => {
    commitsRef.current = next;
    saveCommits(next);
    setCommitsState(next);
  }, []);

  useEffect(() => {
    hostTokenRef.current = readHostTokenFromUrl() ?? loadHostToken();
    supersededRef.current = false;

    const socket: RoomSocket = io({
      auth: (cb) => {
        const auth: HandshakeAuth = {};
        const stored = loadSession();
        if (hostTokenRef.current !== null) auth.hostToken = hostTokenRef.current;
        else if (stored !== null) auth.sessionToken = stored.sessionToken;
        cb(auth);
      },
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      seenSeqRef.current = 0;
      for (const attempt of revealsRef.current.values()) attempt.inflight = false;
      setConn("connected");
    });

    socket.on("disconnect", (reason) => {
      if (supersededRef.current || reason === "io client disconnect") return;
      setConn("reconnecting");
      if (reason === "io server disconnect") socket.connect();
    });

    socket.on("connect_error", (error) => {
      if (error.message === "INVALID_HOST_TOKEN") {
        clearHostToken();
        setConn("host_rejected");
        return;
      }
      if (error.message === "HOST_TOKEN_LOCKED") {
        setConn("host_locked");
        return;
      }
      if (error.message === "TOO_MANY_CONNECTIONS") {
        setConn("too_many_connections");
        return;
      }
      if (error.message === "INVALID_HANDSHAKE") {
        setConn("handshake_rejected");
        return;
      }
      setConn((current) => (current === "connecting" ? current : "reconnecting"));
    });

    socket.on("session", (info) => {
      if (info.role === "host") {
        if (hostTokenRef.current !== null) saveHostToken(hostTokenRef.current);
        stripHostTokenFromUrl();
      } else if (info.playerId === null) {
        clearSession();
        clearCommits();
        if (Object.keys(commitsRef.current).length > 0) {
          commitsRef.current = {};
          setCommitsState({});
        }
      }
      setSession(info);
    });

    socket.on("state", (next) => {
      if (next.seq <= seenSeqRef.current) return;
      seenSeqRef.current = next.seq;
      setOffset(clockOffset(next.serverNow, Date.now()));
      const pruned = pruneCommits(commitsRef.current, next.gameId);
      if (Object.keys(pruned).length !== Object.keys(commitsRef.current).length) {
        commitsRef.current = pruned;
        saveCommits(pruned);
        setCommitsState(pruned);
      }
      setSnapshot(next);
    });

    socket.on("superseded", () => {
      supersededRef.current = true;
      setConn("superseded");
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !snapshot || snapshot.phase !== "reveal" || conn !== "connected") return;
    const me = findSelf(session, snapshot);
    if (!me) return;
    const match = findDuelMatch(snapshot, me.id);
    const play = match ? currentPlay(match) : null;
    const side = match ? sideOf(match, me.id) : null;
    if (!match || !play || side === null) return;
    const key = commitStorageKey(match.id, play.index);
    const stored = commitsRef.current[key];
    if (!stored || stored.hash !== play.commits[side]) return;
    const attempt = revealsRef.current.get(key) ?? { done: false, inflight: false, tries: 0 };
    revealsRef.current.set(key, attempt);
    if (attempt.done || attempt.inflight || attempt.tries >= MAX_REVEAL_TRIES) return;
    attempt.inflight = true;
    attempt.tries += 1;
    socket
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck("reveal", { matchId: match.id, playIndex: play.index, preimage: stored.preimage })
      .then((ack) => {
        attempt.inflight = false;
        if (ack.ok || ack.error === "ALREADY_REVEALED") attempt.done = true;
        else setRevealTick((tick) => tick + 1);
      })
      .catch(() => {
        attempt.inflight = false;
        setRevealTick((tick) => tick + 1);
      });
  }, [snapshot, session, conn, revealTick]);

  const join = useCallback(async (nickname: string, avatar: Avatar): Promise<ActionResult<JoinResult>> => {
    const socket = socketRef.current;
    if (!socket) return TIMEOUT;
    try {
      const ack = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck("join", { nickname, avatar });
      if (ack.ok) saveSession(ack.data);
      return ack;
    } catch {
      return TIMEOUT;
    }
  }, []);

  const commit = useCallback(
    async ({ matchId, playIndex, move, answer }: CommitInput): Promise<ActionResult<Empty>> => {
      const socket = socketRef.current;
      if (!socket) return TIMEOUT;
      const nonce = nonceFromBytes(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)));
      const preimage = buildPreimage(move, answer, nonce);
      const stored: StoredCommit = { matchId, playIndex, hash: hashPreimage(preimage), preimage };
      const key = commitStorageKey(matchId, playIndex);
      const previous = commitsRef.current[key];
      setCommits(withCommit(commitsRef.current, stored));
      try {
        const ack = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck("commit", { matchId, playIndex, hash: stored.hash });
        if (!ack.ok && commitsRef.current[key]?.hash === stored.hash) {
          setCommits(previous ? withCommit(commitsRef.current, previous) : withoutCommit(commitsRef.current, key));
        }
        return ack;
      } catch {
        return TIMEOUT;
      }
    },
    [setCommits],
  );

  const emitHost = useCallback(async (send: (socket: RoomSocket) => Promise<ActionResult<Empty>>) => {
    const socket = socketRef.current;
    if (!socket) return TIMEOUT;
    try {
      return await send(socket);
    } catch {
      return TIMEOUT;
    }
  }, []);

  const hostStart = useCallback(
    (commitSeconds: number) =>
      emitHost((socket) => socket.timeout(ACK_TIMEOUT_MS).emitWithAck("host:start", { commitSeconds })),
    [emitHost],
  );
  const hostStartRound = useCallback(
    (question: string) =>
      emitHost((socket) => socket.timeout(ACK_TIMEOUT_MS).emitWithAck("host:startRound", { question })),
    [emitHost],
  );
  const hostNext = useCallback(
    () => emitHost((socket) => socket.timeout(ACK_TIMEOUT_MS).emitWithAck("host:next", {})),
    [emitHost],
  );
  const hostReset = useCallback(
    () => emitHost((socket) => socket.timeout(ACK_TIMEOUT_MS).emitWithAck("host:reset", {})),
    [emitHost],
  );

  const leaveHost = useCallback(() => {
    clearHostToken();
    stripHostTokenFromUrl();
    window.location.reload();
  }, []);

  return useMemo(
    () => ({
      conn,
      session,
      snapshot,
      clockOffset: offset,
      frozenNow: null,
      commits,
      join,
      commit,
      hostStart,
      hostStartRound,
      hostNext,
      hostReset,
      leaveHost,
    }),
    [conn, session, snapshot, offset, commits, join, commit, hostStart, hostStartRound, hostNext, hostReset, leaveHost],
  );
}
