import {
  ANSWER_MAX_LENGTH,
  DECISION_REASON_LABEL,
  MOVE_LABEL,
  codePointLength,
  commitStorageKey,
  currentPlay,
  extractAnswer,
  hashPreimage,
  isValidAnswer,
  parsePreimage,
  type Match,
  type Move,
  type PlayerPublic,
  type RevealedPlay,
  type RoomSnapshot,
  type Side,
} from "@fair-rps/shared";
import { useState } from "react";
import { MOVE_EMOJI, MOVE_ORDER, NO_MOVE_EMOJI, NO_MOVE_LABEL, stripForbiddenAnswerChars, visibleText } from "../lib/format.js";
import { ERROR_MESSAGE, FORFEIT_LABEL, type ActionError } from "../lib/messages.js";
import type { RoomModel } from "../model.js";
import { Avatar } from "./Avatar.js";
import { HashBlock, Seal } from "./Seal.js";
import { AnswerLine, HostWait, QuestionBar } from "./Watch.js";

function MoveForm({
  model,
  match,
  playIndex,
}: {
  model: RoomModel;
  match: Match;
  playIndex: 0 | 1;
}) {
  const [text, setText] = useState("");
  const [move, setMove] = useState<Move | null>(null);
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<ActionError | null>(model.initialCommitError ?? null);
  const length = codePointLength(text);
  const textOk = isValidAnswer(text);
  const canLock = move !== null && textOk && !busy;

  const lock = () => {
    if (move === null || !textOk) return;
    setBusy(true);
    setError(null);
    void model.commit({ matchId: match.id, playIndex, move, answer: text }).then((result) => {
      setBusy(false);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <form
      className="move-form"
      onSubmit={(event) => {
        event.preventDefault();
        lock();
      }}
    >
      <label className="field">
        <span className="field-label">你的回答</span>
        <input
          type="text"
          value={text}
          onChange={(event) => {
            const cleaned = stripForbiddenAnswerChars(event.target.value);
            setRemoved(cleaned !== event.target.value);
            setText(cleaned);
          }}
          autoComplete="off"
          placeholder="寫下你對這一題的回答，可以留空"
          aria-invalid={!textOk}
          aria-describedby="answer-hint"
        />
        <span id="answer-hint" className={`field-hint${textOk ? "" : " is-error"}`}>
          {textOk
            ? `回答會在結果揭曉時對所有人公開。${length}／${ANSWER_MAX_LENGTH} 字`
            : `回答最多 ${ANSWER_MAX_LENGTH} 個字，現在是 ${length} 個字。`}
          {removed && " 回答只能是單行文字，換行與控制字元已自動移除。"}
        </span>
      </label>
      <div className="moves" role="group" aria-label="選擇出拳">
        {MOVE_ORDER.map((option) => (
          <button
            key={option}
            type="button"
            className={`move${move === option ? " is-selected" : ""}`}
            aria-pressed={move === option}
            onClick={() => setMove(option)}
          >
            <span className="move-emoji" aria-hidden="true">
              {MOVE_EMOJI[option]}
            </span>
            <span>{MOVE_LABEL[option]}</span>
          </button>
        ))}
      </div>
      {error !== null && (
        <p className="alert" role="alert">
          {ERROR_MESSAGE[error]}
        </p>
      )}
      <button type="submit" className="btn btn-lock" disabled={!canLock}>
        {busy ? "鎖定中…" : "🔒 鎖定回答和出拳"}
      </button>
      <p className="form-note">{move === null ? "先選一個拳，才能鎖定。" : "鎖定後回答和出拳都不能改了。"}</p>
    </form>
  );
}

function OwnLocked({ hash, preimage, revealing }: { hash: string; preimage: string | null; revealing: boolean }) {
  const parsed = preimage === null ? null : parsePreimage(preimage);
  const move = parsed !== null && parsed.ok ? parsed.parts.move : null;
  const answer = preimage === null ? null : extractAnswer(preimage);
  return (
    <div className="locked flip-in">
      <p className="locked-title">已鎖定 🔒</p>
      <Seal hash={hash} />
      {preimage !== null ? (
        <div className="private">
          <p className="private-label">現在只有你看得到，結果揭曉時才公開</p>
          {move !== null && (
            <p className="private-move">
              <span aria-hidden="true">{MOVE_EMOJI[move]}</span> {MOVE_LABEL[move]}
            </p>
          )}
          <AnswerLine answer={answer} owner="你" />
          <p className="private-label">原文（出拳｜回答｜隨機碼）</p>
          <code className="preimage">
            <bdi>{visibleText(preimage)}</bdi>
          </code>
        </div>
      ) : (
        <p className="alert" role="alert">
          這個瀏覽器找不到你鎖定時的原文，時間到將無法揭示，會被視為未出拳。
        </p>
      )}
      <p className="card-note">
        {revealing ? "時間到，正在把原文送給伺服器驗算…" : "時間到會自動揭示原文，不用再做任何事。"}
      </p>
    </div>
  );
}

function OpponentHidden({ hash, phase }: { hash: string | null; phase: "commit" | "reveal" }) {
  if (hash === null) {
    return phase === "commit" ? (
      <div className="thinking">
        <p className="thinking-title">⏳ 思考中…</p>
        <p className="card-note">對手一鎖定，這裡會立刻出現他的雜湊指紋。</p>
      </div>
    ) : (
      <div className="thinking">
        <p className="thinking-title">對手沒有鎖定出拳</p>
      </div>
    );
  }
  return (
    <div className="locked flip-in">
      <p className="locked-title">🔒 已鎖定</p>
      <Seal hash={hash} />
      <p className="card-note">對手已經鎖定、改不了。你看得到這串雜湊，但看不出他出什麼、答什麼。</p>
    </div>
  );
}

function SelfCheck({ preimage, commit }: { preimage: string; commit: string }) {
  const [open, setOpen] = useState(false);
  const recomputed = open ? hashPreimage(preimage) : null;
  return (
    <details className="selfcheck" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>自己驗算</summary>
      {recomputed !== null && (
        <div className="selfcheck-body">
          <p className="selfcheck-step">你的瀏覽器剛剛對原文重算 SHA-256：</p>
          <HashBlock hash={recomputed} compact />
          <p className="selfcheck-step">作答階段鎖定的雜湊：</p>
          <HashBlock hash={commit} compact />
          <p className={`selfcheck-result ${recomputed === commit ? "is-ok" : "is-bad"}`}>
            {recomputed === commit ? "兩串完全相同 ✔ 出拳和回答都沒有被改過" : "兩串不同 ✘ 原文不是當初鎖定的那一份"}
          </p>
        </div>
      )}
    </details>
  );
}

export function RevealedSide({ play, side, owner }: { play: RevealedPlay; side: Side; owner: string }) {
  const record = play.reveals[side];
  const commit = play.commits[side];
  return (
    <div className="revealed flip-in">
      {record.status === "valid" && record.move !== null ? (
        <p className="revealed-move">
          <span className="revealed-emoji" aria-hidden="true">
            {MOVE_EMOJI[record.move]}
          </span>
          <span className="revealed-label">{MOVE_LABEL[record.move]}</span>
        </p>
      ) : (
        <p className="revealed-move is-forfeit">
          <span className="revealed-emoji" aria-hidden="true">
            {NO_MOVE_EMOJI}
          </span>
          <span className="revealed-label">{NO_MOVE_LABEL}</span>
          <span className="revealed-why">{record.status === "valid" ? "" : FORFEIT_LABEL[record.status]}</span>
        </p>
      )}
      <AnswerLine answer={record.status === "valid" ? record.answer : null} owner={owner} />
      {record.preimage !== null && (
        <div className="private is-public">
          <p className="private-label">原文（出拳｜回答｜隨機碼）</p>
          <code className="preimage">
            <bdi>{visibleText(record.preimage)}</bdi>
          </code>
        </div>
      )}
      {record.status === "hash_mismatch" && <p className="verify is-bad">SHA-256(送來的原文) ≠ 先前的雜湊 ✘，原文不公開</p>}
      {commit !== null && record.preimage !== null && (
        <>
          <p className="verify is-ok">SHA-256(原文) = 先前的雜湊 ✔</p>
          {record.status === "malformed" && <p className="verify is-bad">但原文格式不符規定，視同未出拳 ✘</p>}
          <SelfCheck preimage={record.preimage} commit={commit} />
        </>
      )}
    </div>
  );
}

function Verdict({
  match,
  play,
  self,
  players,
}: {
  match: Match;
  play: RevealedPlay;
  self: PlayerPublic;
  players: Map<string, PlayerPublic>;
}) {
  if (match.status === "awaiting_tiebreak") {
    const move = play.reveals[0].move;
    return (
      <div className="verdict verdict-tie" role="status">
        <p className="verdict-title">平手，等裁判開始加賽</p>
        <p className="verdict-sub">
          {move !== null ? `雙方都出${MOVE_LABEL[move]}。` : ""}加賽的問題不變，會再作答、再出一次拳；加賽再平手就抽籤決定。
        </p>
      </div>
    );
  }
  if (match.winnerId === null || match.reason === null) return null;
  const won = match.winnerId === self.id;
  const winnerName = players.get(match.winnerId)?.nickname ?? "對手";
  return (
    <div className={`verdict ${won ? "verdict-win" : "verdict-lose"}`} role="status">
      <p className="verdict-title">{won ? "你贏了，晉級！" : "你輸了，這一輪止步"}</p>
      <p className="verdict-sub">
        判定：<bdi>{winnerName}</bdi> 晉級（{DECISION_REASON_LABEL[match.reason]}）
      </p>
    </div>
  );
}

export function DuelScreen({
  model,
  snapshot,
  match,
  self,
}: {
  model: RoomModel;
  snapshot: RoomSnapshot;
  match: Match;
  self: PlayerPublic;
}) {
  const players = new Map(snapshot.players.map((player) => [player.id, player]));
  const mySide: Side = match.playerIds[0] === self.id ? 0 : 1;
  const oppSide: Side = mySide === 0 ? 1 : 0;
  const opponent = players.get(match.playerIds[oppSide]);
  const play = currentPlay(match);
  if (play === null) return null;
  const tiebreak = play.index === 1;
  const first = match.plays[0];
  const firstMove = tiebreak && first && first.revealed ? first.reveals[0].move : null;
  const stored = model.commits[commitStorageKey(match.id, play.index)];
  const myHash = play.commits[mySide];
  const myPreimage = stored && stored.hash === myHash ? stored.preimage : null;
  const decided = match.status === "decided";

  const cardClass = (side: Side) => {
    const id = match.playerIds[side];
    if (!play.revealed || !decided) return "duel-card";
    return `duel-card ${match.winnerId === id ? "is-winner" : "is-loser"}`;
  };

  return (
    <main className="page duel">
      <QuestionBar snapshot={snapshot} />

      {tiebreak && !play.revealed && (
        <p className="tiebreak-banner" role="status">
          <strong>加賽</strong>
          上一拳平手{firstMove !== null ? `（雙方都出 ${MOVE_EMOJI[firstMove]} ${MOVE_LABEL[firstMove]}）` : ""}
          ，同一題再作答、再出一次拳。這次再平手就抽籤。
        </p>
      )}

      {play.revealed && <Verdict match={match} play={play} self={self} players={players} />}

      <div className="duel-cards">
        <section className={`${cardClass(mySide)} is-self`} aria-label="你的回答與出拳">
          <h2 className="card-name">
            <Avatar player={self} size="md" self out={play.revealed && decided && match.winnerId !== self.id}>
              <span className="tag tag-me">你</span>
              {play.revealed && decided && match.winnerId === self.id && <span className="tag tag-win">勝</span>}
            </Avatar>
          </h2>
          {play.revealed ? (
            <RevealedSide play={play} side={mySide} owner="你" />
          ) : myHash !== null ? (
            <OwnLocked hash={myHash} preimage={myPreimage} revealing={snapshot.phase === "reveal"} />
          ) : snapshot.phase === "commit" ? (
            <MoveForm key={`${match.id}#${play.index}`} model={model} match={match} playIndex={play.index} />
          ) : (
            <div className="thinking">
              <p className="thinking-title">時間到，你沒有鎖定</p>
              <p className="card-note">這一拳會被視為未出拳。</p>
            </div>
          )}
        </section>

        <div className="duel-vs" aria-hidden="true">
          VS
        </div>

        <section className={cardClass(oppSide)} aria-label="對手的回答與出拳">
          <h2 className="card-name">
            <Avatar
              player={opponent}
              size="md"
              out={play.revealed && decided && match.winnerId !== match.playerIds[oppSide]}
            >
              {play.revealed && decided && match.winnerId === match.playerIds[oppSide] && (
                <span className="tag tag-win">勝</span>
              )}
            </Avatar>
          </h2>
          {play.revealed ? (
            <RevealedSide play={play} side={oppSide} owner={opponent?.nickname ?? "對手"} />
          ) : (
            <OpponentHidden hash={play.commits[oppSide]} phase={snapshot.phase === "reveal" ? "reveal" : "commit"} />
          )}
        </section>
      </div>

      <HostWait snapshot={snapshot} />
    </main>
  );
}
