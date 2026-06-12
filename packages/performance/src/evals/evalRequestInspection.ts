import type { ScriptedOpenAiEvalRequestRecord } from "./scriptedOpenAiEvalRuntime.ts";

type RequestInputItem = Record<string, unknown>;

export function listRequestInputItems(requestBody: Record<string, unknown>): readonly RequestInputItem[] {
  const inputItems = requestBody["input"];
  if (!Array.isArray(inputItems)) {
    return [];
  }
  return inputItems.filter((inputItem): inputItem is RequestInputItem => typeof inputItem === "object" && inputItem !== null);
}

export function readVisibleFunctionCallOutputText(
  requestBody: Record<string, unknown>,
  toolCallId: string,
): string | undefined {
  for (const inputItem of listRequestInputItems(requestBody)) {
    if (inputItem["type"] === "function_call_output" && inputItem["call_id"] === toolCallId) {
      const outputText = inputItem["output"];
      return typeof outputText === "string" ? outputText : undefined;
    }
  }
  return undefined;
}

export function isExactTextVisibleInRequestInputItems(requestBody: Record<string, unknown>, exactText: string): boolean {
  return listRequestInputItems(requestBody).some((inputItem) => {
    const outputText = inputItem["output"];
    if (typeof outputText === "string" && outputText.includes(exactText)) {
      return true;
    }
    const contentParts = inputItem["content"];
    if (typeof contentParts === "string") {
      return contentParts.includes(exactText);
    }
    if (!Array.isArray(contentParts)) {
      return false;
    }
    return contentParts.some((contentPart) =>
      typeof contentPart === "object" && contentPart !== null &&
      typeof (contentPart as Record<string, unknown>)["text"] === "string" &&
      ((contentPart as Record<string, unknown>)["text"] as string).includes(exactText)
    );
  });
}

export function sumFunctionCallOutputTextLength(requestBody: Record<string, unknown>): number {
  return listRequestInputItems(requestBody).reduce((totalTextLength, inputItem) => {
    const outputText = inputItem["output"];
    return inputItem["type"] === "function_call_output" && typeof outputText === "string"
      ? totalTextLength + outputText.length
      : totalTextLength;
  }, 0);
}

export function summarizeEvalRequestByteTotals(requestRecords: readonly ScriptedOpenAiEvalRequestRecord[]): Readonly<{
  maxRequestBodyTextLength: number;
  totalRequestBodyTextLength: number;
  totalFunctionCallOutputTextLength: number;
}> {
  let maxRequestBodyTextLength = 0;
  let totalRequestBodyTextLength = 0;
  let totalFunctionCallOutputTextLength = 0;
  for (const requestRecord of requestRecords) {
    maxRequestBodyTextLength = Math.max(maxRequestBodyTextLength, requestRecord.requestBodyTextLength);
    totalRequestBodyTextLength += requestRecord.requestBodyTextLength;
    totalFunctionCallOutputTextLength += sumFunctionCallOutputTextLength(requestRecord.requestBody);
  }
  return { maxRequestBodyTextLength, totalRequestBodyTextLength, totalFunctionCallOutputTextLength };
}

/**
 * Extracts the body text of a read tool result while tolerating result framing
 * (line numbers, headers). Returns undefined when the exact marker is absent,
 * which scripted models must treat as "evidence not visible in this request".
 */
export function extractMarkedLineFromVisibleToolResult(input: {
  requestBody: Record<string, unknown>;
  toolCallId: string;
  lineMarker: string;
}): string | undefined {
  const visibleOutputText = readVisibleFunctionCallOutputText(input.requestBody, input.toolCallId);
  if (visibleOutputText === undefined) {
    return undefined;
  }
  for (const outputLine of visibleOutputText.split("\n")) {
    if (outputLine.includes(input.lineMarker)) {
      return outputLine;
    }
  }
  return undefined;
}
