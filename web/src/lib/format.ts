import { hasForbiddenAnswerChars, stripForbiddenAnswerChars, type Move } from "@fair-rps/shared";

export const MOVE_EMOJI: Record<Move, string> = {
  rock: "✊",
  scissors: "✌️",
  paper: "✋",
};

export const MOVE_ORDER: readonly Move[] = ["rock", "scissors", "paper"];

export const NO_MOVE_EMOJI = "🚫";
export const NO_MOVE_LABEL = "未出拳";

export function groupHash(hash: string, size = 4): string[] {
  const groups: string[] = [];
  for (let i = 0; i < hash.length; i += size) groups.push(hash.slice(i, i + size));
  return groups;
}

export function visibleText(text: string): string {
  if (!hasForbiddenAnswerChars(text)) return text;
  let out = "";
  for (const char of text) {
    out += hasForbiddenAnswerChars(char)
      ? `⟦U+${char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}⟧`
      : char;
  }
  return out;
}

export { stripForbiddenAnswerChars };
