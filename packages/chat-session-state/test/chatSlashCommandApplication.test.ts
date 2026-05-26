import { expect, test } from "bun:test";
import {
  applyChatSlashCommandToChatSessionState,
  createInitialChatSessionState,
  type ChatSlashCommandApplicationEffect,
} from "../src/index.ts";

test("applyChatSlashCommandToChatSessionState opens command help without an external effect", () => {
  const application = applyChatSlashCommandToChatSessionState(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    "help",
  );

  expect(application.nextChatSessionState.isCommandHelpModalVisible).toBe(true);
  expect(application.chatSlashCommandApplicationEffect).toBeUndefined();
});

test("applyChatSlashCommandToChatSessionState returns a model-load effect for the model command", () => {
  const application = applyChatSlashCommandToChatSessionState(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    "model",
  );

  expect(application.chatSlashCommandApplicationEffect).toEqual({
    effectType: "load_available_assistant_models",
  } satisfies ChatSlashCommandApplicationEffect);
});

test("applyChatSlashCommandToChatSessionState ignores removed mode command strings", () => {
  const initialChatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });

  expect(applyChatSlashCommandToChatSessionState(initialChatSessionState, "plan")).toEqual({
    nextChatSessionState: initialChatSessionState,
    chatSlashCommandApplicationEffect: undefined,
  });
  expect(applyChatSlashCommandToChatSessionState(initialChatSessionState, "implementation")).toEqual({
    nextChatSessionState: initialChatSessionState,
    chatSlashCommandApplicationEffect: undefined,
  });
  expect(applyChatSlashCommandToChatSessionState(initialChatSessionState, "understand")).toEqual({
    nextChatSessionState: initialChatSessionState,
    chatSlashCommandApplicationEffect: undefined,
  });
});

test("applyChatSlashCommandToChatSessionState toggles reasoning summaries and reports the next display mode", () => {
  const application = applyChatSlashCommandToChatSessionState(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    "thinking",
  );

  expect(application.nextChatSessionState.reasoningSummaryDisplayMode).toBe("collapsed");
  expect(application.chatSlashCommandApplicationEffect).toEqual({
    effectType: "reasoning_summary_display_mode_changed",
    reasoningSummaryDisplayMode: "collapsed",
  } satisfies ChatSlashCommandApplicationEffect);
});

test("applyChatSlashCommandToChatSessionState returns external effects for session commands", () => {
  const initialChatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });

  expect(
    applyChatSlashCommandToChatSessionState(initialChatSessionState, "clear").chatSlashCommandApplicationEffect,
  ).toEqual({ effectType: "clear_current_conversation_session" } satisfies ChatSlashCommandApplicationEffect);
  expect(
    applyChatSlashCommandToChatSessionState(initialChatSessionState, "compact").chatSlashCommandApplicationEffect,
  ).toEqual({ effectType: "compact_current_conversation_session" } satisfies ChatSlashCommandApplicationEffect);
  expect(
    applyChatSlashCommandToChatSessionState(initialChatSessionState, "sessions").chatSlashCommandApplicationEffect,
  ).toEqual({ effectType: "load_conversation_sessions" } satisfies ChatSlashCommandApplicationEffect);
  expect(
    applyChatSlashCommandToChatSessionState(initialChatSessionState, "export-session").chatSlashCommandApplicationEffect,
  ).toEqual({ effectType: "export_current_conversation_session" } satisfies ChatSlashCommandApplicationEffect);
});

test("applyChatSlashCommandToChatSessionState submits selected skills as visible slash prompts", () => {
  const application = applyChatSlashCommandToChatSessionState(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    "skill:code-review",
  );
  const userMessage = Object.values(application.nextChatSessionState.conversationMessagesById).find((conversationMessage) =>
    conversationMessage.role === "user"
  );
  const userTextPart = userMessage
    ? application.nextChatSessionState.conversationMessagePartsById[userMessage.partIds[0] ?? ""]
    : undefined;

  expect(application.nextChatSessionState.conversationTurnStatus).toBe("streaming_assistant_response");
  expect(userTextPart).toMatchObject({ partKind: "user_text", text: "/code-review" });
  expect(application.chatSlashCommandApplicationEffect).toEqual({
    effectType: "stream_assistant_response_for_selected_skill",
    skillName: "code-review",
    submittedPromptText: "/code-review",
  } satisfies ChatSlashCommandApplicationEffect);
});
