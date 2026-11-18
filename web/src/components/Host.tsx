import {
  COMMIT_SECONDS_DEFAULT,
  COMMIT_SECONDS_MAX,
  COMMIT_SECONDS_MIN,
  MIN_PLAYERS_TO_START,
  QUESTION_MAX_LENGTH,
  cleanQuestion,
  codePointLength,
  isValidCommitSeconds,
  normalizeQuestion,
  type RoomSnapshot,
} from "@fair-rps/shared";
import { useState } from "react";
import { ERROR_MESSAGE, PHASE_LABEL, questionErrorMessage, type ActionError } from "../lib/messages.js";
import { hostAction } from "../lib/view.js";
import type { ActionResult, RoomModel } from "../model.js";
import { ChampionCard } from "./BracketScreen.js";
import { onlineCount, RosterPanel } from "./Lobby.js";
import { BracketTree } from "./Tree.js";
import { QuestionBar, ResultsList, roundHeading, StatusBoard } from "./Watch.js";

const SECONDS_PRESETS = [10, 20, 30, 60] as const;

export function parseCommitSeconds(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return isValidCommitSeconds(value) ? value : null;
}

function SecondsSetting({ raw, onChange }: { raw: string; onChange: (next: string) => void }) {
  const value = parseCommitSeconds(raw);
  return (
    <section className="panel settings" aria-label="作答時間">
      <h2>作答時間</h2>
      <div className="seconds">
        <label className="field seconds-field">
          <span className="field-label">每一拳的作答秒數</span>
          <span className="seconds-input">
            <input
              type="number"
              inputMode="numeric"
              min={COMMIT_SECONDS_MIN}
              max={COMMIT_SECONDS_MAX}
              step={1}
              value={raw}
              onChange={(event) => onChange(event.target.value)}
              aria-invalid={value === null}
              aria-describedby="seconds-hint"
            />
            <span>秒</span>
          </span>
        </label>
        <div className="seconds-presets" role="group" aria-label="快速設定秒數">
          {SECONDS_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`chip${value === preset ? " is-selected" : ""}`}
              aria-pressed={value === preset}
              onClick={() => onChange(String(preset))}
            >
              {preset} 秒
            </button>
          ))}
        </div>
      </div>
      <p id="seconds-hint" className={`field-hint${value === null ? " is-error" : ""}`}>
        {value === null
          ? `請輸入 ${COMMIT_SECONDS_MIN}–${COMMIT_SECONDS_MAX} 的整數。`
          : `玩家每次有 ${value} 秒可以回答問題並選拳，加賽也一樣。開始後整場不能改。`}
      </p>
    </section>
  );
}

function QuestionForm({
  raw,
  onChange,
  busy,
  onSubmit,
  title,
}: {
  raw: string;
  onChange: (next: string) => void;
  busy: boolean;
  onSubmit: (question: string) => void;
  title: string;
}) {
  const result = normalizeQuestion(raw);
  const length = codePointLength(cleanQuestion(raw));
  const touched = raw.length > 0;
  const invalid = touched && !result.ok;
  return (
    <form
      className="panel question-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (result.ok && !busy) onSubmit(result.question);
      }}
    >
      <label className="field">
        <span className="field-label">{title}的問題</span>
        <textarea
          rows={2}
          value={raw}
          onChange={(event) => onChange(event.target.value)}
          placeholder="例如：最近讓你開心的一件小事是什麼？"
          aria-invalid={invalid}
          aria-describedby="question-hint"
        />
        <span id="question-hint" className={`field-hint${invalid ? " is-error" : ""}`}>
          {!result.ok && touched
            ? questionErrorMessage(result.error, length)
            : `必填。按下「開始猜拳」後所有人才會看到題目，之後不能修改。${length}／${QUESTION_MAX_LENGTH} 字`}
        </span>
      </label>
      <button type="submit" className="btn btn-primary btn-big" disabled={!result.ok || busy}>
        開始猜拳
      </button>
    </form>
  );
}

export function HostScreen({ model, snapshot }: { model: RoomModel; snapshot: RoomSnapshot }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [seconds, setSeconds] = useState(String(COMMIT_SECONDS_DEFAULT));
  const [question, setQuestion] = useState(model.initialQuestion ?? "");
  const online = onlineCount(snapshot);
  const { phase } = snapshot;
  const action = hostAction(snapshot);
  const commitSeconds = parseCommitSeconds(seconds);
  const canStart = online >= MIN_PLAYERS_TO_START && commitSeconds !== null;
  const title = roundHeading(snapshot);

  const run = (send: () => Promise<ActionResult<unknown>>, quiet: ActionError[] = [], done?: () => void) => {
    setBusy(true);
    setError(null);
    void send().then((result) => {
      setBusy(false);
      if (result.ok) done?.();
      else if (!quiet.includes(result.error)) setError(result.error);
    });
  };

  return (
    <main className="page host">
      <header className="host-bar">
        <div className="host-heading">
          <h1 className="brand brand-small">裁判總覽</h1>
          <p className="page-sub">
            {title !== "" && phase !== "finished" && <span>{title}</span>}
            <span className="tag tag-now">{PHASE_LABEL[phase]}</span>
            {snapshot.playIndex === 1 && <span className="tag tag-tiebreak">加賽</span>}
            {phase !== "lobby" && <span className="host-seconds">作答 {snapshot.commitSeconds} 秒</span>}
          </p>
        </div>
        <div className="host-actions">
          {action?.kind === "start" && (
            <button
              type="button"
              className="btn btn-primary btn-big"
              disabled={!canStart || busy}
              onClick={() => commitSeconds !== null && run(() => model.hostStart(commitSeconds))}
            >
              {action.label}
            </button>
          )}
          {action?.kind === "next" && (
            <button
              type="button"
              className="btn btn-primary btn-big"
              disabled={busy}
              onClick={() => run(model.hostNext, ["WRONG_PHASE"])}
            >
              {action.label}
            </button>
          )}
          <button type="button" className="btn btn-ghost" disabled={busy || confirming} onClick={() => setConfirming(true)}>
            重開一局
          </button>
        </div>
      </header>

      {confirming && (
        <div className="confirm" role="alertdialog" aria-label="確認重開一局">
          <p>
            <strong>確定要重開一局？</strong>
            {phase === "lobby"
              ? "會清掉離線的玩家，在線玩家留在等候室。"
              : "目前的賽程、各輪問題和所有勝負會全部清掉，在線玩家回到等候室。這個動作無法復原。"}
          </p>
          <div className="confirm-actions">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                setConfirming(false);
                run(model.hostReset, [], () => {
                  setQuestion("");
                  setSeconds(String(COMMIT_SECONDS_DEFAULT));
                });
              }}
            >
              確定重開
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
              取消
            </button>
          </div>
        </div>
      )}

      {error !== null && (
        <p className="alert" role="alert">
          {ERROR_MESSAGE[error]}
        </p>
      )}

      {phase === "lobby" && (
        <>
          <SecondsSetting raw={seconds} onChange={setSeconds} />
          <RosterPanel snapshot={snapshot} selfId={null} />
          <p className="form-note">
            {online >= MIN_PLAYERS_TO_START
              ? "開始後會洗牌配對；離線的玩家不會排進賽程。"
              : `至少要 ${MIN_PLAYERS_TO_START} 位在線玩家才能開始分配賽程，目前 ${online} 位。`}
          </p>
          <p className="share">
            玩家網址：<code>{window.location.origin}/</code>
          </p>
        </>
      )}

      {phase === "bracket" && (
        <QuestionForm
          raw={question}
          onChange={setQuestion}
          busy={busy}
          title={title}
          onSubmit={(text) => run(() => model.hostStartRound(text), [], () => setQuestion(""))}
        />
      )}

      {(phase === "commit" || phase === "reveal") && (
        <>
          <QuestionBar snapshot={snapshot} large />
          <StatusBoard snapshot={snapshot} large />
        </>
      )}

      {phase === "result" && (
        <>
          <QuestionBar snapshot={snapshot} large />
          <ResultsList snapshot={snapshot} large />
          <p className="form-note host-hint">
            畫面會停在這裡，可以請玩家分享回答。準備好了再按上方的「{action?.label ?? ""}」。
          </p>
        </>
      )}

      {phase === "finished" && <ChampionCard snapshot={snapshot} self={null} />}

      {snapshot.bracket !== null && (
        <section aria-label="賽程表">
          <h2 className="section-title">賽程表</h2>
          <BracketTree snapshot={snapshot} selfId={null} />
        </section>
      )}

      <footer className="host-foot">
        <button type="button" className="link" onClick={model.leaveHost}>
          離開裁判模式
        </button>
      </footer>
    </main>
  );
}
