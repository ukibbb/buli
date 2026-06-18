import { expect, test } from "bun:test";
import {
  createOpenAiResponsesHttpRequestBody,
  summarizeOpenAiRequestSizeContributorsForDiagnostics,
  summarizeOpenAiResponsesRequestForDiagnostics,
} from "../src/provider/openAiResponsesRequest.ts";

type TestOpenAiToolDefinition = Readonly<{ type: string; name?: string }>;

function listDiagnosticToolNames(toolDefinitions: readonly TestOpenAiToolDefinition[] | undefined): string[] {
  return toolDefinitions?.map((toolDefinition) => toolDefinition.name ?? toolDefinition.type) ?? [];
}

test("createOpenAiResponsesHttpRequestBody builds a streaming reasoning-model request", () => {
  expect(
    createOpenAiResponsesHttpRequestBody({
      selectedModelId: "gpt-5.4",
      systemPromptText: "You are buli.",
      openAiInputItems: [{ role: "user", content: "Run pwd" }],
    }),
  ).toMatchObject({
    model: "gpt-5.4",
    instructions: "You are buli.",
    store: false,
    input: [{ role: "user", content: "Run pwd" }],
    parallel_tool_calls: true,
    include: ["reasoning.encrypted_content"],
    reasoning: { summary: "auto" },
    text: { verbosity: "low" },
    stream: true,
  });
});

test("createOpenAiResponsesHttpRequestBody omits low verbosity for Codex and chat models", () => {
  const codexRequestBody = createOpenAiResponsesHttpRequestBody({
    selectedModelId: "gpt-5.5-codex",
    systemPromptText: "You are buli.",
    openAiInputItems: [{ role: "user", content: "Run pwd" }],
  });
  const chatRequestBody = createOpenAiResponsesHttpRequestBody({
    selectedModelId: "gpt-5.5-chat-latest",
    systemPromptText: "You are buli.",
    openAiInputItems: [{ role: "user", content: "Say hello" }],
  });

  expect(codexRequestBody.text).toBeUndefined();
  expect(chatRequestBody.text).toBeUndefined();
});

test("createOpenAiResponsesHttpRequestBody disables encrypted reasoning include for none effort", () => {
  const requestBody = createOpenAiResponsesHttpRequestBody({
    selectedModelId: "gpt-5.4",
    selectedReasoningEffort: "none",
    promptCacheKey: "buli:test-session",
    availableToolNames: ["read", "glob", "grep"],
    systemPromptText: "You are Buli Explorer.",
    openAiInputItems: [{ role: "user", content: "Explore runtime" }],
  });

  expect(requestBody.include).toBeUndefined();
  expect(requestBody.reasoning).toEqual({ effort: "none" });
  expect(requestBody.prompt_cache_key).toBe("buli:test-session");
  expect(listDiagnosticToolNames(requestBody.tools)).toEqual(["read", "glob", "grep"]);
});

test("createOpenAiResponsesHttpRequestBody includes hosted web search when configured live", () => {
  const requestBody = createOpenAiResponsesHttpRequestBody({
    selectedModelId: "gpt-5.4-mini",
    selectedReasoningEffort: "none",
    availableToolNames: ["read"],
    hostedWebSearch: { mode: "live", searchContentTypes: ["text", "image"] },
    systemPromptText: "You are buli.",
    openAiInputItems: [{ role: "user", content: "Search the web" }],
  });

  expect(listDiagnosticToolNames(requestBody.tools)).toEqual(["read", "web_search"]);
  expect(requestBody.tools?.at(-1)).toEqual({
    type: "web_search",
    external_web_access: true,
    search_content_types: ["text", "image"],
    search_context_size: "high",
  });
  expect(requestBody.include).toEqual(["web_search_call.action.sources", "web_search_call.results"]);
  expect(requestBody.parallel_tool_calls).toBe(true);
  expect(summarizeOpenAiResponsesRequestForDiagnostics({ requestBody, responseStepIndex: 1 })).toMatchObject({
    toolDefinitionCount: 2,
    toolNames: ["read", "web_search"],
    parallelToolCalls: true,
    includesHostedWebSearchSources: true,
    includesHostedWebSearchResults: true,
  });
});

test("createOpenAiResponsesHttpRequestBody merges reasoning and hosted web search includes without duplicates", () => {
  const requestBody = createOpenAiResponsesHttpRequestBody({
    selectedModelId: "gpt-5.4",
    hostedWebSearch: { mode: "live", includeSources: true, includeResults: true },
    systemPromptText: "You are buli.",
    openAiInputItems: [{ role: "user", content: "Search current docs" }],
  });

  expect(requestBody.include).toEqual([
    "web_search_call.action.sources",
    "web_search_call.results",
    "reasoning.encrypted_content",
  ]);
});

test("createOpenAiResponsesHttpRequestBody omits hosted web search when configured disabled", () => {
  const requestBody = createOpenAiResponsesHttpRequestBody({
    selectedModelId: "gpt-5.4-mini",
    availableToolNames: [],
    hostedWebSearch: { mode: "disabled" },
    systemPromptText: "You are buli.",
    openAiInputItems: [{ role: "user", content: "No web access" }],
  });

  expect(requestBody.tools).toBeUndefined();
  expect(requestBody.parallel_tool_calls).toBeUndefined();
});

test("createOpenAiResponsesHttpRequestBody omits tool fields when no tools are available", () => {
  const requestBody = createOpenAiResponsesHttpRequestBody({
    selectedModelId: "gpt-5.4",
    availableToolNames: [],
    systemPromptText: "You are buli.",
    openAiInputItems: [{ role: "user", content: "Summarize only" }],
  });

  expect(requestBody.tools).toBeUndefined();
  expect(requestBody.parallel_tool_calls).toBeUndefined();
  expect(summarizeOpenAiResponsesRequestForDiagnostics({ requestBody, responseStepIndex: 1 })).toMatchObject({
    toolDefinitionCount: 0,
    toolNames: [],
    parallelToolCalls: false,
  });
});

test("summarizeOpenAiResponsesRequestForDiagnostics reports counts without raw content", () => {
  const requestBody = createOpenAiResponsesHttpRequestBody({
    selectedModelId: "gpt-5.4",
    availableToolNames: [],
    systemPromptText: "You are buli.",
    openAiInputItems: [
      { role: "user", content: "Inspect README" },
      {
        type: "reasoning",
        id: "rs_1",
        encrypted_content: "encrypted-reasoning",
        summary: [],
      },
      {
        type: "function_call_output",
        call_id: "call_1",
        output: "README contents",
      },
    ],
  });

  expect(summarizeOpenAiResponsesRequestForDiagnostics({ requestBody, responseStepIndex: 2 })).toMatchObject({
    responseStepIndex: 2,
    model: "gpt-5.4",
    reasoningSummary: "auto",
    textVerbosity: "low",
    includesReasoningEncryptedContent: true,
    inputItemCount: 3,
    userMessageInputItemCount: 1,
    reasoningInputItemCount: 1,
    reasoningEncryptedContentItemCount: 1,
    functionCallOutputInputItemCount: 1,
    functionCallOutputLength: "README contents".length,
  });
});

test("summarizeOpenAiRequestSizeContributorsForDiagnostics reports largest visible contributors without raw content", () => {
  const rawSecretToolText = "SECRET_TOOL_OUTPUT_".repeat(20);
  const requestBody = createOpenAiResponsesHttpRequestBody({
    selectedModelId: "gpt-5.4",
    availableToolNames: [],
    systemPromptText: "You are buli.",
    openAiInputItems: [
      { role: "user", content: "Inspect README" },
      {
        type: "function_call_output",
        call_id: "call_1",
        output: rawSecretToolText,
      },
    ],
  });

  const diagnostics = summarizeOpenAiRequestSizeContributorsForDiagnostics({
    requestBody,
    largestContributorCount: 1,
  });

  expect(diagnostics).toMatchObject({
    requestStableSerializedByteLength: expect.any(Number),
    requestInputSerializedByteLength: expect.any(Number),
    requestLargestContributorKinds: ["input_function_call_output"],
    requestLargestContributorInputItemIndexes: [1],
    requestLargestContributorSerializedByteLengths: [expect.any(Number)],
    requestLargestContributorTextLengths: [rawSecretToolText.length],
  });
  expect(JSON.stringify(diagnostics)).not.toContain(rawSecretToolText);
});
