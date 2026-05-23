import { expect, test } from "bun:test";
import type {
  AssistantResponseEvent,
  AvailableAssistantModel,
  ConversationSessionEntry,
  ConversationSessionModelSelection,
  ConversationSessionSummary,
} from "@buli/contracts";
import type {
  AssistantConversationRunner,
  ConversationAutoCompactionDecision,
  ConversationAutoCompactionRequest,
  ConversationAutoCompactionResult,
  ConversationTurnRequest,
  PromptContextCandidate,
} from "@buli/engine";
import { act } from "react";
import { ChatScreen } from "../src/ChatScreen.tsx";
import { testRender } from "./testRenderWithCleanup.ts";

const neverEmittingAssistantConversationRunner: AssistantConversationRunner = {
  startConversationTurn() {
    return {
      async *streamAssistantResponseEvents() {
        return;
      },
      async approvePendingToolCall() {},
      async denyPendingToolCall() {},
      interrupt() {},
    };
  },
};

const reasoningSummaryAssistantResponseEvents = [
  {
    type: "assistant_turn_started",
    messageId: "assistant-reasoning-1",
    startedAtMs: 1000,
  },
  {
    type: "assistant_message_part_added",
    messageId: "assistant-reasoning-1",
    part: {
      id: "reasoning-1",
      partKind: "assistant_reasoning",
      partStatus: "completed",
      reasoningSummaryText: "I inspected the available context before answering.",
      reasoningStartedAtMs: 1000,
      reasoningDurationMs: 1200,
      reasoningTokenCount: 7,
    },
  },
  {
    type: "assistant_message_completed",
    messageId: "assistant-reasoning-1",
    usage: {
      total: 30,
      input: 20,
      output: 3,
      reasoning: 7,
      cache: { read: 0, write: 0 },
    },
  },
] as const satisfies readonly AssistantResponseEvent[];

const reasoningSummaryAssistantConversationRunner: AssistantConversationRunner = {
  startConversationTurn() {
    return {
      async *streamAssistantResponseEvents() {
        for (const assistantResponseEvent of reasoningSummaryAssistantResponseEvents) {
          yield assistantResponseEvent;
        }
      },
      async approvePendingToolCall() {},
      async denyPendingToolCall() {},
      interrupt() {},
    };
  },
};

type OpenTuiChatScreenHarness = {
  captureFrame(): Promise<string>;
  pressArrowDown(): Promise<string>;
  pressCtrlL(): Promise<string>;
  pressDelete(): Promise<string>;
  pressEnter(): Promise<string>;
  pressEscape(): Promise<string>;
  clickMouse(column: number, row: number): Promise<string>;
  typeText(text: string): Promise<string>;
  waitForAssistantEvents(): Promise<string>;
};

async function renderChatScreen(input: {
  loadAvailableAssistantModels?: () => Promise<AvailableAssistantModel[]>;
  loadPromptContextCandidates?: (promptContextQueryText: string) => Promise<readonly PromptContextCandidate[]>;
  assistantConversationRunner?: AssistantConversationRunner;
  initialConversationSessionEntries?: readonly ConversationSessionEntry[];
  initialConversationSessionId?: string;
  loadConversationSessions?: () => Promise<readonly ConversationSessionSummary[]>;
  switchConversationSession?: (conversationSessionId: string) => Promise<{
    conversationSessionId: string;
    conversationSessionEntries: readonly ConversationSessionEntry[];
  }>;
  deleteConversationSession?: (conversationSessionId: string) => Promise<{
    deletedConversationSessionId: string;
    activeConversationSessionId: string;
    activeConversationSessionEntries: readonly ConversationSessionEntry[];
    conversationSessions: readonly ConversationSessionSummary[];
  }>;
  exportCurrentConversationSession?: () => Promise<{ exportFilePath: string; exportFileUrl: string }>;
  compactCurrentConversationSession?: () => Promise<{ conversationSessionEntries: readonly ConversationSessionEntry[] }>;
  autoCompactCurrentConversationSession?: (
    input: ConversationAutoCompactionRequest,
  ) => Promise<ConversationAutoCompactionResult> | ConversationAutoCompactionResult;
  onConversationCleared?: () => void;
  onConversationSessionModelSelectionChanged?: (modelSelection: ConversationSessionModelSelection) => void;
} = {}): Promise<OpenTuiChatScreenHarness> {
  const renderedChatScreen = await testRender(
    <ChatScreen
      selectedModelId="gpt-5.4"
      loadAvailableAssistantModels={input.loadAvailableAssistantModels ?? (async () => [])}
      loadPromptContextCandidates={input.loadPromptContextCandidates ?? (async () => [])}
      assistantConversationRunner={input.assistantConversationRunner ?? neverEmittingAssistantConversationRunner}
      {...(input.initialConversationSessionEntries ? { initialConversationSessionEntries: input.initialConversationSessionEntries } : {})}
      {...(input.initialConversationSessionId ? { initialConversationSessionId: input.initialConversationSessionId } : {})}
      {...(input.loadConversationSessions ? { loadConversationSessions: input.loadConversationSessions } : {})}
      {...(input.switchConversationSession ? { switchConversationSession: input.switchConversationSession } : {})}
      {...(input.deleteConversationSession ? { deleteConversationSession: input.deleteConversationSession } : {})}
      {...(input.exportCurrentConversationSession ? { exportCurrentConversationSession: input.exportCurrentConversationSession } : {})}
      {...(input.compactCurrentConversationSession ? { compactCurrentConversationSession: input.compactCurrentConversationSession } : {})}
      {...(input.autoCompactCurrentConversationSession
        ? { autoCompactCurrentConversationSession: input.autoCompactCurrentConversationSession }
        : {})}
      {...(input.onConversationCleared ? { onConversationCleared: input.onConversationCleared } : {})}
      {...(input.onConversationSessionModelSelectionChanged
        ? { onConversationSessionModelSelectionChanged: input.onConversationSessionModelSelectionChanged }
        : {})}
    />,
    { width: 120, height: 28 },
  );

  const captureFrame = async (): Promise<string> => {
    await renderedChatScreen.renderOnce();
    return renderedChatScreen.captureCharFrame();
  };

  await captureFrame();

  return {
    async captureFrame(): Promise<string> {
      return captureFrame();
    },
    async pressArrowDown(): Promise<string> {
      await act(async () => {
        renderedChatScreen.mockInput.pressKey("ARROW_DOWN");
      });
      return captureFrame();
    },
    async pressCtrlL(): Promise<string> {
      await act(async () => {
        renderedChatScreen.mockInput.pressKey("l", { ctrl: true });
      });
      return captureFrame();
    },
    async pressDelete(): Promise<string> {
      await act(async () => {
        renderedChatScreen.mockInput.pressKey("DELETE");
      });
      return captureFrame();
    },
    async pressEnter(): Promise<string> {
      await act(async () => {
        renderedChatScreen.mockInput.pressKey("RETURN");
      });
      return captureFrame();
    },
    async pressEscape(): Promise<string> {
      await act(async () => {
        renderedChatScreen.mockInput.pressEscape();
        await new Promise((resolve) => setTimeout(resolve, 25));
      });
      return captureFrame();
    },
    async clickMouse(column: number, row: number): Promise<string> {
      await act(async () => {
        await renderedChatScreen.mockMouse.click(column, row);
      });
      return captureFrame();
    },
    async typeText(text: string): Promise<string> {
      let frame = "";
      for (const character of text) {
        await act(async () => {
          renderedChatScreen.mockInput.pressKey(character);
        });
        frame = await captureFrame();
      }

      return frame;
    },
    async waitForAssistantEvents(): Promise<string> {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
      });
      return captureFrame();
    },
  };
}

function findRenderedRowContaining(renderedOutput: string, expectedText: string): string {
  const renderedRow = renderedOutput.split("\n").find((row) => row.includes(expectedText));
  if (!renderedRow) {
    throw new Error(`expected rendered output to contain a row with ${expectedText}`);
  }

  return renderedRow;
}

function findRenderedFrameTextPosition(renderedOutput: string, rowText: string, targetText: string): { column: number; row: number } {
  const renderedRows = renderedOutput.split("\n");
  const row = renderedRows.findIndex((renderedRow) => renderedRow.includes(rowText));
  if (row === -1) {
    throw new Error(`expected rendered output to contain a row with ${rowText}`);
  }

  const column = renderedRows[row]?.indexOf(targetText) ?? -1;
  if (column === -1) {
    throw new Error(`expected rendered row to contain ${targetText}`);
  }

  return { column, row };
}

test("ChatScreen shows user-facing slash commands after typing a bare slash", async () => {
  const renderedChatScreen = await renderChatScreen();

  const frame = await renderedChatScreen.typeText("/");

  expect(frame).not.toContain("Commands");
  expect(frame).toContain("/help");
  expect(frame).toContain("/model");
  expect(frame).toContain("/clear");
  expect(frame).toContain("/compact");
  expect(frame).toContain("/sessions");
  expect(frame).toContain("/export-session");
  expect(frame).toContain("/thinking");
  expect(frame).toContain("Collapse thinking");
  expect(frame).not.toContain("/understand");
  expect(frame).not.toContain("/plan");
  expect(frame).not.toContain("/implementation");
  expect(frame).not.toContain("/scroll-up");
  expect(frame).not.toContain("/bottom");

  const helpCommandRow = findRenderedRowContaining(frame, "/help");
  const promptDraftRow = findRenderedRowContaining(frame, "> /");
  const helpCommandIndentationWidth = helpCommandRow.length - helpCommandRow.trimStart().length;
  const promptDraftIndentationWidth = promptDraftRow.length - promptDraftRow.trimStart().length;
  expect(helpCommandIndentationWidth).toBe(promptDraftIndentationWidth);
});

test("ChatScreen treats removed mode slash command text as a normal prompt", async () => {
  const submittedPromptTexts: string[] = [];
  const assistantConversationRunner: AssistantConversationRunner = {
    startConversationTurn(input) {
      submittedPromptTexts.push(input.userPromptText);
      return {
        async *streamAssistantResponseEvents() {
          return;
        },
        async approvePendingToolCall() {},
        async denyPendingToolCall() {},
        interrupt() {},
      };
    },
  };
  const renderedChatScreen = await renderChatScreen({ assistantConversationRunner });

  await renderedChatScreen.typeText("/plan");
  await renderedChatScreen.pressEnter();
  await renderedChatScreen.waitForAssistantEvents();

  expect(submittedPromptTexts).toEqual(["/plan"]);
});

test("ChatScreen exports the current session through slash command", async () => {
  let exportCount = 0;
  const renderedChatScreen = await renderChatScreen({
    exportCurrentConversationSession: async () => {
      exportCount += 1;
      return {
        exportFilePath: "/tmp/buli-session.html",
        exportFileUrl: "file:///tmp/buli-session.html",
      };
    },
  });

  await renderedChatScreen.typeText("/export-session");
  await renderedChatScreen.pressEnter();
  const exportedFrame = await renderedChatScreen.waitForAssistantEvents();

  expect(exportCount).toBe(1);
  expect(exportedFrame).not.toContain("Exported session");
  expect(exportedFrame).not.toContain("/tmp/buli-session.html");
});

test("ChatScreen compacts the current session through slash command", async () => {
  let compactCount = 0;
  const renderedChatScreen = await renderChatScreen({
    initialConversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Previous prompt",
        modelFacingPromptText: "Previous prompt",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "Previous answer",
      },
    ],
    compactCurrentConversationSession: async () => {
      compactCount += 1;
      return {
        conversationSessionEntries: [
          {
            entryKind: "user_prompt",
            promptText: "Previous prompt",
            modelFacingPromptText: "Previous prompt",
          },
          {
            entryKind: "assistant_message",
            assistantMessageStatus: "completed",
            assistantMessageText: "Previous answer",
          },
          {
            entryKind: "conversation_compaction_summary",
            summaryText: "Goal: continue the manual compaction implementation.",
            compactedEntryCount: 2,
            retainedRecentConversationSessionEntryCount: 0,
          },
        ],
      };
    },
  });

  await renderedChatScreen.typeText("/compact");
  await renderedChatScreen.pressEnter();
  const compactedFrame = await renderedChatScreen.waitForAssistantEvents();

  expect(compactCount).toBe(1);
  expect(compactedFrame).toContain("Context compacted");
  expect(compactedFrame).toContain("continue the manual compaction implementation");
});

test("ChatScreen auto-compacts and continues after a terminal assistant turn", async () => {
  const terminalUsage = {
    total: 800_000,
    input: 790_000,
    output: 10_000,
    reasoning: 0,
    cache: { read: 0, write: 0 },
  };
  const terminalContextWindowUsage = {
    total: 790_000,
    input: 780_000,
    output: 10_000,
    reasoning: 0,
    cache: { read: 0, write: 0 },
  };
  const continuedUsage = {
    total: 10,
    input: 8,
    output: 2,
    reasoning: 0,
    cache: { read: 0, write: 0 },
  };
  const conversationTurnRequests: ConversationTurnRequest[] = [];
  const assistantConversationRunner: AssistantConversationRunner = {
    startConversationTurn(conversationTurnRequest) {
      conversationTurnRequests.push(conversationTurnRequest);
      const conversationTurnRequestIndex = conversationTurnRequests.length;
      return {
        async *streamAssistantResponseEvents() {
          if (conversationTurnRequestIndex === 2) {
            yield { type: "assistant_turn_started", messageId: "assistant-auto-continue-1", startedAtMs: 2 };
            yield {
              type: "assistant_message_part_added",
              messageId: "assistant-auto-continue-1",
              part: {
                id: "assistant-auto-continue-text-1",
                partKind: "assistant_text",
                partStatus: "completed",
                rawMarkdownText: "Continued after compaction.",
              },
            };
            yield {
              type: "assistant_message_completed",
              messageId: "assistant-auto-continue-1",
              usage: continuedUsage,
              contextWindowUsage: continuedUsage,
            };
            return;
          }

          yield { type: "assistant_turn_started", messageId: "assistant-auto-compact-1", startedAtMs: 1 };
          yield {
            type: "assistant_message_part_added",
            messageId: "assistant-auto-compact-1",
            part: {
              id: "assistant-auto-compact-text-1",
              partKind: "assistant_text",
              partStatus: "completed",
              rawMarkdownText: "Large answer before compaction.",
            },
          };
          yield {
            type: "assistant_message_completed",
            messageId: "assistant-auto-compact-1",
            usage: terminalUsage,
            contextWindowUsage: terminalContextWindowUsage,
          };
        },
        async approvePendingToolCall() {},
        async denyPendingToolCall() {},
        interrupt() {},
      };
    },
  };
  const autoCompactionRequests: ConversationAutoCompactionRequest[] = [];
  const autoCompactionDecision = {
    shouldCompact: true,
    reason: "context_usage_threshold_reached",
    selectedModelId: "gpt-5.4",
    thresholdRatio: 0.75,
    contextTokensUsed: 790_000,
    contextUsageRatio: 790_000 / 1_050_000,
    contextWindowTokenCapacity: 1_050_000,
    contextCompactionTriggerTokenCount: 787_500,
    reservedTokenCount: undefined,
    sessionEntryCountAfterLatestCompactionSummary: 2,
    triggerKind: "threshold_ratio",
  } satisfies ConversationAutoCompactionDecision;
  const skippedAutoCompactionDecision = {
    shouldCompact: false,
    reason: "context_usage_below_threshold",
    selectedModelId: "gpt-5.4",
    thresholdRatio: 0.75,
    contextTokensUsed: 10,
    contextUsageRatio: 10 / 1_050_000,
    contextWindowTokenCapacity: 1_050_000,
    contextCompactionTriggerTokenCount: 787_500,
    reservedTokenCount: undefined,
    sessionEntryCountAfterLatestCompactionSummary: 2,
    triggerKind: "threshold_ratio",
  } satisfies ConversationAutoCompactionDecision;
  const renderedChatScreen = await renderChatScreen({
    assistantConversationRunner,
    autoCompactCurrentConversationSession: (autoCompactionRequest) => {
      autoCompactionRequests.push(autoCompactionRequest);
      if (autoCompactionRequests.length > 1) {
        return {
          didCompact: false,
          decision: skippedAutoCompactionDecision,
        };
      }

      return {
        didCompact: true,
        decision: autoCompactionDecision,
        conversationSessionEntries: [
          {
            entryKind: "user_prompt",
            promptText: "Trigger auto compaction",
            modelFacingPromptText: "Trigger auto compaction",
          },
          {
            entryKind: "assistant_message",
            assistantMessageStatus: "completed",
            assistantMessageText: "Large answer before compaction.",
          },
          {
            entryKind: "conversation_compaction_summary",
            summaryText: "Goal: continue after automatic compaction.",
            compactedEntryCount: 2,
            retainedRecentConversationSessionEntryCount: 0,
          },
        ],
      };
    },
  });

  await renderedChatScreen.typeText("Trigger auto compaction");
  await renderedChatScreen.pressEnter();
  await renderedChatScreen.waitForAssistantEvents();
  const compactedFrame = await renderedChatScreen.waitForAssistantEvents();

  expect(autoCompactionRequests).toEqual<ConversationAutoCompactionRequest[]>([
    {
      selectedModelId: "gpt-5.4",
      latestContextWindowUsage: terminalContextWindowUsage,
    },
    {
      selectedModelId: "gpt-5.4",
      latestContextWindowUsage: continuedUsage,
    },
  ]);
  expect(conversationTurnRequests.map((conversationTurnRequest) => ({
    userPromptText: conversationTurnRequest.userPromptText,
    promptSource: conversationTurnRequest.promptSource,
  }))).toEqual([
    {
      userPromptText: "Trigger auto compaction",
      promptSource: undefined,
    },
    {
      userPromptText: "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.",
      promptSource: "auto_compaction_continue",
    },
  ]);
  expect(compactedFrame).toContain("Context compacted");
  expect(compactedFrame).toContain("continue after automatic compaction");
  expect(compactedFrame).toContain("Continued after compaction.");
  expect(compactedFrame).not.toContain("Continue if you have next steps, or stop and ask for clarification");
});

test("ChatScreen hydrates the initial session and switches sessions through slash command", async () => {
  const renderedChatScreen = await renderChatScreen({
    initialConversationSessionId: "session-a",
    initialConversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Previous prompt",
        modelFacingPromptText: "Previous prompt",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "Previous answer",
      },
    ],
    loadConversationSessions: async () => [
      {
        sessionId: "session-a",
        title: "Previous prompt",
        createdAtMs: 1000,
        updatedAtMs: 2000,
        conversationSessionEntryCount: 2,
      },
      {
        sessionId: "session-b",
        title: "Switched prompt",
        createdAtMs: 3000,
        updatedAtMs: 4000,
        conversationSessionEntryCount: 2,
      },
    ],
    switchConversationSession: async (conversationSessionId) => ({
      conversationSessionId,
      conversationSessionEntries: [
        {
          entryKind: "user_prompt",
          promptText: "Switched prompt",
          modelFacingPromptText: "Switched prompt",
        },
        {
          entryKind: "assistant_message",
          assistantMessageStatus: "completed",
          assistantMessageText: "Switched answer",
        },
      ],
    }),
  });

  const initialFrame = await renderedChatScreen.captureFrame();
  expect(initialFrame).toContain("Previous prompt");
  expect(initialFrame).toContain("Previous answer");

  await renderedChatScreen.typeText("/sessions");
  const sessionListFrame = await renderedChatScreen.pressEnter();
  expect(sessionListFrame).not.toContain("Sessions");
  expect(sessionListFrame).toContain("Previous prompt");
  expect(sessionListFrame).toContain("Switched prompt");

  await renderedChatScreen.pressArrowDown();
  const switchedFrame = await renderedChatScreen.pressEnter();

  expect(switchedFrame).toContain("Switched prompt");
  expect(switchedFrame).toContain("Switched answer");
  expect(switchedFrame).not.toContain("Previous answer");
});

test("ChatScreen confirms and deletes sessions through slash command", async () => {
  const activeConversationSessionEntries = [
    {
      entryKind: "user_prompt",
      promptText: "Previous prompt",
      modelFacingPromptText: "Previous prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Previous answer",
    },
  ] as const satisfies readonly ConversationSessionEntry[];
  let conversationSessions: ConversationSessionSummary[] = [
    {
      sessionId: "session-a",
      title: "Previous prompt",
      createdAtMs: 1000,
      updatedAtMs: 2000,
      conversationSessionEntryCount: 2,
    },
    {
      sessionId: "session-b",
      title: "Switched prompt",
      createdAtMs: 3000,
      updatedAtMs: 4000,
      conversationSessionEntryCount: 2,
    },
  ];
  const deletedConversationSessionIds: string[] = [];
  const renderedChatScreen = await renderChatScreen({
    initialConversationSessionId: "session-a",
    initialConversationSessionEntries: activeConversationSessionEntries,
    loadConversationSessions: async () => conversationSessions,
    deleteConversationSession: async (conversationSessionId) => {
      deletedConversationSessionIds.push(conversationSessionId);
      conversationSessions = conversationSessions.filter(
        (conversationSession) => conversationSession.sessionId !== conversationSessionId,
      );
      return {
        deletedConversationSessionId: conversationSessionId,
        activeConversationSessionId: "session-a",
        activeConversationSessionEntries,
        conversationSessions,
      };
    },
  });

  await renderedChatScreen.typeText("/sessions");
  const sessionListFrame = await renderedChatScreen.pressEnter();
  const deleteTarget = findRenderedFrameTextPosition(sessionListFrame, "Switched prompt", "delete");

  const confirmationFrame = await renderedChatScreen.clickMouse(deleteTarget.column, deleteTarget.row);
  expect(confirmationFrame).toContain("confirm");
  expect(confirmationFrame).not.toContain('Delete "Switched prompt"?');
  expect(confirmationFrame).not.toContain("delete again");
  expect(deletedConversationSessionIds).toEqual([]);

  const confirmTarget = findRenderedFrameTextPosition(confirmationFrame, "Switched prompt", "confirm");
  const deletedFrame = await renderedChatScreen.clickMouse(confirmTarget.column, confirmTarget.row);
  expect(deletedConversationSessionIds).toEqual(["session-b"]);
  expect(deletedFrame).toContain("Previous prompt");
  expect(deletedFrame).toContain("Previous answer");
  expect(deletedFrame).not.toContain("Switched prompt");
});

test("ChatScreen confirms and deletes highlighted sessions with keyboard delete", async () => {
  const activeConversationSessionEntries = [
    {
      entryKind: "user_prompt",
      promptText: "Previous prompt",
      modelFacingPromptText: "Previous prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Previous answer",
    },
  ] as const satisfies readonly ConversationSessionEntry[];
  let conversationSessions: ConversationSessionSummary[] = [
    {
      sessionId: "session-a",
      title: "Previous prompt",
      createdAtMs: 1000,
      updatedAtMs: 2000,
      conversationSessionEntryCount: 2,
    },
    {
      sessionId: "session-b",
      title: "Switched prompt",
      createdAtMs: 3000,
      updatedAtMs: 4000,
      conversationSessionEntryCount: 2,
    },
  ];
  const deletedConversationSessionIds: string[] = [];
  const renderedChatScreen = await renderChatScreen({
    initialConversationSessionId: "session-a",
    initialConversationSessionEntries: activeConversationSessionEntries,
    loadConversationSessions: async () => conversationSessions,
    deleteConversationSession: async (conversationSessionId) => {
      deletedConversationSessionIds.push(conversationSessionId);
      conversationSessions = conversationSessions.filter(
        (conversationSession) => conversationSession.sessionId !== conversationSessionId,
      );
      return {
        deletedConversationSessionId: conversationSessionId,
        activeConversationSessionId: "session-a",
        activeConversationSessionEntries,
        conversationSessions,
      };
    },
  });

  await renderedChatScreen.typeText("/sessions");
  await renderedChatScreen.pressEnter();
  await renderedChatScreen.pressArrowDown();

  const confirmationFrame = await renderedChatScreen.pressDelete();
  expect(confirmationFrame).toContain("confirm");
  expect(confirmationFrame).not.toContain('Delete "Switched prompt"?');
  expect(confirmationFrame).not.toContain("delete again");
  expect(deletedConversationSessionIds).toEqual([]);

  const deletedFrame = await renderedChatScreen.pressDelete();
  expect(deletedConversationSessionIds).toEqual(["session-b"]);
  expect(deletedFrame).toContain("Previous prompt");
  expect(deletedFrame).not.toContain("Switched prompt");
});

test("ChatScreen opens command and shortcut help through slash command instead of question mark shortcut", async () => {
  const renderedChatScreen = await renderChatScreen();

  await renderedChatScreen.typeText("/help");
  const helpFrame = await renderedChatScreen.pressEnter();

  expect(helpFrame).toContain("help · commands + shortcuts");
  expect(helpFrame).toContain("/help");
  expect(helpFrame).toContain("/model");
  expect(helpFrame).toContain("/clear");
  expect(helpFrame).toContain("/compact");
  expect(helpFrame).toContain("/thinking");
  expect(helpFrame).toContain("Collapse thinking");
  expect(helpFrame).toContain("shortcuts");
  expect(helpFrame).toContain("Tab");
  expect(helpFrame).toContain("Cycle operating mode");
  expect(helpFrame).toContain("Shift/Ctrl+Enter");
  expect(helpFrame).not.toContain("/understand");
  expect(helpFrame).not.toContain("/plan");
  expect(helpFrame).not.toContain("/implementation");

  const renderedQuestionMarkScreen = await renderChatScreen();
  const questionMarkFrame = await renderedQuestionMarkScreen.typeText("?");
  expect(questionMarkFrame).not.toContain("help · commands + shortcuts");
  expect(questionMarkFrame).toContain("?");
});

test("ChatScreen closes command help with Escape", async () => {
  const renderedChatScreen = await renderChatScreen();

  await renderedChatScreen.typeText("/help");
  const helpFrame = await renderedChatScreen.pressEnter();
  expect(helpFrame).toContain("help · commands + shortcuts");

  const closedFrame = await renderedChatScreen.pressEscape();
  expect(closedFrame).not.toContain("help · commands + shortcuts");
  expect(closedFrame).toContain(">");
});

test("ChatScreen opens model picker through slash command instead of ctrl-l", async () => {
  let modelLoadCount = 0;
  const renderedChatScreen = await renderChatScreen({
    loadAvailableAssistantModels: async () => {
      modelLoadCount += 1;
      return [
        {
          id: "gpt-5.4",
          displayName: "GPT 5.4",
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: ["low", "medium", "high"],
        },
      ];
    },
  });

  const ctrlLFrame = await renderedChatScreen.pressCtrlL();
  expect(ctrlLFrame).not.toContain("Choose model");
  expect(modelLoadCount).toBe(0);

  await renderedChatScreen.typeText("/model");
  const modelFrame = await renderedChatScreen.pressEnter();

  expect(modelLoadCount).toBe(1);
  expect(modelFrame).not.toContain("Choose model");
  expect(modelFrame).toContain("GPT 5.4");
});

test("ChatScreen shows the model default reasoning label after choosing the model default", async () => {
  const renderedChatScreen = await renderChatScreen({
    loadAvailableAssistantModels: async () => [
      {
        id: "gpt-5.4",
        displayName: "GPT 5.4",
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: ["low", "medium", "high"],
      },
    ],
  });

  await renderedChatScreen.typeText("/model");
  await renderedChatScreen.pressEnter();
  const reasoningChoicesFrame = await renderedChatScreen.pressEnter();
  expect(reasoningChoicesFrame).not.toContain("Choose reasoning for GPT 5.4");
  expect(reasoningChoicesFrame).toContain("Use model default (medium)");

  const selectedDefaultReasoningFrame = await renderedChatScreen.pressEnter();
  expect(selectedDefaultReasoningFrame).toContain("gpt-5.4");
  expect(selectedDefaultReasoningFrame).toContain("medium");
});

test("ChatScreen reports committed model selection changes", async () => {
  const committedModelSelections: ConversationSessionModelSelection[] = [];
  const renderedChatScreen = await renderChatScreen({
    loadAvailableAssistantModels: async () => [
      {
        id: "gpt-5.4",
        displayName: "GPT 5.4",
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: ["low", "medium", "high"],
      },
    ],
    onConversationSessionModelSelectionChanged: (modelSelection) => {
      committedModelSelections.push(modelSelection);
    },
  });

  await renderedChatScreen.typeText("/model");
  await renderedChatScreen.pressEnter();
  await renderedChatScreen.pressEnter();
  await renderedChatScreen.pressEnter();

  expect(committedModelSelections).toEqual([
    {
      selectedModelId: "gpt-5.4",
      selectedModelDefaultReasoningEffort: "medium",
    },
  ]);
});

test("ChatScreen toggles reasoning summary visibility through thinking slash command", async () => {
  const renderedChatScreen = await renderChatScreen({
    assistantConversationRunner: reasoningSummaryAssistantConversationRunner,
  });

  await renderedChatScreen.typeText("Answer with reasoning");
  await renderedChatScreen.pressEnter();
  const visibleReasoningFrame = await renderedChatScreen.waitForAssistantEvents();
  expect(visibleReasoningFrame).toContain("[-]");
  expect(visibleReasoningFrame).toContain("Thought");
  expect(visibleReasoningFrame).toContain("I inspected the available context before answering.");

  await renderedChatScreen.typeText("/thinking");
  const hiddenReasoningFrame = await renderedChatScreen.pressEnter();
  expect(hiddenReasoningFrame).not.toContain("Thought");
  expect(hiddenReasoningFrame).not.toContain("7 reasoning tok");
  expect(hiddenReasoningFrame).not.toContain("click to show content");
  expect(hiddenReasoningFrame).not.toContain("I inspected the available context before answering.");

  const slashMenuFrame = await renderedChatScreen.typeText("/");
  expect(slashMenuFrame).toContain("/thinking");
  expect(slashMenuFrame).toContain("Expand thinking");
});

test("ChatScreen clears transcript and persisted history through clear slash command", async () => {
  let clearCount = 0;
  const renderedChatScreen = await renderChatScreen({
    assistantConversationRunner: reasoningSummaryAssistantConversationRunner,
    onConversationCleared: () => {
      clearCount += 1;
    },
  });

  await renderedChatScreen.typeText("Answer with reasoning");
  await renderedChatScreen.pressEnter();
  const visibleReasoningFrame = await renderedChatScreen.waitForAssistantEvents();
  expect(visibleReasoningFrame).toContain("I inspected the available context before answering.");

  await renderedChatScreen.typeText("/clear");
  const clearedFrame = await renderedChatScreen.pressEnter();

  expect(clearCount).toBe(1);
  expect(clearedFrame).not.toContain("Answer with reasoning");
  expect(clearedFrame).not.toContain("I inspected the available context before answering.");
});
