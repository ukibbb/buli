export type OpenAiResponseObject = {
  type: string;
  [openAiResponseFieldName: string]: unknown;
};

export type OpenAiReasoningSummaryTextPart = {
  type: "summary_text";
  text: string;
};

export type OpenAiOutputTextContentPart = {
  type: "output_text";
  text: string;
};

export type OpenAiFunctionCallOutputItem = {
  itemId: string;
  toolCallId: string;
  toolName: string;
  argumentsText?: string | undefined;
};

export function isOpenAiResponseObject(value: unknown): value is OpenAiResponseObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "type" in value &&
    typeof value.type === "string"
  );
}

export function isOpenAiReasoningSummaryTextPart(value: unknown): value is OpenAiReasoningSummaryTextPart {
  return isOpenAiResponseObject(value) && value.type === "summary_text" && typeof value.text === "string";
}

export function listOpenAiReasoningSummaryTextParts(value: unknown): OpenAiReasoningSummaryTextPart[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((summaryPart) => isOpenAiReasoningSummaryTextPart(summaryPart) ? [summaryPart] : []);
}

export function isOpenAiOutputTextContentPart(value: unknown): value is OpenAiOutputTextContentPart {
  return isOpenAiResponseObject(value) && value.type === "output_text" && typeof value.text === "string";
}

export function listOpenAiOutputTextContentParts(value: unknown): OpenAiOutputTextContentPart[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((contentPart) => isOpenAiOutputTextContentPart(contentPart) ? [contentPart] : []);
}

export function readOpenAiFunctionCallOutputItem(value: unknown): OpenAiFunctionCallOutputItem | undefined {
  if (!isOpenAiResponseObject(value) || value.type !== "function_call") {
    return undefined;
  }

  if (
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.call_id !== "string" ||
    value.call_id.length === 0 ||
    typeof value.name !== "string" ||
    value.name.length === 0
  ) {
    return undefined;
  }

  const argumentsText = value.arguments;
  if (argumentsText !== undefined && argumentsText !== null && typeof argumentsText !== "string") {
    return undefined;
  }

  return {
    itemId: value.id,
    toolCallId: value.call_id,
    toolName: value.name,
    ...(typeof argumentsText === "string" ? { argumentsText } : {}),
  };
}
