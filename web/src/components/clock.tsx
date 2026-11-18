import type { RoomSnapshot } from "@fair-rps/shared";
import { createContext, useContext, useEffect, useState } from "react";
import { isUrgent, phaseDurationMs, progressFraction, remainingMs, secondsLeft } from "../lib/clock.js";

export interface ClockValue {
  offset: number;
  frozenNow: number | null;
}

export const ClockContext = createContext<ClockValue>({ offset: 0, frozenNow: null });

const TICK_MS = 100;

export function useRemaining(deadline: number | null): number | null {
  const { offset, frozenNow } = useContext(ClockContext);
  const [now, setNow] = useState(() => Date.now());
  const live = deadline !== null && frozenNow === null;
  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [live, deadline]);
  return remainingMs(deadline, frozenNow === null ? offset : 0, frozenNow ?? now);
}

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function countdownLabel(snapshot: RoomSnapshot): string {
  if (snapshot.phase === "commit") return snapshot.playIndex === 1 ? "加賽作答" : "作答倒數";
  if (snapshot.phase === "reveal") return "揭示驗算";
  return "";
}

export function Countdown({ snapshot, size = "large" }: { snapshot: RoomSnapshot; size?: "large" | "small" | "huge" }) {
  const remaining = useRemaining(snapshot.deadline);
  const total = phaseDurationMs(snapshot.phase, snapshot.commitSeconds);
  if (remaining === null || total === null) return null;
  const label = countdownLabel(snapshot);
  const urgent = isUrgent(snapshot.phase, remaining);
  const fraction = progressFraction(remaining, total);
  const seconds = secondsLeft(remaining);
  return (
    <div
      className={`countdown countdown-${size}${urgent ? " is-urgent" : ""}`}
      role="timer"
      aria-label={`${label}，剩 ${seconds} 秒`}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="countdown-track" cx="50" cy="50" r={RADIUS} />
        <circle
          className="countdown-bar"
          cx="50"
          cy="50"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="countdown-number">{seconds}</span>
      <span className="countdown-label">{label}</span>
    </div>
  );
}
