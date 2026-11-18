export const COMMIT_SECONDS_MIN = 10;
export const COMMIT_SECONDS_MAX = 120;
export const COMMIT_SECONDS_DEFAULT = 20;
export const REVEAL_GRACE_MS = 3_000;
export const LOBBY_DISCONNECT_GRACE_MS = 30_000;

export const MIN_PLAYERS_TO_START = 2;
export const MAX_PLAYERS = 64;
export const MAX_PLAYS_PER_MATCH = 2;

export const NICKNAME_MIN_LENGTH = 1;
export const NICKNAME_MAX_LENGTH = 12;
export const NICKNAME_MAX_COMBINING_MARKS = 4;

export const AVATAR_COUNT = 24;

export const QUESTION_MIN_LENGTH = 1;
export const QUESTION_MAX_LENGTH = 100;

export const ANSWER_MAX_LENGTH = 100;
export const NONCE_BYTES = 16;
export const NONCE_HEX_LENGTH = NONCE_BYTES * 2;
export const HASH_HEX_LENGTH = 64;
export const PREIMAGE_SEPARATOR = "|";
export const MAX_PREIMAGE_UTF16_LENGTH = 8 + 1 + ANSWER_MAX_LENGTH * 2 + 1 + NONCE_HEX_LENGTH;

export const SESSION_TOKEN_HEX_LENGTH = 64;
export const PLAYER_ID_HEX_LENGTH = 12;
export const GAME_ID_HEX_LENGTH = 8;
export const MIN_HOST_TOKEN_LENGTH = 16;
export const MAX_HOST_TOKEN_LENGTH = 256;
export const MAX_MATCH_ID_LENGTH = 32;

export const DEFAULT_PORT = 3000;
export const HOST_QUERY_PARAM = "host";
export const MAX_MESSAGE_BYTES = 4096;
export const RATE_LIMIT_WINDOW_MS = 10_000;
export const RATE_LIMIT_MAX_EVENTS = 20;
export const IP_RATE_LIMIT_MAX_EVENTS = 100;
export const DEFAULT_MAX_CONNECTIONS_PER_IP = 16;
export const DEFAULT_MAX_PLAYERS_PER_IP = 8;
export const HOST_AUTH_FREE_FAILURES = 5;
export const HOST_AUTH_BASE_LOCK_MS = 1_000;
export const HOST_AUTH_MAX_LOCK_MS = 300_000;
export const HOST_AUTH_FAILURE_TTL_MS = 900_000;
export const HOST_AUTH_ATTEMPT_WINDOW_MS = 60_000;
export const HOST_AUTH_MAX_ATTEMPTS_PER_WINDOW = 120;
export const HANDSHAKE_RATE_LIMIT_WINDOW_MS = 10_000;
export const HANDSHAKE_RATE_LIMIT_MAX = 60;
export const CONNECTION_BROADCAST_COALESCE_MS = 250;

export const STORAGE_KEY_SESSION = "fair-rps:session";
export const STORAGE_KEY_COMMITS = "fair-rps:commits";
