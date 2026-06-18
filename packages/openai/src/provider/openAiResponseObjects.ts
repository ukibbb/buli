import type {
  AssistantMessageUrlCitation,
  ToolCallWebSearchActionKind,
  ToolCallWebSearchResult,
  ToolCallWebSearchSource,
  ToolCallWebSearchStatus,
} from "@buli/contracts";

export type OpenAiResponseObject = {
  type: string;
  [openAiResponseFieldName: string]: unknown;
};

type OpenAiUnknownRecord = Readonly<Record<string, unknown>>;

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

export type OpenAiWebSearchCallOutputItem = {
  itemId: string;
  webSearchStatus?: ToolCallWebSearchStatus | undefined;
  webSearchActionKind?: ToolCallWebSearchActionKind | undefined;
  searchQueryTexts?: readonly string[] | undefined;
  openedPageUrl?: string | undefined;
  findPattern?: string | undefined;
  sourceCount?: number | undefined;
  sources?: readonly ToolCallWebSearchSource[] | undefined;
  resultCount?: number | undefined;
  results?: readonly ToolCallWebSearchResult[] | undefined;
  imageResultCount?: number | undefined;
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

export function listOpenAiAssistantMessageUrlCitationsFromOutputItem(value: unknown): AssistantMessageUrlCitation[] {
  if (
    !isOpenAiResponseObject(value) ||
    value.type !== "message" ||
    readOpenAiResponseObjectStringField(value, "role") !== "assistant"
  ) {
    return [];
  }

  const contentParts = readOpenAiResponseObjectArrayField(value, "content") ?? [];
  return listUniqueOpenAiAssistantMessageUrlCitations(
    contentParts.flatMap(listOpenAiOutputTextUrlCitationsFromContentPart),
  );
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

export function readOpenAiWebSearchCallOutputItem(value: unknown): OpenAiWebSearchCallOutputItem | undefined {
  if (!isOpenAiResponseObject(value) || value.type !== "web_search_call") {
    return undefined;
  }

  const itemId = readOpenAiResponseObjectStringField(value, "id");
  if (itemId === undefined || itemId.length === 0) {
    return undefined;
  }

  const webSearchStatus = readToolCallWebSearchStatus(value["status"]);
  const action = readOpenAiRecordField(value, "action");
  const webSearchActionKind = readToolCallWebSearchActionKind(readStringFieldFromRecord(action, "type"));
  const searchQueryTexts = listOpenAiWebSearchQueryTexts(action, webSearchActionKind);
  const openedPageUrl = readOpenAiWebSearchOpenedPageUrl(action, webSearchActionKind);
  const findPattern = readOpenAiWebSearchFindPattern(action, webSearchActionKind);
  const results = listOpenAiWebSearchResults(action, value);
  const sourcesFromProvider = listOpenAiWebSearchSources(action, value);
  const sources = sourcesFromProvider.length > 0 ? sourcesFromProvider : listOpenAiWebSearchSourcesFromResults(results);
  const sourceCount = sources.length > 0
    ? sources.length
    : readNonNegativeIntegerFieldFromRecord(action, "source_count") ??
      readNonNegativeIntegerFieldFromRecord(value, "source_count");
  const resultCount = results.length > 0
    ? results.length
    : readNonNegativeIntegerFieldFromRecord(action, "result_count") ??
      readNonNegativeIntegerFieldFromRecord(value, "result_count");
  const imageResultCount = countOpenAiWebSearchImageResults(action, value);

  return {
    itemId,
    ...(webSearchStatus !== undefined ? { webSearchStatus } : {}),
    ...(webSearchActionKind !== undefined ? { webSearchActionKind } : {}),
    ...(searchQueryTexts.length > 0 ? { searchQueryTexts } : {}),
    ...(openedPageUrl !== undefined ? { openedPageUrl } : {}),
    ...(findPattern !== undefined ? { findPattern } : {}),
    ...(sourceCount !== undefined ? { sourceCount } : {}),
    ...(sources.length > 0 ? { sources } : {}),
    ...(resultCount !== undefined ? { resultCount } : {}),
    ...(results.length > 0 ? { results } : {}),
    ...(imageResultCount !== undefined ? { imageResultCount } : {}),
  };
}

function readOpenAiRecordField(record: OpenAiUnknownRecord, fieldName: string): OpenAiUnknownRecord | undefined {
  const fieldValue = record[fieldName];
  return typeof fieldValue === "object" && fieldValue !== null && !Array.isArray(fieldValue)
    ? fieldValue as OpenAiUnknownRecord
    : undefined;
}

function readStringFieldFromRecord(record: OpenAiUnknownRecord | undefined, fieldName: string): string | undefined {
  const fieldValue = record?.[fieldName];
  return typeof fieldValue === "string" && fieldValue.length > 0 ? fieldValue : undefined;
}

function readStringArrayFieldFromRecord(record: OpenAiUnknownRecord | undefined, fieldName: string): string[] {
  const fieldValue = record?.[fieldName];
  if (!Array.isArray(fieldValue)) {
    return [];
  }

  return fieldValue.filter((arrayValue): arrayValue is string => typeof arrayValue === "string" && arrayValue.length > 0);
}

function readNonNegativeIntegerFieldFromRecord(record: OpenAiUnknownRecord | undefined, fieldName: string): number | undefined {
  const fieldValue = record?.[fieldName];
  return typeof fieldValue === "number" && Number.isInteger(fieldValue) && fieldValue >= 0 ? fieldValue : undefined;
}

function readToolCallWebSearchStatus(value: unknown): ToolCallWebSearchStatus | undefined {
  return value === "in_progress" || value === "searching" || value === "completed" ? value : undefined;
}

function readToolCallWebSearchActionKind(value: string | undefined): ToolCallWebSearchActionKind | undefined {
  return value === "search" || value === "open_page" || value === "find_in_page" ? value : undefined;
}

function listOpenAiWebSearchQueryTexts(
  action: OpenAiUnknownRecord | undefined,
  webSearchActionKind: ToolCallWebSearchActionKind | undefined,
): string[] {
  if (webSearchActionKind !== "search") {
    return [];
  }

  return listUniqueNonEmptyStrings([
    readStringFieldFromRecord(action, "query"),
    readStringFieldFromRecord(action, "search_query"),
    ...readStringArrayFieldFromRecord(action, "queries"),
  ]);
}

function readOpenAiWebSearchOpenedPageUrl(
  action: OpenAiUnknownRecord | undefined,
  webSearchActionKind: ToolCallWebSearchActionKind | undefined,
): string | undefined {
  if (webSearchActionKind !== "open_page" && webSearchActionKind !== "find_in_page") {
    return undefined;
  }

  return readStringFieldFromRecord(action, "url") ?? readStringFieldFromRecord(action, "page_url");
}

function readOpenAiWebSearchFindPattern(
  action: OpenAiUnknownRecord | undefined,
  webSearchActionKind: ToolCallWebSearchActionKind | undefined,
): string | undefined {
  if (webSearchActionKind !== "find_in_page") {
    return undefined;
  }

  return readStringFieldFromRecord(action, "pattern") ?? readStringFieldFromRecord(action, "query");
}

function listOpenAiWebSearchSources(
  action: OpenAiUnknownRecord | undefined,
  outputItem: OpenAiUnknownRecord,
): ToolCallWebSearchSource[] {
  const rawSources = [
    ...readArrayFieldFromRecord(action, "sources"),
    ...readArrayFieldFromRecord(outputItem, "sources"),
  ];
  const sources: ToolCallWebSearchSource[] = [];
  const seenSourceUrls = new Set<string>();
  for (const rawSource of rawSources) {
    const source = readOpenAiWebSearchSource(rawSource);
    if (!source || seenSourceUrls.has(source.sourceUrl)) {
      continue;
    }

    seenSourceUrls.add(source.sourceUrl);
    sources.push(source);
  }

  return sources;
}

function readArrayFieldFromRecord(record: OpenAiUnknownRecord | undefined, fieldName: string): unknown[] {
  const fieldValue = record?.[fieldName];
  return Array.isArray(fieldValue) ? fieldValue : [];
}

function readOpenAiWebSearchSource(value: unknown): ToolCallWebSearchSource | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const sourceRecord = value as OpenAiUnknownRecord;
  const nestedSourceRecord = readOpenAiRecordField(sourceRecord, "source");
  const sourceUrl = readStringFieldFromRecord(sourceRecord, "url") ??
    readStringFieldFromRecord(sourceRecord, "source_url") ??
    readStringFieldFromRecord(nestedSourceRecord, "url") ??
    readStringFieldFromRecord(nestedSourceRecord, "source_url");
  if (sourceUrl === undefined) {
    return undefined;
  }

  const sourceTitle = readStringFieldFromRecord(sourceRecord, "title") ??
    readStringFieldFromRecord(sourceRecord, "source_title") ??
    readStringFieldFromRecord(nestedSourceRecord, "title") ??
    readStringFieldFromRecord(nestedSourceRecord, "source_title");

  return {
    sourceUrl,
    ...(sourceTitle !== undefined ? { sourceTitle } : {}),
  };
}

function listOpenAiWebSearchResults(
  action: OpenAiUnknownRecord | undefined,
  outputItem: OpenAiUnknownRecord,
): ToolCallWebSearchResult[] {
  const rawResults = [
    ...readArrayFieldFromRecord(action, "results"),
    ...readArrayFieldFromRecord(outputItem, "results"),
  ];
  const webSearchResults: ToolCallWebSearchResult[] = [];
  const seenWebSearchResultKeys = new Set<string>();
  for (const rawResult of rawResults) {
    const webSearchResult = readOpenAiWebSearchResult(rawResult);
    if (!webSearchResult) {
      continue;
    }

    const webSearchResultKey = createToolCallWebSearchResultKey(webSearchResult);
    if (seenWebSearchResultKeys.has(webSearchResultKey)) {
      continue;
    }

    seenWebSearchResultKeys.add(webSearchResultKey);
    webSearchResults.push(webSearchResult);
  }

  return webSearchResults;
}

function readOpenAiWebSearchResult(value: unknown): ToolCallWebSearchResult | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const resultRecord = value as OpenAiUnknownRecord;
  const resultType = readStringFieldFromRecord(resultRecord, "type");
  if (resultType === "image_result" || resultType === "image") {
    return readOpenAiWebSearchImageResult(resultRecord);
  }

  return readOpenAiWebSearchTextResult(resultRecord);
}

function readOpenAiWebSearchTextResult(resultRecord: OpenAiUnknownRecord): ToolCallWebSearchResult | undefined {
  const nestedSourceRecord = readOpenAiRecordField(resultRecord, "source");
  const resultUrl = readStringFieldFromRecord(resultRecord, "url") ??
    readStringFieldFromRecord(resultRecord, "source_url") ??
    readStringFieldFromRecord(nestedSourceRecord, "url") ??
    readStringFieldFromRecord(nestedSourceRecord, "source_url");
  if (resultUrl === undefined) {
    return undefined;
  }

  const resultTitle = readStringFieldFromRecord(resultRecord, "title") ??
    readStringFieldFromRecord(resultRecord, "source_title") ??
    readStringFieldFromRecord(nestedSourceRecord, "title") ??
    readStringFieldFromRecord(nestedSourceRecord, "source_title");
  const resultSnippet = readStringFieldFromRecord(resultRecord, "snippet") ??
    readStringFieldFromRecord(resultRecord, "text") ??
    readStringFieldFromRecord(resultRecord, "description");

  return {
    resultKind: "text",
    resultUrl,
    ...(resultTitle !== undefined ? { resultTitle } : {}),
    ...(resultSnippet !== undefined ? { resultSnippet } : {}),
  };
}

function readOpenAiWebSearchImageResult(resultRecord: OpenAiUnknownRecord): ToolCallWebSearchResult | undefined {
  const resultImageUrl = readStringFieldFromRecord(resultRecord, "image_url") ??
    readStringFieldFromRecord(resultRecord, "url");
  const resultSourceUrl = readStringFieldFromRecord(resultRecord, "source_url") ??
    readStringFieldFromRecord(resultRecord, "page_url");
  const resultThumbnailUrl = readStringFieldFromRecord(resultRecord, "thumbnail_url");
  const resultTitle = readStringFieldFromRecord(resultRecord, "title") ??
    readStringFieldFromRecord(resultRecord, "source_title");
  if (
    resultImageUrl === undefined &&
    resultSourceUrl === undefined &&
    resultThumbnailUrl === undefined &&
    resultTitle === undefined
  ) {
    return undefined;
  }

  return {
    resultKind: "image",
    ...(resultImageUrl !== undefined ? { resultImageUrl } : {}),
    ...(resultSourceUrl !== undefined ? { resultSourceUrl } : {}),
    ...(resultThumbnailUrl !== undefined ? { resultThumbnailUrl } : {}),
    ...(resultTitle !== undefined ? { resultTitle } : {}),
  };
}

function listOpenAiWebSearchSourcesFromResults(
  webSearchResults: readonly ToolCallWebSearchResult[],
): ToolCallWebSearchSource[] {
  const sources: ToolCallWebSearchSource[] = [];
  const seenSourceUrls = new Set<string>();
  for (const webSearchResult of webSearchResults) {
    const sourceUrl = webSearchResult.resultKind === "text"
      ? webSearchResult.resultUrl
      : webSearchResult.resultSourceUrl;
    if (sourceUrl === undefined || seenSourceUrls.has(sourceUrl)) {
      continue;
    }

    seenSourceUrls.add(sourceUrl);
    sources.push({
      sourceUrl,
      ...(webSearchResult.resultTitle !== undefined ? { sourceTitle: webSearchResult.resultTitle } : {}),
    });
  }

  return sources;
}

function createToolCallWebSearchResultKey(webSearchResult: ToolCallWebSearchResult): string {
  return webSearchResult.resultKind === "text"
    ? [webSearchResult.resultKind, webSearchResult.resultUrl, webSearchResult.resultTitle ?? "", webSearchResult.resultSnippet ?? ""].join("\u0000")
    : [
        webSearchResult.resultKind,
        webSearchResult.resultImageUrl ?? "",
        webSearchResult.resultSourceUrl ?? "",
        webSearchResult.resultThumbnailUrl ?? "",
        webSearchResult.resultTitle ?? "",
      ].join("\u0000");
}

function listOpenAiOutputTextUrlCitationsFromContentPart(contentPart: unknown): AssistantMessageUrlCitation[] {
  if (!isOpenAiOutputTextContentPart(contentPart)) {
    return [];
  }

  return readArrayFieldFromRecord(contentPart as OpenAiUnknownRecord, "annotations").flatMap(readOpenAiOutputTextUrlCitation);
}

function readOpenAiOutputTextUrlCitation(value: unknown): AssistantMessageUrlCitation[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [];
  }

  const annotationRecord = value as OpenAiUnknownRecord;
  if (readStringFieldFromRecord(annotationRecord, "type") !== "url_citation") {
    return [];
  }

  const citedUrl = readStringFieldFromRecord(annotationRecord, "url") ??
    readStringFieldFromRecord(annotationRecord, "cited_url");
  if (citedUrl === undefined) {
    return [];
  }

  const citedTitle = readStringFieldFromRecord(annotationRecord, "title") ??
    readStringFieldFromRecord(annotationRecord, "cited_title");
  const startIndex = readNonNegativeIntegerFieldFromRecord(annotationRecord, "start_index") ??
    readNonNegativeIntegerFieldFromRecord(annotationRecord, "startIndex");
  const endIndex = readNonNegativeIntegerFieldFromRecord(annotationRecord, "end_index") ??
    readNonNegativeIntegerFieldFromRecord(annotationRecord, "endIndex");

  return [{
    citedUrl,
    ...(citedTitle !== undefined ? { citedTitle } : {}),
    ...(startIndex !== undefined ? { startIndex } : {}),
    ...(endIndex !== undefined ? { endIndex } : {}),
  }];
}

function listUniqueOpenAiAssistantMessageUrlCitations(
  assistantMessageUrlCitations: readonly AssistantMessageUrlCitation[],
): AssistantMessageUrlCitation[] {
  const uniqueCitations: AssistantMessageUrlCitation[] = [];
  const seenCitationKeys = new Set<string>();
  for (const assistantMessageUrlCitation of assistantMessageUrlCitations) {
    const citationKey = createAssistantMessageUrlCitationKey(assistantMessageUrlCitation);
    if (seenCitationKeys.has(citationKey)) {
      continue;
    }

    seenCitationKeys.add(citationKey);
    uniqueCitations.push(assistantMessageUrlCitation);
  }

  return uniqueCitations;
}

function createAssistantMessageUrlCitationKey(assistantMessageUrlCitation: AssistantMessageUrlCitation): string {
  return [
    assistantMessageUrlCitation.citedUrl,
    assistantMessageUrlCitation.citedTitle ?? "",
    assistantMessageUrlCitation.startIndex ?? "",
    assistantMessageUrlCitation.endIndex ?? "",
  ].join("\u0000");
}

function countOpenAiWebSearchImageResults(
  action: OpenAiUnknownRecord | undefined,
  outputItem: OpenAiUnknownRecord,
): number | undefined {
  const explicitImageResults = [
    ...readArrayFieldFromRecord(action, "image_results"),
    ...readArrayFieldFromRecord(outputItem, "image_results"),
  ];
  if (explicitImageResults.length > 0) {
    return explicitImageResults.length;
  }

  const resultItems = [
    ...readArrayFieldFromRecord(action, "results"),
    ...readArrayFieldFromRecord(outputItem, "results"),
  ];
  const imageResultCount = resultItems.filter((resultItem) => {
    if (typeof resultItem !== "object" || resultItem === null || Array.isArray(resultItem)) {
      return false;
    }

    const resultType = (resultItem as OpenAiUnknownRecord)["type"];
    return resultType === "image_result" || resultType === "image";
  }).length;

  return imageResultCount > 0 ? imageResultCount : undefined;
}

function listUniqueNonEmptyStrings(values: readonly (string | undefined)[]): string[] {
  const uniqueValues: string[] = [];
  const seenValues = new Set<string>();
  for (const value of values) {
    if (value === undefined || seenValues.has(value)) {
      continue;
    }

    seenValues.add(value);
    uniqueValues.push(value);
  }

  return uniqueValues;
}
