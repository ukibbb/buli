import { render, type Instance } from "ink";
import React from "react";
import { type AgentRuntime } from "@buli/engine";
import { App, type AppProps } from "./App.tsx";

export { App } from "./App.tsx";
export type { AppProps } from "./App.tsx";
export { ComposerPane } from "./components/ComposerPane.tsx";
export { StatusBar } from "./components/StatusBar.tsx";
export { TranscriptPane } from "./components/TranscriptPane.tsx";
export {
  appendComposer,
  applyTurnEvent,
  backspaceComposer,
  createInitialState,
  submitPrompt,
} from "./state.ts";
export type { AppState, AuthState, RuntimeState, TranscriptEntry } from "./state.ts";

export function renderInkApp(input: {
  auth: AppProps["auth"];
  model: string;
  runtime: AgentRuntime;
}): Instance {
  return render(React.createElement(App, { auth: input.auth, model: input.model, runtime: input.runtime }));
}
