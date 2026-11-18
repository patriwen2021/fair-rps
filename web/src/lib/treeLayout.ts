import {
  expectedRoundCount,
  participantCount,
  playerSource,
  type Bracket,
  type Match,
  type Side,
} from "@fair-rps/shared";

export type NodeOrigin = "entrant" | "match" | "bye" | "open";

export interface TreeNode {
  key: string;
  level: number;
  x: number;
  playerId: string | null;
  origin: NodeOrigin;
  matchIndex: number | null;
  side: Side | null;
  isBye: boolean;
}

export interface TreeLink {
  kind: "match" | "bye";
  parent: string;
  children: string[];
}

export interface TreeMatch {
  round: number;
  index: number;
  x: number;
  span: number;
  flipped: boolean;
  match: Match;
  nodes: [string, string];
}

export interface TreeLayout {
  levelCount: number;
  leafCount: number;
  builtRounds: number;
  nodes: TreeNode[];
  links: TreeLink[];
  matches: TreeMatch[];
}

export function levelSizes(participants: number): number[] {
  const sizes: number[] = [];
  let remaining = Math.max(0, Math.trunc(participants));
  if (remaining === 0) return sizes;
  sizes.push(remaining);
  while (remaining > 1) {
    remaining = Math.ceil(remaining / 2);
    sizes.push(remaining);
  }
  return sizes;
}

export function roundTitle(participants: number, roundIndex: number): string {
  const total = expectedRoundCount(participants);
  if (roundIndex === total - 1) return "決賽";
  if (levelSizes(participants)[roundIndex] === 4) return "準決賽";
  return `第 ${roundIndex + 1} 輪`;
}

export function roundTitleOf(bracket: Bracket, roundIndex: number): string {
  return roundTitle(participantCount(bracket), roundIndex);
}

function clusterStart(members: TreeNode[], desired: Map<string, number>): number {
  const pinned = members.findIndex((member) => member.origin === "bye");
  if (pinned !== -1) return (desired.get(members[pinned]!.key) ?? 0) - pinned;
  const total = members.reduce((sum, member, index) => sum + (desired.get(member.key) ?? 0) - index, 0);
  return total / members.length;
}

function spreadLevel(nodes: TreeNode[], desired: Map<string, number>): void {
  const ordered = [...nodes].sort((left, right) => (desired.get(left.key) ?? 0) - (desired.get(right.key) ?? 0));
  interface Cluster {
    members: TreeNode[];
    start: number;
  }
  const clusters: Cluster[] = [];
  for (const node of ordered) {
    clusters.push({ members: [node], start: desired.get(node.key) ?? 0 });
    while (clusters.length > 1) {
      const current = clusters[clusters.length - 1]!;
      const previous = clusters[clusters.length - 2]!;
      if (previous.start + previous.members.length <= current.start + 1e-9) break;
      clusters.pop();
      previous.members.push(...current.members);
      previous.start = clusterStart(previous.members, desired);
    }
  }
  for (const cluster of clusters) cluster.members.forEach((member, index) => (member.x = cluster.start + index));
}

export function layoutTree(bracket: Bracket, championId: string | null = null): TreeLayout {
  const built = bracket.rounds.length;
  const top = Math.max(expectedRoundCount(participantCount(bracket)), built);
  const nodes: TreeNode[] = [];
  const links: TreeLink[] = [];
  const matches: TreeMatch[] = [];
  const perLevel: number[] = [];
  const sources = new Map<string, string[]>();
  const leafX = new Map<string, number>();

  if (built === 0) return { levelCount: 0, leafCount: 0, builtRounds: 0, nodes, links, matches };

  const first = bracket.rounds[0]!;
  const bottom: string[] = first.matches.flatMap((match) => [...match.playerIds]);
  if (first.byePlayerId !== null) bottom.push(first.byePlayerId);
  bottom.forEach((playerId, index) => leafX.set(playerId, index));
  const leafCount = bottom.length;

  const add = (level: number, playerId: string | null, origin: NodeOrigin, at?: number): TreeNode => {
    const index = at ?? perLevel[level] ?? 0;
    if (at === undefined) perLevel[level] = index + 1;
    const node: TreeNode = {
      key: `${level}:${index}`,
      level,
      x: at ?? 0,
      playerId,
      origin,
      matchIndex: null,
      side: null,
      isBye: false,
    };
    nodes.push(node);
    return node;
  };

  const fromMatch = (level: number, source: Match, occupant: string | null): TreeNode => {
    const a = entrant(level - 1, source.playerIds[0]);
    const b = entrant(level - 1, source.playerIds[1]);
    const node = add(level, occupant, "match");
    sources.set(node.key, [a.key, b.key]);
    matches.push({ round: level - 1, index: source.index, x: 0, span: 0, flipped: false, match: source, nodes: [a.key, b.key] });
    links.push({ kind: "match", parent: node.key, children: [a.key, b.key] });
    return node;
  };

  const fromBye = (level: number, playerId: string, occupant: string | null): TreeNode => {
    const child = entrant(level - 1, playerId);
    const node = add(level, occupant, "bye");
    sources.set(node.key, [child.key]);
    links.push({ kind: "bye", parent: node.key, children: [child.key] });
    return node;
  };

  function entrant(level: number, playerId: string): TreeNode {
    let node: TreeNode;
    const source = level === 0 ? null : playerSource(bracket, level, playerId);
    const sourceMatch =
      source?.kind === "match"
        ? bracket.rounds[level - 1]?.matches.find((candidate) => candidate.index === source.matchIndex)
        : undefined;
    if (sourceMatch) node = fromMatch(level, sourceMatch, playerId);
    else if (source?.kind === "bye") node = fromBye(level, playerId, playerId);
    else node = add(level, playerId, "entrant", leafX.get(playerId) ?? 0);
    const round = bracket.rounds[level];
    const own = round?.matches.find((candidate) => candidate.playerIds.includes(playerId));
    if (own) {
      node.matchIndex = own.index;
      node.side = own.playerIds[0] === playerId ? 0 : 1;
    }
    node.isBye = round?.byePlayerId === playerId;
    return node;
  }

  const last = bracket.rounds[built - 1]!;
  let frontier: TreeNode[] = last.matches.map((match) =>
    fromMatch(built, match, built === top ? championId : match.winnerId),
  );
  if (last.byePlayerId !== null) {
    frontier.push(fromBye(built, last.byePlayerId, built === top ? championId : last.byePlayerId));
  }

  for (let level = built + 1; level <= top; level += 1) {
    const next: TreeNode[] = [];
    for (let i = 0; i < frontier.length; i += 2) {
      const a = frontier[i]!;
      const b = frontier[i + 1];
      const node = add(level, level === top ? championId : null, "open");
      sources.set(node.key, b ? [a.key, b.key] : [a.key]);
      next.push(node);
    }
    frontier = next;
  }

  const byKey = new Map(nodes.map((node) => [node.key, node]));
  for (let level = 1; level <= top; level += 1) {
    const here = nodes.filter((node) => node.level === level);
    const desired = new Map<string, number>();
    for (const node of here) {
      const xsOf = (sources.get(node.key) ?? []).map((key) => byKey.get(key)!.x);
      desired.set(node.key, xsOf.reduce((sum, x) => sum + x, 0) / Math.max(1, xsOf.length));
    }
    spreadLevel(here, desired);
  }
  for (const entry of matches) {
    const [a, b] = entry.nodes.map((key) => byKey.get(key)!) as [TreeNode, TreeNode];
    entry.x = (a.x + b.x) / 2;
    entry.span = Math.abs(b.x - a.x);
    entry.flipped = a.x > b.x;
  }

  return { levelCount: top + 1, leafCount, builtRounds: built, nodes, links, matches };
}

export const TREE = {
  cell: 78,
  nodeWidth: 72,
  levelHeight: 188,
  nodeTop: 10,
  nodeHeight: 92,
  stripHeight: 50,
  barGap: 8,
  padX: 10,
} as const;

export function nodeCenterX(x: number): number {
  return TREE.padX + (x + 0.5) * TREE.cell;
}

export function levelTop(levelCount: number, level: number): number {
  return (levelCount - 1 - level) * TREE.levelHeight;
}

export function nodeTopY(levelCount: number, level: number): number {
  return levelTop(levelCount, level) + TREE.nodeTop;
}

export function nodeBottomY(levelCount: number, level: number): number {
  return nodeTopY(levelCount, level) + TREE.nodeHeight;
}

export function treeSize(layout: TreeLayout): { width: number; height: number } {
  return {
    width: TREE.padX * 2 + Math.max(1, layout.leafCount) * TREE.cell,
    height: layout.levelCount * TREE.levelHeight,
  };
}

export interface Point {
  x: number;
  y: number;
}

export interface LinkGeometry {
  parent: Point;
  children: Point[];
  barY: number;
}

export function linkGeometry(layout: TreeLayout, link: TreeLink): LinkGeometry | null {
  const byKey = new Map(layout.nodes.map((node) => [node.key, node]));
  const parent = byKey.get(link.parent);
  const children = link.children.map((key) => byKey.get(key));
  if (!parent || children.some((child) => child === undefined)) return null;
  const childLevel = parent.level - 1;
  const childTop = nodeTopY(layout.levelCount, childLevel);
  return {
    parent: { x: nodeCenterX(parent.x), y: nodeBottomY(layout.levelCount, parent.level) },
    children: children.map((child) => ({ x: nodeCenterX(child!.x), y: childTop })),
    barY: childTop - TREE.barGap,
  };
}

export function stripWidth(entry: TreeMatch): number {
  const room = entry.round === 0 ? 2 * TREE.cell - 8 : entry.span * TREE.cell - 18;
  return Math.max(56, Math.min(190, room));
}

export function treeFocus(layout: TreeLayout, selfId: string | null, currentRound: number | null): number {
  if (selfId !== null) {
    const own = layout.nodes.filter((node) => node.playerId === selfId);
    if (own.length > 0) return own.reduce((best, node) => (node.level > best.level ? node : best)).x;
  }
  const live = layout.matches.filter((entry) => entry.round === currentRound && entry.match.status !== "decided");
  if (live.length > 0) {
    const xs = live.map((entry) => entry.x);
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  }
  const top = layout.nodes.find((node) => node.level === layout.levelCount - 1);
  return top ? top.x : (Math.max(1, layout.leafCount) - 1) / 2;
}

export function isOut(bracket: Bracket, node: TreeNode): boolean {
  if (node.playerId === null || node.matchIndex === null) return false;
  const match = bracket.rounds[node.level]?.matches.find((candidate) => candidate.index === node.matchIndex);
  return match !== undefined && match.status === "decided" && match.winnerId !== node.playerId;
}
