import { describe, expect, test } from "bun:test";
import * as fixtureScenarios from "@buli/chat-session-fixtures";
import type {
  ChatSessionFixtureScenario,
  ExpectedConversationMessagePartShape,
  ExpectedConversationMessageShape,
} from "@buli/chat-session-fixtures";
import type { ConversationMessagePart } from "@buli/contracts";
import {
  applyAssistantResponseEventToChatSessionState,
  createInitialChatSessionState,
  listOrderedConversationMessageParts,
  listOrderedConversationMessages,
} from "../src/index.ts";

const scenarioValues: ChatSessionFixtureScenario[] = Object.values(fixtureScenarios).filter(
  (exported): exported is ChatSessionFixtureScenario =>
    typeof exported === "object" &&
    exported !== null &&
    "scenarioName" in exported &&
    "responseEventSequence" in exported &&
    "expectedConversationMessages" in exported,
);

function summarizeConversationMessagePart(
  conversationMessagePart: ConversationMessagePart,
): ExpectedConversationMessagePartShape {
  if (conversationMessagePart.partKind === "assistant_text" || conversationMessagePart.partKind === "assistant_reasoning") {
    return {
      partKind: conversationMessagePart.partKind,
      partStatus: conversationMessagePart.partStatus,
    };
  }

  if (conversationMessagePart.partKind === "assistant_tool_call") {
    return {
      partKind: conversationMessagePart.partKind,
      toolCallStatus: conversationMessagePart.toolCallStatus,
    };
  }

  return { partKind: conversationMessagePart.partKind };
}

describe("chat session state against shared fixtures", () => {
  test("fixtures_package_exposes_at_least_one_scenario", () => {
    expect(scenarioValues.length).toBeGreaterThan(0);
  });

  for (const scenario of scenarioValues) {
    test(`folds_${scenario.scenarioName}_to_expected_message_shapes`, () => {
      let chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
      for (const responseEvent of scenario.responseEventSequence) {
        chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, responseEvent);
      }

      const actualConversationMessages: ExpectedConversationMessageShape[] = listOrderedConversationMessages(chatSessionState).map((conversationMessage) => ({
        role: conversationMessage.role,
        messageStatus: conversationMessage.messageStatus,
        partKinds: listOrderedConversationMessageParts(chatSessionState, conversationMessage.id).map(
          (conversationMessagePart) => conversationMessagePart.partKind,
        ),
        parts: listOrderedConversationMessageParts(chatSessionState, conversationMessage.id).map(summarizeConversationMessagePart),
      }));
      expect(actualConversationMessages).toEqual([...scenario.expectedConversationMessages]);
      expect(chatSessionState.conversationTurnStatus).toBe(scenario.expectedConversationTurnStatus);
      if (scenario.expectedPendingToolApprovalRequest) {
        expect(chatSessionState.pendingToolApprovalRequest).toEqual(scenario.expectedPendingToolApprovalRequest);
      }
      if (scenario.expectedToolCallPart) {
        const actualToolCallPart = listOrderedConversationMessages(chatSessionState)
          .flatMap((conversationMessage) => listOrderedConversationMessageParts(chatSessionState, conversationMessage.id))
          .find((conversationMessagePart) => conversationMessagePart.partKind === "assistant_tool_call");
        expect(actualToolCallPart).toMatchObject(scenario.expectedToolCallPart);
      }
    });
  }
});
