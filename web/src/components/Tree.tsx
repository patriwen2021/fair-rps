import {
  DECISION_REASON_LABEL,
  MOVE_LABEL,
  finalMoves,
  participantCount,
  type Move,
  type PlayerPublic,
  type RoomSnapshot,
} from "@fair-rps/shared";
import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import { MOVE_EMOJI, NO_MOVE_EMOJI, NO_MOVE_LABEL } from "../lib/format.js";
import {
  TREE,
  isOut,
  layoutTree,
  levelTop,
  linkGeometry,
  nodeCenterX,
  nodeTopY,
  roundTitle,
  stripWidth,
  treeFocus,
  treeSize,
  type TreeLayout,
  type TreeLink,
  type TreeMatch,
  type TreeNode,
} from "../lib/treeLayout.js";
import { AvatarFace, GONE_NAME } from "./Avatar.js";

function moveText(move: Move | null): string {
  return move === null ? NO_MOVE_LABEL : MOVE_LABEL[move];
}

function stripNote(entry: TreeMatch): string | null {
  const { match } = entry;
  const tiebreak = match.plays.length > 1;
  switch (match.status) {
    case "pending":
      return null;
    case "playing":
      return tiebreak ? "加賽中" : "作答中";
    case "awaiting_tiebreak":
      return "平手，待加賽";
    case "decided":
      if (match.reason === null) return null;
      if (match.reason === "win") return tiebreak ? "加賽分出勝負" : null;
      if (match.reason === "opponent_forfeit") return tiebreak ? "加賽時一方未出拳" : "一方未出拳";
      return DECISION_REASON_LABEL[match.reason];
  }
}

function Strip({ entry, levelCount }: { entry: TreeMatch; levelCount: number }) {
  const sideMoves = finalMoves(entry.match);
  const moves = sideMoves === null ? null : entry.flipped ? ([sideMoves[1], sideMoves[0]] as typeof sideMoves) : sideMoves;
  const note = stripNote(entry);
  if (moves === null && note === null) return null;
  const width = stripWidth(entry);
  const style: CSSProperties = {
    left: nodeCenterX(entry.x) - width / 2,
    top: nodeTopY(levelCount, entry.round) + TREE.nodeHeight + 3,
    width,
  };
  const spoken = moves === null ? null : `${moveText(moves[0])} 對 ${moveText(moves[1])}`;
  return (
    <div className={`tree-strip is-${entry.match.status}`} style={style}>
      {moves !== null && spoken !== null && (
        <span className="tree-moves" role="img" aria-label={spoken} title={spoken}>
          <span aria-hidden="true">{moves[0] === null ? NO_MOVE_EMOJI : MOVE_EMOJI[moves[0]]}</span>
          <span className="tree-vs" aria-hidden="true">
            vs
          </span>
          <span aria-hidden="true">{moves[1] === null ? NO_MOVE_EMOJI : MOVE_EMOJI[moves[1]]}</span>
        </span>
      )}
      {note !== null && <span className="tree-note">{note}</span>}
    </div>
  );
}

function NodeBox({
  node,
  layout,
  snapshot,
  players,
  selfId,
}: {
  node: TreeNode;
  layout: TreeLayout;
  snapshot: RoomSnapshot;
  players: Map<string, PlayerPublic>;
  selfId: string | null;
}) {
  const top = node.level === layout.levelCount - 1;
  const style: CSSProperties = {
    left: nodeCenterX(node.x) - TREE.nodeWidth / 2,
    top: nodeTopY(layout.levelCount, node.level),
    width: TREE.nodeWidth,
    height: TREE.nodeHeight,
  };
  if (node.playerId === null) {
    return (
      <div
        className={`tree-node is-empty${top ? " is-crown" : ""}`}
        style={style}
        title={top ? "冠軍尚未揭曉" : "這個位置還沒有人晉級"}
      >
        <span className="tree-empty-face" aria-hidden="true">
          {top ? "🏆" : "？"}
        </span>
        <span className="tree-empty-text">{top ? "冠軍" : "待定"}</span>
      </div>
    );
  }
  const player = players.get(node.playerId);
  const self = node.playerId === selfId;
  const out = snapshot.bracket !== null && isOut(snapshot.bracket, node);
  const offline = player ? !player.connected : false;
  const rising =
    (snapshot.phase === "bracket" && node.level === snapshot.round && node.level > 0) ||
    (snapshot.phase === "finished" && top);
  const classes = [
    "tree-node",
    self ? "is-self" : "",
    out ? "is-out" : "",
    offline ? "is-offline" : "",
    top ? "is-champion" : "",
    rising ? "is-rising" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} style={style} data-self={self ? "true" : undefined}>
      <span className="tree-pic">
        {player ? (
          <AvatarFace avatar={player.avatar} size="sm" />
        ) : (
          <span className="avatar-face avatar-face-sm is-gone" aria-hidden="true">
            ？
          </span>
        )}
        {offline && <span className="avatar-off">離線</span>}
        {node.origin === "bye" && <span className="tree-badge tree-badge-seed">種子</span>}
        {self && <span className="tree-badge tree-badge-me">你</span>}
        {top && <span className="tree-badge tree-badge-crown">冠軍</span>}
      </span>
      <span className="tree-name">
        <bdi>{player?.nickname ?? GONE_NAME}</bdi>
      </span>
    </div>
  );
}

function Link({
  link,
  layout,
  selfId,
}: {
  link: TreeLink;
  layout: TreeLayout;
  selfId: string | null;
}) {
  const geometry = linkGeometry(layout, link);
  if (geometry === null) return null;
  const byKey = new Map(layout.nodes.map((node) => [node.key, node]));
  const parent = byKey.get(link.parent);
  const { parent: to, children, barY } = geometry;
  if (link.kind === "bye") {
    const child = children[0]!;
    const mine = selfId !== null && parent?.playerId === selfId;
    return <path className={`tree-line is-bye${mine ? " is-self" : ""}`} d={`M${child.x} ${child.y}V${to.y}`} />;
  }
  const decided = parent?.playerId !== null && parent?.playerId !== undefined;
  return (
    <g>
      {children.map((child, index) => {
        const node = byKey.get(link.children[index]!);
        const won = decided && node?.playerId === parent?.playerId;
        const mine = won && selfId !== null && node?.playerId === selfId;
        return (
          <path
            key={index}
            className={`tree-line${won ? " is-won" : ""}${mine ? " is-self" : ""}`}
            d={`M${child.x} ${child.y}V${barY}H${to.x}`}
          />
        );
      })}
      <path
        className={`tree-line${decided ? " is-won" : ""}${decided && parent?.playerId === selfId ? " is-self" : ""}`}
        d={`M${to.x} ${barY}V${to.y}`}
      />
    </g>
  );
}

export function BracketTree({ snapshot, selfId }: { snapshot: RoomSnapshot; selfId: string | null }) {
  const { bracket, championId } = snapshot;
  const layout = useMemo(() => (bracket === null ? null : layoutTree(bracket, championId)), [bracket, championId]);
  const scroller = useRef<HTMLDivElement | null>(null);
  const focus = layout === null ? 0 : nodeCenterX(treeFocus(layout, selfId, snapshot.round));
  const width = layout === null ? 0 : treeSize(layout).width;

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    element.scrollLeft = Math.max(0, focus - element.clientWidth / 2);
  }, [focus, width]);

  if (bracket === null || layout === null || layout.levelCount === 0) return null;
  const players = new Map(snapshot.players.map((player) => [player.id, player]));
  const size = treeSize(layout);
  const participants = participantCount(bracket);
  const levels = Array.from({ length: layout.levelCount }, (_unused, index) => layout.levelCount - 1 - index);
  const asked = bracket.rounds.filter((round) => round.question !== null);

  return (
    <div className="tree-wrap">
      <div className="tree">
        <ol className="tree-gutter" aria-label="輪次">
          {levels.map((level) => {
            const top = level === layout.levelCount - 1;
            const question = bracket.rounds[level]?.question ?? null;
            const current = level === snapshot.round && snapshot.phase !== "finished";
            return (
              <li
                key={level}
                className={`tree-label${current ? " is-current" : ""}`}
                style={{ height: TREE.levelHeight }}
              >
                <span className="tree-label-head">
                  <span className="tree-label-title">{top ? "冠軍" : roundTitle(participants, level)}</span>
                  {current && <span className="tag tag-now">本輪</span>}
                </span>
                {question !== null && (
                  <span className="tree-label-question">
                    <bdi>{question}</bdi>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <div
          className="tree-scroll"
          ref={scroller}
          tabIndex={0}
          role="group"
          aria-label="賽程表，由下往上晉級，可左右捲動"
        >
          <div className="tree-stage" style={{ minWidth: size.width, height: size.height }}>
            {levels.map((level) => (
              <div
                key={level}
                className={`tree-band${level === snapshot.round && snapshot.phase !== "finished" ? " is-current" : ""}`}
                style={{ top: levelTop(layout.levelCount, level), height: TREE.levelHeight }}
              />
            ))}
          <div className="tree-canvas" style={{ width: size.width, height: size.height }}>
            <svg className="tree-lines" width={size.width} height={size.height} aria-hidden="true">
              {layout.links.map((link) => (
                <Link key={link.parent} link={link} layout={layout} selfId={selfId} />
              ))}
            </svg>
            {layout.matches.map((entry) => (
              <Strip key={`${entry.round}:${entry.index}`} entry={entry} levelCount={layout.levelCount} />
            ))}
            {layout.nodes.map((node) => (
              <NodeBox
                key={`${node.key}:${node.playerId ?? ""}`}
                node={node}
                layout={layout}
                snapshot={snapshot}
                players={players}
                selfId={selfId}
              />
            ))}
          </div>
          </div>
        </div>
      </div>
      {asked.length > 0 && (
        <ol className="tree-questions" aria-label="各輪問題">
          {asked.map((round) => (
            <li key={round.index}>
              <strong>{roundTitle(participants, round.index)}</strong>
              <bdi>{round.question}</bdi>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
