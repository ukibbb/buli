import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  MAX_SKILL_NAME_LENGTH,
  SKILL_NAME_PATTERN_TEXT,
  type ToolCallSkillSourceKind,
} from "@buli/contracts";
import { escapeModelFacingXmlAttributeValue, escapeModelFacingXmlText } from "../modelFacingXmlEscaping.ts";
import { BUILT_IN_SKILLS } from "./builtInSkills.ts";

export type AvailableSkill = {
  name: string;
  description?: string;
  sourceKind: ToolCallSkillSourceKind;
  instructionFilePath?: string;
  baseDirectoryPath?: string;
};

export type LoadedSkill = AvailableSkill & {
  instructionText: string;
};

type SkillDiscoveryRoot = {
  rootPath: string;
  sourceKind: Exclude<ToolCallSkillSourceKind, "built_in">;
};

type ParsedSkillMarkdown = {
  name: string;
  description?: string;
  instructionText: string;
};

const SKILL_INSTRUCTION_FILE_NAME = "SKILL.md";
const SKILL_NAME_PATTERN = new RegExp(SKILL_NAME_PATTERN_TEXT);

export class WorkspaceSkillCatalog {
  readonly workspaceRootPath: string;
  readonly homeDirectoryPath: string;

  constructor(input: {
    workspaceRootPath: string;
    homeDirectoryPath?: string | undefined;
  }) {
    this.workspaceRootPath = input.workspaceRootPath;
    this.homeDirectoryPath = input.homeDirectoryPath ?? homedir();
  }

  async listAvailableSkills(): Promise<readonly AvailableSkill[]> {
    return (await this.listLoadedSkills()).map((loadedSkill) => ({
      name: loadedSkill.name,
      ...(loadedSkill.description !== undefined ? { description: loadedSkill.description } : {}),
      sourceKind: loadedSkill.sourceKind,
      ...(loadedSkill.instructionFilePath !== undefined ? { instructionFilePath: loadedSkill.instructionFilePath } : {}),
      ...(loadedSkill.baseDirectoryPath !== undefined ? { baseDirectoryPath: loadedSkill.baseDirectoryPath } : {}),
    }));
  }

  async loadSkillByName(skillName: string): Promise<LoadedSkill | undefined> {
    return (await this.listLoadedSkills()).find((loadedSkill) => loadedSkill.name === skillName);
  }

  async listLoadedSkills(): Promise<readonly LoadedSkill[]> {
    const loadedSkillByName = new Map<string, LoadedSkill>();
    for (const loadedSkill of await this.discoverDiskSkills()) {
      if (!loadedSkillByName.has(loadedSkill.name)) {
        loadedSkillByName.set(loadedSkill.name, loadedSkill);
      }
    }
    for (const builtInSkill of BUILT_IN_SKILLS) {
      if (!loadedSkillByName.has(builtInSkill.name)) {
        loadedSkillByName.set(builtInSkill.name, builtInSkill);
      }
    }

    return [...loadedSkillByName.values()].sort((leftSkill, rightSkill) => leftSkill.name.localeCompare(rightSkill.name));
  }

  private async discoverDiskSkills(): Promise<LoadedSkill[]> {
    const loadedSkills: LoadedSkill[] = [];
    for (const discoveryRoot of this.listSkillDiscoveryRoots()) {
      for (const instructionFilePath of await listSkillInstructionFilePaths(join(discoveryRoot.rootPath, "skills"))) {
        const parsedSkillMarkdown = parseSkillMarkdown(await readFile(instructionFilePath, "utf8"));
        if (!parsedSkillMarkdown) {
          continue;
        }

        loadedSkills.push({
          name: parsedSkillMarkdown.name,
          ...(parsedSkillMarkdown.description !== undefined ? { description: parsedSkillMarkdown.description } : {}),
          sourceKind: discoveryRoot.sourceKind,
          instructionFilePath,
          baseDirectoryPath: dirname(instructionFilePath),
          instructionText: parsedSkillMarkdown.instructionText,
        });
      }
    }

    return loadedSkills;
  }

  private listSkillDiscoveryRoots(): readonly SkillDiscoveryRoot[] {
    return [
      { rootPath: join(this.workspaceRootPath, ".buli"), sourceKind: "buli" },
      { rootPath: join(this.homeDirectoryPath, ".buli"), sourceKind: "buli" },
      { rootPath: join(this.workspaceRootPath, ".agents"), sourceKind: "agents" },
      { rootPath: join(this.workspaceRootPath, ".claude"), sourceKind: "claude" },
    ];
  }
}

export function formatSkillContentForModel(loadedSkill: LoadedSkill): string {
  return [
    `<skill_content name="${escapeModelFacingXmlAttributeValue(loadedSkill.name)}">`,
    `# Skill: ${escapeModelFacingXmlText(loadedSkill.name)}`,
    "",
    escapeModelFacingXmlText(loadedSkill.instructionText.trim()),
    "",
    ...formatSkillBaseDirectoryLines(loadedSkill),
    "</skill_content>",
  ].join("\n");
}

export function formatUserSelectedSkillPromptForModel(loadedSkill: LoadedSkill): string {
  return [
    `<user_selected_skill name="${escapeModelFacingXmlAttributeValue(loadedSkill.name)}">`,
    `The user selected /${escapeModelFacingXmlText(loadedSkill.name)}. Follow this skill's instructions for this turn.`,
    "</user_selected_skill>",
    "",
    formatSkillContentForModel(loadedSkill),
  ].join("\n");
}

export function parseSkillMarkdown(markdownText: string): ParsedSkillMarkdown | undefined {
  const normalizedMarkdownText = markdownText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const markdownLines = normalizedMarkdownText.split("\n");
  if (markdownLines[0]?.trim() !== "---") {
    return undefined;
  }

  const closingFrontmatterLineIndex = markdownLines.findIndex((markdownLine, markdownLineIndex) =>
    markdownLineIndex > 0 && markdownLine.trim() === "---"
  );
  if (closingFrontmatterLineIndex < 0) {
    return undefined;
  }

  const frontmatterFields = parseSkillFrontmatterFields(markdownLines.slice(1, closingFrontmatterLineIndex));
  const skillName = frontmatterFields.get("name");
  if (!skillName || !isValidSkillName(skillName)) {
    return undefined;
  }

  const skillDescription = frontmatterFields.get("description");
  return {
    name: skillName,
    ...(skillDescription !== undefined && skillDescription.length > 0 ? { description: skillDescription } : {}),
    instructionText: markdownLines.slice(closingFrontmatterLineIndex + 1).join("\n").trim(),
  };
}

async function listSkillInstructionFilePaths(skillsRootPath: string): Promise<string[]> {
  const instructionFilePaths: string[] = [];
  async function visitDirectory(directoryPath: string): Promise<void> {
    const directoryEntries = await readdir(directoryPath, { withFileTypes: true }).catch(() => []);
    directoryEntries.sort((leftDirectoryEntry, rightDirectoryEntry) => {
      if (leftDirectoryEntry.isDirectory() !== rightDirectoryEntry.isDirectory()) {
        return leftDirectoryEntry.isDirectory() ? -1 : 1;
      }

      return leftDirectoryEntry.name.localeCompare(rightDirectoryEntry.name);
    });

    for (const directoryEntry of directoryEntries) {
      if (directoryEntry.isSymbolicLink()) {
        continue;
      }

      const entryPath = join(directoryPath, directoryEntry.name);
      if (directoryEntry.isDirectory()) {
        await visitDirectory(entryPath);
        continue;
      }

      if (directoryEntry.isFile() && directoryEntry.name === SKILL_INSTRUCTION_FILE_NAME) {
        instructionFilePaths.push(entryPath);
      }
    }
  }

  await visitDirectory(skillsRootPath);
  return instructionFilePaths;
}

function parseSkillFrontmatterFields(frontmatterLines: readonly string[]): Map<string, string> {
  const frontmatterFields = new Map<string, string>();
  for (const frontmatterLine of frontmatterLines) {
    const frontmatterFieldMatch = frontmatterLine.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!frontmatterFieldMatch) {
      continue;
    }

    const frontmatterFieldName = frontmatterFieldMatch[1];
    const rawFrontmatterFieldValue = frontmatterFieldMatch[2];
    if (!frontmatterFieldName || rawFrontmatterFieldValue === undefined) {
      continue;
    }

    frontmatterFields.set(frontmatterFieldName, parseFrontmatterStringValue(rawFrontmatterFieldValue));
  }

  return frontmatterFields;
}

function parseFrontmatterStringValue(rawFrontmatterFieldValue: string): string {
  const trimmedFrontmatterFieldValue = rawFrontmatterFieldValue.trim();
  if (
    trimmedFrontmatterFieldValue.length >= 2 &&
    trimmedFrontmatterFieldValue.startsWith('"') &&
    trimmedFrontmatterFieldValue.endsWith('"')
  ) {
    return trimmedFrontmatterFieldValue.slice(1, -1);
  }
  if (
    trimmedFrontmatterFieldValue.length >= 2 &&
    trimmedFrontmatterFieldValue.startsWith("'") &&
    trimmedFrontmatterFieldValue.endsWith("'")
  ) {
    return trimmedFrontmatterFieldValue.slice(1, -1);
  }

  return trimmedFrontmatterFieldValue;
}

function isValidSkillName(skillName: string): boolean {
  return skillName.length <= MAX_SKILL_NAME_LENGTH && SKILL_NAME_PATTERN.test(skillName);
}

function formatSkillBaseDirectoryLines(loadedSkill: LoadedSkill): string[] {
  if (!loadedSkill.baseDirectoryPath) {
    return [];
  }

  return [
    `Base directory for this skill: ${escapeModelFacingXmlText(pathToFileURL(loadedSkill.baseDirectoryPath).href)}`,
    "Relative paths in this skill are relative to this base directory.",
    ...(loadedSkill.instructionFilePath
      ? [`Instruction file: ${escapeModelFacingXmlText(pathToFileURL(loadedSkill.instructionFilePath).href)}`]
      : []),
  ];
}
