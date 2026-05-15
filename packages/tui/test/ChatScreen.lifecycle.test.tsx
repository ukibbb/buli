import { expect, test } from "bun:test";
import type { AssistantResponseEvent } from "@buli/contracts";
import type {
  ActiveConversationTurn,
  AssistantConversationRunner,
  ConversationTurnRequest,
  PromptContextCandidate,
} from "@buli/engine";
import { act } from "react";
import { ChatScreen } from "../src/ChatScreen.tsx";
import { ActiveConversationTurnShutdownCoordinator } from "../src/activeConversationTurnShutdown.ts";
import { testRender } from "./testRenderWithCleanup.ts";

const noopAvailableModelsLoader = async () => [];
const noopPromptContextCandidatesLoader = async (): Promise<readonly PromptContextCandidate[]> => [];

type OpenTuiChatScreenHarness = {
  captureFrame(): Promise<string>;
  pressEnter(): Promise<string>;
  pressEnterTwiceInOneAct(): Promise<string>;
  pressKey(key: string): Promise<string>;
  pasteText(text: string): Promise<string>;
  typeText(text: string): Promise<string>;
  waitForFrame(delayMs: number): Promise<string>;
};

async function renderChatScreen(input: {
  assistantConversationRunner: AssistantConversationRunner;
  activeConversationTurnShutdownCoordinator?: ActiveConversationTurnShutdownCoordinator;
}): Promise<OpenTuiChatScreenHarness> {
  const renderedChatScreen = await testRender(
    <ChatScreen
      selectedModelId="gpt-5.4"
      loadAvailableAssistantModels={noopAvailableModelsLoader}
      loadPromptContextCandidates={noopPromptContextCandidatesLoader}
      assistantConversationRunner={input.assistantConversationRunner}
      {...(input.activeConversationTurnShutdownCoordinator
        ? { activeConversationTurnShutdownCoordinator: input.activeConversationTurnShutdownCoordinator }
        : {})}
    />,
    { width: 140, height: 34 },
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
    async pressEnter(): Promise<string> {
      await act(async () => {
        renderedChatScreen.mockInput.pressKey("RETURN");
      });
      return captureFrame();
    },
    async pressEnterTwiceInOneAct(): Promise<string> {
      await act(async () => {
        renderedChatScreen.mockInput.pressKey("RETURN");
        renderedChatScreen.mockInput.pressKey("RETURN");
      });
      return captureFrame();
    },
    async pressKey(key: string): Promise<string> {
      await act(async () => {
        if (key === "ESC" || key === "ESCAPE") {
          renderedChatScreen.mockInput.pressEscape();
          await new Promise((resolve) => setTimeout(resolve, 25));
          return;
        }

        renderedChatScreen.mockInput.pressKey(key);
      });
      return captureFrame();
    },
    async pasteText(text: string): Promise<string> {
      await act(async () => {
        await renderedChatScreen.mockInput.pasteBracketedText(text);
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
    async waitForFrame(delayMs: number): Promise<string> {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      });
      return captureFrame();
    },
  };
}

function createEmptyStreamAssistantConversationRunner(): AssistantConversationRunner {
  return {
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
}

function createThrowingStreamAssistantConversationRunner(): AssistantConversationRunner {
  return {
    startConversationTurn() {
      return {
        async *streamAssistantResponseEvents() {
          throw new Error("runner exploded");
        },
        async approvePendingToolCall() {},
        async denyPendingToolCall() {},
        interrupt() {},
      };
    },
  };
}

function createCountingEmptyStreamAssistantConversationRunner(): {
  assistantConversationRunner: AssistantConversationRunner;
  getStartedTurnCount: () => number;
} {
  let startedTurnCount = 0;
  return {
    assistantConversationRunner: {
      startConversationTurn() {
        startedTurnCount += 1;
        return {
          async *streamAssistantResponseEvents() {
            return;
          },
          async approvePendingToolCall() {},
          async denyPendingToolCall() {},
          interrupt() {},
        };
      },
    },
    getStartedTurnCount: () => startedTurnCount,
  };
}

function createRecordingEmptyStreamAssistantConversationRunner(): {
  assistantConversationRunner: AssistantConversationRunner;
  listStartedTurnRequests: () => readonly ConversationTurnRequest[];
} {
  const startedTurnRequests: ConversationTurnRequest[] = [];
  return {
    assistantConversationRunner: {
      startConversationTurn(input) {
        startedTurnRequests.push(input);
        return {
          async *streamAssistantResponseEvents() {
            return;
          },
          async approvePendingToolCall() {},
          async denyPendingToolCall() {},
          interrupt() {},
        };
      },
    },
    listStartedTurnRequests: () => startedTurnRequests,
  };
}

function createKeyboardApprovalAssistantConversationRunner(): {
  assistantConversationRunner: AssistantConversationRunner;
  getApprovedDecisionCount: () => number;
  getDeniedDecisionCount: () => number;
} {
  let approvedDecisionCount = 0;
  let deniedDecisionCount = 0;

  return {
    assistantConversationRunner: {
      startConversationTurn(): ActiveConversationTurn {
        let resolveApprovalDecision: ((decision: "approved" | "denied") => void) | undefined;
        const approvalDecisionPromise = new Promise<"approved" | "denied">((resolveDecision) => {
          resolveApprovalDecision = resolveDecision;
        });

        return {
          async *streamAssistantResponseEvents() {
            for (const assistantResponseEvent of createPendingApprovalAssistantResponseEvents()) {
              yield assistantResponseEvent;
            }

            const approvalDecision = await approvalDecisionPromise;
            yield { type: "assistant_pending_tool_approval_cleared", approvalId: "approval-1" };
            yield {
              type: "assistant_message_part_updated",
              messageId: "assistant-1",
              part: {
                id: "tool-1",
                partKind: "assistant_tool_call",
                toolCallId: "call-1",
                toolCallStatus: approvalDecision === "approved" ? "completed" : "denied",
                toolCallStartedAtMs: 1,
                toolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
                ...(approvalDecision === "denied"
                  ? { denialText: "The user denied this bash command, so it was not executed." }
                  : { durationMs: 1 }),
              },
            } satisfies AssistantResponseEvent;
            yield {
              type: "assistant_message_part_added",
              messageId: "assistant-1",
              part: {
                id: "assistant-text-1",
                partKind: "assistant_text",
                partStatus: "streaming",
                rawMarkdownText: approvalDecision === "approved" ? "Approved after keyboard." : "Denied after keyboard.",
              },
            } satisfies AssistantResponseEvent;
            yield {
              type: "assistant_message_completed",
              messageId: "assistant-1",
              usage: { total: 10, input: 5, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
            } satisfies AssistantResponseEvent;
          },
          async approvePendingToolCall() {
            approvedDecisionCount += 1;
            resolveApprovalDecision?.("approved");
          },
          async denyPendingToolCall() {
            deniedDecisionCount += 1;
            resolveApprovalDecision?.("denied");
          },
          interrupt() {},
        };
      },
    },
    getApprovedDecisionCount: () => approvedDecisionCount,
    getDeniedDecisionCount: () => deniedDecisionCount,
  };
}

function createInterruptibleAssistantConversationRunner(): {
  assistantConversationRunner: AssistantConversationRunner;
  getInterruptCount: () => number;
} {
  let interruptCount = 0;
  let resolveInterrupt: (() => void) | undefined;

  return {
    assistantConversationRunner: {
      startConversationTurn(): ActiveConversationTurn {
        const interruptedPromise = new Promise<void>((resolve) => {
          resolveInterrupt = resolve;
        });

        return {
          async *streamAssistantResponseEvents() {
            yield { type: "assistant_turn_started", messageId: "assistant-1", startedAtMs: 1 };
            yield {
              type: "assistant_message_part_added",
              messageId: "assistant-1",
              part: {
                id: "assistant-text-1",
                partKind: "assistant_text",
                partStatus: "streaming",
                rawMarkdownText: "Partial answer",
              },
            } satisfies AssistantResponseEvent;

            await interruptedPromise;
            yield {
              type: "assistant_message_interrupted",
              messageId: "assistant-1",
              interruptionReason: "Interrupted by user.",
            } satisfies AssistantResponseEvent;
          },
          async approvePendingToolCall() {},
          async denyPendingToolCall() {},
          interrupt() {
            interruptCount += 1;
            resolveInterrupt?.();
          },
        };
      },
    },
    getInterruptCount: () => interruptCount,
  };
}

function createManuallyReleasedInterruptibleAssistantConversationRunner(): {
  assistantConversationRunner: AssistantConversationRunner;
  getInterruptCount: () => number;
  releaseInterruptedTurn: () => void;
} {
  let interruptCount = 0;
  let resolveInterruptedTurn: (() => void) | undefined;

  return {
    assistantConversationRunner: {
      startConversationTurn(): ActiveConversationTurn {
        const interruptedPromise = new Promise<void>((resolve) => {
          resolveInterruptedTurn = resolve;
        });

        return {
          async *streamAssistantResponseEvents() {
            yield { type: "assistant_turn_started", messageId: "assistant-1", startedAtMs: 1 };
            yield {
              type: "assistant_message_part_added",
              messageId: "assistant-1",
              part: {
                id: "assistant-text-1",
                partKind: "assistant_text",
                partStatus: "streaming",
                rawMarkdownText: "Partial answer",
              },
            } satisfies AssistantResponseEvent;

            await interruptedPromise;
            yield {
              type: "assistant_message_interrupted",
              messageId: "assistant-1",
              interruptionReason: "Interrupted by user.",
            } satisfies AssistantResponseEvent;
          },
          async approvePendingToolCall() {},
          async denyPendingToolCall() {},
          interrupt() {
            interruptCount += 1;
          },
        };
      },
    },
    getInterruptCount: () => interruptCount,
    releaseInterruptedTurn: () => resolveInterruptedTurn?.(),
  };
}

function createPendingApprovalAssistantResponseEvents(): readonly AssistantResponseEvent[] {
  return [
    { type: "assistant_turn_started", messageId: "assistant-1", startedAtMs: 1 },
    {
      type: "assistant_message_part_added",
      messageId: "assistant-1",
      part: {
        id: "tool-1",
        partKind: "assistant_tool_call",
        toolCallId: "call-1",
        toolCallStatus: "pending_approval",
        toolCallStartedAtMs: 1,
        toolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
      },
    },
    {
      type: "assistant_pending_tool_approval_requested",
      approvalRequest: {
        approvalId: "approval-1",
        pendingToolCallId: "call-1",
        pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
        riskExplanation: "This command deletes files.",
      },
    },
  ];
}

test("ChatScreen settles an empty assistant stream instead of staying working", async () => {
  const renderedChatScreen = await renderChatScreen({
    assistantConversationRunner: createEmptyStreamAssistantConversationRunner(),
  });

  await renderedChatScreen.typeText("trigger empty stream");
  await renderedChatScreen.pressEnter();
  const frame = await renderedChatScreen.waitForFrame(25);

  expect(frame).toContain("Assistant turn ended without a terminal event.");
  expect(frame).not.toContain("working");
});

test("ChatScreen re-enables prompt editing after a failed assistant stream", async () => {
  const renderedChatScreen = await renderChatScreen({
    assistantConversationRunner: createThrowingStreamAssistantConversationRunner(),
  });

  await renderedChatScreen.typeText("trigger failed stream");
  await renderedChatScreen.pressEnter();
  const failedFrame = await renderedChatScreen.waitForFrame(25);
  expect(failedFrame).toContain("runner exploded");
  expect(failedFrame).not.toContain("working");

  const editedFrame = await renderedChatScreen.typeText("next prompt");
  expect(editedFrame).toContain("next prompt");
});

test("ChatScreen keeps prompt controls available after a failed assistant stream", async () => {
  const renderedChatScreen = await renderChatScreen({
    assistantConversationRunner: createThrowingStreamAssistantConversationRunner(),
  });

  await renderedChatScreen.typeText("trigger failed stream");
  await renderedChatScreen.pressEnter();
  const failedFrame = await renderedChatScreen.waitForFrame(25);
  expect(failedFrame).toContain("runner exploded");

  const planModeFrame = await renderedChatScreen.pressKey("TAB");
  expect(planModeFrame).toContain("Plan");

  const slashCommandFrame = await renderedChatScreen.typeText("/");
  expect(slashCommandFrame).toContain("Commands");
  expect(slashCommandFrame).toContain("/help");
});

test("ChatScreen ignores a same-tick duplicate Enter submission", async () => {
  const countingRunner = createCountingEmptyStreamAssistantConversationRunner();
  const renderedChatScreen = await renderChatScreen({
    assistantConversationRunner: countingRunner.assistantConversationRunner,
  });

  await renderedChatScreen.typeText("submit once");
  await renderedChatScreen.pressEnterTwiceInOneAct();
  await renderedChatScreen.waitForFrame(25);

  expect(countingRunner.getStartedTurnCount()).toBe(1);
});

test("ChatScreen cycles to plan mode with Tab and submits that mode", async () => {
  const recordingRunner = createRecordingEmptyStreamAssistantConversationRunner();
  const renderedChatScreen = await renderChatScreen({
    assistantConversationRunner: recordingRunner.assistantConversationRunner,
  });

  const planModeFrame = await renderedChatScreen.pressKey("TAB");
  expect(planModeFrame).toContain("Plan");

  await renderedChatScreen.typeText("stay read only");
  await renderedChatScreen.pressEnter();
  await renderedChatScreen.waitForFrame(25);

  expect(recordingRunner.listStartedTurnRequests()[0]?.assistantOperatingMode).toBe("plan");
});

test("ChatScreen cycles from plan to implementation and then understand with Tab", async () => {
  const renderedChatScreen = await renderChatScreen({
    assistantConversationRunner: createEmptyStreamAssistantConversationRunner(),
  });

  const planModeFrame = await renderedChatScreen.pressKey("TAB");
  expect(planModeFrame).toContain("Plan");

  const implementationModeFrame = await renderedChatScreen.pressKey("TAB");
  expect(implementationModeFrame).toContain("Implementation");

  const understandModeFrame = await renderedChatScreen.pressKey("TAB");
  expect(understandModeFrame).toContain("Understand");
});

test("ChatScreen approves a pending tool call with the y keyboard shortcut", async () => {
  const approvalRunner = createKeyboardApprovalAssistantConversationRunner();
  const renderedChatScreen = await renderChatScreen({
    assistantConversationRunner: approvalRunner.assistantConversationRunner,
  });

  await renderedChatScreen.typeText("request approval");
  await renderedChatScreen.pressEnter();
  const approvalFrame = await renderedChatScreen.waitForFrame(25);
  expect(approvalFrame).toContain("Approval needed");

  await renderedChatScreen.pressKey("y");
  const completedFrame = await renderedChatScreen.waitForFrame(25);
  expect(approvalRunner.getApprovedDecisionCount()).toBe(1);
  expect(approvalRunner.getDeniedDecisionCount()).toBe(0);
  expect(completedFrame).toContain("Approved after keyboard.");
  expect(completedFrame).not.toContain("Approval needed");
});

test("ChatScreen denies a pending tool call with the n keyboard shortcut", async () => {
  const approvalRunner = createKeyboardApprovalAssistantConversationRunner();
  const renderedChatScreen = await renderChatScreen({
    assistantConversationRunner: approvalRunner.assistantConversationRunner,
  });

  await renderedChatScreen.typeText("request approval");
  await renderedChatScreen.pressEnter();
  const approvalFrame = await renderedChatScreen.waitForFrame(25);
  expect(approvalFrame).toContain("Approval needed");

  await renderedChatScreen.pressKey("n");
  const completedFrame = await renderedChatScreen.waitForFrame(25);
  expect(approvalRunner.getApprovedDecisionCount()).toBe(0);
  expect(approvalRunner.getDeniedDecisionCount()).toBe(1);
  expect(completedFrame).toContain("Denied after keyboard.");
  expect(completedFrame).not.toContain("Approval needed");
});

test("ChatScreen ignores pasted tool approval shortcut text", async () => {
  const approvalRunner = createKeyboardApprovalAssistantConversationRunner();
  const renderedChatScreen = await renderChatScreen({
    assistantConversationRunner: approvalRunner.assistantConversationRunner,
  });

  await renderedChatScreen.typeText("request approval");
  await renderedChatScreen.pressEnter();
  const approvalFrame = await renderedChatScreen.waitForFrame(25);
  expect(approvalFrame).toContain("Approval needed");

  const pastedShortcutFrame = await renderedChatScreen.pasteText("y");
  expect(approvalRunner.getApprovedDecisionCount()).toBe(0);
  expect(approvalRunner.getDeniedDecisionCount()).toBe(0);
  expect(pastedShortcutFrame).toContain("Approval needed");

  await renderedChatScreen.pressKey("y");
  await renderedChatScreen.waitForFrame(25);
  expect(approvalRunner.getApprovedDecisionCount()).toBe(1);
});

test("ChatScreen requires double Escape to interrupt a running assistant turn", async () => {
  const interruptibleRunner = createInterruptibleAssistantConversationRunner();
  const renderedChatScreen = await renderChatScreen({
    assistantConversationRunner: interruptibleRunner.assistantConversationRunner,
  });

  await renderedChatScreen.typeText("start long response");
  await renderedChatScreen.pressEnter();
  await renderedChatScreen.waitForFrame(25);

  await renderedChatScreen.pressKey("ESCAPE");
  const armedFrame = await renderedChatScreen.waitForFrame(40);
  expect(interruptibleRunner.getInterruptCount()).toBe(0);
  expect(armedFrame).toContain("esc again to stop");

  await renderedChatScreen.pressKey("ESCAPE");
  const interruptedFrame = await renderedChatScreen.waitForFrame(40);
  expect(interruptibleRunner.getInterruptCount()).toBe(1);
  expect(interruptedFrame).toContain("Interrupted by user.");
  expect(interruptedFrame).not.toContain("esc again to stop");
});

test("ChatScreen ignores extra Escape presses after interrupt is requested", async () => {
  const interruptibleRunner = createManuallyReleasedInterruptibleAssistantConversationRunner();
  const renderedChatScreen = await renderChatScreen({
    assistantConversationRunner: interruptibleRunner.assistantConversationRunner,
  });

  await renderedChatScreen.typeText("start long response");
  await renderedChatScreen.pressEnter();
  await renderedChatScreen.waitForFrame(25);

  await renderedChatScreen.pressKey("ESCAPE");
  await renderedChatScreen.waitForFrame(40);
  await renderedChatScreen.pressKey("ESCAPE");
  expect(interruptibleRunner.getInterruptCount()).toBe(1);

  await renderedChatScreen.pressKey("ESCAPE");
  await renderedChatScreen.waitForFrame(40);
  await renderedChatScreen.pressKey("ESCAPE");
  expect(interruptibleRunner.getInterruptCount()).toBe(1);

  interruptibleRunner.releaseInterruptedTurn();
  const interruptedFrame = await renderedChatScreen.waitForFrame(40);
  expect(interruptedFrame).toContain("Interrupted by user.");
});

test("ChatScreen shutdown coordinator interrupts and waits for a running assistant turn", async () => {
  const shutdownCoordinator = new ActiveConversationTurnShutdownCoordinator();
  const interruptibleRunner = createInterruptibleAssistantConversationRunner();
  const renderedChatScreen = await renderChatScreen({
    assistantConversationRunner: interruptibleRunner.assistantConversationRunner,
    activeConversationTurnShutdownCoordinator: shutdownCoordinator,
  });

  await renderedChatScreen.typeText("start long response");
  await renderedChatScreen.pressEnter();
  await renderedChatScreen.waitForFrame(25);

  await act(async () => {
    await shutdownCoordinator.interruptActiveConversationTurnAndWaitForSettlement();
  });
  const interruptedFrame = await renderedChatScreen.captureFrame();

  expect(interruptibleRunner.getInterruptCount()).toBe(1);
  expect(interruptedFrame).toContain("Interrupted by user.");
});
