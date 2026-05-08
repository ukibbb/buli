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

test("applyChatSlashCommandToChatSessionState switches assistant mode inside shared state", () => {
  const planApplication = applyChatSlashCommandToChatSessionState(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    "plan",
  );
  const implementationApplication = applyChatSlashCommandToChatSessionState(
    planApplication.nextChatSessionState,
    "implementation",
  );

  expect(planApplication.nextChatSessionState.selectedAssistantOperatingMode).toBe("plan");
  expect(planApplication.chatSlashCommandApplicationEffect).toBeUndefined();
  expect(implementationApplication.nextChatSessionState.selectedAssistantOperatingMode).toBe("implementation");
});

test("applyChatSlashCommandToChatSessionState toggles reasoning summaries and reports the next visibility", () => {
  const application = applyChatSlashCommandToChatSessionState(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    "thinking",
  );

  expect(application.nextChatSessionState.isReasoningSummaryVisible).toBe(false);
  expect(application.chatSlashCommandApplicationEffect).toEqual({
    effectType: "reasoning_summary_visibility_changed",
    isReasoningSummaryVisible: false,
  } satisfies ChatSlashCommandApplicationEffect);
});

test("applyChatSlashCommandToChatSessionState returns external effects for session commands", () => {
  const initialChatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });

  expect(
    applyChatSlashCommandToChatSessionState(initialChatSessionState, "clear").chatSlashCommandApplicationEffect,
  ).toEqual({ effectType: "clear_current_conversation_session" } satisfies ChatSlashCommandApplicationEffect);
  expect(
    applyChatSlashCommandToChatSessionState(initialChatSessionState, "sessions").chatSlashCommandApplicationEffect,
  ).toEqual({ effectType: "load_conversation_sessions" } satisfies ChatSlashCommandApplicationEffect);
  expect(
    applyChatSlashCommandToChatSessionState(initialChatSessionState, "export-session").chatSlashCommandApplicationEffect,
  ).toEqual({ effectType: "export_current_conversation_session" } satisfies ChatSlashCommandApplicationEffect);
});
