import { describe, expect, test } from "bun:test";
import * as fixtureScenarios from "@buli/chat-session-fixtures";
import type { ChatSessionFixtureScenario, ExpectedConversationMessageShape } from "@buli/chat-session-fixtures";
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
