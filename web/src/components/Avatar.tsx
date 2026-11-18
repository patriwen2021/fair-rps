import { AVATARS, type Avatar as AvatarEmoji, type PlayerPublic } from "@fair-rps/shared";
import type { ReactNode } from "react";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const TONE_COUNT = 6;

export function avatarTone(avatar: AvatarEmoji): number {
  return Math.max(0, (AVATARS as readonly string[]).indexOf(avatar)) % TONE_COUNT;
}

export function AvatarFace({ avatar, size = "md" }: { avatar: AvatarEmoji; size?: AvatarSize }) {
  return (
    <span className={`avatar-face avatar-face-${size} tone-${avatarTone(avatar)}`} aria-hidden="true">
      {avatar}
    </span>
  );
}

export const GONE_NAME = "已離開的玩家";

export function Avatar({
  player,
  size = "md",
  layout = "row",
  self = false,
  out = false,
  children,
}: {
  player: PlayerPublic | null | undefined;
  size?: AvatarSize;
  layout?: "row" | "stack";
  self?: boolean;
  out?: boolean;
  children?: ReactNode;
}) {
  const offline = player ? !player.connected : false;
  const classes = [
    "avatar",
    `avatar-${size}`,
    `avatar-${layout}`,
    self ? "is-self" : "",
    out ? "is-out" : "",
    offline ? "is-offline" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes}>
      <span className="avatar-pic">
        {player ? (
          <AvatarFace avatar={player.avatar} size={size} />
        ) : (
          <span className={`avatar-face avatar-face-${size} is-gone`} aria-hidden="true">
            ？
          </span>
        )}
        {offline && <span className="avatar-off">離線</span>}
      </span>
      <span className="avatar-text">
        <span className="avatar-name">
          <bdi>{player?.nickname ?? GONE_NAME}</bdi>
        </span>
        {children}
      </span>
    </span>
  );
}
