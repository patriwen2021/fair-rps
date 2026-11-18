export class RateLimiter {
  private readonly stamps: number[] = [];

  constructor(
    private readonly windowMs: number,
    private readonly maxEvents: number,
    private readonly now: () => number = Date.now,
  ) {}

  allow(): boolean {
    const current = this.now();
    while (this.stamps.length > 0 && current - (this.stamps[0] as number) >= this.windowMs) {
      this.stamps.shift();
    }
    if (this.stamps.length >= this.maxEvents) return false;
    this.stamps.push(current);
    return true;
  }
}
