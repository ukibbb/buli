import type { ChatSessionState, SlashCommand } from "./chatSessionState.ts";
import { showCommandHelpModal } from "./commandHelpModalReducer.ts";
import { appendSubmittedUserPromptToConversation } from "./promptDraftReducer.ts";
import { toggleReasoningSummaryDisplayMode } from "./reasoningSummaryVisibilityReducer.ts";

export type BuiltInChatSlashCommandValue =
  | "clear"
  | "compact"
  | "export-session"
  | "help"
  | "model"
  | "sessions"
  | "thinking";

export type SkillChatSlashCommandValue = `skill:${string}`;

export type ChatSlashCommandValue = BuiltInChatSlashCommandValue | SkillChatSlashCommandValue;

export type ChatSlashCommandSkill = {
  name: string;
  description?: string;
};

export type ChatCommandCategory = "display" | "help" | "model" | "session" | "skill";

export type ChatSlashCommandApplicationEffect =
  | { effectType: "clear_current_conversation_session" }
  | { effectType: "compact_current_conversation_session" }
  | { effectType: "export_current_conversation_session" }
  | { effectType: "load_available_assistant_models" }
  | { effectType: "load_conversation_sessions" }
  | {
      effectType: "stream_assistant_response_for_selected_skill";
      skillName: string;
      submittedPromptText: string;
    }
  | {
      effectType: "reasoning_summary_display_mode_changed";
      reasoningSummaryDisplayMode: ChatSessionState["reasoningSummaryDisplayMode"];
    };

export type ChatSlashCommandApplication = {
  nextChatSessionState: ChatSessionState;
  chatSlashCommandApplicationEffect: ChatSlashCommandApplicationEffect | undefined;
};

export type ChatCommandDefinition = SlashCommand & {
  category: ChatCommandCategory;
  value: ChatSlashCommandValue;
  apply: (chatSessionState: ChatSessionState) => ChatSlashCommandApplication;
};

type BuiltInChatCommandDefinition = Omit<ChatCommandDefinition, "description"> & {
  value: BuiltInChatSlashCommandValue;
  description: string | ((input: Pick<ChatSessionState, "reasoningSummaryDisplayMode">) => string);
};

const builtInChatCommandDefinitions = [
  {
    name: "help",
    value: "help",
    category: "help",
    description: "Show available commands and shortcuts",
    apply: (chatSessionState) => createChatSlashCommandApplication({
      nextChatSessionState: showCommandHelpModal(chatSessionState),
    }),
  },
  {
    name: "model",
    value: "model",
    category: "model",
    description: "Choose OpenAI model and reasoning effort",
    apply: (chatSessionState) => createChatSlashCommandApplication({
      nextChatSessionState: chatSessionState,
      chatSlashCommandApplicationEffect: { effectType: "load_available_assistant_models" },
    }),
  },
  {
    name: "clear",
    value: "clear",
    category: "session",
    description: "Clear conversation history",
    apply: (chatSessionState) => createChatSlashCommandApplication({
      nextChatSessionState: chatSessionState,
      chatSlashCommandApplicationEffect: { effectType: "clear_current_conversation_session" },
    }),
  },
  {
    name: "compact",
    value: "compact",
    category: "session",
    description: "Summarize old context for this session",
    apply: (chatSessionState) => createChatSlashCommandApplication({
      nextChatSessionState: chatSessionState,
      chatSlashCommandApplicationEffect: { effectType: "compact_current_conversation_session" },
    }),
  },
  {
    name: "sessions",
    value: "sessions",
    category: "session",
    description: "Switch or delete saved sessions",
    apply: (chatSessionState) => createChatSlashCommandApplication({
      nextChatSessionState: chatSessionState,
      chatSlashCommandApplicationEffect: { effectType: "load_conversation_sessions" },
    }),
  },
  {
    name: "export-session",
    value: "export-session",
    category: "session",
    description: "Export current session as HTML",
    apply: (chatSessionState) => createChatSlashCommandApplication({
      nextChatSessionState: chatSessionState,
      chatSlashCommandApplicationEffect: { effectType: "export_current_conversation_session" },
    }),
  },
  {
    name: "thinking",
    value: "thinking",
    category: "display",
    description: (chatSessionState) => chatSessionState.reasoningSummaryDisplayMode === "expanded" ? "Collapse thinking" : "Expand thinking",
    apply: (chatSessionState) => {
      const nextChatSessionState = toggleReasoningSummaryDisplayMode(chatSessionState);
      return createChatSlashCommandApplication({
        nextChatSessionState,
        chatSlashCommandApplicationEffect: {
          effectType: "reasoning_summary_display_mode_changed",
          reasoningSummaryDisplayMode: nextChatSessionState.reasoningSummaryDisplayMode,
        },
      });
    },
  },
] as const satisfies readonly BuiltInChatCommandDefinition[];

export function listChatCommandDefinitions(input: {
  reasoningSummaryDisplayMode: ChatSessionState["reasoningSummaryDisplayMode"];
  availableSkills?: readonly ChatSlashCommandSkill[];
}): readonly ChatCommandDefinition[] {
  const builtInCommandDefinitions = builtInChatCommandDefinitions.map((chatCommandDefinition) => ({
    ...chatCommandDefinition,
    description: typeof chatCommandDefinition.description === "function"
      ? chatCommandDefinition.description({ reasoningSummaryDisplayMode: input.reasoningSummaryDisplayMode })
      : chatCommandDefinition.description,
  }));
  const builtInCommandNames = new Set<string>(builtInCommandDefinitions.map((chatCommandDefinition) => chatCommandDefinition.name));
  return [
    ...builtInCommandDefinitions,
    ...(input.availableSkills ?? [])
      .filter((availableSkill) => !builtInCommandNames.has(availableSkill.name))
      .map(createSkillChatCommandDefinition),
  ];
}

export function findChatCommandDefinition(input: {
  slashCommandValue: string;
  reasoningSummaryDisplayMode: ChatSessionState["reasoningSummaryDisplayMode"];
}): ChatCommandDefinition | undefined {
  if (isSkillChatSlashCommandValue(input.slashCommandValue)) {
    return createSkillChatCommandDefinition({ name: readSkillNameFromChatSlashCommandValue(input.slashCommandValue) });
  }

  return listChatCommandDefinitions({
    reasoningSummaryDisplayMode: input.reasoningSummaryDisplayMode,
  }).find((chatCommandDefinition) => chatCommandDefinition.value === input.slashCommandValue);
}

export function isSkillChatSlashCommandValue(slashCommandValue: string): slashCommandValue is SkillChatSlashCommandValue {
  return slashCommandValue.startsWith("skill:") && slashCommandValue.length > "skill:".length;
}

export function readSkillNameFromChatSlashCommandValue(slashCommandValue: SkillChatSlashCommandValue): string {
  return slashCommandValue.slice("skill:".length);
}

function createSkillChatCommandDefinition(availableSkill: ChatSlashCommandSkill): ChatCommandDefinition {
  const submittedPromptText = `/${availableSkill.name}`;
  return {
    name: availableSkill.name,
    value: `skill:${availableSkill.name}`,
    category: "skill",
    description: availableSkill.description ?? `Use the ${availableSkill.name} skill`,
    apply: (chatSessionState) => createChatSlashCommandApplication({
      nextChatSessionState: appendSubmittedUserPromptToConversation({
        chatSessionState,
        submittedPromptText,
        submittedPromptImageAttachments: [],
      }),
      chatSlashCommandApplicationEffect: {
        effectType: "stream_assistant_response_for_selected_skill",
        skillName: availableSkill.name,
        submittedPromptText,
      },
    }),
  };
}

function createChatSlashCommandApplication(input: {
  nextChatSessionState: ChatSessionState;
  chatSlashCommandApplicationEffect?: ChatSlashCommandApplicationEffect | undefined;
}): ChatSlashCommandApplication {
  return {
    nextChatSessionState: input.nextChatSessionState,
    chatSlashCommandApplicationEffect: input.chatSlashCommandApplicationEffect,
  };
}
