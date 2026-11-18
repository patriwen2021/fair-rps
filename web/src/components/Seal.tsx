import { useEffect, useRef, useState } from "react";
import { fingerprintColors, FINGERPRINT_SIDE } from "../lib/fingerprint.js";
import { groupHash } from "../lib/format.js";

export function Fingerprint({ hash, size = 72 }: { hash: string; size?: number }) {
  const colors = fingerprintColors(hash);
  return (
    <svg
      className="fingerprint"
      width={size}
      height={size}
      viewBox={`0 0 ${FINGERPRINT_SIDE} ${FINGERPRINT_SIDE}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="由雜湊產生的指紋圖"
    >
      {colors.map((color, index) => (
        <rect
          key={index}
          x={index % FINGERPRINT_SIDE}
          y={Math.floor(index / FINGERPRINT_SIDE)}
          width="1"
          height="1"
          fill={color}
        />
      ))}
    </svg>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    return legacyCopy(text);
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

export function HashBlock({ hash, compact = false }: { hash: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);
  const onCopy = () => {
    void copyText(hash).then((ok) => {
      if (!ok) return;
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      type="button"
      className={`hash${compact ? " hash-compact" : ""}`}
      onClick={onCopy}
      aria-label={`雜湊 ${hash}，點一下複製`}
      title="點一下複製完整雜湊"
    >
      <span className="hash-groups" aria-hidden="true">
        {groupHash(hash).map((group, index) => (
          <span key={index}>{group}</span>
        ))}
      </span>
      <span className="hash-hint" aria-live="polite">
        {copied ? "已複製" : "點一下複製"}
      </span>
    </button>
  );
}

export function HashText({ hash }: { hash: string }) {
  return (
    <span className="hash-text" title={hash} aria-label={`雜湊 ${hash}`}>
      {groupHash(hash).map((group, index) => (
        <span key={index} aria-hidden="true">
          {group}
        </span>
      ))}
    </span>
  );
}

export function Seal({ hash, compact = false }: { hash: string; compact?: boolean }) {
  return (
    <div className={`seal${compact ? " seal-compact" : ""}`}>
      <Fingerprint hash={hash} size={compact ? 52 : 84} />
      <HashBlock hash={hash} compact={compact} />
    </div>
  );
}
