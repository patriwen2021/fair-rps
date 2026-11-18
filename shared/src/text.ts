const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function isWellFormedText(value: string): boolean {
  return !LONE_SURROGATE.test(value);
}

export function codePointLength(value: string): number {
  let count = 0;
  for (const _ of value) count += 1;
  return count;
}
