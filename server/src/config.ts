import { randomBytes } from "node:crypto";
import {
  DEFAULT_MAX_CONNECTIONS_PER_IP,
  DEFAULT_MAX_PLAYERS_PER_IP,
  DEFAULT_PORT,
  MAX_HOST_TOKEN_LENGTH,
  MIN_HOST_TOKEN_LENGTH,
} from "@fair-rps/shared";
import { parseTrustProxy } from "./ipGuard.js";

export interface ServerConfig {
  port: number;
  hostToken: string;
  hostTokenGenerated: boolean;
  trustProxy: number;
  maxConnectionsPerIp: number;
  maxPlayersPerIp: number;
}

export class ConfigError extends Error {}

function positiveInt(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^[1-9]\d{0,5}$/.test(value.trim())) {
    throw new ConfigError(`${name} 必須是 1 以上的整數，目前是「${value}」。`);
  }
  return Number(value.trim());
}

export function loadConfig(env: Record<string, string | undefined>): ServerConfig {
  const configured = env.HOST_TOKEN ?? "";
  const hostTokenGenerated = configured.length === 0;
  if (!hostTokenGenerated && configured.length < MIN_HOST_TOKEN_LENGTH) {
    throw new ConfigError(
      `HOST_TOKEN 太短（${configured.length} 字元）：裁判密鑰至少要 ${MIN_HOST_TOKEN_LENGTH} 字元，否則可能被線上猜中而奪走裁判權。請改用更長的隨機字串，或不要設定 HOST_TOKEN 讓伺服器自動產生。`,
    );
  }
  if (configured.length > MAX_HOST_TOKEN_LENGTH) {
    throw new ConfigError(`HOST_TOKEN 太長：最多 ${MAX_HOST_TOKEN_LENGTH} 字元。`);
  }
  let trustProxy: number;
  try {
    trustProxy = parseTrustProxy(env.TRUST_PROXY);
  } catch (error) {
    throw new ConfigError(error instanceof Error ? error.message : String(error));
  }
  const portRaw = env.PORT ?? String(DEFAULT_PORT);
  if (!/^\d{1,5}$/.test(portRaw) || Number(portRaw) > 65535) {
    throw new ConfigError(`PORT 必須是 0–65535 的整數，目前是「${portRaw}」。`);
  }
  return {
    port: Number(portRaw),
    hostToken: hostTokenGenerated ? randomBytes(24).toString("hex") : configured,
    hostTokenGenerated,
    trustProxy,
    maxConnectionsPerIp: positiveInt("MAX_CONNECTIONS_PER_IP", env.MAX_CONNECTIONS_PER_IP, DEFAULT_MAX_CONNECTIONS_PER_IP),
    maxPlayersPerIp: positiveInt("MAX_PLAYERS_PER_IP", env.MAX_PLAYERS_PER_IP, DEFAULT_MAX_PLAYERS_PER_IP),
  };
}

export function startupNotes(config: ServerConfig): string[] {
  const limits = `每個 IP 最多 ${config.maxConnectionsPerIp} 條連線、${config.maxPlayersPerIp} 位玩家（MAX_CONNECTIONS_PER_IP／MAX_PLAYERS_PER_IP 可調）`;
  if (config.trustProxy === 0) {
    return [
      `TRUST_PROXY 未開啟：來源 IP 取自直接連線的位址，忽略 X-Forwarded-For。${limits}。`,
      "若伺服器放在 tunnel 或反向代理後面，請設 TRUST_PROXY=1；否則所有玩家都會被當成同一個 IP（代理的位址），很快就會撞到上面的每 IP 上限。",
    ];
  }
  return [
    `TRUST_PROXY=${config.trustProxy}：來源 IP 取自 X-Forwarded-For（信任最靠近伺服器的 ${config.trustProxy} 層代理）。${limits}。`,
    "伺服器若沒有放在代理後面就不要開 TRUST_PROXY，否則任何人都能偽造 X-Forwarded-For 繞過每 IP 上限。",
  ];
}
