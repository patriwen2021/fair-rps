import type { RoomSnapshot } from "@fair-rps/shared";
import { useContext, useEffect, useRef, useState } from "react";
import { HOST_TOAST_MS, hostActionToast, type HostToast } from "../lib/view.js";
import { ClockContext } from "./clock.js";

export function HostActionToast({ snapshot }: { snapshot: RoomSnapshot }) {
  const { offset, frozenNow } = useContext(ClockContext);
  const [toast, setToast] = useState<HostToast | null>(null);
  const seen = useRef<string | null>(null);
  const action = snapshot.lastHostAction;
  const key = action === null ? null : `${snapshot.gameId ?? ""}:${action.id}`;

  useEffect(() => {
    const next = hostActionToast(action, snapshot.gameId, seen.current, frozenNow ?? Date.now() + offset);
    if (next === null) return;
    seen.current = next.key;
    setToast(next);
  }, [key]);

  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), HOST_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (toast === null) return null;
  return (
    <p className="host-toast" role="status" key={toast.key}>
      {toast.text}
    </p>
  );
}
