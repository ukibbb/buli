import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AssistantOperatingMode,
  AssistantResponseEvent,
  BuliDiagnosticLogEvent,
  ConversationSessionEntry,
} from "@buli/contracts";
import { AssistantConversationRuntime } from "@buli/engine";
import { OpenAiAuthStore, OpenAiProvider } from "@buli/openai";
import {
  buildScriptedOpenAiSseResponseText,
  createScriptedOpenAiSseResponse,
  type ScriptedOpenAiResponseStep,
} from "./scriptedOpenAiSse.ts";

const SCRIPTED_OPENAI_EVAL_ENDPOINT = "http://buli-eval.invalid/responses";

export type ScriptedOpenAiEvalRequestRecord = Readonly<{
  requestIndex: number;
  requestBody: Record<string, unknown>;
  requestBodyTextLength: number;
}>;

export type ScriptedOpenAiEvalRequestContext = Readonly<{
  requestIndex: number;
  requestBody: Record<string, unknown>;
}>;

export type ScriptedOpenAiEvalModel = (context: ScriptedOpenAiEvalRequestContext) => ScriptedOpenAiResponseStep;

export type ScriptedOpenAiEvalConversationTurnResult = Readonly<{
  assistantResponseEvents: readonly AssistantResponseEvent[];
  conversationSessionEntries: readonly ConversationSessionEntry[];
  finalAssistantMessageText: string;
  requestRecords: readonly ScriptedOpenAiEvalRequestRecord[];
  diagnosticEvents: readonly BuliDiagnosticLogEvent[];
}>;

export async function runScriptedOpenAiEvalConversationTurn(input: {
  workspaceRootPath: string;
  evalStateDirectoryPath: string;
  userPromptText: string;
  assistantOperatingMode?: AssistantOperatingMode | undefined;
  scriptedEvalModel: ScriptedOpenAiEvalModel;
}): Promise<ScriptedOpenAiEvalConversationTurnResult> {
  const requestRecords: ScriptedOpenAiEvalRequestRecord[] = [];
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const authStore = await createScriptedOpenAiEvalAuthStore(input.evalStateDirectoryPath);
  const scriptedFetch = createScriptedOpenAiEvalFetch({
    scriptedEvalModel: input.scriptedEvalModel,
    requestRecords,
  });
  const provider = new OpenAiProvider({
    endpoint: SCRIPTED_OPENAI_EVAL_ENDPOINT,
    store: authStore,
    fetchImpl: scriptedFetch,
  });
  const runtime = new AssistantConversationRuntime({
    conversationTurnProvider: provider,
    workspaceRootPath: input.workspaceRootPath,
    promptContextBrowseRootPath: input.workspaceRootPath,
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  const assistantResponseEvents: AssistantResponseEvent[] = [];
  const activeConversationTurn = runtime.startConversationTurn({
    userPromptText: input.userPromptText,
    selectedModelId: "gpt-5.5",
    ...(input.assistantOperatingMode ? { assistantOperatingMode: input.assistantOperatingMode } : {}),
  });
  for await (const assistantResponseEvent of activeConversationTurn.streamAssistantResponseEvents()) {
    assistantResponseEvents.push(assistantResponseEvent);
  }

  const conversationSessionEntries = runtime.conversationHistory.listConversationSessionEntries();
  return {
    assistantResponseEvents,
    conversationSessionEntries,
    finalAssistantMessageText: readFinalAssistantMessageText(conversationSessionEntries),
    requestRecords,
    diagnosticEvents,
  };
}

function createScriptedOpenAiEvalFetch(input: {
  scriptedEvalModel: ScriptedOpenAiEvalModel;
  requestRecords: ScriptedOpenAiEvalRequestRecord[];
}): typeof fetch {
  const scriptedFetch = async (resource: string | URL | Request, requestInit?: RequestInit): Promise<Response> => {
    const requestBodyText = typeof requestInit?.body === "string" ? requestInit.body : undefined;
    if (requestBodyText === undefined) {
      throw new Error(`Scripted OpenAI eval fetch received a non-Responses request: ${String(resource)}`);
    }

    const requestBody = JSON.parse(requestBodyText) as Record<string, unknown>;
    const requestIndex = input.requestRecords.length;
    input.requestRecords.push({
      requestIndex,
      requestBody,
      requestBodyTextLength: requestBodyText.length,
    });

    const scriptedResponseStep = input.scriptedEvalModel({ requestIndex, requestBody });
    return createScriptedOpenAiSseResponse(buildScriptedOpenAiSseResponseText({
      responseId: `resp_eval_${requestIndex}`,
      scriptedResponseStep,
    }));
  };
  return scriptedFetch as typeof fetch;
}

async function createScriptedOpenAiEvalAuthStore(evalStateDirectoryPath: string): Promise<OpenAiAuthStore> {
  await mkdir(evalStateDirectoryPath, { recursive: true });
  const authFilePath = join(evalStateDirectoryPath, "eval-auth.json");
  await writeFile(
    authFilePath,
    JSON.stringify({
      openai: {
        provider: "openai",
        method: "oauth",
        accessToken: "buli-eval-access-token",
        refreshToken: "buli-eval-refresh-token",
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1_000,
      },
    }),
    "utf8",
  );
  return new OpenAiAuthStore({ filePath: authFilePath });
}

function readFinalAssistantMessageText(conversationSessionEntries: readonly ConversationSessionEntry[]): string {
  for (let entryIndex = conversationSessionEntries.length - 1; entryIndex >= 0; entryIndex -= 1) {
    const conversationSessionEntry = conversationSessionEntries[entryIndex];
    if (conversationSessionEntry?.entryKind === "assistant_message") {
      return conversationSessionEntry.assistantMessageText;
    }
  }
  return "";
}
