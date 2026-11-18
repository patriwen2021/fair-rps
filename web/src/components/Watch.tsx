import {
  DECISION_REASON_LABEL,
  MOVE_LABEL,
  codePointLength,
  currentQuestion,
  currentRound,
  lastRevealedPlay,
  hashPreimage,
  type Match,
  type PlayerPublic,
  type RevealedPlay,
  type RoomSnapshot,
  type Side,
} from "@fair-rps/shared";
import { MOVE_EMOJI, NO_MOVE_EMOJI, NO_MOVE_LABEL, visibleText } from "../lib/format.js";
import { FORFEIT_LABEL } from "../lib/messages.js";
import { roundTitleOf } from "../lib/treeLayout.js";
import { boardOf, waitingForHostText, type BoardSide, type Notice } from "../lib/view.js";
import { Avatar } from "./Avatar.js";
import { Countdown } from "./clock.js";
import { Fingerprint, HashText } from "./Seal.js";

const LONG_QUESTION_LENGTH = 40;

export function roundHeading(snapshot: RoomSnapshot): string {
  return snapshot.bracket !== null && snapshot.round !== null ? roundTitleOf(snapshot.bracket, snapshot.round) : "";
}

export function QuestionBar({ snapshot, large = false }: { snapshot: RoomSnapshot; large?: boolean }) {
  const question = currentQuestion(snapshot);
  const tiebreak = snapshot.playIndex === 1;
  return (
    <section
      className={`question${large ? " question-large" : ""}${tiebreak ? " is-tiebreak" : ""}${question !== null && codePointLength(question) > LONG_QUESTION_LENGTH ? " is-long" : ""}`}
      aria-label="本輪問題"
    >
      <div className="question-main">
        <p className="question-kicker">
          <span>{roundHeading(snapshot)}的問題</span>
          {tiebreak && <span className="tag tag-tiebreak">加賽，問題不變</span>}
        </p>
        <p className="question-text">
          <bdi>{question ?? "（裁判還沒出題）"}</bdi>
        </p>
      </div>
      <Countdown snapshot={snapshot} size={large ? "huge" : "large"} />
    </section>
  );
}

export function HostWait({ snapshot }: { snapshot: RoomSnapshot }) {
  const text = waitingForHostText(snapshot);
  if (text === null) return null;
  return (
    <p className={`hostwait${snapshot.hostConnected ? "" : " is-away"}`} role="status">
      <span className="hostwait-dot" aria-hidden="true" />
      {text}
    </p>
  );
}

export function noticeText(notice: Notice, snapshot: RoomSnapshot): string | null {
  switch (notice) {
    case "seed":
      return "你這一輪抽到種子，不用比，直接晉級下一輪。";
    case "advanced":
      return snapshot.playIndex === 1 && snapshot.phase !== "result"
        ? "你已經晉級。其他場次平手，正在加賽。"
        : "你已經晉級，等其他場次結束。";
    case "eliminated":
      return "你已經淘汰，接下來可以繼續觀賽。";
    case "spectator":
      return "比賽已經開始，你現在是觀賽者。下一局開始前會回到等候室，到時可以加入。";
    case null:
      return null;
  }
}

export function NoticeLine({ notice, snapshot }: { notice: Notice; snapshot: RoomSnapshot }) {
  const text = noticeText(notice, snapshot);
  if (text === null) return null;
  return (
    <p className={`notice notice-${notice ?? "info"}`} role="status">
      {text}
    </p>
  );
}

function BoardCell({ side, phase, selfId }: { side: BoardSide; phase: RoomSnapshot["phase"]; selfId: string | null }) {
  const { status } = side;
  return (
    <div className={`board-side${status.locked ? " is-locked" : ""}`}>
      <Avatar player={side.player} size="sm" self={side.playerId === selfId} />
      {status.locked ? (
        <div className="board-lock">
          <Fingerprint hash={status.hash} size={40} />
          <div className="board-lock-text">
            <span className="board-state is-locked">🔒 已鎖定</span>
            <HashText hash={status.hash} />
          </div>
        </div>
      ) : (
        <p className="board-state">{phase === "commit" ? "⏳ 思考中…" : "沒有鎖定，視為未出拳"}</p>
      )}
    </div>
  );
}

export function StatusBoard({
  snapshot,
  selfId = null,
  large = false,
}: {
  snapshot: RoomSnapshot;
  selfId?: string | null;
  large?: boolean;
}) {
  const board = boardOf(snapshot);
  const round = currentRound(snapshot);
  const idle = (round?.matches.length ?? 0) - board.matches.length;
  return (
    <section className={`board${large ? " board-large" : ""}`} aria-label="各場作答狀況">
      <div className="board-head">
        <h2 className="section-title">各場作答狀況</h2>
        <p className="board-count" role="status">
          已鎖定 <strong>{board.locked}</strong>／{board.total}
        </p>
      </div>
      <div
        className="board-meter"
        role="progressbar"
        aria-label="已鎖定人數"
        aria-valuemin={0}
        aria-valuemax={board.total}
        aria-valuenow={board.locked}
      >
        <span style={{ width: `${board.total === 0 ? 0 : (board.locked / board.total) * 100}%` }} />
      </div>
      <p className="section-note">
        {snapshot.phase === "commit"
          ? "鎖定後只會出現雜湊與指紋；出拳和回答要等結果揭曉才公開，裁判也看不到。"
          : "作答時間結束，伺服器正在收原文驗算，馬上揭曉。"}
        {idle > 0 && ` 另有 ${idle} 場已分出勝負，正在等加賽結束。`}
      </p>
      <ul className="board-grid">
        {board.matches.map((entry) => (
          <li key={entry.match.id} className="board-match">
            <p className="board-match-head">
              <span>第 {entry.match.index + 1} 場</span>
              {entry.match.plays.length > 1 && <span className="tag tag-tiebreak">加賽</span>}
            </p>
            <div className="board-sides">
              <BoardCell side={entry.sides[0]} phase={snapshot.phase} selfId={selfId} />
              <span className="board-vs" aria-hidden="true">
                vs
              </span>
              <BoardCell side={entry.sides[1]} phase={snapshot.phase} selfId={selfId} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AnswerLine({ answer, owner }: { answer: string | null; owner: string }) {
  if (answer === null) return null;
  return (
    <div className="answer-box">
      <p className="answer-label">
        <bdi>{owner}</bdi>的回答
      </p>
      {answer.length === 0 ? (
        <p className="answer is-empty">（沒有寫回答）</p>
      ) : (
        <p className="answer">
          <bdi>{answer}</bdi>
        </p>
      )}
    </div>
  );
}

function ResultSide({
  match,
  play,
  side,
  player,
  selfId,
}: {
  match: Match;
  play: RevealedPlay;
  side: Side;
  player: PlayerPublic | undefined;
  selfId: string | null;
}) {
  const record = play.reveals[side];
  const decided = match.status === "decided";
  const won = decided && match.winnerId === match.playerIds[side];
  return (
    <div className={`rs-side${won ? " is-winner" : ""}${decided && !won ? " is-loser" : ""}`}>
      <div className="rs-who">
        <Avatar player={player} size="md" self={match.playerIds[side] === selfId} out={decided && !won}>
          {won && <span className="tag tag-win">勝，晉級</span>}
        </Avatar>
      </div>
      <p className="rs-move">
        <span className="rs-emoji" aria-hidden="true">
          {record.move === null ? NO_MOVE_EMOJI : MOVE_EMOJI[record.move]}
        </span>
        <span className="rs-move-text">
          {record.move === null ? NO_MOVE_LABEL : MOVE_LABEL[record.move]}
          {record.status !== "valid" && <span className="rs-why">{FORFEIT_LABEL[record.status]}</span>}
        </span>
      </p>
      <AnswerLine answer={record.status === "valid" ? record.answer : null} owner={player?.nickname ?? "玩家"} />
    </div>
  );
}

function VerifyRow({ name, record, commit }: { name: string; record: RevealedPlay["reveals"][Side]; commit: string | null }) {
  const recomputed = record.preimage === null ? null : hashPreimage(record.preimage);
  const matches = recomputed !== null && recomputed === commit;
  return (
    <li className="rv-row">
      <p className="rv-name">
        <bdi>{name}</bdi>
      </p>
      {record.preimage === null ? (
        <p className="rv-line">
          {record.status === "hash_mismatch" ? "雜湊不符，原文不公開" : FORFEIT_LABEL[record.status === "valid" ? "malformed" : record.status]}
        </p>
      ) : (
        <>
          <p className="rv-label">原文（出拳｜回答｜隨機碼）</p>
          <code className="preimage rv-preimage">
            <bdi>{visibleText(record.preimage)}</bdi>
          </code>
          <p className="rv-label">先前鎖定的雜湊</p>
          <code className="rv-hash">{commit}</code>
          <p className="rv-label">瀏覽器重算 SHA-256</p>
          <code className="rv-hash">{recomputed}</code>
          <p className={`rv-result ${matches ? "is-ok" : "is-bad"}`}>
            {matches ? "兩串相同 ✔" : "兩串不同 ✘"}
            {record.status === "malformed" && "，但原文格式不符規定，視同未出拳"}
          </p>
        </>
      )}
    </li>
  );
}

function VerifyDetails({ play, names }: { play: RevealedPlay; names: [string, string] }) {
  return (
    <details className="rs-verify">
      <summary>原文與驗算</summary>
      <ul className="rv-list">
        <VerifyRow name={names[0]} record={play.reveals[0]} commit={play.commits[0]} />
        <VerifyRow name={names[1]} record={play.reveals[1]} commit={play.commits[1]} />
      </ul>
    </details>
  );
}

export function verdictText(match: Match, players: Map<string, PlayerPublic>): string {
  if (match.status === "awaiting_tiebreak") return "平手，待加賽";
  if (match.winnerId === null || match.reason === null) return "";
  const name = players.get(match.winnerId)?.nickname ?? "勝方";
  const tiebreak = match.plays.length > 1 && match.reason !== "tiebreak_draw_lot" ? "加賽後，" : "";
  return `${tiebreak}${name} 晉級：${DECISION_REASON_LABEL[match.reason]}`;
}

export function ResultsList({
  snapshot,
  selfId = null,
  large = false,
}: {
  snapshot: RoomSnapshot;
  selfId?: string | null;
  large?: boolean;
}) {
  const round = currentRound(snapshot);
  if (!round) return null;
  const players = new Map(snapshot.players.map((player) => [player.id, player]));
  const seed = round.byePlayerId === null ? undefined : players.get(round.byePlayerId);
  return (
    <section className={`results${large ? " results-large" : ""}`} aria-label="本輪各場結果">
      <h2 className="section-title">本輪各場結果</h2>
      <ul className="results-list">
        {round.matches.map((match) => {
          const play = lastRevealedPlay(match);
          if (play === null) return null;
          return (
            <li key={match.id} className={`rs is-${match.status}`}>
              <p className="rs-head">
                <span className="rs-no">第 {match.index + 1} 場</span>
                {match.plays.length > 1 && <span className="tag tag-tiebreak">加賽</span>}
                <span className={`rs-verdict${match.status === "awaiting_tiebreak" ? " is-tie" : ""}`}>
                  <bdi>{verdictText(match, players)}</bdi>
                </span>
              </p>
              <div className="rs-sides">
                <ResultSide match={match} play={play} side={0} player={players.get(match.playerIds[0])} selfId={selfId} />
                <span className="rs-vs" aria-hidden="true">
                  vs
                </span>
                <ResultSide match={match} play={play} side={1} player={players.get(match.playerIds[1])} selfId={selfId} />
              </div>
              <VerifyDetails
                play={play}
                names={[players.get(match.playerIds[0])?.nickname ?? "玩家", players.get(match.playerIds[1])?.nickname ?? "玩家"]}
              />
            </li>
          );
        })}
        {round.byePlayerId !== null && (
          <li className="rs rs-bye">
            <Avatar player={seed} size="md" self={round.byePlayerId === selfId}>
              <span className="tag tag-seed">種子，直接晉級</span>
            </Avatar>
          </li>
        )}
      </ul>
    </section>
  );
}

export function WatchScreen({
  snapshot,
  self,
  notice,
}: {
  snapshot: RoomSnapshot;
  self: PlayerPublic | null;
  notice: Notice;
}) {
  return (
    <main className="page watch">
      <header className="page-head">
        <h1 className="brand brand-small">觀賽看板</h1>
      </header>
      <NoticeLine notice={notice} snapshot={snapshot} />
      <QuestionBar snapshot={snapshot} />
      <StatusBoard snapshot={snapshot} selfId={self?.id ?? null} />
    </main>
  );
}

export function ResultsScreen({
  snapshot,
  self,
  notice,
}: {
  snapshot: RoomSnapshot;
  self: PlayerPublic | null;
  notice: Notice;
}) {
  return (
    <main className="page watch">
      <header className="page-head">
        <h1 className="brand brand-small">結果揭曉</h1>
      </header>
      <NoticeLine notice={notice} snapshot={snapshot} />
      <QuestionBar snapshot={snapshot} />
      <ResultsList snapshot={snapshot} selfId={self?.id ?? null} />
      <HostWait snapshot={snapshot} />
    </main>
  );
}
