import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import fastifyStatic from "@fastify/static";
import {
  DEFAULT_MAX_CONNECTIONS_PER_IP,
  DEFAULT_MAX_PLAYERS_PER_IP,
  HANDSHAKE_RATE_LIMIT_MAX,
  HANDSHAKE_RATE_LIMIT_WINDOW_MS,
  HOST_AUTH_ATTEMPT_WINDOW_MS,
  HOST_AUTH_BASE_LOCK_MS,
  HOST_AUTH_FAILURE_TTL_MS,
  HOST_AUTH_FREE_FAILURES,
  HOST_AUTH_MAX_ATTEMPTS_PER_WINDOW,
  HOST_AUTH_MAX_LOCK_MS,
  IP_RATE_LIMIT_MAX_EVENTS,
  MAX_HOST_TOKEN_LENGTH,
  MAX_MESSAGE_BYTES,
  RATE_LIMIT_MAX_EVENTS,
  RATE_LIMIT_WINDOW_MS,
  SESSION_TOKEN_HEX_LENGTH,
  type Ack,
  type ClientToServerEvents,
  type ConnectErrorCode,
  type InterServerEvents,
  type PlayerId,
  type Role,
  type ServerToClientEvents,
  type SocketData,
} from "@fair-rps/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { Server, type Socket } from "socket.io";
import { Game, type Actor, type GameOptions } from "./game.js";
import { HostAuthGuard, IpCounter, IpRateLimiter, clientIp, type HostAuthPolicy } from "./ipGuard.js";
import { RateLimiter } from "./rateLimiter.js";

type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export interface AppOptions {
  hostToken: string;
  webDist?: string;
  game?: GameOptions;
  logger?: boolean | { level?: string; stream?: { write(message: string): void } };
  rateLimit?: { windowMs: number; maxEvents: number; maxEventsPerIp?: number };
  trustProxy?: number;
  limits?: { maxConnectionsPerIp?: number; maxPlayersPerIp?: number; handshakesPerWindow?: number };
  hostAuth?: Partial<HostAuthPolicy>;
}

export interface App {
  fastify: FastifyInstance;
  io: GameServer;
  game: Game;
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

const OVER_LIMIT_CLOSE_MS = 2_000;
const SESSION_TOKEN_PATTERN = new RegExp(`^[0-9a-f]{${SESSION_TOKEN_HEX_LENGTH}}$`);

export function tokensEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}

export function redactUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  const cut = url.indexOf("?");
  return cut === -1 ? url : url.slice(0, cut);
}

type Handshake =
  | { ok: true; hostToken: string | undefined; sessionToken: string | undefined }
  | { ok: false };

function parseHandshake(auth: unknown): Handshake {
  if (typeof auth !== "object" || auth === null || Array.isArray(auth)) return { ok: false };
  const { hostToken, sessionToken } = auth as Record<string, unknown>;
  if (hostToken !== undefined) {
    if (typeof hostToken !== "string" || hostToken.length > MAX_HOST_TOKEN_LENGTH) {
      return { ok: false };
    }
  }
  if (sessionToken !== undefined) {
    if (typeof sessionToken !== "string" || !SESSION_TOKEN_PATTERN.test(sessionToken)) {
      return { ok: false };
    }
  }
  return { ok: true, hostToken, sessionToken };
}

export async function createApp(options: AppOptions): Promise<App> {
  const { hostToken } = options;
  if (hostToken.length === 0 || hostToken.length > MAX_HOST_TOKEN_LENGTH) {
    throw new Error(`HOST_TOKEN must be 1-${MAX_HOST_TOKEN_LENGTH} characters`);
  }
  const rateLimit = options.rateLimit ?? {
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxEvents: RATE_LIMIT_MAX_EVENTS,
  };
  const trustedHops = options.trustProxy ?? 0;
  const maxConnectionsPerIp = options.limits?.maxConnectionsPerIp ?? DEFAULT_MAX_CONNECTIONS_PER_IP;
  const maxPlayersPerIp = options.limits?.maxPlayersPerIp ?? DEFAULT_MAX_PLAYERS_PER_IP;
  const ipEvents = new IpRateLimiter(rateLimit.windowMs, rateLimit.maxEventsPerIp ?? IP_RATE_LIMIT_MAX_EVENTS);
  const hostAuth = new HostAuthGuard({
    freeFailures: HOST_AUTH_FREE_FAILURES,
    baseLockMs: HOST_AUTH_BASE_LOCK_MS,
    maxLockMs: HOST_AUTH_MAX_LOCK_MS,
    failureTtlMs: HOST_AUTH_FAILURE_TTL_MS,
    attemptWindowMs: HOST_AUTH_ATTEMPT_WINDOW_MS,
    maxAttemptsPerWindow: HOST_AUTH_MAX_ATTEMPTS_PER_WINDOW,
    ...options.hostAuth,
  });
  const handshakes = new IpRateLimiter(
    HANDSHAKE_RATE_LIMIT_WINDOW_MS,
    options.limits?.handshakesPerWindow ?? HANDSHAKE_RATE_LIMIT_MAX,
  );
  const loggerOption = options.logger ?? false;

  const fastify = Fastify({
    trustProxy: trustedHops > 0 ? (_address: string, hop: number) => hop < trustedHops : false,
    logger:
      loggerOption === false
        ? false
        : {
            ...(loggerOption === true ? {} : loggerOption),
            serializers: {
              req(request: {
                method?: string;
                url?: string;
                host?: string;
                ip?: string;
              }) {
                return {
                  method: request.method,
                  url: redactUrl(request.url),
                  host: request.host,
                  remoteAddress: request.ip,
                };
              },
            },
          },
  });

  fastify.addHook("onSend", async (_request, reply) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) reply.header(name, value);
  });

  if (options.webDist !== undefined && existsSync(options.webDist)) {
    await fastify.register(fastifyStatic, { root: options.webDist });
    fastify.setNotFoundHandler((_request, reply) => reply.sendFile("index.html"));
  } else if (options.webDist !== undefined) {
    fastify.log.warn(`web build not found at ${options.webDist}; run "npm run build" first`);
  }

  const game = new Game({
    ...options.game,
    onError: options.game?.onError ?? ((error) => fastify.log.error(error)),
  });

  const io: GameServer = new Server(fastify.server, {
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    serveClient: false,
  });

  const playerSockets = new Map<PlayerId, GameSocket>();
  const playerIps = new Map<PlayerId, string>();
  const connections = new IpCounter();
  const connIps = new WeakMap<object, string>();
  const overLimit = new WeakSet<object>();
  let warnedForwarded = false;

  const ipOf = (conn: GameSocket["conn"]): string => {
    const known = connIps.get(conn);
    if (known !== undefined) return known;
    const forwarded = conn.request.headers["x-forwarded-for"];
    if (trustedHops === 0 && forwarded !== undefined && !warnedForwarded) {
      warnedForwarded = true;
      fastify.log.warn(
        "收到帶 X-Forwarded-For 的連線，但 TRUST_PROXY 未開啟：伺服器若在 tunnel 或反向代理後面，請設 TRUST_PROXY=1，否則所有玩家會被視為同一個 IP。",
      );
    }
    const ip = clientIp(conn.request.socket.remoteAddress, forwarded, trustedHops);
    connIps.set(conn, ip);
    return ip;
  };

  const playersFromIp = (ip: string): number => {
    let count = 0;
    for (const [playerId, owner] of playerIps) {
      if (!game.hasPlayer(playerId)) playerIps.delete(playerId);
      else if (owner === ip) count += 1;
    }
    return count;
  };

  io.engine.on("connection", (conn: GameSocket["conn"]) => {
    const ip = ipOf(conn);
    if (connections.get(ip) >= maxConnectionsPerIp) {
      overLimit.add(conn);
      const timer = setTimeout(() => conn.close(), OVER_LIMIT_CLOSE_MS);
      timer.unref();
      conn.once("close", () => clearTimeout(timer));
      return;
    }
    connections.add(ip);
    conn.once("close", () => connections.remove(ip));
  });
  let holding = 0;
  let dirty = false;

  const broadcast = () => {
    try {
      io.emit("state", game.snapshot());
    } catch (error) {
      fastify.log.error(error);
    }
  };

  const batch = (run: () => void): boolean => {
    holding += 1;
    try {
      run();
    } finally {
      holding -= 1;
    }
    if (holding > 0 || !dirty) return false;
    dirty = false;
    broadcast();
    return true;
  };

  game.onChange(() => {
    if (holding > 0) dirty = true;
    else broadcast();
  });

  io.use((socket, next) => {
    const reject = (code: ConnectErrorCode) => next(new Error(code));
    if (overLimit.has(socket.conn)) return reject("TOO_MANY_CONNECTIONS");
    const ip = ipOf(socket.conn);
    const handshake = parseHandshake(socket.handshake.auth);
    if (!handshake.ok) return reject("INVALID_HANDSHAKE");
    let role: Role = "spectator";
    let playerId: PlayerId | null = null;
    let verifiedHost = false;
    if (handshake.hostToken !== undefined) {
      if (!hostAuth.allowAttempt(ip)) return reject("HOST_TOKEN_LOCKED");
      if (tokensEqual(handshake.hostToken, hostToken)) {
        verifiedHost = true;
      } else {
        if (hostAuth.lockRemainingMs(ip) > 0) return reject("HOST_TOKEN_LOCKED");
        hostAuth.recordFailure(ip);
        return reject("INVALID_HOST_TOKEN");
      }
    }
    if (!verifiedHost && !handshakes.allow(ip)) return reject("TOO_MANY_CONNECTIONS");
    if (verifiedHost) {
      role = "host";
    } else if (handshake.sessionToken !== undefined) {
      playerId = game.resumeSession(handshake.sessionToken);
      if (playerId !== null) role = "player";
    }
    socket.data.role = role;
    socket.data.playerId = playerId;
    next();
  });

  io.on("connection", (socket) => {
    const limiter = new RateLimiter(rateLimit.windowMs, rateLimit.maxEvents);
    const ip = ipOf(socket.conn);
    const actor = (): Actor => ({ role: socket.data.role, playerId: socket.data.playerId });
    const sessionInfo = () => ({
      role: socket.data.role,
      playerId: socket.data.playerId,
      nickname: socket.data.playerId === null ? null : game.nicknameOf(socket.data.playerId),
      avatar: socket.data.playerId === null ? null : game.avatarOf(socket.data.playerId),
    });

    socket.use((packet, next) => {
      const joined = socket.data.role !== "spectator";
      const needsIpQuota = !joined || packet[0] === "join";
      if (limiter.allow() && (!needsIpQuota || ipEvents.allow(ip))) return next();
      const ack: unknown = packet[packet.length - 1];
      if (packet.length > 1 && typeof ack === "function") {
        ack({ ok: false, error: "RATE_LIMITED" });
      }
    });

    const handle = <T>(
      event: keyof ClientToServerEvents,
      run: (payload: unknown) => Ack<T>,
      onOk?: (data: T) => void,
    ) => {
      (socket as Socket).on(event, (payload: unknown, ack: unknown) => {
        if (typeof ack !== "function") return;
        batch(() => {
          let result: Ack<T>;
          try {
            result = run(payload);
            if (result.ok && onOk) onOk(result.data);
          } catch (error) {
            fastify.log.error(error);
            result = { ok: false, error: "INTERNAL" };
          }
          ack(result);
        });
      });
    };

    handle(
      "join",
      (payload) =>
        game.join(actor(), payload, () =>
          playersFromIp(ip) >= maxPlayersPerIp ? "TOO_MANY_PLAYERS_FROM_IP" : null,
        ),
      (data) => {
        playerIps.set(data.playerId, ip);
        socket.data.role = "player";
        socket.data.playerId = data.playerId;
        playerSockets.set(data.playerId, socket);
        socket.emit("session", sessionInfo());
      },
    );
    handle("commit", (payload) => game.commit(actor(), payload));
    handle("reveal", (payload) => game.reveal(actor(), payload));
    handle("host:start", (payload) => game.hostStart(actor(), payload));
    handle("host:startRound", (payload) => game.hostStartRound(actor(), payload));
    handle("host:next", (payload) => game.hostNext(actor(), payload));
    handle("host:reset", (payload) => game.hostReset(actor(), payload));

    socket.on("disconnect", () => {
      if (socket.data.role === "host") {
        game.hostLeft();
        return;
      }
      const playerId = socket.data.playerId;
      if (playerId === null || playerSockets.get(playerId) !== socket) return;
      playerSockets.delete(playerId);
      game.setPlayerConnected(playerId, false);
    });

    if (socket.data.role === "player") {
      const playerId = socket.data.playerId;
      if (playerId === null || !game.hasPlayer(playerId)) {
        socket.data.role = "spectator";
        socket.data.playerId = null;
      }
    }

    const sent = batch(() => {
      socket.emit("session", sessionInfo());
      if (socket.data.role === "host") {
        game.hostJoined();
      } else if (socket.data.role === "player" && socket.data.playerId !== null) {
        const playerId = socket.data.playerId;
        const previous = playerSockets.get(playerId);
        playerSockets.set(playerId, socket);
        if (previous && previous !== socket) {
          previous.emit("superseded");
          previous.disconnect(true);
        }
        game.setPlayerConnected(playerId, true);
      }
    });
    if (!sent) {
      try {
        socket.emit("state", game.snapshot());
      } catch (error) {
        fastify.log.error(error);
      }
    }
  });

  let closed = false;

  return {
    fastify,
    io,
    game,
    async listen(port, host = "0.0.0.0") {
      await fastify.listen({ port, host });
      const address = fastify.server.address();
      return typeof address === "object" && address !== null ? address.port : port;
    },
    async close() {
      if (closed) return;
      closed = true;
      game.dispose();
      io.disconnectSockets(true);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await fastify.close().catch(() => {});
    },
  };
}
