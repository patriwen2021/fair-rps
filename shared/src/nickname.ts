import {
  NICKNAME_MAX_COMBINING_MARKS,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
} from "./constants.js";
import { codePointLength, isWellFormedText } from "./text.js";

export type NicknameError =
  | "not_string"
  | "malformed_text"
  | "empty"
  | "too_long"
  | "reserved"
  | "too_many_marks";

export type NicknameResult =
  | { ok: true; nickname: string }
  | { ok: false; error: NicknameError };

export const RESERVED_NICKNAMES: readonly string[] = [
  "裁判",
  "主持人",
  "系統",
  "冠軍",
  "種子",
  "觀賽者",
  "host",
  "referee",
  "judge",
  "system",
  "champion",
  "seed",
  "spectator",
];

export const RESERVED_NICKNAME_FRAGMENTS: readonly string[] = ["晉級", "勝", "判定", "抽籤"];

const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}⠀]/gu;
const WHITESPACE_RUN = /\p{Zs}+/gu;
const COMBINING_MARK = /[\p{Mn}\p{Me}]/gu;
const COMPARISON_NOISE = /[\p{Z}\p{P}\p{S}\p{C}]+/gu;

export function cleanNickname(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\t\n\r]/g, " ")
    .replace(INVISIBLE, "")
    .replace(WHITESPACE_RUN, " ")
    .trim()
    .normalize("NFC");
}

export function nicknameKey(nickname: string): string {
  return nickname.normalize("NFKC").toLowerCase().normalize("NFC");
}

function confusableForm(nickname: string): string {
  return nicknameKey(nickname).replace(COMPARISON_NOISE, "");
}

export function isReservedNickname(nickname: string): boolean {
  const form = confusableForm(nickname);
  if (RESERVED_NICKNAMES.includes(form)) return true;
  return RESERVED_NICKNAME_FRAGMENTS.some((fragment) => form.includes(fragment));
}

export function normalizeNickname(raw: unknown): NicknameResult {
  if (typeof raw !== "string") return { ok: false, error: "not_string" };
  if (!isWellFormedText(raw)) return { ok: false, error: "malformed_text" };
  const nickname = cleanNickname(raw);
  const length = codePointLength(nickname);
  if (length < NICKNAME_MIN_LENGTH) return { ok: false, error: "empty" };
  if (length > NICKNAME_MAX_LENGTH) return { ok: false, error: "too_long" };
  if ((nickname.match(COMBINING_MARK) ?? []).length > NICKNAME_MAX_COMBINING_MARKS) {
    return { ok: false, error: "too_many_marks" };
  }
  if (isReservedNickname(nickname)) return { ok: false, error: "reserved" };
  return { ok: true, nickname };
}

export function isValidNickname(raw: unknown): boolean {
  return normalizeNickname(raw).ok;
}

export function dedupeNickname(nickname: string, taken: Iterable<string>): string {
  const used = new Set<string>();
  for (const name of taken) used.add(nicknameKey(name));
  if (!used.has(nicknameKey(nickname))) return nickname;
  let suffix = 2;
  while (used.has(nicknameKey(`${nickname}${suffix}`))) suffix += 1;
  return `${nickname}${suffix}`;
}
