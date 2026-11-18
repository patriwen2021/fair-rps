export const AVATARS = [
  "🐶",
  "🐱",
  "🐭",
  "🐹",
  "🐰",
  "🦊",
  "🐻",
  "🐼",
  "🐨",
  "🐯",
  "🦁",
  "🐮",
  "🐷",
  "🐸",
  "🐵",
  "🐔",
  "🐧",
  "🐦",
  "🦆",
  "🦉",
  "🦄",
  "🐝",
  "🐢",
  "🐙",
] as const;
export type Avatar = (typeof AVATARS)[number];

export function isAvatar(value: unknown): value is Avatar {
  return typeof value === "string" && (AVATARS as readonly string[]).includes(value);
}

export function avatarAt(index: number): Avatar {
  const size = AVATARS.length;
  return AVATARS[((Math.trunc(index) % size) + size) % size]!;
}
