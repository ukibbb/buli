import { type TurnEvent } from "@buli/contracts";
import { type AgentRuntime } from "@buli/engine";
import { Box, useInput } from "ink";
import React, { startTransition, useEffectEvent, useRef, useState } from "react";
import { ComposerPane } from "./components/ComposerPane.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { TranscriptPane } from "./components/TranscriptPane.tsx";
import { appendComposer, applyTurnEvent, backspaceComposer, createInitialState, submitPrompt, type AuthState, type AppState } from "./state.ts";

export type AppProps = {
  auth: AuthState;
  model: string;
  runtime: AgentRuntime;
};

export function App(props: AppProps) {
  const [state, setState] = useState(() => createInitialState({ auth: props.auth, model: props.model }));
  const stateRef = useRef<AppState>(state);
  stateRef.current = state;

  const handleTurnEvent = useEffectEvent((event: TurnEvent) => {
    startTransition(() => {
      setState((current) => applyTurnEvent(current, event));
    });
  });

  const streamPrompt = useEffectEvent(async (prompt: string) => {
    for await (const event of props.runtime.runTurn({
      prompt,
      model: props.model,
    })) {
      handleTurnEvent(event);
    }
  });

  useInput((input, key) => {
    if (key.return) {
      const result = submitPrompt(stateRef.current);
      if (!result.prompt) {
        return;
      }

      setState(result.state);
      void streamPrompt(result.prompt);
      return;
    }

    if (key.backspace || key.delete) {
      setState((current) => backspaceComposer(current));
      return;
    }

    if (input) {
      setState((current) => appendComposer(current, input));
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column" marginBottom={1}>
        <TranscriptPane entries={state.transcript} />
      </Box>
      <ComposerPane disabled={state.runtime === "streaming"} value={state.composer} />
      <StatusBar auth={state.auth} model={state.model} runtime={state.runtime} usage={state.usage} />
    </Box>
  );
}
