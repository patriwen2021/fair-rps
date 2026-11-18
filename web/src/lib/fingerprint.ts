import { isValidHash } from "@fair-rps/shared";

export const FINGERPRINT_SIDE = 5;
export const FINGERPRINT_CELLS = FINGERPRINT_SIDE * FINGERPRINT_SIDE;

export const FINGERPRINT_COLORS = [
  "#1c1b3a",
  "#ffc93c",
  "#19a974",
  "#e5484d",
  "#3d5afe",
  "#f4f5fb",
  "#b55cf0",
  "#17b6c9",
] as const;

export function fingerprintCells(hash: string): number[] {
  if (!isValidHash(hash)) return new Array<number>(FINGERPRINT_CELLS).fill(0);
  const cells: number[] = [];
  for (let i = 0; i < FINGERPRINT_CELLS; i += 1) {
    const byte = Number.parseInt(hash.slice(i * 2, i * 2 + 2), 16);
    cells.push(byte % FINGERPRINT_COLORS.length);
  }
  return cells;
}

export function fingerprintColors(hash: string): string[] {
  return fingerprintCells(hash).map((index) => FINGERPRINT_COLORS[index] ?? FINGERPRINT_COLORS[0]);
}
