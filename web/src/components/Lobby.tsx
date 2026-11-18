import { MAX_PLAYERS, MIN_PLAYERS_TO_START, type RoomSnapshot } from "@fair-rps/shared";
import { Avatar } from "./Avatar.js";

export function Roster({ snapshot, selfId }: { snapshot: RoomSnapshot; selfId: string | null }) {
  if (snapshot.players.length === 0) {
    return <p className="empty">還沒有玩家。把網址傳給大家，請他們輸入暱稱、選頭像進來。</p>;
  }
  return (
    <ul className="roster">
      {snapshot.players.map((player) => (
        <li key={player.id} className={`roster-item${player.id === selfId ? " is-self" : ""}`}>
          <Avatar player={player} size="sm" self={player.id === selfId}>
            {player.id === selfId && <span className="tag tag-me">你</span>}
          </Avatar>
        </li>
      ))}
    </ul>
  );
}

export function onlineCount(snapshot: RoomSnapshot): number {
  return snapshot.players.filter((player) => player.connected).length;
}

export function RosterPanel({ snapshot, selfId }: { snapshot: RoomSnapshot; selfId: string | null }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>玩家名單</h2>
        <p className="count">
          <strong>{snapshot.players.length}</strong> 人（{onlineCount(snapshot)} 人在線），上限 {MAX_PLAYERS} 人
        </p>
      </div>
      <Roster snapshot={snapshot} selfId={selfId} />
    </section>
  );
}

export function LobbyScreen({ snapshot, selfId }: { snapshot: RoomSnapshot; selfId: string }) {
  const online = onlineCount(snapshot);
  return (
    <main className="page lobby">
      <header className="page-head">
        <h1 className="brand brand-small">公平猜拳</h1>
        <p className="page-sub">等候室</p>
      </header>
      <RosterPanel snapshot={snapshot} selfId={selfId} />
      <p className="waitline" role="status">
        {!snapshot.hostConnected
          ? "裁判還沒上線。裁判進來後才能開始。"
          : online < MIN_PLAYERS_TO_START
            ? `至少要 ${MIN_PLAYERS_TO_START} 位玩家才能開始，再等一下其他人。`
            : "人到齊後，裁判會開始分配賽程。這個畫面會自動切換。"}
      </p>
    </main>
  );
}
