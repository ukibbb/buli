import { expect, test } from "bun:test";
import {
  createOpenAiResponsesHttpRequestBody,
  summarizeOpenAiResponsesRequestForDiagnostics,
} from "../src/provider/openAiResponsesRequest.ts";

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
    availablePresentationFunctionNames: [],
    systemPromptText: "You are Buli Explorer.",
    openAiInputItems: [{ role: "user", content: "Explore runtime" }],
  });

  expect(requestBody.include).toBeUndefined();
  expect(requestBody.reasoning).toEqual({ effort: "none" });
  expect(requestBody.prompt_cache_key).toBe("buli:test-session");
  expect(requestBody.tools?.map((toolDefinition) => toolDefinition.name)).toEqual(["read", "glob", "grep"]);
});

test("createOpenAiResponsesHttpRequestBody omits tool fields when no tools are available", () => {
  const requestBody = createOpenAiResponsesHttpRequestBody({
    selectedModelId: "gpt-5.4",
    availableToolNames: [],
    availablePresentationFunctionNames: [],
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
