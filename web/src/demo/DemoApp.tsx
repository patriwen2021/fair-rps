import { Screen } from "../components/Screen.js";
import type { RoomModel } from "../model.js";
import { DEMO_NOW, DEMO_SCENES } from "./scenes.js";

const OK = { ok: true as const, data: {} };

export function DemoApp({ scene }: { scene: string }) {
  const found = DEMO_SCENES.find((candidate) => candidate.name === scene);
  if (!found) {
    return (
      <main className="page">
        <h1 className="brand brand-small">展示場景</h1>
        <ul className="demo-index">
          {DEMO_SCENES.map((candidate) => (
            <li key={candidate.name}>
              <a href={`?demo=${candidate.name}`}>{candidate.title}</a>
            </li>
          ))}
        </ul>
      </main>
    );
  }
  const model: RoomModel = {
    conn: found.conn,
    session: found.session,
    snapshot: found.snapshot,
    clockOffset: 0,
    frozenNow: DEMO_NOW,
    commits: found.commits,
    join: async () => ({ ok: false, error: "TIMEOUT" }),
    commit: async () => OK,
    hostStart: async () => OK,
    hostStartRound: async () => OK,
    hostNext: async () => OK,
    hostReset: async () => OK,
    leaveHost: () => undefined,
    initialAvatar: "🦊",
    ...(found.initialCommitError ? { initialCommitError: found.initialCommitError } : {}),
    ...(found.initialQuestion ? { initialQuestion: found.initialQuestion } : {}),
  };
  return <Screen model={model} />;
}
