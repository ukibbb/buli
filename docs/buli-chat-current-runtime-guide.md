# Buli Chat Current Runtime Guide

This guide explains how the current `buli` chat app works in plain English.

It is written for someone who wants to understand the runtime flow, data flow,
rendering flow, and agent behavior without already knowing the codebase.

## The Short Version

`buli` chat is a pipeline:

```text
terminal command
  -> CLI command dispatcher
  -> chat composition root
  -> OpenTUI React screen
  -> local chat-session state
  -> assistant runtime
  -> OpenAI provider
  -> streamed provider events
  -> assistant response events
  -> chat-session reducer
  -> React/OpenTUI components
```

The model does not directly render UI components.

The model produces text, reasoning summaries, and tool-call requests. `buli`
converts those into typed events and typed message parts. The TUI renders those
typed objects.

The most important rule is:

```text
OpenAI stream data becomes provider events.
Provider events become assistant response events.
Assistant response events become chat state.
Chat state becomes UI.
```

## Main Packages

The current chat app is split across these packages.

| Package | Role |
| --- | --- |
| `apps/cli` | Command-line entrypoints and composition root. |
| `packages/contracts` | Shared typed shapes for messages, parts, events, usage, tools, and history. |
| `packages/chat-session-state` | Reducers and selectors for local UI/session state. |
| `packages/chat-app-controller` | Renderer-neutral chat app state and actions: normalized keyboard effects, assistant turn relay, prompt image attachment state, active turn interruption, tool approval, session/model loading, prompt-context refresh, and session compaction/export orchestration. |
| `packages/engine` | Provider-independent assistant runtime, in-memory history, prompt-context expansion, bash execution, and tool approval. |
| `packages/openai` | Auth, model discovery, Responses API request building, SSE parsing, and tool-continuation loop. |
| `packages/tui` | OpenTUI React renderer, terminal runtime lifecycle, renderer-specific keyboard/paste adapters, transcript rendering, live interaction chrome, and component dispatch. |

## Mental Model

There are three separate concepts that are easy to confuse.

| Concept | What it means | Main files |
| --- | --- | --- |
| Conversation state | What the TUI currently knows and renders. | `packages/chat-session-state/src/chatSessionState.ts` |
| Runtime history | What the assistant runtime remembers across turns in the current process. | `packages/engine/src/conversationHistory.ts` |
| Provider request context | What gets sent to OpenAI for one provider turn or tool continuation. | `packages/openai/src/provider/request.ts` |

They overlap, but they are not the same object.

The TUI state is optimized for rendering. The runtime history is optimized for
future turns. The OpenAI request context is optimized for the Responses API.

## CLI Entry Flow

### User Command

Common commands are:

```bash
buli login
buli models
buli
buli --model gpt-5.5 --reasoning high
```

The binary wrapper is:

`apps/cli/bin/buli.js`

```ts
#!/usr/bin/env bun
import { main } from "../dist/cli.js";

await main(process.argv.slice(2));
```

This file only calls the built CLI entrypoint.

During source development, the package scripts call `apps/cli/src/cli.ts`
directly.

### CLI Main Function

Source file:

`apps/cli/src/cli.ts`

```ts
export async function main(args: readonly string[]): Promise<void> {
  try {
    const output = await runCli(args);
    if (output) {
      console.log(output);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
```

This function does two things:

1. It asks `runCli(...)` what to do.
2. If the command returns text, it prints that text.

It deliberately keeps side effects at the edge so tests can call `runCli(...)`
without printing or exiting.

### Command Dispatch

Source file:

`apps/cli/src/main.ts`

```ts
if (!firstArgument) {
  return commandHandlers.runInteractiveChat({});
}
```

No arguments means interactive chat.

```ts
if (firstArgument.startsWith("--")) {
  const interactiveChatStartOptions = parseInteractiveChatStartOptions(args);
  if (!interactiveChatStartOptions) {
    return USAGE;
  }

  return commandHandlers.runInteractiveChat(interactiveChatStartOptions);
}
```

Startup flags also mean interactive chat, but with initial model or reasoning
settings.

```ts
switch (firstArgument) {
  case "login":
    return commandHandlers.runLogin();
  case "models":
    return commandHandlers.runListAvailableModels();
  default:
    return USAGE;
}
```

Only `login` and `models` are named commands today. The old `chat` alias is not
accepted.

## Login Flow

### User Flow

When the user runs:

```bash
buli login
```

`apps/cli/src/commands/login.ts` calls `loginWithBrowser()`.

```ts
export async function runLogin(): Promise<string> {
  const auth = await loginWithBrowser();
  if (auth.accountId) {
    return `OpenAI login complete for account ${auth.accountId}`;
  }

  return "OpenAI login complete";
}
```

### Browser OAuth Flow

Source file:

`packages/openai/src/auth/browser.ts`

```ts
const store = input.store ?? new OpenAiAuthStore();
const server = input.server ?? new OpenAiCallbackServer();
const pkce = await createPkcePair();
const state = createOAuthState();

const { redirectUri } = await server.start();
```

The login flow creates:

- a local auth store
- a local callback server
- a PKCE verifier/challenge pair
- an OAuth state token
- a callback URL such as `http://localhost:1455/auth/callback`

Then it builds the authorize URL:

```ts
const url = buildAuthorizeUrl({
  redirectUri,
  challenge: pkce.challenge,
  state,
  issuer: input.issuer,
});
```

Then it opens the browser and waits for the callback:

```ts
await (input.openUrl ?? openBrowser)(url);
const callback = await pending;
```

Then it exchanges the authorization code for tokens:

```ts
const tokens = await exchangeAuthorizationCode({
  code: callback.code,
  redirectUri,
  verifier: pkce.verifier,
  issuer: input.issuer,
  fetchImpl: input.fetchImpl,
});
```

Finally it stores auth:

```ts
const auth = toAuthInfo({ tokens });
await store.saveOpenAi(auth);
return auth;
```

### Where Auth Is Stored

Source file:

`packages/openai/src/auth/store.ts`

```ts
export function defaultAuthFilePath(): string {
  return join(homedir(), ".buli", "auth.json");
}
```

Auth is stored at:

```text
~/.buli/auth.json
```

The stored shape is typed by:

`packages/openai/src/auth/schema.ts`

```ts
export const OpenAiAuthInfoSchema = z
  .object({
    provider: z.literal("openai"),
    method: z.literal("oauth"),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    expiresAt: z.number().int().nonnegative(),
    accountId: z.string().min(1).optional(),
  })
  .strict();
```

### Token Refresh

Source file:

`packages/openai/src/auth/refresh.ts`

When OpenAI calls need auth, `refreshStoredAuth(...)` is used.

```ts
const auth = await input.store.loadOpenAi();
if (!auth) {
  return undefined;
}

const now = input.now ?? Date.now();
if (auth.expiresAt > now) {
  return auth;
}
```

If the token is still valid, it is reused.

If expired, the refresh token is exchanged for a new access token and the store
is updated.

## Models Command Flow

### User Flow

When the user runs:

```bash
buli models
```

Source file:

`apps/cli/src/commands/models.ts`

```ts
const store = input.store ?? new OpenAiAuthStore();
const auth = await store.loadOpenAi();
if (!auth) {
  return "OpenAI auth not found. Run `buli login`.";
}

const provider = new OpenAiProvider({ store });
return formatAvailableAssistantModelsOutput(await provider.listAvailableAssistantModels());
```

The command requires stored auth.

If auth is missing, it exits with a clean message.

If auth exists, it creates an OpenAI provider and asks for available models.

### Provider Model Fetch

Source file:

`packages/openai/src/provider/client.ts`

```ts
async listAvailableAssistantModels(): Promise<AvailableAssistantModel[]> {
  const auth = await loadOpenAiAuth({
    store: this.store,
    fetchImpl: this.fetchImpl,
  });

  const response = await this.fetchImpl(deriveOpenAiModelListEndpoint(this.endpoint), {
    method: "GET",
    headers: createRequestHeaders(auth, "application/json"),
  });
```

The provider:

1. Loads or refreshes auth.
2. Derives the model-list endpoint from the Responses endpoint.
3. Calls the endpoint.
4. Parses the response into `AvailableAssistantModel[]`.

The parsed model shape comes from `packages/contracts/src/provider.ts`:

```ts
export const AvailableAssistantModelSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    defaultReasoningEffort: ReasoningEffortSchema.optional(),
    supportedReasoningEfforts: z.array(ReasoningEffortSchema),
  })
  .strict();
```

## Interactive Chat Boot Flow

### User Flow

When the user runs:

```bash
buli
```

or:

```bash
buli --model gpt-5.5 --reasoning high
```

the CLI calls `runInteractiveChat(...)`.

Source file:

`apps/cli/src/commands/chat.ts`

```ts
const store = input.store ?? new OpenAiAuthStore();
const auth = await store.loadOpenAi();
if (!auth) {
  return "OpenAI auth not found. Run `buli login`.";
}
```

Auth is checked before starting the TUI.

```ts
const stdin = input.stdin ?? process.stdin;
if (!stdin.isTTY) {
  return "Interactive chat requires a TTY. Run `buli` in a terminal.";
}
```

The interactive UI only starts in a real terminal.

Then the composition root creates long-lived objects for this process:

```ts
const provider = new OpenAiProvider({ store });
const promptContextCandidateCatalog = new PromptContextCandidateCatalog({
  promptContextBrowseRootPath,
  promptContextStartingDirectoryPath,
});
const assistantConversationRunner = new AssistantConversationRuntime({
  conversationTurnProvider: provider,
  workspaceRootPath: process.cwd(),
  promptContextBrowseRootPath,
  promptContextStartingDirectoryPath,
});
```

These objects stay alive for the fullscreen session.

### Important Runtime Objects

| Object | Created in | What it does |
| --- | --- | --- |
| `OpenAiProvider` | `apps/cli/src/commands/chat.ts` | Talks to OpenAI. |
| `PromptContextCandidateCatalog` | `apps/cli/src/commands/chat.ts` | Lists files/folders for the `@` picker. |
| `AssistantConversationRuntime` | `apps/cli/src/commands/chat.ts` | Runs assistant turns and tool calls. |
| TUI entrypoint | `packages/tui/src/index.ts` | Wires the production OpenTUI renderer, React root, and app element factory. |
| OpenTUI terminal runtime | `packages/tui/src/terminalChatScreenRuntime.ts` | Owns alternate-screen renderer creation, React root lifetime, console-capture environment restoration, and active-turn shutdown. |
| `ChatScreen` | `packages/tui/src/ChatScreen.tsx` | Owns current chat screen state and connects controller actions to layout props. |

### TUI Mount

Source file:

`packages/tui/src/index.ts`

`packages/tui/src/terminalChatScreenRuntime.ts`

```ts
const cliRenderer = await createCliRenderer({
  screenMode: "alternate-screen",
  useMouse: true,
  enableMouseMovement: true,
  consoleMode: process.env.BULI_CONSOLE_LOG_FILE?.trim() ? "disabled" : "console-overlay",
});
```

The terminal switches into alternate-screen mode.

That means the app owns the visible screen while it is running, and the previous
terminal content is restored after exit.

Then the root renders `TerminalChatScreenApp`, which contains `ChatScreen` and the terminal selection clipboard bridge:

```ts
root.render(
  runtime.createChatScreenElement({
    assistantConversationRunner: input.assistantConversationRunner,
    activeConversationTurnShutdownCoordinator,
    loadAvailableAssistantModels: input.loadAvailableAssistantModels,
    loadPromptContextCandidates: input.loadPromptContextCandidates,
    selectedModelId: input.selectedModelId,
  }),
);
```

The returned instance can request shutdown and then wait for both renderer destruction and active-turn settlement:

```ts
destroy(): void {
  destroyRendererOnce();
}

async waitUntilExit(): Promise<void> {
  await rendererDestroyedPromise;
  await activeConversationTurnShutdownCoordinator.interruptActiveConversationTurnAndWaitForSettlement();
}
```

Current note: `ChatScreen` does not define a custom quit shortcut. Process exit
is handled outside this component, and terminal shutdown is coordinated by
`terminalChatScreenRuntime.ts`.

## Initial Chat State

Source file:

`packages/chat-session-state/src/chatSessionState.ts`

```ts
export function createInitialChatSessionState(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
}): ChatSessionState {
  return {
    selectedModelId: input.selectedModelId,
    selectedReasoningEffort: input.selectedReasoningEffort,
    conversationTurnStatus: "waiting_for_user_input",
    promptDraft: "",
    promptDraftCursorOffset: 0,
    latestTokenUsage: undefined,
    conversationMessagesById: {},
    conversationMessagePartsById: {},
    orderedConversationMessageIds: [],
    pendingToolApprovalRequest: undefined,
    promptContextSelectionState: { step: "hidden" },
    slashCommandSelectionState: { step: "hidden" },
    selectedPromptContextReferenceTexts: [],
    modelAndReasoningSelectionState: { step: "hidden" },
    isCommandHelpModalVisible: false,
  };
}
```

The first real state is simple:

- no messages
- empty prompt draft
- waiting for user input
- no modal
- no picker
- no pending approval
- selected model from CLI input or default

## ChatScreen State Ownership

Source file:

`packages/chat-app-controller/src/useChatAppController.ts`

`packages/tui/src/behavior/useChatScreenController.ts`

```ts
const [chatSessionState, setChatSessionState] = useState(() =>
  createInitialChatSessionState({
    selectedModelId: props.selectedModelId,
    ...(props.selectedReasoningEffort ? { selectedReasoningEffort: props.selectedReasoningEffort } : {}),
  }),
);
```

`useChatAppController` owns the live state for the current UI session.
`useChatScreenController` adapts that renderer-neutral state to transcript
viewport callbacks, OpenTUI keyboard/paste actions, render diagnostics, and
`ChatScreenLayout` props. `ChatScreen` reads terminal dimensions, formats the
working-directory label, and renders `ChatScreenLayout`.

That state is not persisted to disk. If the process exits, the visible chat
session is lost.

The app controller also stores refs for things that need current values inside async
callbacks:

```ts
const latestChatSessionStateRef = useRef<ChatSessionState>(chatSessionState);
const latestActiveConversationSessionIdRef = useRef<string | undefined>(activeConversationSessionId);
const isPromptSubmissionInFlightRef = useRef(false);
const isConversationCompactionInFlightRef = useRef(false);
```

These refs matter because streaming and keyboard handlers can run after React
has scheduled updates.

## Screen Regions

Ignoring the demo gallery, the screen has three conceptual regions.

```text
Top region
  -> TopBar

Middle region
  -> CommandHelpModal
  -> ConversationTranscriptSurface
     -> ConversationMessageList, even before the first message

Bottom region
  -> LiveInteractionChrome
     -> LiveInteractionStatusStack
        -> ToolApprovalRequestBlock when approval is pending
        -> export or compaction status panes when active
        -> ConversationSessionSelectionPane when session selection is active
        -> ModelAndReasoningSelectionPane when model/reasoning selection is active
        -> SlashCommandSelectionPane when / picker is active
        -> PromptContextSelectionPane when @ picker is active
     -> PromptComposerChrome
        -> InputPanel or MinimumHeightPromptStrip
```

The middle region is mutually exclusive. Only one primary thing wins.

The bottom region is additive. Several support surfaces can stack at once.

### Render Priority

Source file:

`packages/tui/src/components/ChatScreenLayout.tsx`

`packages/tui/src/components/ChatScreenMainArea.tsx`

```tsx
{chatSessionState.isCommandHelpModalVisible ? (
  <CommandHelpModal ... />
) : (
  <ConversationTranscriptSurface ... />
)}
```

The production middle branch is `ConversationTranscriptSurface`, which wraps
`ConversationMessageList`. It renders even when the ordered message list is
empty, so a fresh session starts with an empty transcript area rather than a
separate demo surface.

The bottom region is independent:

```tsx
<LiveInteractionChrome statusStackProps={...} promptComposerProps={...} />
```

This is why tool approval can appear below the transcript instead of replacing
the transcript.

## Keyboard Ownership

Source file:

`packages/tui/src/behavior/useChatScreenKeyboardInputActions.ts`

`packages/chat-app-controller/src/useChatAppKeyboardActions.ts`

`packages/chat-session-state/src/chatSessionKeyboardInteraction.ts`

The TUI owns OpenTUI event plumbing, then delegates normalized chat actions to
the renderer-neutral controller.

```ts
useKeyboard((keyEvent: KeyEvent) => {
  applyKeyboardInputToChatScreen({
    chatSessionKeyboardInput: normalizeOpenTuiKeyEventForChatSession(keyEvent),
    inputEvent: keyEvent,
  });
});
```

The TUI adapter still handles renderer-only concerns:

- preventing default OpenTUI behavior when a key is consumed
- paste events and native clipboard image reads
- respecting when `PromptTextarea` already owns a key

After that, `useChatAppKeyboardActions` applies the shared keyboard reducer and
executes typed effects such as prompt submission, slash-command execution,
model/session loading, tool approval decisions, active-turn interruption, and
transcript page scrolling.
Prompt image placeholder deletion and pasted-image state changes are handled by
`useChatAppPromptImageAttachmentActions`; the TUI only supplies the native
clipboard image reader and consumes the OpenTUI event.

This decides what keys mean.

| State scope | Example key behavior |
| --- | --- |
| model selection | Up/down move model highlight. Enter selects. Esc closes. |
| reasoning-effort selection | Up/down move reasoning highlight. Enter selects. Esc closes. |
| slash-command selection | Up/down move command highlight. Enter executes. Esc closes. |
| prompt-context selection | Up/down move context candidate. Enter inserts. Esc dismisses. |
| tool approval | `Y` approves, `N` denies, and `Esc` requests active-turn interruption. |
| prompt draft editing | Text edits draft. Enter submits. Left/right move caret. |

## Typing Flow

### User Action

The user types a normal character.

### Keyboard Handler

Source files:

`packages/tui/src/behavior/openTuiKeyboardInputAdapter.ts`

`packages/tui/src/behavior/useChatScreenKeyboardInputActions.ts`

`packages/chat-app-controller/src/useChatAppKeyboardActions.ts`

The OpenTUI key event becomes a `ChatSessionKeyboardInput`, then the controller
applies it to shared session state.

```ts
const keyboardInteraction = applyChatSessionKeyboardInputToChatSessionState({
  chatSessionState: previousChatSessionState,
  chatSessionKeyboardInput: keyboardInput.chatSessionKeyboardInput,
  isPromptSubmissionInFlight: input.isPromptSubmissionInFlightRef.current || input.isConversationCompactionInFlightRef.current,
});
```

### State Update

Source file:

`packages/chat-session-state/src/promptDraftReducer.ts`

For ordinary text, the keyboard reducer reaches the prompt draft reducer:

```ts
export function insertTextIntoPromptDraftAtCursor(chatSessionState: ChatSessionState, insertedText: string): ChatSessionState {
  const promptDraftPrefix = chatSessionState.promptDraft.slice(0, chatSessionState.promptDraftCursorOffset);
  const promptDraftSuffix = chatSessionState.promptDraft.slice(chatSessionState.promptDraftCursorOffset);
  const promptDraft = `${promptDraftPrefix}${insertedText}${promptDraftSuffix}`;
  return createPromptDraftEditedState({
    chatSessionState,
    promptDraft,
    promptDraftCursorOffset: chatSessionState.promptDraftCursorOffset + insertedText.length,
  });
}
```

The prompt draft changes locally. Nothing goes to OpenAI yet.

### Render

Source file:

`packages/tui/src/components/InputPanel.tsx`

```tsx
<PromptTextarea
  promptDraft={props.promptDraft}
  promptDraftCursorOffset={props.promptDraftCursorOffset}
  selectedPromptContextReferenceTexts={props.selectedPromptContextReferenceTexts}
  isFocused={true}
  onPromptDraftEdited={props.onPromptDraftEdited}
  onPromptSubmitted={props.onPromptSubmitted}
/>
```

Source file:

`packages/tui/src/components/PromptDraftText.tsx`

`PromptDraftText` splits the prompt around the cursor and renders a cursor
character between the two halves.

## Prompt Context Flow

Prompt context is the `@file-or-folder` picker.

It has two phases:

1. UI selection while typing.
2. Model-facing context expansion when submitting.

### Detecting The Active Query

Source file:

`packages/engine/src/prompt-context/extractActivePromptContextQueryFromPromptDraft.ts`

```ts
export function extractActivePromptContextQueryFromPromptDraft(
  promptDraft: string,
  promptDraftCursorOffset: number,
): ActivePromptContextQuery | undefined {
```

It scans the draft for an `@` reference near the cursor.

Examples:

```text
Explain @packages/tui
        ^ active query starts after @

Read @"folder with spaces/file.ts"
```

### Loading Candidates

Source file:

`packages/tui/src/ChatScreen.tsx`

```ts
const activePromptContextQuery = extractActivePromptContextQueryFromPromptDraft(
  latestChatSessionState.promptDraft,
  latestChatSessionState.promptDraftCursorOffset,
);
```

If there is an active query, `ChatScreen` calls:

```ts
props.loadPromptContextCandidates(input.promptContextQueryText)
```

That function was passed from `apps/cli/src/commands/chat.ts`:

```ts
loadPromptContextCandidates: (promptContextQueryText: string) =>
  promptContextCandidateCatalog.listPromptContextCandidates(promptContextQueryText),
```

The catalog lives in:

`packages/engine/src/prompt-context/promptContextCandidateCatalog.ts`

It caches fuzzy recursive scans briefly:

```ts
const DEFAULT_RECURSIVE_PROMPT_CONTEXT_ENTRY_SNAPSHOT_TIME_TO_LIVE_MS = 2_000;
```

### Candidate Search Strategy

Source file:

`packages/engine/src/prompt-context/listPromptContextCandidates.ts`

```ts
export type PromptContextQueryLoadStrategy = "browse_current_directory" | "path_query" | "fuzzy_query";
```

The strategy is:

- empty query browses the current directory
- path-like query searches inside a specific directory
- plain fuzzy query scans recursively and filters

### Rendering The Picker

Source file:

`packages/tui/src/components/PromptContextSelectionPane.tsx`

The picker renders up to six visible candidates:

```ts
const MAX_VISIBLE_PROMPT_CONTEXT_CANDIDATE_COUNT = 6;
```

It shows the highlighted candidate with `>`.

### Selecting A Candidate

Source file:

`packages/chat-session-state/src/promptContextSelectionReducer.ts`

```ts
export function selectHighlightedPromptContextCandidate(chatSessionState: ChatSessionState): ChatSessionState {
```

This function:

1. Reads the highlighted candidate.
2. Replaces the active `@query` with the candidate reference.
3. Hides the picker.
4. Tracks the selected reference so the input can color it.

### Model-Facing Expansion

The selected reference is still just text until the prompt is submitted.

When the assistant turn starts, the runtime calls:

Source file:

`packages/engine/src/runtime.ts`

```ts
const modelFacingPromptText = await buildModelFacingPromptTextFromPromptContextReferences({
  promptText: this.conversationTurnInput.userPromptText,
  promptContextBrowseRootPath: this.promptContextBrowseRootPath,
  promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
});
```

Source file:

`packages/engine/src/prompt-context/buildModelFacingPromptTextFromPromptContextReferences.ts`

If there are no references, the prompt is unchanged:

```ts
if (parsedPromptContextReferences.length === 0) {
  return input.promptText;
}
```

If references exist, file or directory snapshots are appended:

```ts
return `${input.promptText}\n\nAttached prompt context:\n\n${promptContextBlocks.join("\n\n")}`;
```

So the user sees:

```text
Explain @packages/tui/src/ChatScreen.tsx
```

But the model receives:

```text
Explain @packages/tui/src/ChatScreen.tsx

Attached prompt context:

<file snapshot here>
```

## Prompt Submission Flow

### User Action

The user presses Enter while in prompt draft editing.

### Keyboard Handler

Source file:

`packages/tui/src/ChatScreen.tsx`

```ts
if (keyEvent.name === "return") {
  const promptDraftSubmission = submitPromptDraft(latestChatSessionState);
  if (!promptDraftSubmission.submittedPromptText) {
    return;
  }

  setChatSessionState(promptDraftSubmission.nextChatSessionState);
  scrollConversationMessagesToBottom();
  void streamAssistantResponseForSubmittedPrompt(promptDraftSubmission.submittedPromptText);
  return;
}
```

### Submission Reducer

Source file:

`packages/chat-session-state/src/promptDraftReducer.ts`

```ts
const submittedPromptText = chatSessionState.promptDraft.trim();
if (
  !submittedPromptText ||
  chatSessionState.conversationTurnStatus === "streaming_assistant_response" ||
  chatSessionState.conversationTurnStatus === "waiting_for_tool_approval" ||
  chatSessionState.promptContextSelectionState.step !== "hidden" ||
  chatSessionState.modelAndReasoningSelectionState.step !== "hidden"
) {
  return { nextChatSessionState: chatSessionState, submittedPromptText: undefined };
}
```

Submission is blocked if:

- the prompt is empty
- an assistant response is streaming
- tool approval is pending
- prompt-context picker is open
- model/reasoning picker is open

If submission is allowed, the reducer creates a completed user message:

```ts
const userTextConversationMessagePart: UserTextConversationMessagePart = {
  id: userTextPartId,
  partKind: "user_text",
  text: submittedPromptText,
};

const userConversationMessage: ConversationMessage = {
  id: userMessageId,
  role: "user",
  messageStatus: "completed",
  createdAtMs: submittedAtMs,
  partIds: [userTextPartId],
};
```

Then it updates state:

```ts
promptDraft: "",
promptDraftCursorOffset: 0,
conversationTurnStatus: "streaming_assistant_response",
latestTokenUsage: undefined,
pendingToolApprovalRequest: undefined,
promptContextSelectionState: { step: "hidden" },
selectedPromptContextReferenceTexts: [],
```

Important behavior: the user's message appears immediately before the assistant
has produced any output.

## Starting The Assistant Turn

After local submission, `ChatScreen` starts streaming.

Source file:

`packages/tui/src/ChatScreen.tsx`

```ts
const streamAssistantResponseForSubmittedPrompt = useEffectEvent(async (submittedPromptText: string) => {
  const conversationTurnRequest = {
    userPromptText: submittedPromptText,
    selectedModelId: latestChatSessionStateRef.current.selectedModelId,
    ...(latestChatSessionStateRef.current.selectedReasoningEffort
      ? { selectedReasoningEffort: latestChatSessionStateRef.current.selectedReasoningEffort }
      : {}),
  };

  await relayAssistantResponseRunnerEvents({
    assistantConversationRunner: props.assistantConversationRunner,
    conversationTurnRequest,
    onConversationTurnStarted: (activeConversationTurn) => {
      latestActiveConversationTurnRef.current = activeConversationTurn;
    },
    onConversationTurnFinished: () => {
      latestActiveConversationTurnRef.current = undefined;
    },
    onAssistantResponseEvents: applyIncomingAssistantResponseEventsToChatScreen,
  });
});
```

The turn request contains only:

- user prompt text
- selected model id
- optional selected reasoning effort

## Event Relay Flow

Source file:

`packages/tui/src/relayAssistantResponseRunnerEvents.ts`

```ts
const activeConversationTurn = input.assistantConversationRunner.startConversationTurn(input.conversationTurnRequest);
input.onConversationTurnStarted(activeConversationTurn);
```

The relay starts a runtime turn and gives `ChatScreen` the active turn object.

That active turn matters later for tool approval:

```ts
latestActiveConversationTurnRef.current?.approvePendingToolCall(...)
latestActiveConversationTurnRef.current?.denyPendingToolCall(...)
```

The relay batches assistant events:

```ts
const ASSISTANT_RESPONSE_EVENT_BATCH_WINDOW_MS = 16;
```

This avoids forcing a React render for every tiny stream chunk.

The core loop is:

```ts
for await (const assistantResponseEvent of activeConversationTurn.streamAssistantResponseEvents()) {
  queueAssistantResponseEvent(assistantResponseEvent);
}
```

If the runner throws, the relay turns the error into a synthetic failed assistant
message:

```ts
queueAssistantResponseEvent({
  type: "assistant_turn_started",
  messageId: failedAssistantMessageId,
  startedAtMs: Date.now(),
});
queueAssistantResponseEvent({
  type: "assistant_message_failed",
  messageId: failedAssistantMessageId,
  errorText: error instanceof Error ? error.message : String(error),
});
```

## Assistant Runtime Flow

Source file:

`packages/engine/src/runtime.ts`

The runtime is provider-independent. It does not know about React. It knows how
to run assistant turns and emit typed assistant events.

### Runtime Class

```ts
export class AssistantConversationRuntime implements AssistantConversationRunner {
  readonly conversationTurnProvider: ConversationTurnProvider;
  readonly workspaceRootPath: string;
  readonly promptContextBrowseRootPath: string;
  readonly promptContextStartingDirectoryPath: string;
  readonly workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
  readonly conversationHistory: InMemoryConversationHistory;
  currentPendingConversationTurn: RuntimeConversationTurn | undefined;
```

It owns:

- the provider, currently OpenAI
- workspace paths
- shell command executor
- in-memory conversation history
- currently running turn, if any

### Only One Turn At A Time

```ts
startConversationTurn(input: ConversationTurnRequest): ActiveConversationTurn {
  if (this.currentPendingConversationTurn && !this.currentPendingConversationTurn.hasFinishedTurn()) {
    throw new Error("A conversation turn is already running");
  }
```

The runtime rejects concurrent assistant turns.

### Runtime Turn Setup

Inside `streamAssistantResponseEvents()`:

```ts
const conversationTurnStartedAtMilliseconds = Date.now();
const modelFacingPromptText = await buildModelFacingPromptTextFromPromptContextReferences({
  promptText: this.conversationTurnInput.userPromptText,
  promptContextBrowseRootPath: this.promptContextBrowseRootPath,
  promptContextStartingDirectoryPath: this.promptContextStartingDirectoryPath,
});
```

Then the runtime appends the user prompt to history:

```ts
this.conversationHistory.appendConversationSessionEntry({
  entryKind: "user_prompt",
  promptText: this.conversationTurnInput.userPromptText,
  modelFacingPromptText,
});
```

Then it starts the provider turn:

```ts
const providerConversationTurn = this.conversationTurnProvider.startConversationTurn({
  systemPromptText: buildBuliSystemPrompt({
    workspaceRootPath: this.workspaceRootPath,
    assistantOperatingMode: this.assistantOperatingMode,
  }),
  conversationSessionEntries: this.conversationHistory.listConversationSessionEntries(),
  modelContextItems: this.conversationHistory.listModelContextItems(),
  selectedModelId: this.conversationTurnInput.selectedModelId,
  ...(this.conversationTurnInput.selectedReasoningEffort
    ? { selectedReasoningEffort: this.conversationTurnInput.selectedReasoningEffort }
    : {}),
});
```

The system prompt is built per turn.

## System Prompt

Source file:

`packages/engine/src/systemPrompt.ts`

```ts
export function buildBuliSystemPrompt(input: {
  workspaceRootPath: string;
  assistantOperatingMode?: AssistantOperatingMode;
}): string {
  return [
    [
      "Identity:",
      "You are buli, Lukasz Bulinski's local learning-first software engineering partner working inside the user's current workspace.",
      `Current workspace root: ${input.workspaceRootPath}`,
    ].join("\n"),
```

The current system prompt defines:

- identity
- default workflow
- decision support
- learning partnership rules
- agreement-before-apply posture
- communication style
- execution style
- safety posture

Important current behavior: repo instruction files are loaded into this prompt
at turn start. `buli` supports `AGENTS.md`, `CLAUDE.md`, and `BULI.md` under the
workspace root for the initial prompt, and nested files with those names are
discovered later when tools read paths inside those directories. The base prompt
is otherwise mostly stable except for the workspace root and current mode overlay.

## Runtime Event Sequence

The runtime first emits:

```ts
yield AssistantTurnStartedEventSchema.parse({
  type: "assistant_turn_started",
  messageId: assistantResponseMessageId,
  startedAtMs: conversationTurnStartedAtMilliseconds,
});
```

Then it loops over provider events:

```ts
for await (const providerStreamEvent of providerConversationTurn.streamProviderEvents()) {
```

Provider event types are defined in:

`packages/contracts/src/provider.ts`

```ts
export const ProviderStreamEventSchema = z.discriminatedUnion("type", [
  ProviderTextChunkEventSchema,
  ProviderCompletedEventSchema,
  ProviderIncompleteEventSchema,
  ProviderReasoningSummaryStartedEventSchema,
  ProviderReasoningSummaryTextChunkEventSchema,
  ProviderReasoningSummaryCompletedEventSchema,
  ProviderToolCallRequestedEventSchema,
  ProviderRateLimitPendingEventSchema,
  ProviderPlanProposedEventSchema,
]);
```

Assistant response event types are defined in:

`packages/contracts/src/events.ts`

```ts
export const AssistantResponseEventSchema = z.discriminatedUnion("type", [
  AssistantTurnStartedEventSchema,
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantPendingToolApprovalRequestedEventSchema,
  AssistantPendingToolApprovalClearedEventSchema,
  AssistantMessageCompletedEventSchema,
  AssistantMessageIncompleteEventSchema,
  AssistantMessageFailedEventSchema,
]);
```

## OpenAI Provider Flow

### Provider Creation

Source file:

`packages/openai/src/provider/client.ts`

```ts
export class OpenAiProvider {
  readonly endpoint: string;
  readonly store: OpenAiAuthStore;
  readonly fetchImpl: typeof fetch;
```

The provider owns:

- Responses API endpoint
- auth store
- `fetch` implementation

The default endpoint is:

`packages/openai/src/auth/constants.ts`

```ts
export const OPENAI_CODEX_API_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
```

### Starting A Provider Turn

Source file:

`packages/openai/src/provider/client.ts`

```ts
startConversationTurn(input: OpenAiConversationTurnRequest): OpenAiProviderConversationTurn {
  return new OpenAiProviderConversationTurn({
    endpoint: this.endpoint,
    fetchImpl: this.fetchImpl,
    loadRequestHeaders: async () => {
      const auth = await loadOpenAiAuth({
        store: this.store,
        fetchImpl: this.fetchImpl,
      });

      const headers = createRequestHeaders(auth, "text/event-stream");
      headers.set("Content-Type", "application/json");
      return headers;
    },
```

The provider turn lazily loads request headers so auth can be refreshed when the
request actually happens.

## OpenAI Request Construction

Source file:

`packages/openai/src/provider/turnSession.ts`

```ts
function createHttpRequestBody(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  systemPromptText: string;
  openAiInputItems: ReadonlyArray<OpenAiConversationInputItem>;
}) {
  return {
    model: input.selectedModelId,
    instructions: input.systemPromptText,
    store: false,
    input: input.openAiInputItems,
    tools: [createBashToolDefinition()],
    parallel_tool_calls: false,
    ...(shouldIncludeReasoningEncryptedContent(input) ? { include: ["reasoning.encrypted_content"] } : {}),
    ...(input.selectedReasoningEffort ? { reasoning: { effort: input.selectedReasoningEffort } } : {}),
    stream: true,
  };
}
```

The request body includes:

- selected model
- system prompt as `instructions`
- reconstructed conversation as `input`
- the local `bash` tool definition
- `parallel_tool_calls: false`
- streaming enabled
- optional reasoning effort
- optional `reasoning.encrypted_content` include

### Current Tool Surface

Source file:

`packages/openai/src/provider/toolDefinitions.ts`

```ts
export function createBashToolDefinition() {
  return {
    type: "function",
    name: "bash",
    description: "Run a shell command inside the current workspace and return stdout, stderr, and the exit code.",
```

Only `bash` is currently exposed to OpenAI.

The UI has cards for other tool kinds, but the current OpenAI provider does not
send definitions for `read`, `grep`, `edit`, `todowrite`, or `task`.

## Conversation History

Runtime history is in-memory only.

Source file:

`packages/engine/src/conversationHistory.ts`

```ts
export class InMemoryConversationHistory {
  readonly conversationSessionEntries: ConversationSessionEntry[];
  readonly modelContextItems: ModelContextItem[];
```

Appending a history entry also appends model-context projections:

```ts
appendConversationSessionEntry(conversationSessionEntry: ConversationSessionEntry): void {
  this.conversationSessionEntries.push(conversationSessionEntry);
  this.modelContextItems.push(...projectConversationSessionEntryToModelContextItems(conversationSessionEntry));
}
```

The canonical history entry shapes live in:

`packages/contracts/src/conversationSessionEntry.ts`

```ts
export const ConversationSessionEntrySchema = z.discriminatedUnion("entryKind", [
  UserPromptConversationSessionEntrySchema,
  AssistantMessageConversationSessionEntrySchema,
  ToolCallConversationSessionEntrySchema,
  CompletedToolResultConversationSessionEntrySchema,
  FailedToolResultConversationSessionEntrySchema,
  DeniedToolResultConversationSessionEntrySchema,
]);
```

Supported history entries are:

- `user_prompt`
- `assistant_message`
- `tool_call`
- `completed_tool_result`
- `failed_tool_result`
- `denied_tool_result`

### Projecting History For The Model

Source file:

`packages/engine/src/conversationHistoryProjection.ts`

```ts
if (conversationSessionEntry.entryKind === "user_prompt") {
  return [
    {
      itemKind: "user_message",
      messageText: conversationSessionEntry.modelFacingPromptText,
    },
  ];
}
```

The runtime keeps separate historical entries, then projects them into simpler
model-context items.

The OpenAI provider separately reconstructs actual OpenAI request input from the
session entries.

Source file:

`packages/openai/src/provider/request.ts`

```ts
export function createOpenAiResponsesInputItems(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): OpenAiConversationInputItem[] {
```

This function turns Buli history into OpenAI input items.

## OpenAI Streaming Parser

Source file:

`packages/openai/src/provider/stream.ts`

The provider receives Server-Sent Events from OpenAI.

The parser reads SSE frames:

```ts
async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
```

Then it switches on OpenAI event names:

```ts
switch (value.type) {
  case "response.output_text.delta": {
    yield createProviderTextChunkEvent(value.delta);
    continue;
  }
```

The parser translates provider-specific OpenAI events into Buli provider events.

Examples:

| OpenAI event | Buli provider event |
| --- | --- |
| `response.output_text.delta` | `text_chunk` |
| `response.reasoning_summary_text.delta` | `reasoning_summary_text_chunk` |
| `response.function_call_arguments.done` | maybe `tool_call_requested` |
| `response.completed` | `completed` or terminal tool-call state |
| `response.incomplete` | `incomplete` or terminal tool-call state |

### Tool Calls Are Special

For tool calls, `parseOpenAiStream(...)` can return a terminal state instead of
ending the whole provider turn.

```ts
type OpenAiResponseStepToolCallRequestedState = {
  terminalKind: "tool_call_requested";
  toolCallId: string;
  toolCallRequest: ToolCallRequest;
  responseOutputItems: unknown[];
};
```

That tells `OpenAiProviderConversationTurn`:

1. This OpenAI step ended because a tool is needed.
2. Do not finish the assistant turn yet.
3. Wait for the local tool result.
4. Send a continuation request with `function_call_output`.

## OpenAI Tool Continuation Loop

Source file:

`packages/openai/src/provider/turnSession.ts`

The provider turn runs in a `while (true)` loop:

```ts
while (true) {
  const requestBody = createHttpRequestBody(...);
  const response = await this.fetchImpl(this.endpoint, ...);
  const openAiStepEventIterator = parseOpenAiStream(response)[Symbol.asyncIterator]();
```

If the step requests a tool:

```ts
if (terminalState.terminalKind === "tool_call_requested") {
  const responseReplayItems = createOpenAiResponseReplayItems(terminalState.responseOutputItems);
```

The provider captures replay-safe OpenAI items, waits for local tool output, and
adds a `function_call_output` item:

```ts
const toolResultSubmission = await this.waitForToolResultSubmission(terminalState.toolCallId);
const functionCallOutputInputItem = createFunctionCallOutputInputItem(
  toolResultSubmission.toolCallId,
  toolResultSubmission.toolResultText,
);
this.openAiConversationInputItems.push(functionCallOutputInputItem);
this.providerTurnReplayInputItems.push(functionCallOutputInputItem);
continue;
```

Then the loop sends the next `/responses` request.

If the step completes without a tool request, the provider turn returns.

## Assistant Text Flow

Assistant prose is streamed as text chunks.

The runtime converts those chunks into one `assistant_text` message part that is
updated over time.

Source file:

`packages/engine/src/runtime.ts`

```ts
if (providerStreamEvent.type === "text_chunk") {
  assistantTextMessagePartBuilderState = appendAssistantTextDeltaToAssistantTextMessagePartBuilder(
    assistantTextMessagePartBuilderState,
    providerStreamEvent.text,
  );

  const assistantTextConversationMessagePart = buildStreamingAssistantTextConversationMessagePart(
    assistantTextMessagePartBuilderState,
  );
```

The first text chunk adds a part. Later chunks update the same part:

```ts
yield (hasEmittedAssistantTextMessagePart
  ? AssistantMessagePartUpdatedEventSchema
  : AssistantMessagePartAddedEventSchema
).parse({
  type: hasEmittedAssistantTextMessagePart ? "assistant_message_part_updated" : "assistant_message_part_added",
  messageId: assistantResponseMessageId,
  part: assistantTextConversationMessagePart,
});
```

### Text Part Builder

Source file:

`packages/engine/src/assistantTextMessagePartBuilder.ts`

The builder keeps only the raw markdown text plus bookkeeping for splitting
internal mode-scope tags out of the stream:

```ts
export type AssistantTextMessagePartBuilderState = {
  partId: string;
  rawMarkdownText: string;
  pendingPossibleInternalModeScopeTagFragment: string;
};
```

On each delta it normalizes line endings (CRLF to LF), strips complete internal
mode-scope tags from the visible stream, holds back a trailing fragment that
might be the start of such a tag, and appends the remaining visible delta to
`rawMarkdownText`. There is no incremental block extraction and no typed
content-part tree: the engine stores the full markdown string and the TUI parses
structure at render time.

The message part it produces carries that raw markdown plus a `partStatus`:

```ts
export const AssistantTextConversationMessagePartSchema = z
  .object({
    id: z.string().min(1),
    partKind: z.literal("assistant_text"),
    partStatus: AssistantTextPartStatusSchema,
    rawMarkdownText: z.string(),
  })
  .strict();
```

Defined in `packages/contracts/src/conversationMessagePart.ts`. Markdown
structure (paragraphs, lists, code fences, tables) is produced by OpenTUI's
incremental markdown parser in the TUI — see the Assistant Text Rendering
section below.

## Reasoning Flow

OpenAI can stream reasoning summary text.

Source file:

`packages/openai/src/provider/stream.ts`

```ts
case "response.reasoning_summary_text.delta": {
  if (!isReasoningSummaryInProgress) {
    reasoningStartedAtMs = performance.now();
    isReasoningSummaryInProgress = true;
    yield createProviderReasoningSummaryStartedEvent();
  }
  yield createProviderReasoningSummaryTextChunkEvent(value.delta);
  continue;
}
```

The runtime turns that into an `assistant_reasoning` message part.

Source file:

`packages/engine/src/runtime.ts`

```ts
if (providerStreamEvent.type === "reasoning_summary_started") {
  currentReasoningPartId = randomUUID();
  currentReasoningSummaryText = "";
  currentReasoningStartedAtMs = Date.now();
  yield AssistantMessagePartAddedEventSchema.parse({
    type: "assistant_message_part_added",
    messageId: assistantResponseMessageId,
    part: AssistantReasoningConversationMessagePartSchema.parse({
      id: currentReasoningPartId,
      partKind: "assistant_reasoning",
      partStatus: "streaming",
      reasoningSummaryText: "",
      reasoningStartedAtMs: currentReasoningStartedAtMs,
    }),
  });
  continue;
}
```

While reasoning is streaming, the part is updated with more summary text.

When reasoning ends, the part status becomes `completed`.

The renderer chooses the component based on status.

Source file:

`packages/tui/src/components/messageParts/ReasoningPartView.tsx`

```tsx
if (props.assistantReasoningConversationMessagePart.partStatus === "streaming") {
  return <ThinkingStatusLine ... />;
}

return <ReasoningCollapsedChip ... />;
```

So the visible behavior is:

1. Reasoning starts as a live `Thinking` status line.
2. Reasoning summary text stays in state but is not printed live.
3. When done, it collapses into a compact chip.
4. After the final usage arrives, token count can be backfilled.

## Bash Tool Flow

Current real tool support is `bash`.

### Tool Request From OpenAI

OpenAI emits function-call arguments.

Source file:

`packages/openai/src/provider/stream.ts`

```ts
function createToolCallRequest(toolCallState: PendingFunctionCallState): ToolCallRequest {
  if (toolCallState.toolName !== "bash") {
    throw new Error(`Unsupported tool requested by OpenAI: ${toolCallState.toolName}`);
  }

  const parsedArguments = JSON.parse(toolCallState.argumentsText) as {
    command?: string;
    description?: string;
    workdir?: string | null;
    timeout?: number | null;
  };
```

The provider converts OpenAI arguments into Buli's typed request:

```ts
return {
  toolName: "bash",
  shellCommand: parsedArguments.command,
  commandDescription: parsedArguments.description,
  ...(typeof parsedArguments.workdir === "string" ? { workingDirectoryPath: parsedArguments.workdir } : {}),
  ...(typeof parsedArguments.timeout === "number" ? { timeoutMilliseconds: parsedArguments.timeout } : {}),
};
```

The tool request type is defined in:

`packages/contracts/src/toolCallRequest.ts`

```ts
export const BashToolCallRequestSchema = z
  .object({
    toolName: z.literal("bash"),
    shellCommand: z.string().min(1),
    commandDescription: z.string().min(1),
    workingDirectoryPath: z.string().min(1).optional(),
    timeoutMilliseconds: z.number().int().positive().optional(),
  })
  .strict();
```

### Runtime Tool Handling

Source file:

`packages/engine/src/runtime.ts`

```ts
if (providerStreamEvent.type === "tool_call_requested") {
  yield* this.handleRequestedToolCall({
    assistantResponseMessageId,
    providerConversationTurn,
    toolCallId: providerStreamEvent.toolCallId,
    toolCallRequest: providerStreamEvent.toolCallRequest,
  });
  continue;
}
```

The runtime records the tool call in history:

```ts
this.conversationHistory.appendConversationSessionEntry({
  entryKind: "tool_call",
  toolCallId: input.toolCallId,
  toolCallRequest: input.toolCallRequest,
});
```

Then it classifies approval risk:

```ts
const bashToolApprovalDecision = classifyBashToolApprovalRequirement(bashToolCallRequest);
```

### Approval Policy

Source file:

`packages/engine/src/tools/bashToolApprovalPolicy.ts`

Safe read-only commands can auto-run:

```ts
const SAFE_READ_ONLY_COMMAND_NAMES = new Set([
  "basename",
  "cat",
  "cut",
  "date",
  "df",
  "dirname",
  "du",
  "echo",
  "file",
  "grep",
  "head",
  "id",
  "jq",
  "ls",
  "printenv",
  "printf",
  "ps",
  "pwd",
  "readlink",
  "realpath",
  "rg",
  "shasum",
  "sort",
  "stat",
  "tail",
  "tree",
  "tr",
  "uname",
  "uniq",
  "wc",
  "which",
  "whoami",
]);
```

Commands that can mutate files require approval:

```ts
const FILESYSTEM_MUTATION_COMMAND_NAMES = new Set([
  "chmod",
  "chown",
  "cp",
  "dd",
  "install",
  "ln",
  "mkdir",
  "mktemp",
  "mv",
  "rm",
  "rmdir",
  "touch",
  "truncate",
  "unlink",
]);
```

Ambiguous shell syntax can also require approval:

```ts
if (shellCommand.includes("||") || shellCommand.includes(";")) {
  return requiresUserApproval(
    "ambiguous_shell_syntax",
    "This bash command uses shell control flow that is not classified as safe, so it still requires explicit user approval.",
  );
}
```

Important behavior: this is runtime enforcement. It is not just a prompt
instruction.

### Tool Call Part Rendering State

The runtime emits an `assistant_tool_call` part.

If approval is required, initial status is `pending_approval`:

```ts
part: AssistantToolCallConversationMessagePartSchema.parse({
  id: toolCallPartId,
  partKind: "assistant_tool_call",
  toolCallId: input.toolCallId,
  toolCallStatus: "pending_approval",
  toolCallStartedAtMs,
  toolCallDetail: startedToolCallDetail,
}),
```

If auto-run is allowed, initial status is `running`.

The part type is defined in:

`packages/contracts/src/conversationMessagePart.ts`

```ts
export const AssistantToolCallPartStatusSchema = z.enum([
  "pending_approval",
  "running",
  "completed",
  "failed",
  "denied",
]);
```

## Tool Approval Flow

Tool approval has two pieces of state.

The transcript has a tool-call message part:

```text
assistant_tool_call with toolCallStatus = "pending_approval"
```

The global chat session has a pending approval request:

```text
pendingToolApprovalRequest
```

The pending approval request shape lives in:

`packages/contracts/src/pendingToolApprovalRequest.ts`

```ts
export const PendingToolApprovalRequestSchema = z
  .object({
    approvalId: z.string().min(1),
    pendingToolCallId: z.string().min(1),
    pendingToolCallDetail: ToolCallDetailSchema,
    riskExplanation: z.string().min(1),
  })
  .strict();
```

### Runtime Creates Approval

Source file:

`packages/engine/src/runtime.ts`

```ts
const { approvalId, approvalDecisionPromise } = this.createPendingToolApproval({
  toolCallId: input.toolCallId,
  toolCallRequest: bashToolCallRequest,
});
yield AssistantPendingToolApprovalRequestedEventSchema.parse({
  type: "assistant_pending_tool_approval_requested",
  approvalRequest: {
    approvalId,
    pendingToolCallId: input.toolCallId,
    pendingToolCallDetail: startedToolCallDetail,
    riskExplanation: bashToolApprovalDecision.riskExplanation,
  },
});
const approvalDecision = await approvalDecisionPromise;
```

The runtime pauses here until the user approves or denies.

### Reducer Applies Approval State

Source file:

`packages/chat-session-state/src/assistantTurnEventReducer.ts`

```ts
if (assistantResponseEvent.type === "assistant_pending_tool_approval_requested") {
  return {
    ...chatSessionState,
    conversationTurnStatus: "waiting_for_tool_approval",
    pendingToolApprovalRequest: assistantResponseEvent.approvalRequest,
  };
}
```

Now the app is waiting for approval, and input is disabled.

### UI Renders Approval Block

Source file:

`packages/tui/src/ChatScreen.tsx`

```tsx
{chatSessionState.pendingToolApprovalRequest ? (
  <ToolApprovalRequestBlock
    pendingToolCallDetail={chatSessionState.pendingToolApprovalRequest.pendingToolCallDetail}
    riskExplanation={chatSessionState.pendingToolApprovalRequest.riskExplanation}
  />
) : null}
```

Source file:

`packages/tui/src/components/behavior/ToolApprovalRequestBlock.tsx`

```tsx
<SurfaceCard
  accentColor={chatScreenTheme.accentAmber}
  headerLeft={... risk explanation and <ApprovalDecisionControl ... /> ...}
/>
```

The approval block is not another transcript row. It is a bottom control surface. The visible buttons collect mouse decisions, and the keyboard reducer also maps `Y` to approve and `N` to deny while approval is pending.

### User Presses `y` Or `n`

Source file:

`packages/chat-session-state/src/chatSessionKeyboardInteraction.ts`

```ts
if (chatSessionKeyboardInput.textInput?.toLowerCase() === "y") {
  return createChatSessionKeyboardInteraction({
    nextChatSessionState: chatSessionState,
    shouldConsumeKeyboardInput: true,
    chatSessionKeyboardEffect: {
      effectType: "submit_pending_tool_approval_decision",
      decision: "approved",
      source: "keyboard",
    },
  });
}

if (chatSessionKeyboardInput.textInput?.toLowerCase() === "n") {
  // Same effect shape, with decision: "denied".
}
```

The reducer does not run the command itself. It returns a typed keyboard effect, and the TUI action hook submits that decision to the active runtime turn.

### Runtime Continues After Decision

If denied:

```ts
const denialText = "The user denied this bash command, so it was not executed.";
this.conversationHistory.appendConversationSessionEntry({
  entryKind: "denied_tool_result",
  toolCallId: input.toolCallId,
  toolCallDetail: startedToolCallDetail,
  toolResultText: denialText,
  denialExplanation: denialText,
});
```

Then it sends the denial text back to OpenAI as the tool result:

```ts
await input.providerConversationTurn.submitToolResult({
  toolCallId: input.toolCallId,
  toolResultText: denialText,
});
```

If approved, the tool call part changes to `running`, then the shell command is
executed.

## Bash Execution Flow

Source file:

`packages/engine/src/tools/bashTool.ts`

```ts
export async function runApprovedBashToolCall(input: {
  bashToolCallRequest: BashToolCallRequest;
  workspaceRootPath: string;
  workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
}): Promise<BashToolCallOutcome> {
```

The tool resolves the working directory:

```ts
const workingDirectoryPath = resolveBashWorkingDirectoryPath({
  workspaceRootPath: input.workspaceRootPath,
  requestedWorkingDirectoryPath: input.bashToolCallRequest.workingDirectoryPath,
});
```

The working directory must stay inside the workspace root:

```ts
if (
  resolvedWorkingDirectoryPath !== workspaceRootPath &&
  !resolvedWorkingDirectoryPath.startsWith(`${workspaceRootPath}${sep}`)
) {
  throw new Error(`Working directory must stay inside the workspace root: ${workspaceRootPath}`);
}
```

The actual execution is delegated to:

`packages/engine/src/tools/workspaceShellCommandExecutor.ts`

```ts
const childProcess = spawn(this.shellExecutablePath, ["-lc", input.shellCommand], {
  cwd: input.workingDirectoryPath,
  env: process.env,
});
```

It captures:

- exit code
- stdout
- stderr

Then `bashTool.ts` builds two outputs:

1. `toolCallDetail` for the UI.
2. `toolResultText` for the model.

The UI output is truncated by lines:

```ts
const MAX_RENDERED_OUTPUT_LINES = 120;
```

The model-visible result is truncated by characters:

```ts
const MAX_MODEL_VISIBLE_OUTPUT_CHARACTERS = 12_000;
```

### Completed Tool Result

If the process completes, even with non-zero exit code, the tool outcome is
`completed` from the runtime's perspective:

```ts
return {
  outcomeKind: "completed",
  toolCallDetail,
  toolResultText: buildModelVisibleBashToolResultText(...),
  durationMilliseconds: Date.now() - startedAtMilliseconds,
};
```

The UI may color non-zero exit as error, but the subprocess still completed.

### Failed Tool Result

If execution fails before completion, for example timeout or invalid working
directory, the outcome is `failed`:

```ts
return {
  outcomeKind: "failed",
  toolCallDetail: startedToolCallDetail,
  failureExplanation,
  toolResultText: `Command execution failed before completion: ${failureExplanation}`,
  durationMilliseconds: Date.now() - startedAtMilliseconds,
};
```

## Chat State Reducer Flow

All assistant events enter the TUI through this callback:

Source file:

`packages/tui/src/ChatScreen.tsx`

```ts
const applyIncomingAssistantResponseEventsToChatScreen = useEffectEvent((assistantResponseEvents: readonly AssistantResponseEvent[]) => {
  startTransition(() => {
    setChatSessionState((currentChatSessionState) =>
      applyAssistantResponseEventsToChatSessionState(currentChatSessionState, assistantResponseEvents),
    );
  });
});
```

The reducer lives in:

`packages/chat-session-state/src/assistantTurnEventReducer.ts`

### Assistant Turn Started

```ts
if (assistantResponseEvent.type === "assistant_turn_started") {
  return appendConversationMessageIfMissing({
    chatSessionState: {
      ...chatSessionState,
      conversationTurnStatus: "streaming_assistant_response",
      latestTokenUsage: undefined,
      pendingToolApprovalRequest: undefined,
    },
    conversationMessage: {
      id: assistantResponseEvent.messageId,
      role: "assistant",
      messageStatus: "streaming",
      createdAtMs: assistantResponseEvent.startedAtMs,
      partIds: [],
    },
  });
}
```

This creates an assistant message with no parts yet.

### Message Part Added Or Updated

```ts
if (assistantResponseEvent.type === "assistant_message_part_added") {
  return upsertConversationMessagePart({
    chatSessionState,
    messageId: assistantResponseEvent.messageId,
    conversationMessagePart: assistantResponseEvent.part,
  });
}
```

Parts are normalized in `conversationMessagePartsById`, and the message stores
part ids.

### Completed

```ts
if (assistantResponseEvent.type === "assistant_message_completed") {
  return backfillCompletedReasoningPartTokenCountForMessage(
    backfillAssistantTurnSummaryUsageForMessage(
      updateConversationMessage({
        chatSessionState: {
          ...chatSessionState,
          conversationTurnStatus: "waiting_for_user_input",
          latestTokenUsage: assistantResponseEvent.usage,
          pendingToolApprovalRequest: undefined,
        },
```

Completion:

- marks assistant message as completed
- returns global status to `waiting_for_user_input`
- updates latest token usage
- clears pending approval
- backfills usage into the turn footer
- backfills reasoning token counts

### Incomplete

Incomplete turns:

- mark the assistant message incomplete
- mark assistant text parts incomplete
- append an incomplete notice if missing
- return to waiting for user input
- keep partial content visible

### Failed

Failed turns:

- mark the assistant message failed
- mark assistant text parts failed
- append an error notice if missing
- set `conversationTurnStatus` to `assistant_response_failed`
- clear pending approval

The input is usable after failure because input disabling only blocks streaming,
tool approval, and model selection.

## Message And Part Data Model

Source file:

`packages/contracts/src/conversationMessage.ts`

```ts
export const ConversationMessageSchema = z
  .object({
    id: z.string().min(1),
    role: ConversationMessageRoleSchema,
    messageStatus: ConversationMessageStatusSchema,
    createdAtMs: z.number().int().nonnegative(),
    partIds: z.array(z.string().min(1)),
  })
  .strict();
```

A message is an envelope. It has a role, status, and ordered part ids.

Source file:

`packages/contracts/src/conversationMessagePart.ts`

```ts
export const ConversationMessagePartSchema = z.discriminatedUnion("partKind", [
  UserTextConversationMessagePartSchema,
  AssistantTextConversationMessagePartSchema,
  AssistantReasoningConversationMessagePartSchema,
  AssistantToolCallConversationMessagePartSchema,
  AssistantPlanProposalConversationMessagePartSchema,
  AssistantRateLimitNoticeConversationMessagePartSchema,
  AssistantIncompleteNoticeConversationMessagePartSchema,
  AssistantErrorNoticeConversationMessagePartSchema,
  AssistantTurnSummaryConversationMessagePartSchema,
]);
```

Parts are the actual renderable pieces.

This shape lets one assistant message contain multiple things over time:

```text
assistant message
  -> reasoning part
  -> text part
  -> bash tool-call part
  -> more text part updates
  -> turn footer
```

## Transcript Rendering Flow

Source file:

`packages/tui/src/components/ConversationMessageList.tsx`

```tsx
{props.conversationMessages.map((conversationMessage, index) => (
  <box flexDirection="column" key={conversationMessage.id} marginTop={index === 0 ? 0 : 1} width="100%">
    <MemoizedConversationMessageRow
      conversationMessage={conversationMessage}
      conversationMessageParts={props.resolveConversationMessageParts(conversationMessage.id)}
    />
  </box>
))}
```

`ConversationMessageList` renders ordered messages.

The selectors that supply ordering live in:

`packages/chat-session-state/src/chatSessionSelectors.ts`

```ts
export function listOrderedConversationMessages(chatSessionState: ChatSessionState): ConversationMessage[] {
  return chatSessionState.orderedConversationMessageIds.flatMap((messageId) => {
    const conversationMessage = chatSessionState.conversationMessagesById[messageId];
    return conversationMessage ? [conversationMessage] : [];
  });
}
```

```ts
export function listOrderedConversationMessageParts(
  chatSessionState: ChatSessionState,
  messageId: string,
): ConversationMessagePart[] {
```

Messages and parts are normalized in state, then denormalized for rendering.

## Component Dispatch By Part Kind

Source file:

`packages/tui/src/components/ConversationMessageRow.tsx`

This is the main place where transcript message parts become components.

```tsx
if (conversationMessagePart.partKind === "user_text") {
  return <UserPromptBlock promptText={conversationMessagePart.text} />;
}
if (conversationMessagePart.partKind === "assistant_text") {
  return <AssistantTextPartView assistantTextConversationMessagePart={conversationMessagePart} />;
}
if (conversationMessagePart.partKind === "assistant_reasoning") {
  return <ReasoningPartView assistantReasoningConversationMessagePart={conversationMessagePart} />;
}
if (conversationMessagePart.partKind === "assistant_tool_call") {
  return <ToolCallPartView assistantToolCallConversationMessagePart={conversationMessagePart} />;
}
```

The full dispatch table is:

| Part kind | Component | Meaning |
| --- | --- | --- |
| `user_text` | `UserPromptBlock` | Submitted user prompt. |
| `assistant_text` | `AssistantTextPartView` | Assistant prose/code/markdown. |
| `assistant_reasoning` | `ReasoningPartView` | Reasoning summary lifecycle. |
| `assistant_tool_call` | `ToolCallPartView` | Tool execution status and details. |
| `assistant_plan_proposal` | `PlanProposalBlock` | Planned provider event type, not currently emitted by OpenAI parser. |
| `assistant_rate_limit_notice` | `RateLimitNoticeBlock` | Provider rate-limit wait notice. |
| `assistant_incomplete_notice` | `IncompleteResponseNoticeBlock` | Response stopped early. |
| `assistant_error_notice` | `ErrorBannerBlock` | Turn failed. |
| `assistant_turn_summary` | `TurnFooter` | Duration, model, token usage. |

## Assistant Text Rendering

Source file:

`packages/tui/src/components/messageParts/AssistantTextPartView.tsx`

```tsx
const markdownText = props.assistantTextConversationMessagePart.rawMarkdownText;
const hasMarkdownText = markdownText.length > 0;
```

Assistant text carries a single `rawMarkdownText` string plus a `partStatus`.
There is no typed content-part tree: the message part holds the full markdown
source, streaming or complete.

When there is markdown text, the whole string is handed to one markdown block:

```tsx
<AssistantMarkdownBlock
  markdownText={markdownText}
  isStreaming={props.assistantTextConversationMessagePart.partStatus === "streaming"}
/>
```

When there is no text yet, it shows a waiting placeholder:

```tsx
return <text fg={chatScreenTheme.textDim}>Waiting for model output...</text>;
```

## Markdown Rendering

Source file:

`packages/tui/src/components/primitives/AssistantMarkdownBlock.tsx`

The entire assistant text part is rendered by a single OpenTUI `<markdown>`
element rather than a React component-per-content-kind dispatch. OpenTUI's
incremental parser and in-place block reconciliation handle the structure
(paragraphs, headings, lists, tables, code fences); buli-specific chrome is
applied through a custom `renderNode`:

```tsx
<markdown
  content={formatAssistantMarkdownTaskListMarkers(
    prepareAssistantMarkdownTextForRendering(props.markdownText, props.isStreaming),
  )}
  renderNode={assistantMarkdownUnifiedRenderNode}
  streaming={true}
  ...
/>
```

The custom render node lives in
`packages/tui/src/components/primitives/assistantMarkdownUnifiedRenderNode.ts`
and decorates fences, diffs, callouts, and prose. The block always renders in
streaming mode — finalizing on completion would re-render the whole tree just
to settle a trailing block whose content has already stopped changing.

This is the answer to “how does the agent decide which component to render?”

It does not decide directly. The model emits markdown text; OpenTUI parses it
and the unified render node applies buli's styling per block.

## Tool Card Dispatch

Source file:

`packages/tui/src/components/messageParts/ToolCallPartView.tsx`

```ts
function resolveToolCallRenderState(toolCallStatus: AssistantToolCallConversationMessagePart["toolCallStatus"]):
  | "streaming"
  | "completed"
  | "failed" {
  if (toolCallStatus === "completed") {
    return "completed";
  }

  if (toolCallStatus === "failed" || toolCallStatus === "denied") {
    return "failed";
  }

  return "streaming";
}
```

Tool-call statuses are normalized into three render states:

- streaming
- completed
- failed

Then `ToolCallEntryView` dispatches by `toolName`.

Source file:

`packages/tui/src/components/toolCalls/ToolCallEntryView.tsx`

```tsx
if (toolCallDetail.toolName === "bash") {
  return (
    <BashToolCallCard
      renderState={props.renderState}
      toolCallDetail={toolCallDetail}
      ...
    />
  );
}
```

Dispatch table:

| Tool detail kind | Component | Current provider support |
| --- | --- | --- |
| `bash` | `BashToolCallCard` | Yes |
| `read` | `ReadToolCallCard` | UI only today |
| `grep` | `GrepToolCallCard` | UI only today |
| `edit` | `EditToolCallCard` | UI only today |
| `todowrite` | `TodoWriteToolCallCard` | UI only today |
| `task` | `TaskToolCallCard` | UI only today |

## Bash Tool Card Rendering

Source file:

`packages/tui/src/components/toolCalls/BashToolCallCard.tsx`

The bash card chooses color by render state and exit code:

```ts
function deriveBashAccentColor(props: BashToolCallCardProps): string {
  if (props.renderState === "failed") {
    return chatScreenTheme.accentRed;
  }
  if (props.renderState === "streaming") {
    return chatScreenTheme.accentAmber;
  }
  if (props.toolCallDetail.exitCode !== undefined && props.toolCallDetail.exitCode !== 0) {
    return chatScreenTheme.accentRed;
  }
  return chatScreenTheme.accentGreen;
}
```

Completed exit `1` is visually red, but it is still a completed subprocess.

Output is rendered through `ShellBlock`:

```tsx
return <ShellBlock maxVisibleLines={MAX_VISIBLE_BASH_OUTPUT_LINES} outputLines={outputLines} />;
```

## Completion Flow

When the provider emits `completed`, the runtime first appends a turn summary:

Source file:

`packages/engine/src/runtime.ts`

```ts
yield AssistantMessagePartAddedEventSchema.parse({
  type: "assistant_message_part_added",
  messageId: assistantResponseMessageId,
  part: AssistantTurnSummaryConversationMessagePartSchema.parse({
    id: randomUUID(),
    partKind: "assistant_turn_summary",
    turnDurationMs: Date.now() - conversationTurnStartedAtMilliseconds,
    modelDisplayName: this.conversationTurnInput.selectedModelId,
  }),
});
```

Then it finalizes assistant text if text was emitted:

```ts
if (hasEmittedAssistantTextMessagePart) {
  yield AssistantMessagePartUpdatedEventSchema.parse({
    type: "assistant_message_part_updated",
    messageId: assistantResponseMessageId,
    part: buildCompletedAssistantTextConversationMessagePart(assistantTextMessagePartBuilderState),
  });
}
```

Then it stores the assistant message in runtime history:

```ts
const providerTurnReplay = providerConversationTurn.getProviderTurnReplay();
this.conversationHistory.appendConversationSessionEntry({
  entryKind: "assistant_message",
  assistantMessageText: assistantTextMessagePartBuilderState.rawMarkdownText,
  ...(providerTurnReplay ? { providerTurnReplay } : {}),
});
```

Finally it emits completion:

```ts
yield AssistantMessageCompletedEventSchema.parse({
  type: "assistant_message_completed",
  messageId: assistantResponseMessageId,
  usage: providerStreamEvent.usage,
});
```

The reducer marks the message completed and returns the app to
`waiting_for_user_input`.

## Incomplete Flow

If OpenAI emits `incomplete`, the runtime appends a turn summary and then emits:

```ts
yield AssistantMessageIncompleteEventSchema.parse({
  type: "assistant_message_incomplete",
  messageId: assistantResponseMessageId,
  incompleteReason: providerStreamEvent.incompleteReason,
  usage: providerStreamEvent.usage,
});
```

The reducer then appends an incomplete notice part if needed.

The visible result is:

- partial assistant content remains
- an incomplete notice appears
- input becomes active again

## Failure Flow

If the provider stream ends without completion, the runtime emits:

```ts
yield AssistantMessageFailedEventSchema.parse({
  type: "assistant_message_failed",
  messageId: assistantResponseMessageId,
  errorText: "Provider stream ended before completion",
});
```

If any error is thrown, it emits:

```ts
yield AssistantMessageFailedEventSchema.parse({
  type: "assistant_message_failed",
  messageId: assistantResponseMessageId,
  errorText: error instanceof Error ? error.message : String(error),
});
```

The reducer appends an error notice.

The visible result is:

- transcript stays visible
- failed assistant message contains an error banner
- input can be used again

## Model And Reasoning Selection Flow

### User Action

The user types `/model` and confirms the highlighted slash command while the app is waiting for user input.

Source file:

`packages/tui/src/ChatScreen.tsx`

```ts
case "model":
  void loadAvailableModelsForSelection();
  return;
```

### Loading State

```ts
const loadAvailableModelsForSelection = useEffectEvent(async () => {
  setChatSessionState((currentChatSessionState) => showModelSelectionLoadingState(currentChatSessionState));
```

Then it calls the loader passed from the CLI:

```ts
const availableAssistantModels = await props.loadAvailableAssistantModels();
```

That calls:

```ts
provider.listAvailableAssistantModels()
```

### Selection State

Source file:

`packages/chat-session-state/src/modelAndReasoningSelectionReducer.ts`

The model selection state can be:

- `hidden`
- `loading_available_models`
- `showing_model_loading_error`
- `showing_available_models`
- `showing_reasoning_effort_choices`

The render branch lives in `ChatScreen`:

```tsx
const modelAndReasoningSelectionPane =
  chatSessionState.modelAndReasoningSelectionState.step === "loading_available_models" ? (
    <box alignItems="center" flexGrow={1} justifyContent="center">
      <text fg={chatScreenTheme.accentAmber}>Loading models...</text>
    </box>
  ) : chatSessionState.modelAndReasoningSelectionState.step === "showing_model_loading_error" ? (
    <ErrorBannerBlock ... />
  ) : chatSessionState.modelAndReasoningSelectionState.step === "showing_available_models" ? (
    <ModelAndReasoningSelectionPane ... />
  ) : chatSessionState.modelAndReasoningSelectionState.step === "showing_reasoning_effort_choices" ? (
    <ModelAndReasoningSelectionPane ... />
  ) : null;
```

### Confirming Model

Source file:

`packages/chat-session-state/src/modelAndReasoningSelectionReducer.ts`

```ts
export function confirmHighlightedModelSelection(chatSessionState: ChatSessionState): ChatSessionState {
```

If the selected model has no reasoning options, it commits immediately:

```ts
if (selectedModel.supportedReasoningEfforts.length === 0) {
  return {
    ...chatSessionState,
    selectedModelId: selectedModel.id,
    selectedReasoningEffort: undefined,
    modelAndReasoningSelectionState: { step: "hidden" },
  };
}
```

If reasoning options exist, it advances to reasoning selection.

Confirming reasoning commits both selected model and reasoning effort:

```ts
return {
  ...chatSessionState,
  selectedModelId: chatSessionState.modelAndReasoningSelectionState.selectedModel.id,
  selectedReasoningEffort: selectedReasoningEffortChoice.reasoningEffort,
  modelAndReasoningSelectionState: { step: "hidden" },
};
```

The selected model and reasoning effort affect the next submitted assistant turn.

They do not restart a currently running turn.

## Slash Command And Command Help Flow

### User Action

The user types `/` at the start of the prompt draft.

Source file:

`packages/chat-session-state/src/chatSlashCommandSelectionRefresh.ts`

```ts
return refreshChatSlashCommandSelectionForCurrentState(currentChatSessionState);
```

The picker shows every command for a bare `/` and filters as more command text is typed.

The command registry includes:

Source file:

`packages/chat-session-state/src/chatSlashCommands.ts`

```ts
export function buildChatSlashCommands(...) {
  return [
  { name: "help", value: "help", description: "Show available commands and shortcuts" },
  { name: "model", value: "model", description: "Choose OpenAI model and reasoning effort" },
  ];
}
```

Selecting `/help` is resolved by slash-command application before it opens command and shortcut help through a tiny modal reducer:

Source file:

`packages/chat-session-state/src/chatSlashCommandApplication.ts`

```ts
return applyChatSlashCommandToChatSessionState(chatSessionState, "help");
```

The final state transition uses the modal reducer:

Source file:

`packages/chat-session-state/src/commandHelpModalReducer.ts`

```ts
export function showCommandHelpModal(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    isCommandHelpModalVisible: true,
  };
}
```

The global keyboard reducer closes the modal when `Esc` is pressed:

Source file:

`packages/chat-session-state/src/chatSessionKeyboardInteraction.ts`

```ts
if (chatSessionKeyboardInput.keyName === "escape") {
  return createChatSessionKeyboardInteraction({
    nextChatSessionState: hideCommandHelpModal(chatSessionState),
    shouldConsumeKeyboardInput: true,
  });
}
```

The command help modal takes over the middle region, but it does not destroy input state. The slash-command picker itself renders in the bottom stack above the input.

## Input Disabled Rules

Source file:

`packages/tui/src/ChatScreen.tsx`

```ts
const isPromptInputDisabled =
  chatSessionState.conversationTurnStatus === "streaming_assistant_response" ||
  chatSessionState.conversationTurnStatus === "waiting_for_tool_approval" ||
  chatSessionState.modelAndReasoningSelectionState.step !== "hidden";
```

The input is disabled while:

- assistant is streaming
- tool approval is pending
- model/reasoning picker is active

The input is not disabled merely because a previous assistant response failed.

## Terminal Size Flow

Source file:

`packages/tui/src/ChatScreen.tsx`

The TUI chooses one of two input surfaces:

```tsx
{terminalSizeTierForChatScreen === minimumTerminalSizeTier ? (
  <MinimumHeightPromptStrip ... />
) : (
  <InputPanel ... />
)}
```

`InputPanel` is the normal multi-row composer.

Source file:

`packages/tui/src/components/InputPanel.tsx`

```ts
export const INPUT_PANEL_NATURAL_ROW_COUNT = 7;
```

`MinimumHeightPromptStrip` is the tiny-terminal fallback.

Source file:

`packages/tui/src/components/MinimumHeightPromptStrip.tsx`

```ts
export const MINIMUM_HEIGHT_PROMPT_STRIP_ROW_COUNT = 1;
```

Terminal size affects presentation only. It does not change the underlying chat
state or assistant runtime.

## Token Usage And Context Meter

When a turn completes or ends incomplete, usage arrives from OpenAI and is
normalized by:

`packages/openai/src/provider/usage.ts`

The reducer stores it as `latestTokenUsage` and backfills the turn footer.

`ChatScreen` derives total usage:

```ts
const totalContextTokensUsed =
  chatSessionState.latestTokenUsage?.total ??
  (chatSessionState.latestTokenUsage
    ? chatSessionState.latestTokenUsage.input +
      chatSessionState.latestTokenUsage.output +
      chatSessionState.latestTokenUsage.reasoning
    : undefined);
```

The known context window capacity comes from:

`packages/engine/src/modelContextWindowCapacity.ts`

```ts
const MODEL_CONTEXT_WINDOW_TOKEN_CAPACITIES: Record<string, number> = {
  "gpt-5.5": 400_000,
  "gpt-5.5-pro": 400_000,
  "gpt-5.4": 1_050_000,
  "gpt-5.4-pro": 1_050_000,
  "gpt-5.4-mini": 400_000,
  "gpt-5.4-nano": 400_000,
  "gpt-5": 256_000,
  "gpt-4.1": 1_000_000,
```

The meter renders in:

`packages/tui/src/components/ContextWindowMeter.tsx`

If capacity is known, it shows a percentage bar. If not, it shows raw token
count.

## Full User Flow: Ask A Normal Question

Example user action:

```text
What does this project do?
```

Execution path:

```text
User types text
  -> OpenTUI keyboard adapter
  -> useChatAppKeyboardActions
  -> insertTextIntoPromptDraftAtCursor
  -> chatSessionState.promptDraft updates
  -> InputPanel renders draft

User presses Enter
  -> useChatAppKeyboardActions applies submit-prompt effect
  -> user message added to chatSessionState
  -> promptDraft cleared
  -> conversationTurnStatus = streaming_assistant_response
  -> ConversationMessageList renders user message

Assistant-turn action starts streaming
  -> relayAssistantResponseRunnerEvents
  -> AssistantConversationRuntime.startConversationTurn
  -> RuntimeConversationTurn.streamAssistantResponseEvents
  -> OpenAiProviderConversationTurn.streamProviderEvents
  -> OpenAI /responses request

OpenAI streams response
  -> parseOpenAiStream emits text_chunk events
  -> runtime builds assistant_text part
  -> relay batches assistant events
  -> assistantTurnEventReducer updates chatSessionState
  -> ConversationMessageRow renders AssistantTextPartView
  -> AssistantMarkdownBlock renders markdown

OpenAI completes
  -> provider emits completed
  -> runtime emits turn summary and assistant_message_completed
  -> reducer marks message completed
  -> input becomes active again
```

## Full User Flow: Ask A Question With `@` Context

Example user action:

```text
Explain @packages/tui/src/ChatScreen.tsx
```

Execution path:

```text
User types @packages...
  -> prompt-context refresh hook detects active prompt-context query
  -> PromptContextCandidateCatalog lists matching candidates
  -> promptContextSelectionState shows candidates
  -> PromptContextSelectionPane renders bottom picker

User selects candidate
  -> selectHighlightedPromptContextCandidate
  -> prompt draft is updated with selected @ reference
  -> selected reference is tracked for colored input rendering

User presses Enter
  -> submitPromptDraft stores visible prompt as user message
  -> runtime starts assistant turn
  -> buildModelFacingPromptTextFromPromptContextReferences reads selected file/folder
  -> model-facing prompt gets Attached prompt context block
  -> OpenAI receives expanded prompt
```

Important distinction:

- Transcript shows the user's original submitted prompt.
- OpenAI receives the model-facing prompt with attached context snapshots.

## Full User Flow: Assistant Requests Bash And Auto-Runs

Example model tool request:

```json
{
  "command": "pwd",
  "description": "Print working directory",
  "workdir": null,
  "timeout": null
}
```

Execution path:

```text
OpenAI streams function call
  -> parseOpenAiStream creates tool_call_requested
  -> runtime handleRequestedToolCall
  -> bash approval policy classifies pwd as safe read-only
  -> runtime emits assistant_tool_call part with running status
  -> runApprovedBashToolCall executes command
  -> WorkspaceShellCommandExecutor spawns shell
  -> output captured
  -> runtime updates tool-call part to completed or failed
  -> runtime appends tool result to history
  -> provider submitToolResult sends function_call_output to OpenAI
  -> OpenAI continues assistant response
```

Visible result:

- A bash card appears in the transcript.
- It starts as running.
- It updates with exit code and output.
- Assistant continues after seeing the tool result.

## Full User Flow: Assistant Requests Bash And Needs Approval

Example model tool request:

```json
{
  "command": "rm temp.txt",
  "description": "Remove temp file",
  "workdir": null,
  "timeout": null
}
```

Execution path:

```text
OpenAI streams function call
  -> parseOpenAiStream creates tool_call_requested
  -> runtime handleRequestedToolCall
  -> bash approval policy classifies rm as filesystem_change
  -> runtime emits assistant_tool_call part with pending_approval status
  -> runtime emits assistant_pending_tool_approval_requested
  -> reducer sets conversationTurnStatus = waiting_for_tool_approval
  -> reducer stores pendingToolApprovalRequest
  -> LiveInteractionStatusStack renders ToolApprovalRequestBlock in bottom region

User presses y
  -> useChatAppKeyboardActions submits an approved tool decision
  -> active turn approves approvalId
  -> runtime promise resolves approved
  -> runtime clears pending approval
  -> tool-call part updates to running
  -> command executes
  -> result goes back to OpenAI

User presses n
  -> useChatAppKeyboardActions submits a denied tool decision
  -> active turn denies approvalId
  -> runtime promise resolves denied
  -> command is not executed
  -> tool-call part updates to denied
  -> denial text goes back to OpenAI as tool result
```

Visible result:

- Transcript still shows the tool call.
- Bottom region shows approval controls.
- Input is disabled until approval is resolved.

## What The Agent Actually Decides

The model decides things like:

- what text to say
- whether to request the `bash` tool
- what bash command arguments to request
- when to continue after a tool result

The runtime decides things like:

- whether a bash command needs approval
- whether a working directory is allowed
- how to execute the shell command
- how to convert provider events into assistant events
- how to represent tool state

The TUI decides things like:

- which component renders a given `partKind`
- which rich text primitive renders a given content `kind`
- where the approval block appears
- whether the input panel or minimum strip appears
- which keyboard scope owns key presses

This separation is why the model does not directly render React components.

## What Persists And What Does Not

Persists:

- OpenAI auth at `~/.buli/auth.json`
- workspace-scoped conversation sessions under `~/.buli/conversation-sessions`
- active conversation-session pointer per workspace
- canonical session entries for user prompts, assistant messages, tool calls, and tool results
- HTML session exports under `~/.buli/session-exports` by default

Lives only during the current process:

- chat transcript UI state
- in-memory conversation history projection over the active persisted session
- selected model inside the UI
- selected reasoning effort inside the UI
- latest token usage
- pending tool approval state
- prompt draft

Does not exist yet:

- branch history
- raw event/session replay export
- replayable UI snapshots beyond transcript hydration
- process restart with active-turn or pending-approval restore

## Current Limitations

Current limitations that matter for understanding the flow:

- OpenAI provider exposes `bash`, `read`, `glob`, `grep`, `edit`, and `write` as real model-callable tools.
- UI has cards for additional future tool kinds such as `todowrite` and `task`, but those are not currently wired as OpenAI tools.
- Session persistence stores canonical entries, but not active turns, pending approvals, or selected model/reasoning settings per session.
- The app does not currently load repo instruction files into `buildBuliSystemPrompt(...)`.
- There is no full runtime-enforced learning/agreement/apply phase model yet.
- `plan_proposed` exists in contracts/runtime pathways, but the current OpenAI stream parser does not emit it.
- Code changes made while the TUI is running do not hot-reload into the running process.

## Debugging Map

Use this map when you are trying to answer “where does this happen?”

| Question | Start here |
| --- | --- |
| Why did a CLI command run? | `apps/cli/src/main.ts` |
| Why did chat not start? | `apps/cli/src/commands/chat.ts` |
| How is auth loaded? | `packages/openai/src/auth/store.ts` |
| How is auth refreshed? | `packages/openai/src/auth/refresh.ts` |
| How is the TUI mounted? | `packages/tui/src/index.ts` and `packages/tui/src/terminalChatScreenRuntime.ts` |
| Who owns chat app state wiring? | `packages/chat-app-controller/src/useChatAppController.ts` |
| Who adapts chat state to OpenTUI layout? | `packages/tui/src/behavior/useChatScreenController.ts` |
| Who owns chat state transitions? | `packages/chat-session-state/src/chatSessionState.ts` and reducers in `packages/chat-session-state/src/*` |
| What is initial state? | `packages/chat-session-state/src/chatSessionState.ts` |
| How does typing update draft? | `packages/tui/src/behavior/useChatScreenKeyboardInputActions.ts`, `packages/chat-app-controller/src/useChatAppKeyboardActions.ts`, and `packages/chat-session-state/src/promptDraftReducer.ts` |
| How does Enter submit? | `packages/chat-app-controller/src/useChatAppKeyboardActions.ts` and `packages/chat-session-state/src/chatSessionKeyboardInteraction.ts` |
| How does `/` command selection work? | `packages/chat-session-state/src/slashCommandSelectionReducer.ts`, `packages/chat-session-state/src/chatSlashCommands.ts`, and `packages/chat-session-state/src/chatSlashCommandApplication.ts` |
| How does `@` picker work? | `packages/chat-session-state/src/promptContextSelectionRefresh.ts`, `packages/chat-session-state/src/promptContextSelectionReducer.ts`, and `packages/engine/src/prompt-context/*` |
| How does a turn start? | `packages/chat-app-controller/src/useChatAppAssistantTurnActions.ts` and `packages/chat-app-controller/src/relayAssistantResponseRunnerEvents.ts` |
| How does the runtime work? | `packages/engine/src/runtime.ts` |
| How is OpenAI request built? | `packages/openai/src/provider/turnSession.ts` |
| How is history reconstructed? | `packages/openai/src/provider/request.ts` |
| How is SSE parsed? | `packages/openai/src/provider/stream.ts` |
| How is assistant text accumulated? | `packages/engine/src/assistantTextMessagePartBuilder.ts` |
| How is assistant markdown rendered? | `packages/tui/src/components/primitives/AssistantMarkdownBlock.tsx` |
| How do assistant events update UI state? | `packages/chat-session-state/src/assistantTurnEventReducer.ts` |
| How are transcript rows rendered? | `packages/tui/src/components/ConversationMessageRow.tsx` |
| How is markdown block chrome applied? | `packages/tui/src/components/primitives/assistantMarkdownUnifiedRenderNode.ts` |
| How are tool cards chosen? | `packages/tui/src/components/toolCalls/ToolCallEntryView.tsx` |
| How is bash approval decided? | `packages/engine/src/tools/bashToolApprovalPolicy.ts` |
| How is bash executed? | `packages/engine/src/tools/bashTool.ts` |

## Recommended Reading Order

Read these files in this order if you want to build understanding gradually.

1. `apps/cli/src/main.ts`
2. `apps/cli/src/commands/chat.ts`
3. `packages/tui/src/index.ts`
4. `packages/tui/src/terminalChatScreenRuntime.ts`
5. `packages/tui/src/ChatScreen.tsx`
6. `packages/tui/src/behavior/useChatScreenController.ts`
7. `packages/chat-app-controller/src/useChatAppController.ts`
8. `packages/tui/src/components/ChatScreenLayout.tsx`
9. `packages/tui/src/components/ConversationTranscriptSurface.tsx`
10. `packages/tui/src/components/LiveInteractionChrome.tsx`
11. `packages/tui/src/components/LiveInteractionStatusStack.tsx`
12. `packages/tui/src/components/PromptComposerChrome.tsx`
13. `packages/chat-session-state/src/chatSessionState.ts`
14. `packages/chat-app-controller/src/useChatAppKeyboardActions.ts`
15. `packages/chat-app-controller/src/useChatAppPromptImageAttachmentActions.ts`
16. `packages/chat-session-state/src/promptDraftReducer.ts`
17. `packages/chat-session-state/src/slashCommandSelectionReducer.ts`
18. `packages/chat-session-state/src/chatSlashCommands.ts`
19. `packages/chat-session-state/src/chatSlashCommandApplication.ts`
20. `packages/chat-session-state/src/promptContextSelectionRefresh.ts`
21. `packages/chat-app-controller/src/relayAssistantResponseRunnerEvents.ts`
22. `packages/engine/src/provider.ts`
23. `packages/engine/src/runtime.ts`
24. `packages/openai/src/provider/client.ts`
25. `packages/openai/src/provider/turnSession.ts`
26. `packages/openai/src/provider/stream.ts`
27. `packages/openai/src/provider/request.ts`
28. `packages/chat-session-state/src/assistantTurnEventReducer.ts`
29. `packages/tui/src/components/ConversationMessageList.tsx`
30. `packages/tui/src/components/ConversationMessageRow.tsx`
31. `packages/tui/src/components/messageParts/AssistantTextPartView.tsx`
32. `packages/tui/src/components/primitives/AssistantMarkdownBlock.tsx`
33. `packages/engine/src/tools/bashToolApprovalPolicy.ts`
34. `packages/engine/src/tools/bashTool.ts`

## One Complete Data Flow Example

This is the whole path for a prompt that produces text and no tools.

```text
User presses keys
  -> useChatScreenKeyboardInputActions useKeyboard
  -> useChatAppKeyboardActions
  -> insertTextIntoPromptDraftAtCursor
  -> chatSessionState.promptDraft
  -> InputPanel / PromptTextarea

User presses Enter
  -> useChatAppKeyboardActions submit-prompt effect
  -> user ConversationMessage + user_text part
  -> conversationTurnStatus = streaming_assistant_response
  -> ConversationMessageList renders UserPromptBlock

Assistant turn starts
  -> relayAssistantResponseRunnerEvents
  -> AssistantConversationRuntime.startConversationTurn
  -> RuntimeConversationTurn.streamAssistantResponseEvents
  -> buildModelFacingPromptTextFromPromptContextReferences
  -> conversationHistory.append user_prompt
  -> OpenAiProvider.startConversationTurn
  -> OpenAiProviderConversationTurn.streamProviderEvents

OpenAI request
  -> createOpenAiResponsesInputItems
  -> createHttpRequestBody
  -> POST /responses stream=true

OpenAI stream
  -> parseOpenAiStream
  -> text_chunk
  -> runtime appendAssistantTextDeltaToAssistantTextMessagePartBuilder
  -> assistant_message_part_added / updated
  -> relay batches event
  -> applyAssistantResponseEventsToChatSessionState
  -> assistant_text part in chatSessionState
  -> ConversationMessageRow
  -> AssistantTextPartView
  -> AssistantMarkdownBlock

OpenAI completed
  -> provider completed event
  -> runtime adds assistant_turn_summary
  -> runtime finalizes assistant_text part
  -> runtime appends assistant_message to conversationHistory
  -> runtime emits assistant_message_completed
  -> reducer messageStatus = completed
  -> conversationTurnStatus = waiting_for_user_input
  -> InputPanel enabled again
```

That is the core current `buli` chat loop.
