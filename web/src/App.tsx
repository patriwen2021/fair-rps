import { Screen } from "./components/Screen.js";
import { useRoom } from "./net/useRoom.js";

export function App() {
  const model = useRoom();
  return <Screen model={model} />;
}
