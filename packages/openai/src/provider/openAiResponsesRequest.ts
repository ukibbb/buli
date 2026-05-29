import type {
  BuliDiagnosticLogFields,
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

type OpenAiReasoningEncryptedContentInclusionPolicy = "always" | "never" | "when_input_contains_reasoning";

export type CreateOpenAiResponsesHttpRequestBodyInput = {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  promptCacheKey?: string;
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
  systemPromptText: string;
  openAiInputItems: ReadonlyArray<OpenAiConversationInputItem>;
};

export type CreateOpenAiResponsesHttpRequestTemplateInput = Omit<
  CreateOpenAiResponsesHttpRequestBodyInput,
  "openAiInputItems"
>;

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

type StableOpenAiResponsesHttpRequestFields = Omit<OpenAiResponsesHttpRequestBody, "input" | "include">;

type OpenAiRequestSizeContributorKind =
  | "request_model"
  | "request_instructions"
  | "request_prompt_cache_key"
  | "request_tools"
  | "request_parallel_tool_calls"
  | "request_include"
  | "request_reasoning"
  | "request_text"
  | "request_stream"
  | "input_user_message"
  | "input_assistant_message"
  | "input_reasoning"
  | "input_function_call"
  | "input_function_call_output";

type OpenAiRequestSizeContributor = Readonly<{
  contributorKind: OpenAiRequestSizeContributorKind;
  inputItemIndex: number;
  textLength: number;
  serializedByteLength: number;
}>;

const DEFAULT_REQUEST_SIZE_CONTRIBUTOR_COUNT = 5;
const textEncoder = new TextEncoder();

export type OpenAiResponsesHttpRequestTemplate = Readonly<{
  stableRequestFields: StableOpenAiResponsesHttpRequestFields;
  reasoningEncryptedContentInclusionPolicy: OpenAiReasoningEncryptedContentInclusionPolicy;
}>;

export function createOpenAiResponsesHttpRequestBody(
  input: CreateOpenAiResponsesHttpRequestBodyInput,
): OpenAiResponsesHttpRequestBody {
  return createOpenAiResponsesHttpRequestBodyFromTemplate({
    requestTemplate: createOpenAiResponsesHttpRequestTemplate(input),
    openAiInputItems: input.openAiInputItems,
  });
}

export function createOpenAiResponsesHttpRequestTemplate(
  input: CreateOpenAiResponsesHttpRequestTemplateInput,
): OpenAiResponsesHttpRequestTemplate {
  const reasoningRequest = createReasoningRequest(input);
  const toolDefinitions = createOpenAiToolDefinitions({
    availableToolNames: input.availableToolNames,
  });
  return {
    stableRequestFields: {
      model: input.selectedModelId,
      instructions: input.systemPromptText,
      store: false,
      ...(input.promptCacheKey ? { prompt_cache_key: input.promptCacheKey } : {}),
      ...(toolDefinitions.length > 0 ? { tools: toolDefinitions, parallel_tool_calls: true as const } : {}),
      ...(reasoningRequest ? { reasoning: reasoningRequest } : {}),
      ...(shouldRequestLowTextVerbosity(input.selectedModelId) ? { text: { verbosity: "low" as const } } : {}),
      stream: true,
    },
    reasoningEncryptedContentInclusionPolicy: createReasoningEncryptedContentInclusionPolicy(input),
  };
}

export function createOpenAiResponsesHttpRequestBodyFromTemplate(input: {
  requestTemplate: OpenAiResponsesHttpRequestTemplate;
  openAiInputItems: ReadonlyArray<OpenAiConversationInputItem>;
}): OpenAiResponsesHttpRequestBody {
  return {
    ...input.requestTemplate.stableRequestFields,
    input: input.openAiInputItems,
    ...(shouldIncludeReasoningEncryptedContent({
      inclusionPolicy: input.requestTemplate.reasoningEncryptedContentInclusionPolicy,
      openAiInputItems: input.openAiInputItems,
    }) ? { include: ["reasoning.encrypted_content"] as const } : {}),
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

export function summarizeOpenAiRequestSizeContributorsForDiagnostics(input: {
  requestBody: OpenAiResponsesHttpRequestBody;
  largestContributorCount?: number;
}): BuliDiagnosticLogFields {
  const largestContributorCount = input.largestContributorCount ?? DEFAULT_REQUEST_SIZE_CONTRIBUTOR_COUNT;
  const stableRequestContributors = listStableRequestSizeContributors(input.requestBody);
  const inputItemContributors = input.requestBody.input.map((openAiInputItem, inputItemIndex) =>
    createInputItemSizeContributor(openAiInputItem, inputItemIndex)
  );
  const largestContributors = [...stableRequestContributors, ...inputItemContributors]
    .sort((leftContributor, rightContributor) =>
      rightContributor.serializedByteLength - leftContributor.serializedByteLength ||
      leftContributor.contributorKind.localeCompare(rightContributor.contributorKind) ||
      leftContributor.inputItemIndex - rightContributor.inputItemIndex
    )
    .slice(0, largestContributorCount);

  return {
    requestStableSerializedByteLength: sumSerializedByteLength(stableRequestContributors),
    requestInputSerializedByteLength: sumSerializedByteLength(inputItemContributors),
    requestLargestContributorKinds: largestContributors.map((contributor) => contributor.contributorKind),
    requestLargestContributorInputItemIndexes: largestContributors.map((contributor) => contributor.inputItemIndex),
    requestLargestContributorSerializedByteLengths: largestContributors.map((contributor) => contributor.serializedByteLength),
    requestLargestContributorTextLengths: largestContributors.map((contributor) => contributor.textLength),
  };
}

function createReasoningEncryptedContentInclusionPolicy(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
}): OpenAiReasoningEncryptedContentInclusionPolicy {
  if (input.selectedReasoningEffort === "none") {
    return "never";
  }

  if (input.selectedReasoningEffort) {
    return "always";
  }

  return isOpenAiReasoningModel(input.selectedModelId) ? "always" : "when_input_contains_reasoning";
}

function shouldIncludeReasoningEncryptedContent(input: {
  inclusionPolicy: OpenAiReasoningEncryptedContentInclusionPolicy;
  openAiInputItems: ReadonlyArray<OpenAiConversationInputItem>;
}): boolean {
  if (input.inclusionPolicy === "never") {
    return false;
  }

  if (input.inclusionPolicy === "always") {
    return true;
  }

  if (input.openAiInputItems.some(isOpenAiReasoningInputItem)) {
    return true;
  }
  return false;
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

function listStableRequestSizeContributors(
  requestBody: OpenAiResponsesHttpRequestBody,
): readonly OpenAiRequestSizeContributor[] {
  const contributors: OpenAiRequestSizeContributor[] = [
    createRequestSizeContributor("request_model", requestBody.model, requestBody.model.length),
    createRequestSizeContributor("request_instructions", requestBody.instructions, requestBody.instructions.length),
    createRequestSizeContributor("request_stream", requestBody.stream, 0),
  ];

  if (requestBody.prompt_cache_key !== undefined) {
    contributors.push(createRequestSizeContributor(
      "request_prompt_cache_key",
      requestBody.prompt_cache_key,
      requestBody.prompt_cache_key.length,
    ));
  }
  if (requestBody.tools !== undefined) {
    contributors.push(createRequestSizeContributor("request_tools", requestBody.tools, 0));
  }
  if (requestBody.parallel_tool_calls !== undefined) {
    contributors.push(createRequestSizeContributor("request_parallel_tool_calls", requestBody.parallel_tool_calls, 0));
  }
  if (requestBody.include !== undefined) {
    contributors.push(createRequestSizeContributor("request_include", requestBody.include, 0));
  }
  if (requestBody.reasoning !== undefined) {
    contributors.push(createRequestSizeContributor("request_reasoning", requestBody.reasoning, 0));
  }
  if (requestBody.text !== undefined) {
    contributors.push(createRequestSizeContributor("request_text", requestBody.text, 0));
  }

  return contributors;
}

function createInputItemSizeContributor(
  openAiInputItem: OpenAiConversationInputItem,
  inputItemIndex: number,
): OpenAiRequestSizeContributor {
  return {
    contributorKind: classifyInputItemSizeContributor(openAiInputItem),
    inputItemIndex,
    textLength: calculateInputItemTextLength(openAiInputItem),
    serializedByteLength: calculateSerializedUtf8ByteLength(openAiInputItem),
  };
}

function createRequestSizeContributor(
  contributorKind: OpenAiRequestSizeContributorKind,
  value: unknown,
  textLength: number,
): OpenAiRequestSizeContributor {
  return {
    contributorKind,
    inputItemIndex: -1,
    textLength,
    serializedByteLength: calculateSerializedUtf8ByteLength(value),
  };
}

function classifyInputItemSizeContributor(openAiInputItem: OpenAiConversationInputItem): OpenAiRequestSizeContributorKind {
  if ("role" in openAiInputItem) {
    return openAiInputItem.role === "user" ? "input_user_message" : "input_assistant_message";
  }
  if (openAiInputItem.type === "reasoning") {
    return "input_reasoning";
  }
  if (openAiInputItem.type === "function_call") {
    return "input_function_call";
  }
  return "input_function_call_output";
}

function calculateInputItemTextLength(openAiInputItem: OpenAiConversationInputItem): number {
  if ("role" in openAiInputItem) {
    if (typeof openAiInputItem.content === "string") {
      return openAiInputItem.content.length;
    }
    return openAiInputItem.content.reduce((contentLength, contentPart) =>
      contentLength + (contentPart.type === "input_text" ? contentPart.text.length : contentPart.image_url.length), 0);
  }
  if (openAiInputItem.type === "reasoning") {
    return (openAiInputItem.encrypted_content?.length ?? 0) +
      openAiInputItem.summary.reduce((summaryTextLength, summaryPart) => summaryTextLength + summaryPart.text.length, 0);
  }
  if (openAiInputItem.type === "function_call") {
    return openAiInputItem.arguments.length;
  }
  return openAiInputItem.output.length;
}

function sumSerializedByteLength(contributors: readonly OpenAiRequestSizeContributor[]): number {
  return contributors.reduce((totalByteLength, contributor) => totalByteLength + contributor.serializedByteLength, 0);
}

function calculateSerializedUtf8ByteLength(value: unknown): number {
  return textEncoder.encode(JSON.stringify(value)).byteLength;
}
