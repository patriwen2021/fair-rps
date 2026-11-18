import { QUESTION_MAX_LENGTH, QUESTION_MIN_LENGTH } from "./constants.js";
import { codePointLength, isWellFormedText } from "./text.js";

export type QuestionError = "not_string" | "malformed_text" | "empty" | "too_long";

export type QuestionResult =
  | { ok: true; question: string }
  | { ok: false; error: QuestionError };

const EMOJI_GLUE_OR_INVISIBLE =
  /((?<=\p{Extended_Pictographic})️|(?<=\p{Extended_Pictographic}[️\u{1F3FB}-\u{1F3FF}]?)‍(?=\p{Extended_Pictographic}))|[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}⠀]/gu;
const WHITESPACE_RUN = /\p{Zs}+/gu;

export function cleanQuestion(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\t\n\r]/g, " ")
    .replace(EMOJI_GLUE_OR_INVISIBLE, (_match, emojiGlue: string | undefined) => emojiGlue ?? "")
    .replace(WHITESPACE_RUN, " ")
    .trim();
}

export function normalizeQuestion(raw: unknown): QuestionResult {
  if (typeof raw !== "string") return { ok: false, error: "not_string" };
  if (!isWellFormedText(raw)) return { ok: false, error: "malformed_text" };
  const question = cleanQuestion(raw);
  const length = codePointLength(question);
  if (length < QUESTION_MIN_LENGTH) return { ok: false, error: "empty" };
  if (length > QUESTION_MAX_LENGTH) return { ok: false, error: "too_long" };
  return { ok: true, question };
}

export function isValidQuestion(raw: unknown): boolean {
  return normalizeQuestion(raw).ok;
}
