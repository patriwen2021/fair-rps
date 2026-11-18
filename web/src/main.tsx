import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

function mount(node: ReactNode) {
  createRoot(document.getElementById("root")!).render(<StrictMode>{node}</StrictMode>);
}

function demoScene(): string | null {
  return new URLSearchParams(window.location.search).get("demo");
}

if (import.meta.env.DEV && demoScene() !== null) {
  void import("./demo/DemoApp.js").then(({ DemoApp }) => mount(<DemoApp scene={demoScene() ?? ""} />));
} else {
  mount(<App />);
}
