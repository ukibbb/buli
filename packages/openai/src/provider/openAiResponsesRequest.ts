import type {
  BuliDiagnosticLogFields,
  ProviderAvailablePresentationFunctionName,
  ProviderAvailableToolName,
  ReasoningEffort,
} from "@buli/contracts";
import type { OpenAiConversationInputItem } from "./request.ts";
import { createOpenAiToolDefinitions, type OpenAiToolDefinition } from "./toolDefinitions.ts";

type OpenAiReasoningRequest = {
  effort?: ReasoningEffort;
  summary?: "auto";
};

type OpenAiTextRequest = {
  verbosity: "low";
};

export type CreateOpenAiResponsesHttpRequestBodyInput = {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  promptCacheKey?: string;
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
  availablePresentationFunctionNames?: readonly ProviderAvailablePresentationFunctionName[] | undefined;
  systemPromptText: string;
  openAiInputItems: ReadonlyArray<OpenAiConversationInputItem>;
};

export type OpenAiResponsesHttpRequestBody = {
  model: string;
  instructions: string;
  store: false;
  prompt_cache_key?: string;
  input: ReadonlyArray<OpenAiConversationInputItem>;
  tools?: OpenAiToolDefinition[];
  parallel_tool_calls?: true;
  include?: readonly ["reasoning.encrypted_content"];
  reasoning?: OpenAiReasoningRequest;
  text?: OpenAiTextRequest;
  stream: true;
};

export function createOpenAiResponsesHttpRequestBody(
  input: CreateOpenAiResponsesHttpRequestBodyInput,
): OpenAiResponsesHttpRequestBody {
  const reasoningRequest = createReasoningRequest(input);
  const toolDefinitions = createOpenAiToolDefinitions({
    availableToolNames: input.availableToolNames,
    availablePresentationFunctionNames: input.availablePresentationFunctionNames,
  });
  return {
    model: input.selectedModelId,
    instructions: input.systemPromptText,
    store: false,
    ...(input.promptCacheKey ? { prompt_cache_key: input.promptCacheKey } : {}),
    input: input.openAiInputItems,
    ...(toolDefinitions.length > 0 ? { tools: toolDefinitions, parallel_tool_calls: true as const } : {}),
    ...(shouldIncludeReasoningEncryptedContent(input) ? { include: ["reasoning.encrypted_content"] as const } : {}),
    ...(reasoningRequest ? { reasoning: reasoningRequest } : {}),
    ...(shouldRequestLowTextVerbosity(input.selectedModelId) ? { text: { verbosity: "low" as const } } : {}),
    stream: true,
  };
}

export function summarizeOpenAiResponsesRequestForDiagnostics(input: {
  requestBody: OpenAiResponsesHttpRequestBody;
  responseStepIndex: number;
}): BuliDiagnosticLogFields {
  const inputItemSummary = summarizeOpenAiInputItemsForDiagnostics(input.requestBody.input);
  return {
    responseStepIndex: input.responseStepIndex,
    model: input.requestBody.model,
    reasoningEffort: input.requestBody.reasoning?.effort ?? null,
    reasoningSummary: input.requestBody.reasoning?.summary ?? null,
    textVerbosity: input.requestBody.text?.verbosity ?? null,
    includesReasoningEncryptedContent: input.requestBody.include?.includes("reasoning.encrypted_content") ?? false,
    hasPromptCacheKey: input.requestBody.prompt_cache_key !== undefined,
    toolDefinitionCount: input.requestBody.tools?.length ?? 0,
    toolNames: input.requestBody.tools?.map((toolDefinition) => toolDefinition.name) ?? [],
    parallelToolCalls: input.requestBody.parallel_tool_calls ?? false,
    stream: input.requestBody.stream,
    ...inputItemSummary,
  };
}

function shouldIncludeReasoningEncryptedContent(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  openAiInputItems: ReadonlyArray<OpenAiConversationInputItem>;
}): boolean {
  if (input.selectedReasoningEffort === "none") {
    return false;
  }

  if (input.selectedReasoningEffort) {
    return true;
  }

  if (input.openAiInputItems.some(isOpenAiReasoningInputItem)) {
    return true;
  }

  return isOpenAiReasoningModel(input.selectedModelId);
}

function createReasoningRequest(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
}): OpenAiReasoningRequest | undefined {
  if (input.selectedReasoningEffort === "none") {
    return { effort: "none" };
  }

  const reasoningRequest: OpenAiReasoningRequest = {};
  if (input.selectedReasoningEffort) {
    reasoningRequest.effort = input.selectedReasoningEffort;
  }
  if (shouldRequestReasoningSummary(input.selectedModelId)) {
    reasoningRequest.summary = "auto";
  }

  return reasoningRequest.effort || reasoningRequest.summary ? reasoningRequest : undefined;
}

function shouldRequestReasoningSummary(selectedModelId: string): boolean {
  return isOpenAiReasoningModel(selectedModelId);
}

function shouldRequestLowTextVerbosity(selectedModelId: string): boolean {
  const normalizedSelectedModelId = selectedModelId.toLowerCase();
  return (
    normalizedSelectedModelId.includes("gpt-5.") &&
    !normalizedSelectedModelId.includes("codex") &&
    !normalizedSelectedModelId.includes("-chat")
  );
}

function isOpenAiReasoningModel(selectedModelId: string): boolean {
  const normalizedSelectedModelId = selectedModelId.toLowerCase();
  return (
    (normalizedSelectedModelId.includes("gpt-5") || normalizedSelectedModelId.includes("codex")) &&
    !normalizedSelectedModelId.includes("chat")
  );
}

function isOpenAiReasoningInputItem(
  openAiInputItem: OpenAiConversationInputItem,
): openAiInputItem is Extract<OpenAiConversationInputItem, { type: "reasoning" }> {
  return "type" in openAiInputItem && openAiInputItem.type === "reasoning";
}

function summarizeOpenAiInputItemsForDiagnostics(
  openAiInputItems: readonly OpenAiConversationInputItem[],
): BuliDiagnosticLogFields {
  let userMessageInputItemCount = 0;
  let assistantMessageInputItemCount = 0;
  let messageInputContentLength = 0;
  let userMessageInputImageCount = 0;
  let reasoningInputItemCount = 0;
  let reasoningEncryptedContentItemCount = 0;
  let functionCallInputItemCount = 0;
  let functionCallOutputInputItemCount = 0;
  let functionCallOutputLength = 0;

  for (const openAiInputItem of openAiInputItems) {
    if ("role" in openAiInputItem) {
      if (openAiInputItem.role === "user") {
        userMessageInputItemCount += 1;
      } else {
        assistantMessageInputItemCount += 1;
      }
      if (typeof openAiInputItem.content === "string") {
        messageInputContentLength += openAiInputItem.content.length;
      } else {
        messageInputContentLength += openAiInputItem.content.reduce((contentLength, contentPart) => {
          if (contentPart.type === "input_text") {
            return contentLength + contentPart.text.length;
          }

          return contentLength + contentPart.image_url.length;
        }, 0);
        userMessageInputImageCount += openAiInputItem.content.filter((contentPart) => contentPart.type === "input_image").length;
      }
      continue;
    }

    if (openAiInputItem.type === "reasoning") {
      reasoningInputItemCount += 1;
      if (openAiInputItem.encrypted_content !== undefined) {
        reasoningEncryptedContentItemCount += 1;
      }
      continue;
    }

    if (openAiInputItem.type === "function_call") {
      functionCallInputItemCount += 1;
      continue;
    }

    functionCallOutputInputItemCount += 1;
    functionCallOutputLength += openAiInputItem.output.length;
  }

  return {
    inputItemCount: openAiInputItems.length,
    userMessageInputItemCount,
    assistantMessageInputItemCount,
    messageInputContentLength,
    userMessageInputImageCount,
    reasoningInputItemCount,
    reasoningEncryptedContentItemCount,
    functionCallInputItemCount,
    functionCallOutputInputItemCount,
    functionCallOutputLength,
  };
}
