import { useMemo } from "react";
import { findSelf, selectView } from "../lib/view.js";
import type { RoomModel } from "../model.js";
import { BracketScreen, ChampionScreen } from "./BracketScreen.js";
import { ClockContext } from "./clock.js";
import { DuelScreen } from "./Duel.js";
import { EntryScreen } from "./Entry.js";
import { HostScreen } from "./Host.js";
import { HostActionToast } from "./HostActionToast.js";
import { LobbyScreen } from "./Lobby.js";
import { ResultsScreen, WatchScreen } from "./Watch.js";

function StatusScreen({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; run: () => void };
}) {
  return (
    <main className="page status-page">
      <section className="panel status">
        <h1>{title}</h1>
        <p>{body}</p>
        {action && (
          <button type="button" className="btn btn-primary" onClick={action.run}>
            {action.label}
          </button>
        )}
      </section>
    </main>
  );
}

function Body({ model }: { model: RoomModel }) {
  const view = selectView(model);
  const { snapshot, session } = model;
  const self = findSelf(session, snapshot);

  switch (view.kind) {
    case "superseded":
      return (
        <StatusScreen
          title="已在另一個分頁開啟"
          body="同一個身分一次只能用一個分頁。這個分頁已經停止更新，請回到新開的分頁繼續；如果想改用這一頁，按下面的按鈕。"
          action={{ label: "改用這個分頁", run: () => window.location.reload() }}
        />
      );
    case "host_rejected":
      return (
        <StatusScreen
          title="裁判密鑰不正確"
          body="網址裡的裁判密鑰被伺服器拒絕。請向主辦人確認完整的裁判網址；如果你是玩家，可以直接以玩家身分進入。"
          action={{ label: "以玩家身分進入", run: model.leaveHost }}
        />
      );
    case "host_locked":
      return (
        <StatusScreen
          title="裁判密鑰嘗試次數過多"
          body="這個網路（IP 位址）連續送出太多次錯誤的裁判密鑰，伺服器暫時不接受裁判登入，最長約 5 分鐘。請確認裁判網址完整無誤，稍等一下再重試。"
          action={{ label: "重試", run: () => window.location.reload() }}
        />
      );
    case "too_many_connections":
      return (
        <StatusScreen
          title="同一個網路的連線太多"
          body="同一個網路（IP 位址）同時連到比賽的分頁或裝置已達上限，所以這個分頁沒有連上。請關掉多餘的分頁後重試；如果大家共用同一個網路，請主辦人調高上限。"
          action={{ label: "重試", run: () => window.location.reload() }}
        />
      );
    case "handshake_rejected":
      return (
        <StatusScreen
          title="連線被拒絕"
          body="伺服器不接受這個瀏覽器送出的身分資料。請重新整理頁面再試一次。"
          action={{ label: "重新整理", run: () => window.location.reload() }}
        />
      );
    case "connecting":
      return <StatusScreen title="連線中…" body="正在連上比賽伺服器。" />;
  }

  if (!snapshot) return null;

  switch (view.kind) {
    case "host":
      return <HostScreen model={model} snapshot={snapshot} />;
    case "entry":
      return <EntryScreen model={model} snapshot={snapshot} />;
    case "lobby":
      return self ? <LobbyScreen snapshot={snapshot} selfId={self.id} /> : null;
    case "champion":
      return <ChampionScreen snapshot={snapshot} self={self} />;
    case "bracket":
      return <BracketScreen snapshot={snapshot} self={self} notice={view.notice} />;
    case "watch":
      return <WatchScreen snapshot={snapshot} self={self} notice={view.notice} />;
    case "results":
      return <ResultsScreen snapshot={snapshot} self={self} notice={view.notice} />;
    case "duel": {
      const round = snapshot.round === null ? undefined : snapshot.bracket?.rounds[snapshot.round];
      const match = round?.matches.find((candidate) => candidate.id === view.matchId);
      return match && self ? <DuelScreen model={model} snapshot={snapshot} match={match} self={self} /> : null;
    }
  }
}

export function Screen({ model }: { model: RoomModel }) {
  const clock = useMemo(
    () => ({ offset: model.clockOffset, frozenNow: model.frozenNow }),
    [model.clockOffset, model.frozenNow],
  );
  return (
    <ClockContext.Provider value={clock}>
      {model.conn === "reconnecting" && (
        <div className="banner" role="alert">
          連線中斷，正在重新連線… 比賽計時不會暫停。
        </div>
      )}
      {model.snapshot && <HostActionToast snapshot={model.snapshot} />}
      <Body model={model} />
    </ClockContext.Provider>
  );
}
