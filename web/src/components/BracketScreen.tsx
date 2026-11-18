import type { PlayerPublic, RoomSnapshot } from "@fair-rps/shared";
import type { Notice } from "../lib/view.js";
import { Avatar } from "./Avatar.js";
import { BracketTree } from "./Tree.js";
import { HostWait, NoticeLine, roundHeading } from "./Watch.js";

export function BracketScreen({
  snapshot,
  self,
  notice,
}: {
  snapshot: RoomSnapshot;
  self: PlayerPublic | null;
  notice: Notice;
}) {
  return (
    <main className="page bracket-page">
      <header className="page-head">
        <h1 className="brand brand-small">賽程表</h1>
        <p className="page-sub">
          {roundHeading(snapshot)}
          <span className="tag tag-now">由下往上晉級</span>
        </p>
      </header>
      <NoticeLine notice={notice} snapshot={snapshot} />
      <HostWait snapshot={snapshot} />
      <BracketTree snapshot={snapshot} selfId={self?.id ?? null} />
    </main>
  );
}

export function ChampionCard({ snapshot, self }: { snapshot: RoomSnapshot; self: PlayerPublic | null }) {
  const champion = snapshot.players.find((player) => player.id === snapshot.championId);
  const mine = self !== null && self.id === snapshot.championId;
  return (
    <section className="champion" aria-label="冠軍">
      <p className="champion-kicker">
        <span aria-hidden="true">🏆</span> {mine ? "你是冠軍" : "冠軍"}
      </p>
      <Avatar player={champion} size="xl" layout="stack" />
    </section>
  );
}

export function ChampionScreen({ snapshot, self }: { snapshot: RoomSnapshot; self: PlayerPublic | null }) {
  return (
    <main className="page champion-page">
      <ChampionCard snapshot={snapshot} self={self} />
      <p className="waitline" role="status">
        每一拳都鎖定後才揭示，下面是完整賽程。等裁判重開一局。
      </p>
      <BracketTree snapshot={snapshot} selfId={self?.id ?? null} />
    </main>
  );
}
