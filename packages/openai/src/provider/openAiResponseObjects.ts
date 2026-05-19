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
  functionCallId: string;
  functionName: string;
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

export function readOpenAiResponseObjectStringField(
  responseObject: OpenAiResponseObject,
  fieldName: string,
): string | undefined {
  const fieldValue = responseObject[fieldName];
  return typeof fieldValue === "string" ? fieldValue : undefined;
}

export function readOpenAiResponseObjectArrayField(
  responseObject: OpenAiResponseObject,
  fieldName: string,
): unknown[] | undefined {
  const fieldValue = responseObject[fieldName];
  return Array.isArray(fieldValue) ? fieldValue : undefined;
}

export function isOpenAiReasoningSummaryTextPart(value: unknown): value is OpenAiReasoningSummaryTextPart {
  return isOpenAiResponseObject(value) && value.type === "summary_text" &&
    readOpenAiResponseObjectStringField(value, "text") !== undefined;
}

export function listOpenAiReasoningSummaryTextParts(value: unknown): OpenAiReasoningSummaryTextPart[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((summaryPart) => isOpenAiReasoningSummaryTextPart(summaryPart) ? [summaryPart] : []);
}

export function isOpenAiOutputTextContentPart(value: unknown): value is OpenAiOutputTextContentPart {
  return isOpenAiResponseObject(value) && value.type === "output_text" &&
    readOpenAiResponseObjectStringField(value, "text") !== undefined;
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

  const itemId = readOpenAiResponseObjectStringField(value, "id");
  const functionCallId = readOpenAiResponseObjectStringField(value, "call_id");
  const functionName = readOpenAiResponseObjectStringField(value, "name");
  if (
    itemId === undefined ||
    itemId.length === 0 ||
    functionCallId === undefined ||
    functionCallId.length === 0 ||
    functionName === undefined ||
    functionName.length === 0
  ) {
    return undefined;
  }

  const argumentsText = value["arguments"];
  if (argumentsText !== undefined && argumentsText !== null && typeof argumentsText !== "string") {
    return undefined;
  }

  return {
    itemId,
    functionCallId,
    functionName,
    ...(typeof argumentsText === "string" ? { argumentsText } : {}),
  };
}
