import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import {
  MAX_PREIMAGE_UTF16_LENGTH,
  NONCE_BYTES,
  NONCE_HEX_LENGTH,
  PREIMAGE_SEPARATOR,
  ANSWER_MAX_LENGTH,
} from "./constants.js";
import { isMove, type Move } from "./moves.js";
import { codePointLength, isWellFormedText } from "./text.js";

export interface PreimageParts {
  move: Move;
  answer: string;
  nonce: string;
}

export type ParsePreimageResult =
  | { ok: true; parts: PreimageParts }
  | { ok: false; error: PreimageError };

export type PreimageError =
  | "not_string"
  | "too_long"
  | "malformed_text"
  | "missing_separator"
  | "invalid_move"
  | "answer_too_long"
  | "answer_forbidden_chars"
  | "invalid_nonce";

export type RevealStatus =
  | "valid"
  | "hash_mismatch"
  | "malformed"
  | "not_revealed"
  | "not_committed";

export interface RevealRecord {
  status: RevealStatus;
  preimage: string | null;
  move: Move | null;
  answer: string | null;
  nonce: string | null;
}

const FORBIDDEN_ANSWER_CHARS = /[\p{Cc}\u2028\u2029\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;
const FORBIDDEN_ANSWER_CHARS_GLOBAL = new RegExp(FORBIDDEN_ANSWER_CHARS.source, "gu");

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const NONCE_PATTERN = new RegExp(`^[0-9a-f]{${NONCE_HEX_LENGTH}}$`);

export function isValidHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

export function isValidNonce(value: unknown): value is string {
  return typeof value === "string" && NONCE_PATTERN.test(value);
}

export function hasForbiddenAnswerChars(value: string): boolean {
  return FORBIDDEN_ANSWER_CHARS.test(value);
}

export function stripForbiddenAnswerChars(value: string): string {
  return value.replace(FORBIDDEN_ANSWER_CHARS_GLOBAL, "");
}

export function isValidAnswer(value: unknown): value is string {
  return (
    typeof value === "string" &&
    isWellFormedText(value) &&
    codePointLength(value) <= ANSWER_MAX_LENGTH &&
    !hasForbiddenAnswerChars(value)
  );
}

export function nonceFromBytes(bytes: Uint8Array): string {
  if (bytes.length !== NONCE_BYTES) {
    throw new RangeError(`nonce requires exactly ${NONCE_BYTES} bytes`);
  }
  return bytesToHex(bytes);
}

export function buildPreimage(move: Move, answer: string, nonce: string): string {
  if (!isMove(move)) throw new TypeError("invalid move");
  if (!isValidAnswer(answer)) throw new RangeError("invalid answer");
  if (!isValidNonce(nonce)) throw new RangeError("invalid nonce");
  return [move, answer, nonce].join(PREIMAGE_SEPARATOR);
}

export function parsePreimage(preimage: unknown): ParsePreimageResult {
  if (typeof preimage !== "string") return { ok: false, error: "not_string" };
  if (preimage.length > MAX_PREIMAGE_UTF16_LENGTH) return { ok: false, error: "too_long" };
  if (!isWellFormedText(preimage)) return { ok: false, error: "malformed_text" };
  const first = preimage.indexOf(PREIMAGE_SEPARATOR);
  const last = preimage.lastIndexOf(PREIMAGE_SEPARATOR);
  if (first === -1 || first === last) return { ok: false, error: "missing_separator" };
  const move = preimage.slice(0, first);
  const answer = preimage.slice(first + 1, last);
  const nonce = preimage.slice(last + 1);
  if (!isMove(move)) return { ok: false, error: "invalid_move" };
  if (codePointLength(answer) > ANSWER_MAX_LENGTH) {
    return { ok: false, error: "answer_too_long" };
  }
  if (hasForbiddenAnswerChars(answer)) return { ok: false, error: "answer_forbidden_chars" };
  if (!isValidNonce(nonce)) return { ok: false, error: "invalid_nonce" };
  return { ok: true, parts: { move, answer, nonce } };
}

export function hashPreimage(preimage: string): string {
  return bytesToHex(sha256(utf8ToBytes(preimage)));
}

export function verifyCommit(hash: string, preimage: string): boolean {
  return isValidHash(hash) && hashPreimage(preimage) === hash;
}

export function evaluateReveal(commitHash: string | null, preimage: unknown): RevealRecord {
  const empty = { preimage: null, move: null, answer: null, nonce: null };
  if (commitHash === null) return { status: "not_committed", ...empty };
  if (typeof preimage !== "string") return { status: "not_revealed", ...empty };
  if (preimage.length > MAX_PREIMAGE_UTF16_LENGTH || !isWellFormedText(preimage)) {
    return { status: "malformed", ...empty };
  }
  if (!verifyCommit(commitHash, preimage)) {
    return { status: "hash_mismatch", ...empty };
  }
  const parsed = parsePreimage(preimage);
  if (!parsed.ok) return { status: "malformed", ...empty, preimage };
  return { status: "valid", preimage, ...parsed.parts };
}

export function extractAnswer(preimage: unknown): string | null {
  const parsed = parsePreimage(preimage);
  return parsed.ok ? parsed.parts.answer : null;
}
