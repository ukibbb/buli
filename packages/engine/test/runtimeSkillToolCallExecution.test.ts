import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ConversationSessionEntry,
  ProviderStreamEvent,
  TokenUsage,
} from "@buli/contracts";
import type {
  ConversationTurnProvider,
  ProviderConversationTurn,
  ProviderConversationTurnRequest,
  ProviderToolResultSubmission,
} from "../src/index.ts";
import { AssistantConversationRuntime, InMemoryConversationHistory } from "../src/index.ts";

const completedUsage: TokenUsage = {
  total: 12,
  input: 7,
  output: 5,
  reasoning: 0,
  cache: { read: 0, write: 0 },
};

type CompletedToolResultConversationSessionEntry = Extract<
  ConversationSessionEntry,
  { entryKind: "completed_tool_result" }
>;

class CompletedProviderTurn implements ProviderConversationTurn {
  async *streamProviderEvents(): AsyncGenerator<ProviderStreamEvent> {
    yield { type: "completed", usage: completedUsage };
  }

  async submitToolResult(_input: ProviderToolResultSubmission): Promise<void> {}

  getProviderTurnReplay() {
    return undefined;
  }
}

class SkillToolRequestingProviderTurn implements ProviderConversationTurn {
  readonly submittedToolResults: ProviderToolResultSubmission[] = [];
  private resolveSubmittedToolResult: (() => void) | undefined;
  private readonly submittedToolResultPromise = new Promise<void>((resolveSubmittedToolResult) => {
    this.resolveSubmittedToolResult = resolveSubmittedToolResult;
  });

  async *streamProviderEvents(): AsyncGenerator<ProviderStreamEvent> {
    yield {
      type: "tool_call_requested",
      toolCallId: "call-skill-1",
      toolCallRequest: { toolName: "skill", skillName: "code-review" },
    };
    await this.submittedToolResultPromise;
    yield { type: "completed", usage: completedUsage };
  }

  async submitToolResult(input: ProviderToolResultSubmission): Promise<void> {
    this.submittedToolResults.push(input);
    this.resolveSubmittedToolResult?.();
  }

  getProviderTurnReplay() {
    return undefined;
  }
}

class RecordingConversationTurnProvider implements ConversationTurnProvider {
  readonly startedTurnRequests: ProviderConversationTurnRequest[] = [];
  private readonly providerTurns: ProviderConversationTurn[];

  constructor(providerTurns: readonly ProviderConversationTurn[]) {
    this.providerTurns = [...providerTurns];
  }

  startConversationTurn(input: ProviderConversationTurnRequest): ProviderConversationTurn {
    this.startedTurnRequests.push(input);
    const providerTurn = this.providerTurns.shift();
    if (!providerTurn) {
      throw new Error("No provider turn was configured");
    }

    return providerTurn;
  }
}

async function collectAssistantEvents(activeConversationTurn: ReturnType<AssistantConversationRuntime["startConversationTurn"]>) {
  const emittedAssistantEvents = [];
  for await (const assistantResponseEvent of activeConversationTurn.streamAssistantResponseEvents()) {
    emittedAssistantEvents.push(assistantResponseEvent);
  }
  return emittedAssistantEvents;
}

async function writeSkillFile(input: {
  workspaceRootPath: string;
  name: string;
  description?: string | undefined;
  instructionText: string;
}): Promise<string> {
  const skillDirectoryPath = join(input.workspaceRootPath, ".buli", "skills", input.name);
  await mkdir(skillDirectoryPath, { recursive: true });
  const skillInstructionFilePath = join(skillDirectoryPath, "SKILL.md");
  await writeFile(
    skillInstructionFilePath,
    [
      "---",
      `name: ${input.name}`,
      ...(input.description !== undefined ? [`description: ${input.description}`] : []),
      "---",
      "",
      input.instructionText,
    ].join("\n"),
    "utf8",
  );
  return skillInstructionFilePath;
}

function findCompletedToolResultEntry(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): CompletedToolResultConversationSessionEntry | undefined {
  return conversationSessionEntries.find((conversationSessionEntry): conversationSessionEntry is CompletedToolResultConversationSessionEntry =>
    conversationSessionEntry.entryKind === "completed_tool_result"
  );
}

test("AssistantConversationRuntime injects a user-selected skill while preserving the visible prompt", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-runtime-selected-skill-"));
  await writeSkillFile({
    workspaceRootPath,
    name: "code-review",
    description: "Review code changes",
    instructionText: "Always inspect tests before judging the change.",
  });
  const conversationHistory = new InMemoryConversationHistory();
  const provider = new RecordingConversationTurnProvider([new CompletedProviderTurn()]);
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    conversationHistory,
    workspaceRootPath,
    promptContextBrowseRootPath: workspaceRootPath,
    skillHomeDirectoryPath: workspaceRootPath,
  });

  await collectAssistantEvents(runtime.startConversationTurn({
    userPromptText: "/code-review",
    userSelectedSkillName: "code-review",
    selectedModelId: "gpt-5.5",
  }));

  const startedTurnRequest = provider.startedTurnRequests[0];
  expect(startedTurnRequest?.systemPromptText).toContain('<skill name="code-review">');
  expect(startedTurnRequest?.systemPromptText).toContain("Review code changes");
  const userPromptEntry = startedTurnRequest?.conversationSessionEntries[0];
  if (userPromptEntry?.entryKind !== "user_prompt") {
    throw new Error("Expected provider turn history to start with the selected skill user prompt.");
  }

  expect(userPromptEntry.promptText).toBe("/code-review");
  expect(userPromptEntry.modelFacingPromptText).toContain('<user_selected_skill name="code-review">');
  expect(userPromptEntry.modelFacingPromptText).toContain("Always inspect tests before judging the change.");
});

test("AssistantConversationRuntime only advertises skills when the skill tool is available", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-runtime-skill-tool-filter-"));
  await writeSkillFile({
    workspaceRootPath,
    name: "code-review",
    description: "Review code changes",
    instructionText: "Always inspect tests before judging the change.",
  });
  const provider = new RecordingConversationTurnProvider([new CompletedProviderTurn()]);
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath,
    promptContextBrowseRootPath: workspaceRootPath,
    skillHomeDirectoryPath: workspaceRootPath,
    availableToolNames: ["read"],
  });

  await collectAssistantEvents(runtime.startConversationTurn({
    userPromptText: "Please review this change.",
    selectedModelId: "gpt-5.5",
  }));

  expect(provider.startedTurnRequests[0]?.availableToolNames).toEqual(["read"]);
  expect(provider.startedTurnRequests[0]?.systemPromptText).not.toContain("<available_skills>");
  expect(provider.startedTurnRequests[0]?.systemPromptText).not.toContain("Use the skill tool");
  expect(provider.startedTurnRequests[0]?.systemPromptText).not.toContain("code-review");
});

test("AssistantConversationRuntime auto-runs skill tool calls in read-only modes", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-runtime-skill-tool-"));
  await writeSkillFile({
    workspaceRootPath,
    name: "code-review",
    description: "Review code changes",
    instructionText: "Always inspect tests before judging the change.",
  });
  const conversationHistory = new InMemoryConversationHistory();
  const providerTurn = new SkillToolRequestingProviderTurn();
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: new RecordingConversationTurnProvider([providerTurn]),
    conversationHistory,
    workspaceRootPath,
    promptContextBrowseRootPath: workspaceRootPath,
    skillHomeDirectoryPath: workspaceRootPath,
  });

  await collectAssistantEvents(runtime.startConversationTurn({
    userPromptText: "Please review this change.",
    selectedModelId: "gpt-5.5",
  }));

  expect(providerTurn.submittedToolResults).toHaveLength(1);
  expect(providerTurn.submittedToolResults[0]).toMatchObject({
    toolCallId: "call-skill-1",
    toolResultText: expect.stringContaining('<skill_content name="code-review">'),
  });
  const completedToolResultEntry = findCompletedToolResultEntry(conversationHistory.listConversationSessionEntries());
  expect(completedToolResultEntry).toMatchObject({
    toolCallId: "call-skill-1",
    toolCallDetail: {
      toolName: "skill",
      skillName: "code-review",
      skillDescription: "Review code changes",
      skillSourceKind: "buli",
    },
  });
});
