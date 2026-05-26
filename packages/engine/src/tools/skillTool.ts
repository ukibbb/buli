import {
  createStartedToolCallDetailFromRequest,
  type SkillToolCallRequest,
  type ToolCallSkillDetail,
} from "@buli/contracts";
import { formatSkillContentForModel, type WorkspaceSkillCatalog } from "../skills/skillCatalog.ts";
import type { ToolCallOutcome } from "./toolCallOutcome.ts";

export function createStartedSkillToolCallDetail(skillToolCallRequest: SkillToolCallRequest): ToolCallSkillDetail {
  return createStartedToolCallDetailFromRequest(skillToolCallRequest);
}

export async function runSkillToolCall(input: {
  skillToolCallRequest: SkillToolCallRequest;
  skillCatalog: WorkspaceSkillCatalog;
}): Promise<ToolCallOutcome> {
  const startedAtMilliseconds = Date.now();
  const startedToolCallDetail = createStartedSkillToolCallDetail(input.skillToolCallRequest);
  const loadedSkill = await input.skillCatalog.loadSkillByName(input.skillToolCallRequest.skillName);
  if (!loadedSkill) {
    const availableSkillNames = (await input.skillCatalog.listAvailableSkills()).map((availableSkill) => availableSkill.name);
    const failureExplanation = `Skill "${input.skillToolCallRequest.skillName}" not found. Available skills: ${availableSkillNames.join(", ") || "none"}.`;
    return {
      outcomeKind: "failed",
      toolCallDetail: startedToolCallDetail,
      toolResultText: `Skill failed: ${failureExplanation}`,
      failureExplanation,
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  }

  const toolCallDetail: ToolCallSkillDetail = {
    toolName: "skill",
    skillName: loadedSkill.name,
    ...(loadedSkill.description !== undefined ? { skillDescription: loadedSkill.description } : {}),
    skillSourceKind: loadedSkill.sourceKind,
    ...(loadedSkill.instructionFilePath !== undefined ? { skillInstructionFilePath: loadedSkill.instructionFilePath } : {}),
  };
  return {
    outcomeKind: "completed",
    toolCallDetail,
    toolResultText: formatSkillContentForModel(loadedSkill),
    durationMilliseconds: Date.now() - startedAtMilliseconds,
  };
}
