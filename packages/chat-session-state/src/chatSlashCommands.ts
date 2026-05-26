import type { ReasoningSummaryDisplayMode, SlashCommand } from "./chatSessionState.ts";
import {
  isSkillChatSlashCommandValue,
  listChatCommandDefinitions,
  readSkillNameFromChatSlashCommandValue,
  type BuiltInChatSlashCommandValue,
  type ChatSlashCommandSkill,
  type ChatSlashCommandValue,
  type SkillChatSlashCommandValue,
} from "./chatCommandCatalog.ts";

export type {
  BuiltInChatSlashCommandValue,
  ChatSlashCommandSkill,
  ChatSlashCommandValue,
  SkillChatSlashCommandValue,
};
export { isSkillChatSlashCommandValue, readSkillNameFromChatSlashCommandValue };

export type ChatSlashCommand = SlashCommand & {
  value: ChatSlashCommandValue;
};

export function buildChatSlashCommands(input: {
  reasoningSummaryDisplayMode: ReasoningSummaryDisplayMode;
  availableSkills?: readonly ChatSlashCommandSkill[];
}): readonly ChatSlashCommand[] {
  return listChatCommandDefinitions(input).map((chatCommandDefinition) => ({
    name: chatCommandDefinition.name,
    value: chatCommandDefinition.value,
    description: chatCommandDefinition.description,
  }));
}
