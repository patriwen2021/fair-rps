import {
  AVATARS,
  AVATAR_COUNT,
  MAX_PLAYERS,
  NICKNAME_MAX_LENGTH,
  NONCE_HEX_LENGTH,
  cleanNickname,
  codePointLength,
  avatarAt,
  hashPreimage,
  normalizeNickname,
  type Avatar,
  type RoomSnapshot,
} from "@fair-rps/shared";
import { useState } from "react";
import { ERROR_MESSAGE, nicknameErrorMessage, type ActionError } from "../lib/messages.js";
import type { RoomModel } from "../model.js";
import { AvatarFace } from "./Avatar.js";
import { Seal } from "./Seal.js";

export function EntryScreen({ model, snapshot }: { model: RoomModel; snapshot: RoomSnapshot }) {
  const [raw, setRaw] = useState("");
  const [avatar, setAvatar] = useState<Avatar>(
    () => model.initialAvatar ?? avatarAt(Math.floor(Math.random() * AVATAR_COUNT)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const result = normalizeNickname(raw);
  const length = codePointLength(cleanNickname(raw));
  const touched = raw.length > 0;
  const full = snapshot.players.length >= MAX_PLAYERS;
  const sample = `rock|${raw}|${"0".repeat(NONCE_HEX_LENGTH)}`;

  const submit = () => {
    if (!result.ok || busy) return;
    setBusy(true);
    setError(null);
    void model.join(result.nickname, avatar).then((ack) => {
      setBusy(false);
      if (!ack.ok) setError(ack.error);
    });
  };

  return (
    <main className="page entry">
      <header className="entry-head">
        <h1 className="brand">公平猜拳</h1>
        <p className="entry-pitch">每一輪先回答裁判的問題、再出拳。沒人能偷看、沒人能反悔的單淘汰猜拳賽。</p>
      </header>

      <form
        className="panel entry-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span className="field-label">你的暱稱</span>
          <input
            type="text"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            placeholder="1–12 個字"
            autoComplete="nickname"
            autoFocus
            aria-invalid={touched && !result.ok}
            aria-describedby="nickname-hint"
          />
          <span id="nickname-hint" className={`field-hint${touched && !result.ok ? " is-error" : ""}`}>
            {touched && !result.ok
              ? nicknameErrorMessage(result.error, length)
              : `${length}／${NICKNAME_MAX_LENGTH} 字。和別人撞名會自動加序號。`}
          </span>
        </label>
        <div className="field" role="radiogroup" aria-labelledby="avatar-label">
          <span id="avatar-label" className="field-label">
            選一個頭像
          </span>
          <div className="avatar-grid">
            {AVATARS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={avatar === option}
                aria-label={`頭像 ${option}`}
                className={`avatar-option${avatar === option ? " is-selected" : ""}`}
                onClick={() => setAvatar(option)}
              >
                <AvatarFace avatar={option} size="sm" />
              </button>
            ))}
          </div>
          <span className="field-hint">先幫你隨機挑了一個，可以改。加入後不能再換，和別人選同一個也沒關係。</span>
        </div>
        <div className="entry-preview" aria-label="你在比賽中的樣子">
          <AvatarFace avatar={avatar} size="md" />
          <span className="entry-preview-name">
            <bdi>{result.ok ? result.nickname : "你的暱稱"}</bdi>
          </span>
        </div>
        {error !== null && (
          <p className="alert" role="alert">
            {ERROR_MESSAGE[error]}
          </p>
        )}
        {full && (
          <p className="alert" role="alert">
            房間已滿（{MAX_PLAYERS} 人），目前無法加入。
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={!result.ok || busy || full}>
          {busy ? "加入中…" : "進入等候室"}
        </button>
        <p className="form-note">目前等候室有 {snapshot.players.length} 位玩家。</p>
      </form>

      <section className="panel entry-how" aria-label="為什麼公平">
        <h2>為什麼公平</h2>
        <div className="entry-demo">
          <Seal hash={hashPreimage(sample)} />
          <p>
            這是「石頭＋你打的暱稱」算出來的雜湊指紋。改一個字，整張圖就完全不同；但光看圖，沒人反推得出內容。
          </p>
        </div>
        <ol className="steps">
          <li>
            <strong>作答並鎖定</strong>
            你的瀏覽器把出拳和回答一起算成雜湊再送出。伺服器和對手都只拿到雜湊。
          </li>
          <li>
            <strong>互看指紋</strong>
            雙方的雜湊立刻公開。對手已經鎖定、改不了，你也一樣。
          </li>
          <li>
            <strong>揭示驗算</strong>
            時間到才公開出拳與回答，任何人都能重算一次，確認沒被掉包。
          </li>
        </ol>
      </section>
    </main>
  );
}
