import {
  COMMIT_SECONDS_DEFAULT,
  avatarAt,
  buildPreimage,
  commitStorageKey,
  computeNextStep,
  evaluateReveal,
  hashPreimage,
  judgePlay,
  makeMatchId,
  type Avatar,
  type DecisionReason,
  type HiddenPlay,
  type Match,
  type MatchStatus,
  type Move,
  type Phase,
  type Play,
  type PlayIndex,
  type PlayerPublic,
  type PlayerStatus,
  type RevealedPlay,
  type RoomSnapshot,
  type Round,
  type SessionInfo,
  type StoredCommits,
} from "@fair-rps/shared";
import type { ActionError } from "../lib/messages.js";
import type { ConnStatus } from "../lib/view.js";

export interface DemoScene {
  name: string;
  title: string;
  conn: ConnStatus;
  session: SessionInfo | null;
  snapshot: RoomSnapshot | null;
  commits: StoredCommits;
  initialCommitError?: ActionError;
  initialQuestion?: string;
}

export const DEMO_NOW = 1_800_000_000_000;
const GAME = "0f3a9c21";
const DEMO_COMMIT_SECONDS = 30;

const MING = "a1b2c3d4e5f6";
const HUA = "b2c3d4e5f6a1";
const PEI = "c3d4e5f6a1b2";
const MOMO = "d4e5f6a1b2c3";
const MEI = "e5f6a1b2c3d4";

const NAMES: Record<string, string> = {
  [MING]: "小明",
  [HUA]: "阿華",
  [PEI]: "佩佩",
  [MOMO]: "Momo",
  [MEI]: "超級無敵霹靂猜拳大魔王",
};

const FACES: Record<string, Avatar> = {
  [MING]: "🦊",
  [HUA]: "🐼",
  [PEI]: "🐰",
  [MOMO]: "🐸",
  [MEI]: "🦁",
};

function fill(text: string, length: number): string {
  const pad = "一二三四五六七八九十";
  const points = [...text];
  for (let i = 0; points.length < length; i += 1) points.push(pad[i % pad.length]!);
  return points.slice(0, length).join("");
}

export const Q1 = "最近讓你開心的一件小事是什麼？";
export const Q2 = "如果明天突然放假，你最想去哪裡？";
export const Q3 = "用三個字形容今天的自己";
export const LONG_QUESTION = fill(
  "請分享一個你最近學到的新東西，可以是工作上的技巧、生活裡的小撇步，或是從別人身上得到的啟發，並說說它為什麼讓你印象深刻、之後打算怎麼用在每天的生活或工作裡？湊滿一百個字：",
  100,
);
export const LONG_ANSWER = fill(
  "上週末第一次自己煮了一鍋紅燒牛肉麵，燉了三個小時，家人都說比外面賣的還好吃，雖然廚房被我弄得一團亂，洗碗洗到手軟，但是看到大家把湯都喝光的那一刻真的超級有成就感，下次想挑戰小籠包，數到一百：",
  100,
);

interface Sealed {
  hash: string;
  preimage: string;
}

function seal(move: Move, answer: string, nonce: string): Sealed {
  const preimage = buildPreimage(move, answer, nonce);
  return { hash: hashPreimage(preimage), preimage };
}

const S = {
  mingRock: seal("rock", "中午吃到一碗超好吃的牛肉麵", "3fa91c073fa91c073fa91c073fa91c07"),
  mingPaper: seal("paper", "", "77aa0b1e77aa0b1e77aa0b1e77aa0b1e"),
  mingScissors: seal("scissors", "加賽不會再平手了吧", "c40d92eec40d92eec40d92eec40d92ee"),
  mingLong: seal("paper", LONG_ANSWER, "1eaf1eaf1eaf1eaf1eaf1eaf1eaf1eaf"),
  huaScissors: seal("scissors", "貓咪今天主動來討摸", "9e21b6d09e21b6d09e21b6d09e21b6d0"),
  huaPaper: seal("paper", "我猜你會出石頭｜果然", "04be77f104be77f104be77f104be77f1"),
  huaRock: seal("rock", "a|b|c 有直線也沒關係", "51c0de4251c0de4251c0de4251c0de42"),
  huaRock2: seal("rock", "", "0badf00d0badf00d0badf00d0badf00d"),
  huaEmpty: seal("scissors", "", "e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0"),
  huaLong: seal("rock", LONG_ANSWER, "abcabcabcabcabcabcabcabcabcabcab"),
  peiRock: seal("rock", "🍜🍜🍜", "1234abcd1234abcd1234abcd1234abcd"),
  peiPaper: seal("paper", "同事請喝珍奶", "aa55aa55aa55aa55aa55aa55aa55aa55"),
  momoRock: seal("rock", "momo was here", "deadbeefdeadbeefdeadbeefdeadbeef"),
  meiPaper: seal("paper", LONG_ANSWER, "feedfacefeedfacefeedfacefeedface"),
  meiScissors: seal("scissors", "final", "8badf00d8badf00d8badf00d8badf00d"),
};

const NEWLINE_PREIMAGE = `rock|${"\n".repeat(98)}ab|${"c0ffee00".repeat(4)}`;
const NEWLINE_SEAL: Sealed = { hash: hashPreimage(NEWLINE_PREIMAGE), preimage: NEWLINE_PREIMAGE };

function players(
  statuses: Partial<Record<string, PlayerStatus>>,
  offline: string[] = [],
  ids = [MING, HUA, PEI, MOMO, MEI],
): PlayerPublic[] {
  return ids.map((id, index) => ({
    id,
    nickname: NAMES[id] ?? id,
    avatar: FACES[id] ?? avatarAt(index),
    connected: !offline.includes(id),
    status: statuses[id] ?? "active",
  }));
}

function hidden(index: PlayIndex, a: Sealed | null, b: Sealed | null): HiddenPlay {
  return { index, revealed: false, commits: [a?.hash ?? null, b?.hash ?? null] };
}

interface Shown {
  commit: Sealed | null;
  reveal?: string | null;
}

function shown(index: PlayIndex, a: Shown, b: Shown): RevealedPlay {
  const recordA = evaluateReveal(a.commit?.hash ?? null, a.reveal === undefined ? a.commit?.preimage : a.reveal);
  const recordB = evaluateReveal(b.commit?.hash ?? null, b.reveal === undefined ? b.commit?.preimage : b.reveal);
  return {
    index,
    revealed: true,
    commits: [a.commit?.hash ?? null, b.commit?.hash ?? null],
    reveals: [recordA, recordB],
    outcome: judgePlay(recordA.move, recordB.move),
  };
}

function match(
  round: number,
  index: number,
  playerIds: [string, string],
  status: MatchStatus,
  plays: Play[] = [],
  winnerId: string | null = null,
  reason: DecisionReason | null = null,
): Match {
  return { id: makeMatchId(GAME, round, index), round, index, playerIds, status, plays, winnerId, reason };
}

function round(index: number, question: string, matches: Match[], byePlayerId: string | null): Round {
  const started = matches.some((entry) => entry.status !== "pending");
  return { index, question: started ? question : null, matches, byePlayerId };
}

function snap(
  phase: Phase,
  remaining: number | null,
  rounds: Round[] | null,
  roster: PlayerPublic[],
  extra: Partial<RoomSnapshot> = {},
): RoomSnapshot {
  const timed = phase === "commit" || phase === "reveal";
  const last = rounds === null ? undefined : rounds[rounds.length - 1];
  return {
    seq: 42,
    serverNow: DEMO_NOW,
    phase,
    deadline: timed ? DEMO_NOW + (remaining ?? 0) : null,
    nextStep: phase === "result" && last ? computeNextStep(last) : null,
    commitSeconds: rounds === null ? COMMIT_SECONDS_DEFAULT : DEMO_COMMIT_SECONDS,
    hostConnected: true,
    players: roster,
    gameId: rounds === null ? null : GAME,
    bracket: rounds === null ? null : { rounds },
    round: rounds === null ? null : rounds.length - 1,
    playIndex: timed || phase === "result" ? 0 : null,
    championId: null,
    ...extra,
  };
}

function reveal(snapshot: RoomSnapshot, remaining = 2_000): RoomSnapshot {
  return { ...snapshot, phase: "reveal", deadline: DEMO_NOW + remaining };
}

const as = (playerId: string, roster: PlayerPublic[] = players({})): SessionInfo => {
  const found = roster.find((player) => player.id === playerId);
  return { role: "player", playerId, nickname: found?.nickname ?? "", avatar: found?.avatar ?? avatarAt(0) };
};

const ME: SessionInfo = as(MING);
const HOST: SessionInfo = { role: "host", playerId: null, nickname: null, avatar: null };
const WATCHER: SessionInfo = { role: "spectator", playerId: null, nickname: null, avatar: null };

const M0 = makeMatchId(GAME, 0, 0);

function mine(sealed: Sealed, playIndex: PlayIndex = 0, matchId = M0): StoredCommits {
  return { [commitStorageKey(matchId, playIndex)]: { matchId, playIndex, hash: sealed.hash, preimage: sealed.preimage } };
}

const waiting = (ids: string[], offline: string[] = []) =>
  players(Object.fromEntries(ids.map((id) => [id, "waiting" as const])), offline, ids);

const otherMatchPlaying = (a: Sealed | null, b: Sealed | null) =>
  match(0, 1, [PEI, MOMO], "playing", [hidden(0, a, b)]);
const otherMatchDone = match(
  0,
  1,
  [PEI, MOMO],
  "decided",
  [shown(0, { commit: S.peiPaper }, { commit: S.momoRock })],
  PEI,
  "win",
);

function round0(first: Match, second: Match, question = Q1): Round[] {
  return [round(0, question, [first, second], MEI)];
}

function commitScene(a: Sealed | null, b: Sealed | null, remaining = 21_000, question = Q1): RoomSnapshot {
  return snap(
    "commit",
    remaining,
    round0(match(0, 0, [MING, HUA], "playing", [hidden(0, a, b)]), otherMatchPlaying(S.peiRock, null), question),
    players({}),
  );
}

function resultScene(
  a: Shown,
  b: Shown,
  winnerId: string | null,
  reason: DecisionReason | null,
  roster: PlayerPublic[],
): RoomSnapshot {
  return snap(
    "result",
    null,
    round0(
      match(0, 0, [MING, HUA], winnerId === null ? "awaiting_tiebreak" : "decided", [shown(0, a, b)], winnerId, reason),
      otherMatchDone,
    ),
    roster,
  );
}

const afterR0 = (loser: string, offline: string[] = []) =>
  players({ [loser]: "eliminated", [MOMO]: "eliminated" }, offline);

const drawPlay = shown(0, { commit: S.mingRock }, { commit: S.huaRock });

const round0Done = round(
  0,
  Q1,
  [
    match(0, 0, [MING, HUA], "decided", [shown(0, { commit: S.mingRock }, { commit: S.huaScissors })], MING, "win"),
    otherMatchDone,
  ],
  MEI,
);

const round1Pending = round(1, Q2, [match(1, 0, [MING, MEI], "pending")], PEI);

const round1Done = round(
  1,
  Q2,
  [
    match(
      1,
      0,
      [MING, MEI],
      "decided",
      [
        shown(0, { commit: S.mingPaper }, { commit: S.meiPaper }),
        shown(1, { commit: S.mingScissors }, { commit: S.meiScissors }),
      ],
      MING,
      "tiebreak_draw_lot",
    ),
  ],
  PEI,
);

const finalDone = round(
  2,
  Q3,
  [match(2, 0, [MING, PEI], "decided", [shown(0, { commit: S.mingRock }, { commit: null })], MING, "opponent_forfeit")],
  null,
);

const finishedSnapshot = snap(
  "finished",
  null,
  [round0Done, round1Done, finalDone],
  players({ [MING]: "champion", [HUA]: "eliminated", [PEI]: "eliminated", [MOMO]: "eliminated", [MEI]: "eliminated" }),
  { championId: MING },
);

const finalResultSnapshot = snap(
  "result",
  null,
  [
    round0Done,
    round1Done,
    round(
      2,
      Q3,
      [match(2, 0, [MING, PEI], "decided", [shown(0, { commit: S.mingPaper }, { commit: S.peiRock })], MING, "win")],
      null,
    ),
  ],
  players({ [HUA]: "eliminated", [PEI]: "eliminated", [MOMO]: "eliminated", [MEI]: "eliminated" }),
);

const lobbyRoster: PlayerPublic[] = [
  ...waiting([MING, HUA, PEI], [PEI]),
  { id: MOMO, nickname: "一二三四五六七八九十十二2", avatar: "🐙", connected: true, status: "waiting" },
];

const POOL = [
  "小明",
  "阿華",
  "佩佩",
  "Momo",
  "大雄",
  "靜香",
  "胖虎",
  "小夫",
  "阿土伯",
  "柯南",
  "小丸子",
  "花輪",
  "皮卡丘",
  "海綿寶寶",
  "章魚哥",
  "派大星",
];
const ANSWERS = ["珍奶半糖少冰", "去海邊看日落", "", "睡到自然醒", "貓咪來討摸", "週末要去爬山", "買到演唱會的票", "今天準時下班"];
const QUESTIONS = [Q1, Q2, Q3, "你最想學會的一項技能是什麼？", "推薦一家你的口袋名單小吃", "下一個假期想做什麼？"];

const bigId = (index: number) => index.toString(16).padStart(12, "0");
const bigName = (index: number) =>
  `${POOL[index % POOL.length]}${index < POOL.length ? "" : Math.floor(index / POOL.length) + 1}`;

export type Tail = "pending" | "commit" | "stop";

export interface Tournament {
  rounds: Round[];
  roster: PlayerPublic[];
  championId: string | null;
}

export function tournament(count: number, decided: number, tail: Tail): Tournament {
  const ids = Array.from({ length: count }, (_unused, index) => bigId(index));
  const status = new Map<string, PlayerStatus>(ids.map((id) => [id, "active"]));
  const rounds: Round[] = [];
  let entrants = ids;
  let counter = 0;

  const sealOf = (move: Move, salt: number): Sealed => {
    counter += 1;
    return seal(move, ANSWERS[(salt + counter) % ANSWERS.length]!, counter.toString(16).padStart(32, "0"));
  };

  const pair = (list: string[]): { pairs: [string, string][]; bye: string | null } => {
    const rest = [...list];
    const bye = rest.length % 2 === 1 ? rest.splice(Math.floor(rest.length / 2), 1)[0]! : null;
    const pairs: [string, string][] = [];
    for (let i = 0; i < rest.length; i += 2) pairs.push([rest[i]!, rest[i + 1]!]);
    return { pairs, bye };
  };

  const play = (roundIndex: number, index: number, pairIds: [string, string]): Match => {
    const kind = (index * 3 + roundIndex + 2) % 8;
    const salt = roundIndex * 7 + index;
    const draw = () => shown(0, { commit: sealOf("rock", salt) }, { commit: sealOf("rock", salt) });
    const done = (plays: Play[], side: 0 | 1, reason: DecisionReason) =>
      match(roundIndex, index, pairIds, "decided", plays, pairIds[side], reason);
    switch (kind) {
      case 0:
        return done([shown(0, { commit: sealOf("rock", salt) }, { commit: sealOf("scissors", salt) })], 0, "win");
      case 1:
        return done([shown(0, { commit: sealOf("paper", salt) }, { commit: sealOf("scissors", salt) })], 1, "win");
      case 2:
        return done([shown(0, { commit: sealOf("scissors", salt) }, { commit: null })], 0, "opponent_forfeit");
      case 3:
        return done(
          [draw(), shown(1, { commit: sealOf("paper", salt) }, { commit: sealOf("scissors", salt) })],
          1,
          "win",
        );
      case 4:
        return done([shown(0, { commit: sealOf("paper", salt) }, { commit: sealOf("rock", salt) })], 0, "win");
      case 5:
        return done([shown(0, { commit: null }, { commit: null })], 1, "double_forfeit_lot");
      case 6:
        return done(
          [draw(), shown(1, { commit: sealOf("scissors", salt) }, { commit: sealOf("scissors", salt) })],
          0,
          "tiebreak_draw_lot",
        );
      default:
        return done([shown(0, { commit: sealOf("rock", salt) }, { commit: sealOf("paper", salt) })], 1, "win");
    }
  };

  for (let index = 0; index < decided && entrants.length > 1; index += 1) {
    const { pairs, bye } = pair(entrants);
    const matches = pairs.map((pairIds, matchIndex) => play(index, matchIndex, pairIds));
    for (const entry of matches) {
      for (const id of entry.playerIds) if (id !== entry.winnerId) status.set(id, "eliminated");
    }
    rounds.push(round(index, QUESTIONS[index % QUESTIONS.length]!, matches, bye));
    entrants = [...matches.map((entry) => entry.winnerId!), ...(bye === null ? [] : [bye])];
  }

  if (tail !== "stop" && entrants.length > 1) {
    const index = rounds.length;
    const { pairs, bye } = pair(entrants);
    const matches = pairs.map((pairIds, matchIndex) =>
      tail === "pending"
        ? match(index, matchIndex, pairIds, "pending")
        : match(index, matchIndex, pairIds, "playing", [
            hidden(
              0,
              matchIndex % 3 === 2 ? null : sealOf("rock", matchIndex),
              matchIndex % 3 === 0 ? sealOf("paper", matchIndex) : null,
            ),
          ]),
    );
    rounds.push(round(index, QUESTIONS[index % QUESTIONS.length]!, matches, bye));
  }

  const championId = tail === "stop" && entrants.length === 1 ? entrants[0]! : null;
  if (championId !== null) status.set(championId, "champion");
  const roster: PlayerPublic[] = ids.map((id, index) => ({
    id,
    nickname: bigName(index),
    avatar: avatarAt(index * 5 + 3),
    connected: index % 11 !== 7,
    status: status.get(id) ?? "active",
  }));
  return { rounds, roster, championId };
}

export function treeSnapshot(count: number, decided: number, tail: Tail = "pending"): RoomSnapshot {
  const game = tournament(count, decided, tail);
  if (game.championId !== null) {
    return snap("finished", null, game.rounds, game.roster, { championId: game.championId });
  }
  if (tail === "commit") return snap("commit", 18_000, game.rounds, game.roster);
  if (tail === "stop") return snap("result", null, game.rounds, game.roster, { playIndex: 1 });
  return snap("bracket", null, game.rounds, game.roster);
}

function seat(snapshot: RoomSnapshot, matchIndex: number, side: 0 | 1): SessionInfo {
  const rounds = snapshot.bracket?.rounds ?? [];
  const last = rounds[rounds.length - 1];
  const playerId = last?.matches[matchIndex]?.playerIds[side] ?? "";
  return as(playerId, snapshot.players);
}

const tree2 = treeSnapshot(2, 0);
const tree3 = treeSnapshot(3, 1);
const tree9 = treeSnapshot(9, 2);
const tree16 = treeSnapshot(16, 1);
const tree64 = treeSnapshot(64, 2);
const tree64Start = treeSnapshot(64, 0);
const tree64Finished = treeSnapshot(64, 6, "stop");
const commit32 = treeSnapshot(32, 0, "commit");
const result16 = treeSnapshot(16, 1, "stop");

const tiebreakCommit = (a: Sealed | null, b: Sealed | null) =>
  snap(
    "commit",
    24_000,
    round0(match(0, 0, [MING, HUA], "playing", [drawPlay, hidden(1, a, b)]), otherMatchDone),
    players({ [MOMO]: "eliminated" }),
    { playIndex: 1 },
  );

const round1Commit = snap(
  "commit",
  19_000,
  [round0Done, round(1, Q2, [match(1, 0, [MING, MEI], "playing", [hidden(0, S.mingPaper, null)])], PEI)],
  afterR0(HUA),
);

const firstBracket = () =>
  snap("bracket", null, round0(match(0, 0, [MING, HUA], "pending"), match(0, 1, [PEI, MOMO], "pending")), players({}));
const secondBracket = (extra: Partial<RoomSnapshot> = {}) =>
  snap("bracket", null, [round0Done, round1Pending], afterR0(HUA), extra);

function scene(
  name: string,
  title: string,
  session: SessionInfo | null,
  snapshot: RoomSnapshot | null,
  options: Partial<Pick<DemoScene, "conn" | "commits" | "initialCommitError" | "initialQuestion">> = {},
): DemoScene {
  return { name, title, session, snapshot, conn: "connected", commits: {}, ...options };
}

export const DEMO_SCENES: DemoScene[] = [
  scene("entry", "進場：暱稱與頭像", WATCHER, snap("lobby", null, null, waiting([HUA, PEI, MOMO]))),
  scene("host-rejected", "裁判密鑰被拒", null, null, { conn: "host_rejected" }),
  scene("host-locked", "裁判密鑰嘗試過多被暫時鎖定", null, null, { conn: "host_locked" }),
  scene("too-many-connections", "同一 IP 連線過多", null, null, { conn: "too_many_connections" }),
  scene("handshake-rejected", "連線被拒絕", null, null, { conn: "handshake_rejected" }),
  scene("lobby-player", "等候室（玩家）", ME, snap("lobby", null, null, lobbyRoster)),
  scene("lobby-host", "等候室（裁判，含作答秒數）", HOST, snap("lobby", null, null, lobbyRoster)),
  scene("lobby-host-solo", "等候室（裁判，人數不足）", HOST, snap("lobby", null, null, waiting([MING]))),

  scene("bracket-5", "賽程表階段：5 人含種子（玩家等待出題）", ME, firstBracket()),
  scene("host-bracket", "賽程表階段：裁判出題中", HOST, firstBracket(), { initialQuestion: Q1 }),
  scene("host-bracket-empty", "賽程表階段：裁判還沒輸入問題", HOST, firstBracket()),
  scene("host-bracket-long", "賽程表階段：裁判輸入 100 字問題", HOST, secondBracket(), {
    initialQuestion: LONG_QUESTION,
  }),
  scene("bracket-round2", "賽程表：第二輪（勝者升上來）", ME, secondBracket()),
  scene("bracket-seed", "賽程表：種子視角", as(PEI), secondBracket()),
  scene("bracket-eliminated", "賽程表：淘汰者", as(HUA), secondBracket()),
  scene("bracket-spectator", "賽程表：晚到的觀賽者", WATCHER, secondBracket()),
  scene("bracket-host-away", "賽程表：裁判離線", ME, secondBracket({ hostConnected: false })),
  scene("tree-2", "直式賽程表：2 人", seat(tree2, 0, 0), tree2),
  scene("tree-3", "直式賽程表：3 人，種子進決賽", seat(tree3, 0, 1), tree3),
  scene("tree-9", "直式賽程表：9 人第三輪（種子、未出拳、抽籤、加賽）", seat(tree9, 0, 0), tree9),
  scene("tree-3-r2", "直式賽程表：3 人第 2 輪（觀賽者）", WATCHER, treeSnapshot(3, 1)),
  scene("tree-5-r2", "直式賽程表：5 人第 2 輪（觀賽者）", WATCHER, treeSnapshot(5, 1)),
  scene("tree-5-r3", "直式賽程表：5 人第 3 輪（觀賽者）", WATCHER, treeSnapshot(5, 2)),
  scene("tree-6-r2", "直式賽程表：6 人第 2 輪（觀賽者）", WATCHER, treeSnapshot(6, 1)),
  scene("tree-6-r3", "直式賽程表：6 人第 3 輪（觀賽者）", WATCHER, treeSnapshot(6, 2)),
  scene("tree-7-r2", "直式賽程表：7 人第 2 輪（觀賽者）", WATCHER, treeSnapshot(7, 1)),
  scene("tree-7-r3", "直式賽程表：7 人第 3 輪（觀賽者）", WATCHER, treeSnapshot(7, 2)),
  scene("tree-9-r2", "直式賽程表：9 人第 2 輪（觀賽者）", WATCHER, treeSnapshot(9, 1)),
  scene("tree-9-r3", "直式賽程表：9 人第 3 輪（觀賽者）", WATCHER, treeSnapshot(9, 2)),
  scene("tree-16", "直式賽程表：16 人第二輪（觀賽者）", WATCHER, tree16),
  scene("tree-64", "直式賽程表：64 人第三輪（玩家自動捲動）", seat(tree64, 6, 1), tree64),
  scene("host-bracket-64", "直式賽程表：64 人第一輪（裁判）", HOST, tree64Start),
  scene("champion-64", "冠軍：64 人完整賽程", WATCHER, tree64Finished),

  scene("commit-open", "作答：雙方未鎖", ME, commitScene(null, null, 27_000)),
  scene("commit-me-locked", "作答：我已鎖", ME, commitScene(S.mingRock, null), { commits: mine(S.mingRock) }),
  scene("commit-opp-locked", "作答：對手已鎖", ME, commitScene(null, S.huaScissors, 14_000)),
  scene("commit-both-locked", "作答：雙方已鎖", ME, commitScene(S.mingRock, S.huaScissors, 9_000), {
    commits: mine(S.mingRock),
  }),
  scene("commit-long-question", "作答：100 字問題", ME, commitScene(null, S.huaScissors, 25_000, LONG_QUESTION)),
  scene("commit-long-answer", "作答：我鎖定了 100 字回答", ME, commitScene(S.mingLong, null, 12_000, LONG_QUESTION), {
    commits: mine(S.mingLong),
  }),
  scene("commit-urgent", "作答：最後 5 秒", ME, commitScene(null, S.huaScissors, 3_400)),
  scene("commit-rejected", "作答：伺服器拒收", ME, commitScene(null, S.huaScissors, 11_000), {
    initialCommitError: "DUPLICATE_HASH",
  }),
  scene("tiebreak-commit", "加賽：作答", ME, tiebreakCommit(null, S.huaRock2)),
  scene("reveal", "揭示中", ME, reveal(commitScene(S.mingRock, S.huaScissors)), { commits: mine(S.mingRock) }),

  scene("watch-2", "觀賽看板：2 場（晚到的觀賽者）", WATCHER, commitScene(S.mingRock, null, 18_000)),
  scene("watch-16", "觀賽看板：16 場", WATCHER, commit32),
  scene("watch-seed", "觀賽看板：輪空種子", as(MEI), commitScene(S.mingRock, null, 18_000)),
  scene("watch-eliminated", "觀賽看板：已淘汰", as(HUA, afterR0(HUA)), round1Commit),
  scene("watch-tiebreak", "觀賽看板：已晉級，等加賽", as(PEI), tiebreakCommit(S.mingScissors, null)),
  scene("watch-reveal", "觀賽看板：揭示中", WATCHER, reveal(commitScene(S.mingRock, null))),

  scene("result-win", "結果：勝", ME, resultScene({ commit: S.mingRock }, { commit: S.huaScissors }, MING, "win", afterR0(HUA))),
  scene("result-lose", "結果：負", ME, resultScene({ commit: S.mingRock }, { commit: S.huaPaper }, HUA, "win", afterR0(MING))),
  scene(
    "result-opp-forfeit",
    "結果：對方未出拳",
    ME,
    resultScene({ commit: S.mingRock }, { commit: null }, MING, "opponent_forfeit", afterR0(HUA, [HUA])),
  ),
  scene(
    "result-double-forfeit",
    "結果：雙方棄權抽籤",
    ME,
    resultScene({ commit: null }, { commit: S.huaRock, reveal: null }, HUA, "double_forfeit_lot", afterR0(MING)),
  ),
  scene(
    "result-draw",
    "結果：平手待加賽",
    ME,
    resultScene({ commit: S.mingRock }, { commit: S.huaRock }, null, null, players({ [MOMO]: "eliminated" })),
  ),
  scene(
    "result-tiebreak-lot",
    "結果：加賽仍平手抽籤",
    ME,
    snap(
      "result",
      null,
      round0(
        match(
          0,
          0,
          [MING, HUA],
          "decided",
          [drawPlay, shown(1, { commit: S.mingScissors }, { commit: S.huaScissors })],
          MING,
          "tiebreak_draw_lot",
        ),
        otherMatchDone,
      ),
      afterR0(HUA),
      { playIndex: 1 },
    ),
  ),
  scene(
    "result-hash-mismatch",
    "結果：雜湊驗證失敗",
    ME,
    resultScene(
      { commit: S.mingRock },
      { commit: S.huaScissors, reveal: S.huaPaper.preimage },
      MING,
      "opponent_forfeit",
      afterR0(HUA),
    ),
  ),
  scene(
    "result-empty-answer",
    "結果：空回答",
    ME,
    resultScene({ commit: S.mingPaper }, { commit: S.huaEmpty }, HUA, "win", afterR0(MING)),
  ),
  scene(
    "result-long-answer",
    "結果：100 字回答",
    ME,
    resultScene({ commit: S.mingLong }, { commit: S.huaLong }, MING, "win", afterR0(HUA)),
  ),
  scene(
    "result-newline-answer",
    "結果：回答塞滿換行（格式不符）",
    ME,
    resultScene({ commit: S.mingRock }, { commit: NEWLINE_SEAL }, MING, "opponent_forfeit", afterR0(HUA)),
  ),
  scene(
    "results-spectator-newline",
    "觀賽者看結果列表：回答塞滿換行",
    WATCHER,
    resultScene({ commit: S.mingRock }, { commit: NEWLINE_SEAL }, MING, "opponent_forfeit", afterR0(HUA)),
  ),
  scene("result-final", "結果：決賽", ME, finalResultSnapshot),
  scene("result-host-away", "結果：裁判離線", ME, {
    ...resultScene({ commit: S.mingRock }, { commit: S.huaScissors }, MING, "win", afterR0(HUA)),
    hostConnected: false,
  }),
  scene(
    "results-spectator",
    "觀賽者看結果列表",
    WATCHER,
    resultScene({ commit: S.mingLong }, { commit: S.huaEmpty }, MING, "win", afterR0(HUA)),
  ),
  scene(
    "results-seed",
    "種子看結果列表（含平手待加賽）",
    as(MEI),
    resultScene({ commit: S.mingRock }, { commit: S.huaRock }, null, null, players({ [MOMO]: "eliminated" })),
  ),
  scene("results-16", "觀賽者看結果列表：8 場", WATCHER, result16),

  scene("host-commit", "裁判總覽：作答中", HOST, commitScene(S.mingRock, null, 18_000)),
  scene("host-commit-16", "裁判總覽：作答中 16 場", HOST, commit32),
  scene("host-commit-long", "裁判總覽：100 字問題", HOST, commitScene(S.mingRock, S.huaScissors, 18_000, LONG_QUESTION)),
  scene("host-reveal", "裁判總覽：揭示中", HOST, reveal(commitScene(S.mingRock, S.huaScissors))),
  scene(
    "host-result-tiebreak",
    "裁判總覽：結果（開始加賽）",
    HOST,
    resultScene({ commit: S.mingRock }, { commit: S.huaRock }, null, null, players({ [MOMO]: "eliminated" }, [HUA])),
  ),
  scene(
    "host-result-next",
    "裁判總覽：結果（下一輪）",
    HOST,
    resultScene({ commit: S.mingLong }, { commit: S.huaEmpty }, MING, "win", afterR0(HUA)),
  ),
  scene("host-result-champion", "裁判總覽：結果（揭曉冠軍）", HOST, finalResultSnapshot),
  scene("host-result-16", "裁判總覽：結果 8 場", HOST, result16),
  scene("host-finished", "裁判總覽：比賽結束", HOST, finishedSnapshot),

  scene("champion", "冠軍", ME, finishedSnapshot),
  scene("champion-other", "冠軍（別人）", as(HUA), finishedSnapshot),
  scene("disconnected", "斷線橫幅", ME, commitScene(S.mingRock, null), {
    commits: mine(S.mingRock),
    conn: "reconnecting",
  }),
  scene("superseded", "被新分頁取代", ME, commitScene(S.mingRock, null), { conn: "superseded" }),
];
