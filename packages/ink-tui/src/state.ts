import { type TokenUsage, type TranscriptMessage, type TurnEvent } from "@buli/contracts";

const PENDING_ASSISTANT_ID = "assistant-pending";

export type AuthState = "ready" | "missing";
export type RuntimeState = "idle" | "streaming" | "error";

export type TranscriptEntry =
  | {
      kind: "message";
      message: TranscriptMessage;
    }
  | {
      kind: "error";
      text: string;
    };

export type AppState = {
  auth: AuthState;
  model: string;
  runtime: RuntimeState;
  composer: string;
  usage: TokenUsage | undefined;
  transcript: TranscriptEntry[];
  pendingAssistantId: string | undefined;
};

export function createInitialState(input: { auth: AuthState; model: string }): AppState {
  return {
    auth: input.auth,
    model: input.model,
    runtime: "idle",
    composer: "",
    usage: undefined,
    transcript: [],
    pendingAssistantId: undefined,
  };
}

export function appendComposer(state: AppState, value: string): AppState {
  return {
    ...state,
    composer: state.composer + value,
  };
}

export function backspaceComposer(state: AppState): AppState {
  return {
    ...state,
    composer: state.composer.slice(0, -1),
  };
}

export function submitPrompt(state: AppState): { state: AppState; prompt: string | undefined } {
  const prompt = state.composer.trim();
  if (!prompt || state.runtime === "streaming") {
    return { state, prompt: undefined };
  }

  // We append the user message before the provider runs so the transcript feels
  // immediate, and we block duplicate submits while a turn is already streaming.
  return {
    prompt,
    state: {
      ...state,
      composer: "",
      runtime: "streaming",
      usage: undefined,
      transcript: [
        ...state.transcript,
        {
          kind: "message",
          message: {
            id: `user-${state.transcript.length + 1}`,
            role: "user",
            text: prompt,
          },
        },
      ],
      pendingAssistantId: PENDING_ASSISTANT_ID,
    },
  };
}

export function applyTurnEvent(state: AppState, event: TurnEvent): AppState {
  if (event.type === "assistant_stream_started") {
    return {
      ...state,
      model: event.model,
      runtime: "streaming",
      usage: undefined,
      pendingAssistantId: PENDING_ASSISTANT_ID,
    };
  }

  if (event.type === "assistant_text_delta") {
    const last = state.transcript.at(-1);
    if (last?.kind === "message" && last.message.id === state.pendingAssistantId) {
      return {
        ...state,
        transcript: [
          ...state.transcript.slice(0, -1),
          {
            kind: "message",
            message: {
              ...last.message,
              text: last.message.text + event.text,
            },
          },
        ],
      };
    }

    return {
      ...state,
      transcript: [
        ...state.transcript,
        {
          kind: "message",
          message: {
            id: state.pendingAssistantId ?? PENDING_ASSISTANT_ID,
            role: "assistant",
            text: event.text,
          },
        },
      ],
    };
  }

  if (event.type === "assistant_stream_finished") {
    const last = state.transcript.at(-1);
    // Replace the temporary streaming assistant row with the finalized message
    // so the renderer only has one assistant entry to reason about.
    const transcript =
      last?.kind === "message" && last.message.id === state.pendingAssistantId
        ? [
            ...state.transcript.slice(0, -1),
            {
              kind: "message" as const,
              message: event.message,
            },
          ]
        : [
            ...state.transcript,
            {
              kind: "message" as const,
              message: event.message,
            },
          ];

    return {
      ...state,
      runtime: "idle",
      usage: event.usage,
      transcript,
      pendingAssistantId: undefined,
    };
  }

  return {
    ...state,
    runtime: "error",
    pendingAssistantId: undefined,
    transcript: [
      ...state.transcript,
      {
        kind: "error",
        text: event.error,
      },
    ],
  };
}
