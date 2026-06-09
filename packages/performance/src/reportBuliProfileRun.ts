import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readBuliProfileJsonl,
  type BuliProfileJsonlEvent,
  type ProfileDiagnosticEvent,
  type ProfileProcessSampleEvent,
} from "./profileLog/readBuliProfileJsonl.ts";
import { summarizeBuliProfileRun } from "./profileLog/summarizeBuliProfileRun.ts";

type BuliProfileReportCliOptions = Readonly<{
  profileFilePath: string;
  outputPath: string | undefined;
}>;

type BuliProfileReportCliParseResult =
  | Readonly<{ status: "ready"; options: BuliProfileReportCliOptions }>
  | Readonly<{ status: "help"; output: string }>
  | Readonly<{ status: "error"; output: string }>;

type NumericFieldAggregate = Readonly<{
  count: number;
  total: number;
  max: number;
}>;

type BottleneckCandidate = Readonly<{
  boundaryName: string;
  evidence: string;
  severityScore: number;
  valueText: string;
}>;

type TaskSubagentCallSummary = Readonly<{
  conversationTurnId: string | undefined;
  toolCallId: string;
  subagentName: string;
  executorOutcomeKind: string;
  parentVisibleToolResultKind: string;
  failureKind: string | undefined;
  failureExplanation: string | undefined;
  selectedModelId: string | undefined;
  selectedReasoningEffort: string | undefined;
  routingSource: string | undefined;
  durationMs: number;
  parentToolResultWaitMs: number;
  toolResultTextLength: number;
  checkpointReason: string | undefined;
  checkpointChildToolCallCount: number | undefined;
  checkpointChildToolResultTextLength: number | undefined;
  checkpointSkippedChildToolCallCount: number | undefined;
  checkpointElapsedMilliseconds: number | undefined;
  checkpointSoftElapsedTimeCheckpointMilliseconds: number | undefined;
  subagentChildToolCallCount: number | undefined;
}>;

type TaskSubagentParentVisibleResultSummary = Readonly<{
  parentVisibleToolResultKind: string | undefined;
  failureExplanation: string | undefined;
  toolResultTextLength: number | undefined;
}>;

type TaskSubagentRoutingSummary = Readonly<{
  selectedModelId: string | undefined;
  selectedReasoningEffort: string | undefined;
  routingSource: string | undefined;
}>;

type TaskSubagentCheckpointSummary = Readonly<{
  checkpointReason: string | undefined;
  checkpointChildToolCallCount: number | undefined;
  checkpointChildToolResultTextLength: number | undefined;
  checkpointSkippedChildToolCallCount: number | undefined;
  checkpointElapsedMilliseconds: number | undefined;
  checkpointSoftElapsedTimeCheckpointMilliseconds: number | undefined;
}>;

type TaskSubagentFinishedDiagnosticSummary = Readonly<{
  conversationTurnId: string | undefined;
  toolCallId: string;
  subagentName: string | undefined;
  executorOutcomeKind: string | undefined;
  parentVisibleToolResultKind: string | undefined;
  taskSubagentOutcomeKind: string | undefined;
  failureKind: string | undefined;
  failureExplanation: string | undefined;
  selectedModelId: string | undefined;
  selectedReasoningEffort: string | undefined;
  durationMs: number | undefined;
  parentToolResultTextLength: number | undefined;
  subagentChildToolCallCount: number | undefined;
  checkpointSummary: TaskSubagentCheckpointSummary;
}>;

type ProviderTurnKindAttribution = {
  providerTurnKind: string;
  providerTurnCount: number;
  responseStepCount: number;
  providerTurnDurationMs: number;
  requestedToolCallCount: number;
  httpWaitDurationMs: number;
  streamDurationMs: number;
  toolResultWaitDurationMs: number;
  requestConstructionDurationMs: number;
  maxRequestBodyTextLength: number;
};

type OpenAiRequestSizeContributorReportRow = Readonly<{
  conversationTurnId: string | undefined;
  providerTurnKind: string;
  responseStepIndex: number;
  contributorKind: string;
  inputItemIndex: number;
  serializedByteLength: number;
  textLength: number;
}>;

type OpenAiWorkingSetVisibilityReasonReportRow = Readonly<{
  visibilityReason: string;
  inputItemCount: number;
  textLength: number;
  serializedByteLength: number;
}>;

type OpenAiWorkingSetProjectionKindReportRow = Readonly<{
  projectionKind: string;
  inputItemCount: number;
  originalTextLength: number;
  projectedTextLength: number;
  savedCharacterCount: number;
  originalSerializedByteLength: number;
  projectedSerializedByteLength: number;
  savedSerializedByteLength: number;
}>;

type OpenAiWorkingSetLargestInputItemReportRow = Readonly<{
  conversationTurnId: string | undefined;
  providerTurnKind: string;
  responseStepIndex: number;
  inputItemIndex: number;
  visibilityReason: string;
  projectionKind: string;
  evidenceId: string | null;
  textLength: number;
  serializedByteLength: number;
  isCurrentTurnItem: boolean;
}>;

type CodebaseKnowledgeChangedFileRefreshReportRow = Readonly<{
  action: string;
  status: string;
  refreshCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  maxMemoryDeltaRssBytes: number;
  maxMemoryDeltaHeapUsedBytes: number;
  outputRecordCount: number;
}>;

type CodebaseKnowledgeRepositoryStepReportRow = Readonly<{
  operationName: string;
  stepName: string;
  storedFileRole: string;
  operationStatus: string;
  stepCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  maxMemoryDeltaRssBytes: number;
  maxMemoryDeltaHeapUsedBytes: number;
  maxMemoryDeltaExternalBytes: number;
  maxMemoryDeltaArrayBuffersBytes: number;
  maxFileTextByteLength: number;
  maxSerializedJsonByteLength: number;
  maxRecordCount: number;
  maxIndexedFileCount: number;
}>;

export async function writeBuliProfileRunReport(input: BuliProfileReportCliOptions): Promise<string> {
  const profileEvents = await readBuliProfileJsonl(input.profileFilePath);
  const reportMarkdown = formatBuliProfileRunReportMarkdown({
    profileFilePath: input.profileFilePath,
    profileEvents,
  });
  if (input.outputPath !== undefined) {
    await mkdir(dirname(input.outputPath), { recursive: true });
    await writeFile(input.outputPath, reportMarkdown, "utf8");
  }

  return reportMarkdown;
}

export function formatBuliProfileRunReportMarkdown(input: {
  profileFilePath: string;
  profileEvents: readonly BuliProfileJsonlEvent[];
}): string {
  const profileSummary = summarizeBuliProfileRun(input.profileEvents);
  const diagnosticEvents = input.profileEvents.filter((profileEvent): profileEvent is ProfileDiagnosticEvent =>
    profileEvent.type === "diagnostic_event"
  );
  const processSamples = input.profileEvents.filter((profileEvent): profileEvent is ProfileProcessSampleEvent =>
    profileEvent.type === "process_sample"
  );

  return [
    `# Buli Profile Report`,
    "",
    `- Profile: \`${input.profileFilePath}\``,
    `- Events: ${formatInteger(input.profileEvents.length)}`,
    `- Elapsed: ${formatOptionalMilliseconds(profileSummary.elapsedMs)}`,
    `- Process samples: ${formatInteger(profileSummary.processSampleCount)}`,
    "",
    "## Process Peaks",
    "",
    `- Max RSS: ${formatOptionalBytes(profileSummary.maxRssBytes)}`,
    `- Max heap used: ${formatOptionalBytes(profileSummary.maxHeapUsedBytes)}`,
    `- Max CPU user delta: ${formatOptionalMicros(profileSummary.maxCpuUserDeltaMicros)}`,
    `- Max CPU system delta: ${formatOptionalMicros(profileSummary.maxCpuSystemDeltaMicros)}`,
    `- Max event-loop delay: ${formatOptionalMilliseconds(profileSummary.maxEventLoopDelayMs)}`,
    `- Max event-loop utilization: ${formatOptionalRatio(profileSummary.maxEventLoopUtilization)}`,
    "",
    ...formatSuspectedBottlenecksSection({ diagnosticEvents, processSamples, profileEvents: input.profileEvents }),
    ...formatProfileLoggerSummarySection(input.profileEvents),
    ...formatProcessSampleAttributionSection(processSamples),
    ...formatConversationTurnSection(diagnosticEvents),
    ...formatOpenAiProviderTurnSection(diagnosticEvents),
    ...formatOpenAiProviderTurnKindAttributionSection(diagnosticEvents),
    ...formatOpenAiResponseStepSection(diagnosticEvents),
    ...formatOpenAiRetrySection(diagnosticEvents),
    ...formatOpenAiRequestConstructionSection(diagnosticEvents),
    ...formatOpenAiRequestSizeContributorSection(diagnosticEvents),
    ...formatOpenAiReplayInputAgeSection(diagnosticEvents),
    ...formatOpenAiWorkingSetVisibilitySection(diagnosticEvents),
    ...formatToolAttributionSection(diagnosticEvents),
    ...formatToolResultDuplicationSection(diagnosticEvents),
    ...formatTaskSubagentAttributionSection(diagnosticEvents),
    ...formatOpenAiContextGuardSection(diagnosticEvents),
    ...formatRequestAndContextGrowthSection(diagnosticEvents),
    ...formatCompactionImpactSection(diagnosticEvents),
    ...formatTuiRenderSection(diagnosticEvents),
    ...formatStorageSection(diagnosticEvents),
    ...formatCodebaseKnowledgeSection(diagnosticEvents),
    ...formatTopDiagnosticDurationSection(profileSummary.diagnosticDurationSummaries),
    ...formatTopDiagnosticCountSection(profileSummary.diagnosticEventCounts),
  ].join("\n");
}

function formatProfileLoggerSummarySection(profileEvents: readonly BuliProfileJsonlEvent[]): readonly string[] {
  const profileLoggerSummary = summarizeBuliProfileRun(profileEvents).profileLoggerSummary;
  if (!profileLoggerSummary) {
    return [
      "## Profiler Logger",
      "",
      "No `profile_logger_summary` event was recorded.",
      "",
    ];
  }

  return [
    "## Profiler Logger",
    "",
    `- Recorded events: ${formatInteger(profileLoggerSummary.recordedEventCount)}`,
    `- Written events: ${formatInteger(profileLoggerSummary.writtenEventCount)}`,
    `- Failed writes: ${formatInteger(profileLoggerSummary.failedWriteEventCount)}`,
    `- Bytes written: ${formatBytes(profileLoggerSummary.bytesWritten)}`,
    `- Flushes: ${formatInteger(profileLoggerSummary.flushCount)}`,
    `- Failed flushes: ${formatInteger(profileLoggerSummary.failedFlushCount)}`,
    `- Max buffered events: ${formatInteger(profileLoggerSummary.maxBufferedEventCount)}`,
    `- Max flush duration: ${formatMilliseconds(profileLoggerSummary.maxFlushDurationMs)}`,
    "",
  ];
}

function formatSuspectedBottlenecksSection(input: {
  diagnosticEvents: readonly ProfileDiagnosticEvent[];
  processSamples: readonly ProfileProcessSampleEvent[];
  profileEvents: readonly BuliProfileJsonlEvent[];
}): readonly string[] {
  const responseStepSummaries = listDiagnosticEvents(input.diagnosticEvents, "openai", "response_step.summary");
  const storageOperationSummaries = listDiagnosticEvents(input.diagnosticEvents, "cli", "conversation_session_storage.operation_summary");
  const reactRenderSummaries = listDiagnosticEvents(input.diagnosticEvents, "tui", "chat_screen.react_render_summary");
  const taskToolExecutionFinishedEvents = listDiagnosticEvents(input.diagnosticEvents, "engine", "tool_call.execution_finished")
    .filter((event) => readStringField(event.fields, "toolName") === "task");
  const taskOnlyConcurrentGroupEvents = listDiagnosticEvents(input.diagnosticEvents, "engine", "tool_call.concurrent_group_finished")
    .filter((event) => readStringArrayField(event.fields, "toolNames")?.every((toolName) => toolName === "task") ?? false);
  const profileLoggerSummary = summarizeBuliProfileRun(input.profileEvents).profileLoggerSummary;
  const requestBodyGrowth = calculateNumericFieldGrowth(responseStepSummaries, "requestBodyTextLength");
  const maxEventLoopDelayMs = maxNumber(input.processSamples.map((processSample) => processSample.eventLoopDelayMaxMs)) ?? 0;
  const candidates: BottleneckCandidate[] = [
    createDurationBottleneckCandidate({
      boundaryName: "OpenAI response steps",
      evidence: "Sum of `openai:response_step.summary.durationMs`.",
      durationMs: aggregateNumericField(responseStepSummaries, "durationMs").total,
    }),
    createDurationBottleneckCandidate({
      boundaryName: "OpenAI HTTP wait",
      evidence: "Sum of `openai:response_step.summary.httpWaitDurationMs`.",
      durationMs: aggregateNumericField(responseStepSummaries, "httpWaitDurationMs").total,
    }),
    createDurationBottleneckCandidate({
      boundaryName: "OpenAI stream read",
      evidence: "Sum of `openai:response_step.summary.streamDurationMs`.",
      durationMs: aggregateNumericField(responseStepSummaries, "streamDurationMs").total,
    }),
    createDurationBottleneckCandidate({
      boundaryName: "Tool-result wait",
      evidence: "Sum of `openai:response_step.summary.toolResultWaitDurationMs`.",
      durationMs: aggregateNumericField(responseStepSummaries, "toolResultWaitDurationMs").total,
    }),
    createDurationBottleneckCandidate({
      boundaryName: "Task subagent execution",
      evidence: "Sum of task executor `engine:tool_call.execution_finished.durationMs`; parent-visible success/failure is reported separately in Task Subagent Attribution.",
      durationMs: aggregateNumericField(taskToolExecutionFinishedEvents, "durationMs").total,
    }),
    createDurationBottleneckCandidate({
      boundaryName: "Task subagent group wall time",
      evidence: "Sum of task-only `engine:tool_call.concurrent_group_finished.durationMs` wall-clock spans.",
      durationMs: aggregateNumericField(taskOnlyConcurrentGroupEvents, "durationMs").total,
    }),
    createDurationBottleneckCandidate({
      boundaryName: "SQLite session storage",
      evidence: "Sum of `cli:conversation_session_storage.operation_summary.durationMs`.",
      durationMs: aggregateNumericField(storageOperationSummaries, "durationMs").total,
    }),
    createDurationBottleneckCandidate({
      boundaryName: "TUI React rendering",
      evidence: "Latest `tui:chat_screen.react_render_summary.totalActualDurationMs`.",
      durationMs: readNumberField(reactRenderSummaries.at(-1)?.fields, "totalActualDurationMs"),
    }),
    createDurationBottleneckCandidate({
      boundaryName: "Event-loop stalls",
      evidence: "Max `process_sample.eventLoopDelayMaxMs`.",
      durationMs: maxEventLoopDelayMs,
    }),
    createDurationBottleneckCandidate({
      boundaryName: "Profiler flush overhead",
      evidence: "`profile_logger_summary.totalFlushDurationMs`.",
      durationMs: profileLoggerSummary?.totalFlushDurationMs ?? 0,
    }),
    createSizeBottleneckCandidate({
      boundaryName: "OpenAI request growth",
      evidence: "Max minus first `response_step.summary.requestBodyTextLength`.",
      bytes: requestBodyGrowth.growth,
    }),
    createSizeBottleneckCandidate({
      boundaryName: "Tool-result payload",
      evidence: "Sum of `response_step.summary.toolResultTextLength`.",
      bytes: aggregateNumericField(responseStepSummaries, "toolResultTextLength").total,
    }),
  ].filter((candidate) => candidate.severityScore > 0);

  if (candidates.length === 0) {
    return ["## Suspected Bottlenecks", "", "No ranked bottleneck signals were present in this profile.", ""];
  }

  return [
    "## Suspected Bottlenecks",
    "",
    "| Rank | Boundary | Signal | Evidence |",
    "| ---: | --- | ---: | --- |",
    ...candidates.sort((leftCandidate, rightCandidate) => rightCandidate.severityScore - leftCandidate.severityScore).slice(0, 10).map(
      (candidate, candidateIndex) =>
        `| ${candidateIndex + 1} | ${candidate.boundaryName} | ${candidate.valueText} | ${candidate.evidence} |`,
    ),
    "",
  ];
}

function formatProcessSampleAttributionSection(processSamples: readonly ProfileProcessSampleEvent[]): readonly string[] {
  const activeTurnSampleCount = processSamples.filter((processSample) => processSample.activeConversationTurnId).length;
  const concurrentTurnSampleCount = processSamples.filter((processSample) => (processSample.activeConversationTurnCount ?? 0) > 1).length;
  if (processSamples.length === 0) {
    return ["## Process Sample Attribution", "", "No process samples were recorded.", ""];
  }

  return [
    "## Process Sample Attribution",
    "",
    `- Samples: ${formatInteger(processSamples.length)}`,
    `- Samples with one active conversation turn: ${formatInteger(activeTurnSampleCount)}`,
    `- Samples with concurrent active turns: ${formatInteger(concurrentTurnSampleCount)}`,
    `- Max active turn count: ${formatInteger(maxNumber(processSamples.map((processSample) => processSample.activeConversationTurnCount ?? 0)) ?? 0)}`,
    "",
  ];
}

function formatConversationTurnSection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const conversationTurnSummaries = listDiagnosticEvents(diagnosticEvents, "engine", "conversation_turn.summary");
  if (conversationTurnSummaries.length === 0) {
    return ["## Conversation Turns", "", "No conversation turn summaries were recorded.", ""];
  }

  return [
    "## Conversation Turns",
    "",
    "| Turn | Outcome | Duration | Events | Session Entries | Tool Result Text | Max Tool Result | Replay Output |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...conversationTurnSummaries.map((event) => {
      const fields = event.fields;
      return `| ${formatShortField(fields, "conversationTurnId")} | ${formatStringField(fields, "outcomeKind")} | ${formatMilliseconds(readNumberField(fields, "turnDurationMs"))} | ${formatNumberField(fields, "assistantResponseEventCount")} | ${formatNumberField(fields, "conversationSessionEntryCount")} | ${formatNumberField(fields, "totalToolResultTextLength")} | ${formatNumberField(fields, "maxToolResultTextLength")} | ${formatNumberField(fields, "providerTurnReplayFunctionCallOutputLength")} |`;
    }),
    "",
  ];
}

function formatOpenAiProviderTurnSection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const providerTurnSummaries = listDiagnosticEvents(diagnosticEvents, "openai", "provider_turn.summary");
  if (providerTurnSummaries.length === 0) {
    return ["## OpenAI Provider Turns", "", "No OpenAI provider turn summaries were recorded.", ""];
  }

  return [
    "## OpenAI Provider Turns",
    "",
    "| Turn | Kind | Model | Effort | Terminal | Duration | Steps | Tool Calls | Input Tokens | Output Tokens | Max Request Body | Tool Result Text |",
    "| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...providerTurnSummaries.map((event) => {
      const fields = event.fields;
      return `| ${formatShortField(fields, "conversationTurnId")} | ${formatStringField(fields, "providerTurnKind")} | ${formatStringField(fields, "selectedModelId")} | ${formatStringField(fields, "selectedReasoningEffort")} | ${formatStringField(fields, "terminalKind")} | ${formatMilliseconds(readNumberField(fields, "durationMs"))} | ${formatNumberField(fields, "responseStepCount")} | ${formatNumberField(fields, "requestedToolCallCount")} | ${formatNumberField(fields, "inputTokens")} | ${formatNumberField(fields, "outputTokens")} | ${formatNumberField(fields, "maxRequestBodyTextLength")} | ${formatNumberField(fields, "totalToolResultTextLength")} |`;
    }),
    "",
  ];
}

function formatOpenAiProviderTurnKindAttributionSection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const providerTurnSummaries = listDiagnosticEvents(diagnosticEvents, "openai", "provider_turn.summary");
  const responseStepSummaries = listDiagnosticEvents(diagnosticEvents, "openai", "response_step.summary");
  if (![...providerTurnSummaries, ...responseStepSummaries].some((event) => readStringField(event.fields, "providerTurnKind") !== undefined)) {
    return ["## OpenAI Provider Turn Kind Attribution", "", "No provider-turn kind attribution fields were recorded.", ""];
  }

  const attributionByKind = new Map<string, ProviderTurnKindAttribution>();
  for (const providerTurnSummary of providerTurnSummaries) {
    const attribution = getProviderTurnKindAttribution(attributionByKind, readProviderTurnKind(providerTurnSummary.fields));
    attribution.providerTurnCount += 1;
    attribution.providerTurnDurationMs += readNumberField(providerTurnSummary.fields, "durationMs");
    attribution.requestedToolCallCount += readNumberField(providerTurnSummary.fields, "requestedToolCallCount");
    attribution.maxRequestBodyTextLength = Math.max(
      attribution.maxRequestBodyTextLength,
      readNumberField(providerTurnSummary.fields, "maxRequestBodyTextLength"),
    );
  }
  for (const responseStepSummary of responseStepSummaries) {
    const attribution = getProviderTurnKindAttribution(attributionByKind, readProviderTurnKind(responseStepSummary.fields));
    attribution.responseStepCount += 1;
    attribution.httpWaitDurationMs += readNumberField(responseStepSummary.fields, "httpWaitDurationMs");
    attribution.streamDurationMs += readNumberField(responseStepSummary.fields, "streamDurationMs");
    attribution.toolResultWaitDurationMs += readNumberField(responseStepSummary.fields, "toolResultWaitDurationMs");
    attribution.requestConstructionDurationMs += readNumberField(responseStepSummary.fields, "requestConstructionDurationMs");
    attribution.maxRequestBodyTextLength = Math.max(
      attribution.maxRequestBodyTextLength,
      readNumberField(responseStepSummary.fields, "requestBodyTextLength"),
    );
  }

  const providerTurnKindAttributions = [...attributionByKind.values()].sort((leftAttribution, rightAttribution) =>
    rightAttribution.providerTurnDurationMs - leftAttribution.providerTurnDurationMs ||
    rightAttribution.httpWaitDurationMs - leftAttribution.httpWaitDurationMs ||
    leftAttribution.providerTurnKind.localeCompare(rightAttribution.providerTurnKind)
  );

  return [
    "## OpenAI Provider Turn Kind Attribution",
    "",
    "| Kind | Provider Turns | Provider Duration | Steps | Tool Calls | HTTP Wait | Stream | Tool Wait | Request Build | Max Request Body |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...providerTurnKindAttributions.map((attribution) =>
      `| ${attribution.providerTurnKind} | ${formatInteger(attribution.providerTurnCount)} | ${formatMilliseconds(attribution.providerTurnDurationMs)} | ${formatInteger(attribution.responseStepCount)} | ${formatInteger(attribution.requestedToolCallCount)} | ${formatMilliseconds(attribution.httpWaitDurationMs)} | ${formatMilliseconds(attribution.streamDurationMs)} | ${formatMilliseconds(attribution.toolResultWaitDurationMs)} | ${formatMilliseconds(attribution.requestConstructionDurationMs)} | ${formatBytes(attribution.maxRequestBodyTextLength)} |`
    ),
    "",
  ];
}

function formatOpenAiResponseStepSection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const responseStepSummaries = listDiagnosticEvents(diagnosticEvents, "openai", "response_step.summary");
  if (responseStepSummaries.length === 0) {
    return ["## OpenAI Response Steps", "", "No OpenAI response-step summaries were recorded.", ""];
  }

  const slowestResponseSteps = [...responseStepSummaries].sort((leftEvent, rightEvent) =>
    readNumberField(rightEvent.fields, "durationMs") - readNumberField(leftEvent.fields, "durationMs")
  ).slice(0, 10);
  const aggregateDuration = aggregateNumericField(responseStepSummaries, "durationMs");
  const aggregateHttpWait = aggregateNumericField(responseStepSummaries, "httpWaitDurationMs");
  const aggregateStreamDuration = aggregateNumericField(responseStepSummaries, "streamDurationMs");
  const aggregateToolWait = aggregateNumericField(responseStepSummaries, "toolResultWaitDurationMs");
  const aggregateCacheReadTokens = aggregateNumericField(responseStepSummaries, "cacheReadTokens");
  const aggregateCacheWriteTokens = aggregateNumericField(responseStepSummaries, "cacheWriteTokens");

  return [
    "## OpenAI Response Steps",
    "",
    `- Count: ${formatInteger(responseStepSummaries.length)}`,
    `- Total duration: ${formatMilliseconds(aggregateDuration.total)}`,
    `- Max duration: ${formatMilliseconds(aggregateDuration.max)}`,
    `- Total HTTP wait: ${formatMilliseconds(aggregateHttpWait.total)}`,
    `- Total stream duration: ${formatMilliseconds(aggregateStreamDuration.total)}`,
    `- Total tool-result wait: ${formatMilliseconds(aggregateToolWait.total)}`,
    `- Total cache read tokens: ${formatInteger(aggregateCacheReadTokens.total)}`,
    `- Total cache write tokens: ${formatInteger(aggregateCacheWriteTokens.total)}`,
    "",
    "| Turn | Step | Terminal | Duration | HTTP Wait | Stream | Tool Wait | Request Body | Tool Results | Input Tokens |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...slowestResponseSteps.map((event) => {
      const fields = event.fields;
      return `| ${formatShortField(fields, "conversationTurnId")} | ${formatNumberField(fields, "responseStepIndex")} | ${formatStringField(fields, "terminalKind")} | ${formatMilliseconds(readNumberField(fields, "durationMs"))} | ${formatMilliseconds(readNumberField(fields, "httpWaitDurationMs"))} | ${formatMilliseconds(readNumberField(fields, "streamDurationMs"))} | ${formatMilliseconds(readNumberField(fields, "toolResultWaitDurationMs"))} | ${formatNumberField(fields, "requestBodyTextLength")} | ${formatNumberField(fields, "toolResultTextLength")} | ${formatNumberField(fields, "inputTokens")} |`;
    }),
    "",
  ];
}

function formatOpenAiRetrySection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const responseStepSummaries = listDiagnosticEvents(diagnosticEvents, "openai", "response_step.summary");
  const retriedResponseStepSummaries = responseStepSummaries.filter((event) => readNumberField(event.fields, "requestAttemptCount") > 1);
  const transportRetryScheduledEvents = listDiagnosticEvents(diagnosticEvents, "openai", "response_step.transport_retry_scheduled");
  const transportRetrySucceededEvents = listDiagnosticEvents(diagnosticEvents, "openai", "response_step.transport_retry_succeeded");
  const transportRetryExhaustedEvents = listDiagnosticEvents(diagnosticEvents, "openai", "response_step.transport_retry_exhausted");
  const httpRetryScheduledEvents = listDiagnosticEvents(diagnosticEvents, "openai", "response_step.retry_scheduled");
  const httpRetrySucceededEvents = listDiagnosticEvents(diagnosticEvents, "openai", "response_step.retry_succeeded");
  const httpRetryExhaustedEvents = listDiagnosticEvents(diagnosticEvents, "openai", "response_step.retry_exhausted");
  const responseReceivedEvents = listDiagnosticEvents(diagnosticEvents, "openai", "response_step.response_received");
  const totalExtraResponseStepRequestAttempts = retriedResponseStepSummaries.reduce(
    (totalExtraAttempts, event) => totalExtraAttempts + Math.max(0, readNumberField(event.fields, "requestAttemptCount") - 1),
    0,
  );
  const retriedResponseStepHttpWait = aggregateNumericField(retriedResponseStepSummaries, "httpWaitDurationMs");
  const scheduledRetryDelayMs = aggregateNumericField(transportRetryScheduledEvents, "retryDelayMilliseconds").total +
    aggregateNumericField(httpRetryScheduledEvents, "retryDelayMilliseconds").total;
  const timeoutTransportRetryCount = transportRetryScheduledEvents.filter((event) =>
    readStringField(event.fields, "transportErrorName") === "TimeoutError"
  ).length;
  const rateLimitResponseObservationCount = responseReceivedEvents.filter((event) =>
    readOptionalNumberField(event.fields, "rateLimitRequestsRemaining") !== undefined ||
    readOptionalNumberField(event.fields, "rateLimitTokensRemaining") !== undefined
  ).length;

  if (
    retriedResponseStepSummaries.length === 0 &&
    transportRetryScheduledEvents.length === 0 &&
    httpRetryScheduledEvents.length === 0 &&
    rateLimitResponseObservationCount === 0
  ) {
    return ["## OpenAI Retries And Timeouts", "", "No OpenAI retry, timeout, or rate-limit signals were recorded.", ""];
  }

  return [
    "## OpenAI Retries And Timeouts",
    "",
    `- Retried response steps: ${formatInteger(retriedResponseStepSummaries.length)}`,
    `- Extra response-step request attempts: ${formatInteger(totalExtraResponseStepRequestAttempts)}`,
    `- HTTP wait on retried response steps: ${formatMilliseconds(retriedResponseStepHttpWait.total)}`,
    `- Scheduled retry delay: ${formatMilliseconds(scheduledRetryDelayMs)}`,
    `- Transport retries scheduled: ${formatInteger(transportRetryScheduledEvents.length)}`,
    `- Timeout transport retries scheduled: ${formatInteger(timeoutTransportRetryCount)}`,
    `- Transport retry successes/exhaustions: ${formatInteger(transportRetrySucceededEvents.length)} / ${formatInteger(transportRetryExhaustedEvents.length)}`,
    `- HTTP retries scheduled: ${formatInteger(httpRetryScheduledEvents.length)}`,
    `- HTTP retry successes/exhaustions: ${formatInteger(httpRetrySucceededEvents.length)} / ${formatInteger(httpRetryExhaustedEvents.length)}`,
    `- Rate-limit header observations: ${formatInteger(rateLimitResponseObservationCount)}`,
    `- Transport retry error names: ${formatCountByField(transportRetryScheduledEvents, "transportErrorName")}`,
    `- HTTP retry statuses: ${formatCountByField(httpRetryScheduledEvents, "status")}`,
    "",
  ];
}

function formatOpenAiRequestConstructionSection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const responseStepSummaries = listDiagnosticEvents(diagnosticEvents, "openai", "response_step.summary");
  if (!responseStepSummaries.some((event) => readOptionalNumberField(event.fields, "requestConstructionDurationMs") !== undefined)) {
    return ["## OpenAI Request Construction", "", "No request construction timing fields were recorded.", ""];
  }

  const requestConstructionDuration = aggregateNumericField(responseStepSummaries, "requestConstructionDurationMs");
  const requestObjectBuildDuration = aggregateNumericField(responseStepSummaries, "requestObjectBuildDurationMs");
  const requestSerializationDuration = aggregateNumericField(responseStepSummaries, "requestSerializationDurationMs");
  const serializedRequestBodyText = aggregateNumericField(responseStepSummaries, "requestBodyTextLength");
  const slowestRequestConstructions = [...responseStepSummaries].sort((leftEvent, rightEvent) =>
    readNumberField(rightEvent.fields, "requestConstructionDurationMs") - readNumberField(leftEvent.fields, "requestConstructionDurationMs")
  ).slice(0, 10);

  return [
    "## OpenAI Request Construction",
    "",
    `- Response steps with timing: ${formatInteger(requestConstructionDuration.count)}`,
    `- Total request construction: ${formatMilliseconds(requestConstructionDuration.total)}`,
    `- Max request construction: ${formatMilliseconds(requestConstructionDuration.max)}`,
    `- Total request object build: ${formatMilliseconds(requestObjectBuildDuration.total)}`,
    `- Total request serialization: ${formatMilliseconds(requestSerializationDuration.total)}`,
    `- Serialized request body text across steps: ${formatBytes(serializedRequestBodyText.total)}`,
    "",
    "| Turn | Kind | Step | Construction | Object Build | Serialization | Request Body | Input Items |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...slowestRequestConstructions.map((event) => {
      const fields = event.fields;
      return `| ${formatShortField(fields, "conversationTurnId")} | ${readProviderTurnKind(fields)} | ${formatNumberField(fields, "responseStepIndex")} | ${formatMilliseconds(readNumberField(fields, "requestConstructionDurationMs"))} | ${formatMilliseconds(readNumberField(fields, "requestObjectBuildDurationMs"))} | ${formatMilliseconds(readNumberField(fields, "requestSerializationDurationMs"))} | ${formatBytes(readNumberField(fields, "requestBodyTextLength"))} | ${formatNumberField(fields, "requestInputItemCount")} |`;
    }),
    "",
  ];
}

function formatOpenAiRequestSizeContributorSection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const responseStepSummaries = listDiagnosticEvents(diagnosticEvents, "openai", "response_step.summary");
  const responseStepsWithContributorDiagnostics = responseStepSummaries.filter((event) =>
    readStringArrayField(event.fields, "requestLargestContributorKinds") !== undefined
  );
  if (responseStepsWithContributorDiagnostics.length === 0) {
    return ["## OpenAI Request Size Contributors", "", "No request size contributor fields were recorded.", ""];
  }

  const contributorRows = [...listOpenAiRequestSizeContributorReportRows(responseStepsWithContributorDiagnostics)]
    .sort((leftRow, rightRow) =>
      rightRow.serializedByteLength - leftRow.serializedByteLength ||
      leftRow.contributorKind.localeCompare(rightRow.contributorKind)
    )
    .slice(0, 20);
  const maxStableRequestBytes = maxNumber(responseStepsWithContributorDiagnostics.map((event) =>
    readNumberField(event.fields, "requestStableSerializedByteLength")
  )) ?? 0;
  const maxInputBytes = maxNumber(responseStepsWithContributorDiagnostics.map((event) =>
    readNumberField(event.fields, "requestInputSerializedByteLength")
  )) ?? 0;

  return [
    "## OpenAI Request Size Contributors",
    "",
    `- Response steps with contributor diagnostics: ${formatInteger(responseStepsWithContributorDiagnostics.length)}`,
    `- Max stable request bytes: ${formatBytes(maxStableRequestBytes)}`,
    `- Max input bytes: ${formatBytes(maxInputBytes)}`,
    "",
    "| Turn | Kind | Step | Contributor | Input Item | Serialized | Text |",
    "| --- | --- | ---: | --- | ---: | ---: | ---: |",
    ...contributorRows.map((row) =>
      `| ${formatShortText(row.conversationTurnId)} | ${row.providerTurnKind} | ${formatInteger(row.responseStepIndex)} | ${row.contributorKind} | ${formatInputItemIndex(row.inputItemIndex)} | ${formatBytes(row.serializedByteLength)} | ${formatBytes(row.textLength)} |`
    ),
    "",
  ];
}

function formatOpenAiReplayInputAgeSection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const responseStepSummaries = listDiagnosticEvents(diagnosticEvents, "openai", "response_step.summary");
  if (!responseStepSummaries.some((event) => readOptionalNumberField(event.fields, "requestHistoricalFunctionCallOutputTextLength") !== undefined)) {
    return ["## OpenAI Replay Input Age", "", "No replay-age fields were recorded.", ""];
  }

  const totalFunctionCallOutputText = aggregateNumericField(responseStepSummaries, "requestFunctionCallOutputTextLength");
  const historicalFunctionCallOutputText = aggregateNumericField(responseStepSummaries, "requestHistoricalFunctionCallOutputTextLength");
  const currentTurnFunctionCallOutputText = aggregateNumericField(responseStepSummaries, "requestCurrentTurnFunctionCallOutputTextLength");
  const largestReplayRequests = [...responseStepSummaries].sort((leftEvent, rightEvent) =>
    readNumberField(rightEvent.fields, "requestFunctionCallOutputTextLength") -
      readNumberField(leftEvent.fields, "requestFunctionCallOutputTextLength")
  ).slice(0, 10);

  return [
    "## OpenAI Replay Input Age",
    "",
    `- Function-output text across response-step requests: ${formatBytes(totalFunctionCallOutputText.total)}`,
    `- Historical function-output text: ${formatBytes(historicalFunctionCallOutputText.total)}`,
    `- Current-turn function-output text: ${formatBytes(currentTurnFunctionCallOutputText.total)}`,
    `- Max historical function-output text on one request: ${formatBytes(historicalFunctionCallOutputText.max)}`,
    `- Max current-turn function-output text on one request: ${formatBytes(currentTurnFunctionCallOutputText.max)}`,
    "- Note: totals are bytes sent across provider requests, not unique retained bytes.",
    "",
    "| Turn | Kind | Step | Total Function Output | Historical | Current Turn | Request Body |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...largestReplayRequests.map((event) => {
      const fields = event.fields;
      return `| ${formatShortField(fields, "conversationTurnId")} | ${readProviderTurnKind(fields)} | ${formatNumberField(fields, "responseStepIndex")} | ${formatBytes(readNumberField(fields, "requestFunctionCallOutputTextLength"))} | ${formatBytes(readNumberField(fields, "requestHistoricalFunctionCallOutputTextLength"))} | ${formatBytes(readNumberField(fields, "requestCurrentTurnFunctionCallOutputTextLength"))} | ${formatBytes(readNumberField(fields, "requestBodyTextLength"))} |`;
    }),
    "",
  ];
}

function formatOpenAiWorkingSetVisibilitySection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const responseStepSummaries = listDiagnosticEvents(diagnosticEvents, "openai", "response_step.summary");
  const responseStepsWithWorkingSetDiagnostics = responseStepSummaries.filter((event) =>
    readOptionalNumberField(event.fields, "requestWorkingSetInputItemCount") !== undefined
  );
  if (responseStepsWithWorkingSetDiagnostics.length === 0) {
    return ["## OpenAI Working-Set Visibility", "", "No working-set visibility fields were recorded.", ""];
  }

  const exactInputItemCount = aggregateNumericField(responseStepsWithWorkingSetDiagnostics, "requestWorkingSetExactInputItemCount");
  const compactedInputItemCount = aggregateNumericField(responseStepsWithWorkingSetDiagnostics, "requestWorkingSetCompactedInputItemCount");
  const originalTextLength = aggregateNumericField(responseStepsWithWorkingSetDiagnostics, "requestWorkingSetOriginalTextLength");
  const projectedTextLength = aggregateNumericField(responseStepsWithWorkingSetDiagnostics, "requestWorkingSetProjectedTextLength");
  const savedCharacterCount = aggregateNumericField(responseStepsWithWorkingSetDiagnostics, "requestWorkingSetSavedCharacterCount");
  const originalSerializedByteLength = aggregateNumericField(
    responseStepsWithWorkingSetDiagnostics,
    "requestWorkingSetOriginalSerializedByteLength",
  );
  const projectedSerializedByteLength = aggregateNumericField(
    responseStepsWithWorkingSetDiagnostics,
    "requestWorkingSetProjectedSerializedByteLength",
  );
  const savedSerializedByteLength = aggregateNumericField(
    responseStepsWithWorkingSetDiagnostics,
    "requestWorkingSetSavedSerializedByteLength",
  );
  const unclassifiedInputItemCount = aggregateNumericField(
    responseStepsWithWorkingSetDiagnostics,
    "requestWorkingSetUnclassifiedInputItemCount",
  );
  const currentTurnFunctionOutputOriginalTextLength = aggregateNumericField(
    responseStepsWithWorkingSetDiagnostics,
    "requestCurrentTurnFunctionCallOutputOriginalTextLength",
  );
  const currentTurnFunctionOutputProjectedTextLength = aggregateNumericField(
    responseStepsWithWorkingSetDiagnostics,
    "requestCurrentTurnFunctionCallOutputProjectedTextLength",
  );
  const currentTurnFunctionOutputSavedCharacterCount = aggregateNumericField(
    responseStepsWithWorkingSetDiagnostics,
    "requestCurrentTurnFunctionCallOutputSavedCharacterCount",
  );
  const reasonRows = listOpenAiWorkingSetVisibilityReasonRows(responseStepsWithWorkingSetDiagnostics);
  const projectionKindRows = listOpenAiWorkingSetProjectionKindRows(responseStepsWithWorkingSetDiagnostics);
  const largestVisibleInputItemRows = [...listOpenAiWorkingSetLargestInputItemRows(responseStepsWithWorkingSetDiagnostics)]
    .sort((leftRow, rightRow) =>
      rightRow.serializedByteLength - leftRow.serializedByteLength ||
      leftRow.visibilityReason.localeCompare(rightRow.visibilityReason) ||
      leftRow.inputItemIndex - rightRow.inputItemIndex
    )
    .slice(0, 20);
  const projectionNote = savedSerializedByteLength.total > 0 || compactedInputItemCount.total > 0
    ? "- Note: duplicate-reference projection is request-local only. Raw evidence and stored provider-turn replay stayed exact; cross-step evidence replay aggregation is still off by default."
    : "- Note: these are provider-visible projection diagnostics only. Raw evidence was not deleted, current requests stayed exact, and saved bytes are 0.";

  return [
    "## OpenAI Working-Set Visibility",
    "",
    projectionNote,
    `- Response steps with working-set diagnostics: ${formatInteger(responseStepsWithWorkingSetDiagnostics.length)}`,
    `- Input items exact/compacted: ${formatInteger(exactInputItemCount.total)} / ${formatInteger(compactedInputItemCount.total)}`,
    `- Text original/projected/saved: ${formatBytes(originalTextLength.total)} / ${formatBytes(projectedTextLength.total)} / ${formatBytes(savedCharacterCount.total)}`,
    `- Serialized original/projected/saved: ${formatBytes(originalSerializedByteLength.total)} / ${formatBytes(projectedSerializedByteLength.total)} / ${formatBytes(savedSerializedByteLength.total)}`,
    `- Current-turn function-output original/projected/saved: ${formatBytes(currentTurnFunctionOutputOriginalTextLength.total)} / ${formatBytes(currentTurnFunctionOutputProjectedTextLength.total)} / ${formatBytes(currentTurnFunctionOutputSavedCharacterCount.total)}`,
    `- Unclassified visible input items: ${formatInteger(unclassifiedInputItemCount.total)}`,
    "",
    ...formatOpenAiWorkingSetProjectionKindRows(projectionKindRows),
    "| Visibility Reason | Items | Text | Serialized |",
    "| --- | ---: | ---: | ---: |",
    ...reasonRows.map((row) =>
      `| ${row.visibilityReason} | ${formatInteger(row.inputItemCount)} | ${formatBytes(row.textLength)} | ${formatBytes(row.serializedByteLength)} |`
    ),
    "",
    "Largest provider-visible input items:",
    "",
    "| Turn | Kind | Step | Input Item | Reason | Projection | Evidence | Current Turn | Text | Serialized |",
    "| --- | --- | ---: | ---: | --- | --- | --- | --- | ---: | ---: |",
    ...largestVisibleInputItemRows.map((row) =>
      `| ${formatShortText(row.conversationTurnId)} | ${row.providerTurnKind} | ${formatInteger(row.responseStepIndex)} | ${formatInputItemIndex(row.inputItemIndex)} | ${row.visibilityReason} | ${row.projectionKind} | ${formatNullableText(row.evidenceId)} | ${row.isCurrentTurnItem ? "yes" : "no"} | ${formatBytes(row.textLength)} | ${formatBytes(row.serializedByteLength)} |`
    ),
    "",
  ];
}

function formatOpenAiWorkingSetProjectionKindRows(
  projectionKindRows: readonly OpenAiWorkingSetProjectionKindReportRow[],
): readonly string[] {
  if (projectionKindRows.length === 0) {
    return [];
  }

  return [
    "Projection kinds:",
    "",
    "| Projection | Items | Original Text | Projected Text | Saved Text | Original Serialized | Projected Serialized | Saved Serialized |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...projectionKindRows.map((row) =>
      `| ${row.projectionKind} | ${formatInteger(row.inputItemCount)} | ${formatBytes(row.originalTextLength)} | ${formatBytes(row.projectedTextLength)} | ${formatBytes(row.savedCharacterCount)} | ${formatBytes(row.originalSerializedByteLength)} | ${formatBytes(row.projectedSerializedByteLength)} | ${formatBytes(row.savedSerializedByteLength)} |`
    ),
    "",
  ];
}

function formatToolAttributionSection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const toolNameByToolCallId = buildToolNameByToolCallId(diagnosticEvents);
  const toolResultSubmittedEvents = listDiagnosticEvents(diagnosticEvents, "engine", "provider_turn.tool_result_submitted");
  const toolResultWaitEvents = [
    ...listDiagnosticEvents(diagnosticEvents, "openai", "tool_result_submission.resolved_pending_wait"),
    ...listDiagnosticEvents(diagnosticEvents, "openai", "tool_result_submission.consumed_queued"),
  ];
  const toolExecutionFinishedEvents = listDiagnosticEvents(diagnosticEvents, "engine", "tool_call.execution_finished");
  const bashApprovalWaitFinishedEvents = listDiagnosticEvents(diagnosticEvents, "engine", "tool_call.bash_approval_wait_finished");

  if (
    toolResultSubmittedEvents.length === 0 &&
    toolResultWaitEvents.length === 0 &&
    toolExecutionFinishedEvents.length === 0 &&
    bashApprovalWaitFinishedEvents.length === 0
  ) {
    return ["## Tool Attribution", "", "No tool attribution events were recorded.", ""];
  }

  const toolResultTextLengthByToolName = aggregateToolCallNumericField({
    diagnosticEvents: toolResultSubmittedEvents,
    toolNameByToolCallId,
    fieldName: "toolResultTextLength",
  });
  const toolResultWaitDurationByToolName = aggregateToolCallNumericField({
    diagnosticEvents: toolResultWaitEvents,
    toolNameByToolCallId,
    fieldName: "waitDurationMs",
  });
  const toolExecutionDurationByToolName = aggregateToolCallNumericField({
    diagnosticEvents: toolExecutionFinishedEvents,
    toolNameByToolCallId,
    fieldName: "durationMs",
  });
  const bashApprovalWaitDuration = aggregateNumericField(bashApprovalWaitFinishedEvents, "durationMs");

  return [
    "## Tool Attribution",
    "",
    "### Tool Result Payload By Tool",
    "",
    ...formatToolAggregateTable({ aggregateByToolName: toolResultTextLengthByToolName, valueHeader: "Total Text", formatValue: formatBytes }),
    "### Tool Result Wait By Tool",
    "",
    ...formatToolAggregateTable({
      aggregateByToolName: toolResultWaitDurationByToolName,
      valueHeader: "Total Wait",
      formatValue: formatMilliseconds,
    }),
    "- Note: per-tool wait is summed per tool call and can exceed response-step wall time when parallel calls overlap.",
    "",
    "### Tool Execution By Tool",
    "",
    ...formatToolAggregateTable({
      aggregateByToolName: toolExecutionDurationByToolName,
      valueHeader: "Total Duration",
      formatValue: formatMilliseconds,
    }),
    "### Bash Approval Wait",
    "",
    `- Approval waits: ${formatInteger(bashApprovalWaitDuration.count)}`,
    `- Total approval wait: ${formatMilliseconds(bashApprovalWaitDuration.total)}`,
    `- Max approval wait: ${formatMilliseconds(bashApprovalWaitDuration.max)}`,
    `- Approval decisions: ${formatCountByField(bashApprovalWaitFinishedEvents, "approvalDecision")}`,
    "",
  ];
}

function formatToolResultDuplicationSection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const toolNameByToolCallId = buildToolNameByToolCallId(diagnosticEvents);
  const duplicateToolResultEvents = listDiagnosticEvents(diagnosticEvents, "engine", "conversation_history.entry_appended")
    .filter((event) => isToolResultEntryKind(readStringField(event.fields, "entryKind")))
    .filter((event) => readNumberField(event.fields, "duplicateToolResultTextPreviousCount") > 0);
  if (duplicateToolResultEvents.length === 0) {
    return ["## Tool Result Duplication", "", "No exact duplicate tool-result text events were recorded.", ""];
  }

  const duplicateToolResultTextLength = aggregateNumericField(duplicateToolResultEvents, "toolResultTextLength");
  const previousDuplicateMatchCount = aggregateNumericField(duplicateToolResultEvents, "duplicateToolResultTextPreviousCount");
  const previousSameToolDuplicateMatchCount = aggregateNumericField(duplicateToolResultEvents, "duplicateToolResultTextSameToolNamePreviousCount");
  const duplicateTextLengthByToolName = aggregateToolCallNumericField({
    diagnosticEvents: duplicateToolResultEvents,
    toolNameByToolCallId,
    fieldName: "toolResultTextLength",
  });
  const largestDuplicateToolResults = [...duplicateToolResultEvents].sort((leftEvent, rightEvent) =>
    readNumberField(rightEvent.fields, "toolResultTextLength") - readNumberField(leftEvent.fields, "toolResultTextLength") ||
    readNumberField(rightEvent.fields, "duplicateToolResultTextPreviousCount") -
      readNumberField(leftEvent.fields, "duplicateToolResultTextPreviousCount")
  ).slice(0, 10);

  return [
    "## Tool Result Duplication",
    "",
    `- Duplicate result entries: ${formatInteger(duplicateToolResultEvents.length)}`,
    `- Duplicate result text total: ${formatBytes(duplicateToolResultTextLength.total)}`,
    `- Previous exact-text matches observed: ${formatInteger(previousDuplicateMatchCount.total)}`,
    `- Previous same-tool matches observed: ${formatInteger(previousSameToolDuplicateMatchCount.total)}`,
    "",
    "### Duplicate Text By Tool",
    "",
    ...formatToolAggregateTable({
      aggregateByToolName: duplicateTextLengthByToolName,
      valueHeader: "Duplicate Text",
      formatValue: formatBytes,
    }),
    "### Largest Duplicate Results",
    "",
    "| Turn | Tool | Tool Call | Text | Previous Matches | Same-Tool Matches | First Tool Call | First Tool |",
    "| --- | --- | --- | ---: | ---: | ---: | --- | --- |",
    ...largestDuplicateToolResults.map((event) => {
      const fields = event.fields;
      return `| ${formatShortField(fields, "conversationTurnId")} | ${formatStringField(fields, "toolName")} | ${formatShortField(fields, "toolCallId")} | ${formatBytes(readNumberField(fields, "toolResultTextLength"))} | ${formatNumberField(fields, "duplicateToolResultTextPreviousCount")} | ${formatNumberField(fields, "duplicateToolResultTextSameToolNamePreviousCount")} | ${formatShortField(fields, "duplicateToolResultFirstToolCallId")} | ${formatStringField(fields, "duplicateToolResultFirstToolName")} |`;
    }),
    "",
  ];
}

function formatTaskSubagentAttributionSection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const taskCallSummaries = buildTaskSubagentCallSummaries(diagnosticEvents);
  const taskOnlyConcurrentGroupEvents = listDiagnosticEvents(diagnosticEvents, "engine", "tool_call.concurrent_group_finished")
    .filter((event) => readStringArrayField(event.fields, "toolNames")?.every((toolName) => toolName === "task") ?? false);
  const taskSubagentSlotAcquiredEvents = listDiagnosticEvents(diagnosticEvents, "engine", "subagent_conversation_limiter.slot_acquired")
    .filter((event) => readStringField(event.fields, "toolName") === "task");

  if (taskCallSummaries.length === 0 && taskOnlyConcurrentGroupEvents.length === 0 && taskSubagentSlotAcquiredEvents.length === 0) {
    return ["## Task Subagent Attribution", "", "No task subagent events were recorded.", ""];
  }

  const taskExecutionDuration = summarizeTaskSubagentCallField(taskCallSummaries, "durationMs");
  const taskParentToolResultWaitDuration = summarizeTaskSubagentCallField(taskCallSummaries, "parentToolResultWaitMs");
  const taskResultTextLength = summarizeTaskSubagentCallField(taskCallSummaries, "toolResultTextLength");
  const taskConcurrentGroupDuration = aggregateNumericField(taskOnlyConcurrentGroupEvents, "durationMs");
  const subagentSlotWaitDuration = aggregateNumericField(taskSubagentSlotAcquiredEvents, "waitDurationMs");
  const parentVisibleFailedTaskResultCount = taskCallSummaries.filter((taskCallSummary) =>
    taskCallSummary.parentVisibleToolResultKind === "failed"
  ).length;
  const maxActiveSubagentConversationCount = maxNumber(
    taskSubagentSlotAcquiredEvents.map((event) => readNumberField(event.fields, "activeSubagentConversationCount")),
  ) ?? 0;
  const slowestTaskCalls = [...taskCallSummaries].sort((leftCall, rightCall) =>
    rightCall.durationMs - leftCall.durationMs || rightCall.parentToolResultWaitMs - leftCall.parentToolResultWaitMs
  ).slice(0, 10);

  return [
    "## Task Subagent Attribution",
    "",
    `- Task calls: ${formatInteger(taskCallSummaries.length)}`,
    `- Parent-visible failed task results: ${formatInteger(parentVisibleFailedTaskResultCount)}`,
    `- Parent-visible result kinds: ${formatCountByTaskParentVisibleResultKind(taskCallSummaries)}`,
    `- Per-call task execution total: ${formatMilliseconds(taskExecutionDuration.total)}`,
    `- Max task execution duration: ${formatMilliseconds(taskExecutionDuration.max)}`,
    `- Per-call parent tool-result wait total: ${formatMilliseconds(taskParentToolResultWaitDuration.total)}`,
    `- Max parent tool-result wait: ${formatMilliseconds(taskParentToolResultWaitDuration.max)}`,
    `- Task result text total: ${formatBytes(taskResultTextLength.total)}`,
    `- Task-only concurrent groups: ${formatInteger(taskConcurrentGroupDuration.count)}`,
    `- Task-only concurrent group wall time: ${formatMilliseconds(taskConcurrentGroupDuration.total)}`,
    `- Max task-only concurrent group wall time: ${formatMilliseconds(taskConcurrentGroupDuration.max)}`,
    `- Subagent slot wait total: ${formatMilliseconds(subagentSlotWaitDuration.total)}`,
    `- Max active subagent conversations: ${formatInteger(maxActiveSubagentConversationCount)}`,
    `- Subagents: ${formatCountByTaskSubagentName(taskCallSummaries, taskSubagentSlotAcquiredEvents)}`,
    "- Note: task execution means the runtime task executor returned; parent result is what the parent assistant/model actually received.",
    "- Note: task execution and parent tool-result wait are per-call sums. Use task-only concurrent group wall time to understand elapsed time when task calls run in parallel.",
    "",
    "| Turn | Tool Call | Subagent | Model | Effort | Executor | Parent Result | Duration | Parent Wait | Result Text |",
    "| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: |",
    ...slowestTaskCalls.map((taskCall) =>
      `| ${formatShortText(taskCall.conversationTurnId)} | ${formatShortText(taskCall.toolCallId)} | ${taskCall.subagentName} | ${formatOptionalText(taskCall.selectedModelId)} | ${formatOptionalText(taskCall.selectedReasoningEffort)} | ${taskCall.executorOutcomeKind} | ${taskCall.parentVisibleToolResultKind} | ${formatMilliseconds(taskCall.durationMs)} | ${formatMilliseconds(taskCall.parentToolResultWaitMs)} | ${formatBytes(taskCall.toolResultTextLength)} |`
    ),
    "",
    "Largest task results:",
    "",
    "| Turn | Tool Call | Subagent | Model | Effort | Result Text | Duration |",
    "| --- | --- | --- | --- | --- | ---: | ---: |",
    ...[...taskCallSummaries]
      .sort((leftCall, rightCall) => rightCall.toolResultTextLength - leftCall.toolResultTextLength)
      .slice(0, 10)
      .map((taskCall) =>
        `| ${formatShortText(taskCall.conversationTurnId)} | ${formatShortText(taskCall.toolCallId)} | ${taskCall.subagentName} | ${formatOptionalText(taskCall.selectedModelId)} | ${formatOptionalText(taskCall.selectedReasoningEffort)} | ${formatBytes(taskCall.toolResultTextLength)} | ${formatMilliseconds(taskCall.durationMs)} |`
      ),
    "",
    ...formatTaskSubagentCheckpointFailureDetails(taskCallSummaries),
  ];
}

function formatOpenAiContextGuardSection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const contextGuardTriggeredEvents = listDiagnosticEvents(diagnosticEvents, "openai", "response_step.continuation_context_guard_triggered");
  if (contextGuardTriggeredEvents.length === 0) {
    return ["## OpenAI Context Guard", "", "No OpenAI context guard events were recorded.", ""];
  }

  return [
    "## OpenAI Context Guard",
    "",
    "| Turn | Step | Reason | Context Tokens | Prompt Input Tokens | Trigger | Context Window | Input Cap | Performance Budget |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...contextGuardTriggeredEvents.map((event) => {
      const fields = event.fields;
      return `| ${formatShortField(fields, "conversationTurnId")} | ${formatOptionalNumberField(fields, "responseStepIndex")} | ${formatStringField(fields, "reason")} | ${formatOptionalNumberField(fields, "contextTokensUsed")} | ${formatOptionalNumberField(fields, "promptInputTokensUsed")} | ${formatOptionalNumberField(fields, "continuationTriggerTokenCount")} | ${formatOptionalNumberField(fields, "contextWindowTokenCapacity")} | ${formatOptionalNumberField(fields, "inputTokenCapacity")} | ${formatOptionalNumberField(fields, "preferredContextPerformanceBudgetTokenCount")} |`;
    }),
    "",
  ];
}

function formatRequestAndContextGrowthSection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const responseStepSummaries = listDiagnosticEvents(diagnosticEvents, "openai", "response_step.summary");
  const providerTurnSummaries = listDiagnosticEvents(diagnosticEvents, "openai", "provider_turn.summary");
  const conversationTurnSummaries = listDiagnosticEvents(diagnosticEvents, "engine", "conversation_turn.summary");
  if (responseStepSummaries.length === 0 && providerTurnSummaries.length === 0 && conversationTurnSummaries.length === 0) {
    return ["## Request And Context Growth", "", "No request or context growth summaries were recorded.", ""];
  }

  const requestBodyGrowth = calculateNumericFieldGrowth(responseStepSummaries, "requestBodyTextLength");
  const functionOutputGrowth = calculateNumericFieldGrowth(responseStepSummaries, "requestFunctionCallOutputTextLength");
  const toolResultTextAggregate = aggregateNumericField(responseStepSummaries, "toolResultTextLength");
  const maxProviderReplayOutputLength = maxNumber(
    providerTurnSummaries.map((event) => readNumberField(event.fields, "providerTurnReplayFunctionCallOutputTextLength")),
  ) ?? 0;
  const maxConversationToolResultTextLength = maxNumber(
    conversationTurnSummaries.map((event) => readNumberField(event.fields, "totalToolResultTextLength")),
  ) ?? 0;

  return [
    "## Request And Context Growth",
    "",
    `- Response steps: ${formatInteger(responseStepSummaries.length)}`,
    `- Request body first/max/last: ${formatBytes(requestBodyGrowth.first)} / ${formatBytes(requestBodyGrowth.max)} / ${formatBytes(requestBodyGrowth.last)}`,
    `- Request body growth: ${formatBytes(requestBodyGrowth.growth)}`,
    `- Function-output text first/max/last: ${formatBytes(functionOutputGrowth.first)} / ${formatBytes(functionOutputGrowth.max)} / ${formatBytes(functionOutputGrowth.last)}`,
    `- Total response-step tool-result text: ${formatBytes(toolResultTextAggregate.total)}`,
    `- Max provider replay function-call output text: ${formatBytes(maxProviderReplayOutputLength)}`,
    `- Max conversation tool-result text: ${formatBytes(maxConversationToolResultTextLength)}`,
    "",
  ];
}

function formatCompactionImpactSection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const compactionStartedEvents = listDiagnosticEvents(diagnosticEvents, "engine", "conversation_compaction.started");
  const compactionCompletedEvents = listDiagnosticEvents(diagnosticEvents, "engine", "conversation_compaction.completed");
  if (compactionStartedEvents.length === 0 && compactionCompletedEvents.length === 0) {
    return ["## Compaction Impact", "", "No compaction events were recorded.", ""];
  }

  return [
    "## Compaction Impact",
    "",
    "| Run | Entries Before | Source Entries | Original Chars | Projected Chars | Truncated Tools | Removed Replay | Entries After | Summary Chars |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...compactionStartedEvents.map((startedEvent, compactionIndex) => {
      const completedEvent = compactionCompletedEvents[compactionIndex];
      return `| ${compactionIndex + 1} | ${formatNumberField(startedEvent.fields, "conversationSessionEntryCount")} | ${formatNumberField(startedEvent.fields, "compactionSourceConversationSessionEntryCount")} | ${formatNumberField(startedEvent.fields, "compactionRequestOriginalCharacterCount")} | ${formatNumberField(startedEvent.fields, "compactionRequestProjectedCharacterCount")} | ${formatNumberField(startedEvent.fields, "truncatedToolResultCount")} | ${formatNumberField(startedEvent.fields, "removedProviderTurnReplayCount")} | ${formatNumberField(completedEvent?.fields, "conversationSessionEntryCount")} | ${formatNumberField(completedEvent?.fields, "summaryTextLength")} |`;
    }),
    "",
  ];
}

function formatTuiRenderSection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const reactRenderSummaries = listDiagnosticEvents(diagnosticEvents, "tui", "chat_screen.react_render_summary");
  const reactRenderCommits = listDiagnosticEvents(diagnosticEvents, "tui", "chat_screen.react_render_commit");
  if (reactRenderSummaries.length === 0 && reactRenderCommits.length === 0) {
    return ["## TUI Render", "", "No TUI React render profiler events were recorded.", ""];
  }

  const latestRenderSummary = reactRenderSummaries.at(-1);
  const slowestCommit = [...reactRenderCommits].sort((leftEvent, rightEvent) =>
    readNumberField(rightEvent.fields, "actualDurationMs") - readNumberField(leftEvent.fields, "actualDurationMs")
  )[0];
  const commitDurationsMs = reactRenderCommits.map((reactRenderCommit) => readNumberField(reactRenderCommit.fields, "actualDurationMs"));
  const fallbackCommitCount = reactRenderCommits.length;
  const fallbackTotalActualDurationMs = commitDurationsMs.reduce((totalDurationMs, durationMs) => totalDurationMs + durationMs, 0);
  const commitCount = readOptionalNumberField(latestRenderSummary?.fields, "commitCount") ?? fallbackCommitCount;
  const maxActualDurationMs = readOptionalNumberField(latestRenderSummary?.fields, "maxActualDurationMs") ??
    (maxNumber(commitDurationsMs) ?? 0);
  const meanActualDurationMs = readOptionalNumberField(latestRenderSummary?.fields, "meanActualDurationMs") ??
    (fallbackCommitCount > 0 ? fallbackTotalActualDurationMs / fallbackCommitCount : 0);

  return [
    "## TUI Render",
    "",
    `- Commit count: ${formatInteger(commitCount)}`,
    `- Max actual duration: ${formatMilliseconds(maxActualDurationMs)}`,
    `- Mean actual duration: ${formatMilliseconds(meanActualDurationMs)}`,
    `- Slowest commit phase: ${formatStringField(slowestCommit?.fields, "renderPhase")}`,
    `- Slowest commit duration: ${formatNumberFieldWithUnit(slowestCommit?.fields, "actualDurationMs", "ms")}`,
    "",
  ];
}

function formatStorageSection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const storageOperationSummaries = listDiagnosticEvents(diagnosticEvents, "cli", "conversation_session_storage.operation_summary");
  if (storageOperationSummaries.length === 0) {
    return ["## SQLite Storage", "", "No SQLite storage summaries were recorded.", ""];
  }

  const durationByOperationName = new Map<string, NumericFieldAggregate>();
  for (const storageOperationSummary of storageOperationSummaries) {
    const operationName = readStringField(storageOperationSummary.fields, "operationName") ?? "unknown";
    durationByOperationName.set(
      operationName,
      appendNumericAggregate(durationByOperationName.get(operationName), readNumberField(storageOperationSummary.fields, "durationMs")),
    );
  }

  return [
    "## SQLite Storage",
    "",
    "| Operation | Count | Total Duration | Max Duration | Mean Duration |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...[...durationByOperationName.entries()].sort((leftEntry, rightEntry) =>
      rightEntry[1].total - leftEntry[1].total || leftEntry[0].localeCompare(rightEntry[0])
    ).map(([operationName, aggregate]) =>
      `| ${operationName} | ${formatInteger(aggregate.count)} | ${formatMilliseconds(aggregate.total)} | ${formatMilliseconds(aggregate.max)} | ${formatMilliseconds(aggregate.total / aggregate.count)} |`
    ),
    "",
  ];
}

function formatCodebaseKnowledgeSection(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly string[] {
  const changedFilesRefreshEvents = listDiagnosticEvents(diagnosticEvents, "engine", "codebase_knowledge.changed_files_refresh_completed");
  const changedFileRefreshEvents = listDiagnosticEvents(diagnosticEvents, "engine", "codebase_knowledge.changed_file_refresh_completed");
  const repositoryStepEvents = listDiagnosticEvents(diagnosticEvents, "engine", "codebase_knowledge.repository_step_completed");
  if (changedFilesRefreshEvents.length === 0 && changedFileRefreshEvents.length === 0 && repositoryStepEvents.length === 0) {
    return ["## Codebase Knowledge", "", "No codebase knowledge refresh or repository diagnostics were recorded.", ""];
  }

  const refreshDuration = aggregateNumericField(changedFilesRefreshEvents, "durationMs");
  const requestedChangedFileCount = aggregateNumericField(changedFilesRefreshEvents, "requestedChangedFileCount");
  const refreshedFileCount = aggregateNumericField(changedFilesRefreshEvents, "refreshedFileCount");
  const replacedFileRecordCount = aggregateNumericField(changedFilesRefreshEvents, "replacedFileRecordCount");
  const removedFileRecordCount = aggregateNumericField(changedFilesRefreshEvents, "removedFileRecordCount");
  const maxRefreshMemoryDeltaRssBytes = maxNumber(changedFilesRefreshEvents.map((event) => readNumberField(event.fields, "memoryDeltaRssBytes"))) ?? 0;
  const maxRefreshMemoryDeltaHeapUsedBytes = maxNumber(
    changedFilesRefreshEvents.map((event) => readNumberField(event.fields, "memoryDeltaHeapUsedBytes")),
  ) ?? 0;
  const maxRefreshMemoryDeltaExternalBytes = maxNumber(
    changedFilesRefreshEvents.map((event) => readNumberField(event.fields, "memoryDeltaExternalBytes")),
  ) ?? 0;
  const maxRefreshMemoryDeltaArrayBuffersBytes = maxNumber(
    changedFilesRefreshEvents.map((event) => readNumberField(event.fields, "memoryDeltaArrayBuffersBytes")),
  ) ?? 0;
  const changedFileRefreshRows = listCodebaseKnowledgeChangedFileRefreshRows(changedFileRefreshEvents);
  const repositoryStepRows = listCodebaseKnowledgeRepositoryStepRows(repositoryStepEvents).slice(0, 20);

  return [
    "## Codebase Knowledge",
    "",
    "- Note: this section attributes successful changed-file refresh and JSON repository phases. It is measurement only; it does not imply records sharding, SQLite, or another-language rewrite happened.",
    `- Changed-file refresh operations: ${formatInteger(changedFilesRefreshEvents.length)}`,
    `- Requested/refreshed files: ${formatInteger(requestedChangedFileCount.total)} / ${formatInteger(refreshedFileCount.total)}`,
    `- Replaced/removed file record sets: ${formatInteger(replacedFileRecordCount.total)} / ${formatInteger(removedFileRecordCount.total)}`,
    `- Total refresh duration: ${formatMilliseconds(refreshDuration.total)}`,
    `- Max refresh duration: ${formatMilliseconds(refreshDuration.max)}`,
    `- Max refresh RSS/heap/external/arrayBuffers delta: ${formatBytes(maxRefreshMemoryDeltaRssBytes)} / ${formatBytes(maxRefreshMemoryDeltaHeapUsedBytes)} / ${formatBytes(maxRefreshMemoryDeltaExternalBytes)} / ${formatBytes(maxRefreshMemoryDeltaArrayBuffersBytes)}`,
    "",
    ...formatCodebaseKnowledgeChangedFileRefreshRows(changedFileRefreshRows),
    ...formatCodebaseKnowledgeRepositoryStepRows(repositoryStepRows),
  ];
}

function formatCodebaseKnowledgeChangedFileRefreshRows(
  changedFileRefreshRows: readonly CodebaseKnowledgeChangedFileRefreshReportRow[],
): readonly string[] {
  if (changedFileRefreshRows.length === 0) {
    return [];
  }

  return [
    "Changed-file refresh by action/status:",
    "",
    "| Action | Status | Count | Total Duration | Max Duration | Max RSS Delta | Max Heap Delta | Output Records |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...changedFileRefreshRows.map((row) =>
      `| ${row.action} | ${row.status} | ${formatInteger(row.refreshCount)} | ${formatMilliseconds(row.totalDurationMs)} | ${formatMilliseconds(row.maxDurationMs)} | ${formatBytes(row.maxMemoryDeltaRssBytes)} | ${formatBytes(row.maxMemoryDeltaHeapUsedBytes)} | ${formatInteger(row.outputRecordCount)} |`
    ),
    "",
  ];
}

function formatCodebaseKnowledgeRepositoryStepRows(
  repositoryStepRows: readonly CodebaseKnowledgeRepositoryStepReportRow[],
): readonly string[] {
  if (repositoryStepRows.length === 0) {
    return [];
  }

  return [
    "Repository operation steps:",
    "",
    "| Operation | Step | Role | Status | Count | Total Duration | Max Duration | Max RSS Delta | Max Heap Delta | Max External Delta | Max ArrayBuffers Delta | Max Text | Max JSON | Max Records | Max Indexed Files |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...repositoryStepRows.map((row) =>
      `| ${row.operationName} | ${row.stepName} | ${row.storedFileRole} | ${row.operationStatus} | ${formatInteger(row.stepCount)} | ${formatMilliseconds(row.totalDurationMs)} | ${formatMilliseconds(row.maxDurationMs)} | ${formatBytes(row.maxMemoryDeltaRssBytes)} | ${formatBytes(row.maxMemoryDeltaHeapUsedBytes)} | ${formatBytes(row.maxMemoryDeltaExternalBytes)} | ${formatBytes(row.maxMemoryDeltaArrayBuffersBytes)} | ${formatBytes(row.maxFileTextByteLength)} | ${formatBytes(row.maxSerializedJsonByteLength)} | ${formatInteger(row.maxRecordCount)} | ${formatInteger(row.maxIndexedFileCount)} |`
    ),
    "",
  ];
}

function formatTopDiagnosticDurationSection(
  diagnosticDurationSummaries: ReturnType<typeof summarizeBuliProfileRun>["diagnosticDurationSummaries"],
): readonly string[] {
  return [
    "## Top Diagnostic Durations",
    "",
    "| Event | Count | Max | Mean |",
    "| --- | ---: | ---: | ---: |",
    ...diagnosticDurationSummaries.slice(0, 20).map((durationSummary) =>
      `| ${durationSummary.eventKey} | ${formatInteger(durationSummary.count)} | ${formatMilliseconds(durationSummary.maxDurationMs)} | ${formatMilliseconds(durationSummary.meanDurationMs)} |`
    ),
    "",
  ];
}

function formatTopDiagnosticCountSection(
  diagnosticEventCounts: ReturnType<typeof summarizeBuliProfileRun>["diagnosticEventCounts"],
): readonly string[] {
  return [
    "## Top Diagnostic Counts",
    "",
    "| Event | Count |",
    "| --- | ---: |",
    ...diagnosticEventCounts.slice(0, 20).map((eventCount) => `| ${eventCount.eventKey} | ${formatInteger(eventCount.count)} |`),
    "",
  ];
}

function buildToolNameByToolCallId(diagnosticEvents: readonly ProfileDiagnosticEvent[]): Map<string, string> {
  const toolNameByToolCallId = new Map<string, string>();
  for (const event of [
    ...listDiagnosticEvents(diagnosticEvents, "engine", "tool_call.requested"),
    ...listDiagnosticEvents(diagnosticEvents, "engine", "tool_call.execution_finished"),
  ]) {
    appendToolNameMappingFromFields(toolNameByToolCallId, event.fields);
  }

  for (const event of [
    ...listDiagnosticEvents(diagnosticEvents, "engine", "tool_call.concurrent_group_started"),
    ...listDiagnosticEvents(diagnosticEvents, "openai", "response_step.tool_call_terminal_observed"),
  ]) {
    appendToolNameMappingsFromArrayFields(toolNameByToolCallId, event.fields);
  }

  return toolNameByToolCallId;
}

function getProviderTurnKindAttribution(
  attributionByKind: Map<string, ProviderTurnKindAttribution>,
  providerTurnKind: string,
): ProviderTurnKindAttribution {
  const existingAttribution = attributionByKind.get(providerTurnKind);
  if (existingAttribution) {
    return existingAttribution;
  }

  const attribution: ProviderTurnKindAttribution = {
    providerTurnKind,
    providerTurnCount: 0,
    responseStepCount: 0,
    providerTurnDurationMs: 0,
    requestedToolCallCount: 0,
    httpWaitDurationMs: 0,
    streamDurationMs: 0,
    toolResultWaitDurationMs: 0,
    requestConstructionDurationMs: 0,
    maxRequestBodyTextLength: 0,
  };
  attributionByKind.set(providerTurnKind, attribution);
  return attribution;
}

function readProviderTurnKind(fields: ProfileDiagnosticEvent["fields"] | undefined): string {
  return readStringField(fields, "providerTurnKind") ?? "unknown";
}

function isToolResultEntryKind(entryKind: string | undefined): boolean {
  return entryKind === "completed_tool_result" || entryKind === "failed_tool_result" || entryKind === "denied_tool_result";
}

function buildTaskSubagentCallSummaries(diagnosticEvents: readonly ProfileDiagnosticEvent[]): readonly TaskSubagentCallSummary[] {
  const subagentNameByToolCallId = buildTaskSubagentNameByToolCallId(diagnosticEvents);
  const taskSubagentFinishedSummaryByToolCallId = buildTaskSubagentFinishedDiagnosticSummaryByToolCallId(diagnosticEvents);
  const providerTurnRoutingByParentTaskToolCallId = buildTaskSubagentProviderTurnRoutingByParentTaskToolCallId(diagnosticEvents);
  const modelSelectionRoutingByToolCallId = buildTaskSubagentModelSelectionRoutingByToolCallId(diagnosticEvents);
  const parentVisibleResultByToolCallId = buildTaskSubagentParentVisibleResultByToolCallId(diagnosticEvents);
  const checkpointSummaryByToolCallId = buildTaskSubagentCheckpointSummaryByToolCallId(diagnosticEvents);
  const unattributedCheckpointSummaries = listUnattributedTaskSubagentCheckpointSummaries(diagnosticEvents);
  const taskExecutionFinishedEvents = listDiagnosticEvents(diagnosticEvents, "engine", "tool_call.execution_finished")
    .filter((event) => readStringField(event.fields, "toolName") === "task");
  const parentToolResultWaitByToolCallId = buildNumericFieldByToolCallId({
    diagnosticEvents: [
      ...listDiagnosticEvents(diagnosticEvents, "openai", "tool_result_submission.resolved_pending_wait"),
      ...listDiagnosticEvents(diagnosticEvents, "openai", "tool_result_submission.consumed_queued"),
    ],
    fieldName: "waitDurationMs",
  });
  const toolResultTextLengthByToolCallId = buildNumericFieldByToolCallId({
    diagnosticEvents: listDiagnosticEvents(diagnosticEvents, "engine", "provider_turn.tool_result_submitted"),
    fieldName: "toolResultTextLength",
  });

  return taskExecutionFinishedEvents
    .map((event) => {
      const toolCallId = readStringField(event.fields, "toolCallId") ?? "unknown";
      const taskSubagentFinishedSummary = taskSubagentFinishedSummaryByToolCallId.get(toolCallId);
      const parentVisibleResult = parentVisibleResultByToolCallId.get(toolCallId);
      const parentVisibleToolResultKind = taskSubagentFinishedSummary?.parentVisibleToolResultKind ??
        parentVisibleResult?.parentVisibleToolResultKind ??
        "unknown";
      const selectedRouting = selectTaskSubagentRoutingSummary({
        taskSubagentFinishedSummary,
        providerTurnRouting: providerTurnRoutingByParentTaskToolCallId.get(toolCallId),
        modelSelectionRouting: modelSelectionRoutingByToolCallId.get(toolCallId),
      });
      const directCheckpointSummary = taskSubagentFinishedSummary &&
          hasTaskSubagentCheckpointSummary(taskSubagentFinishedSummary.checkpointSummary)
        ? taskSubagentFinishedSummary.checkpointSummary
        : checkpointSummaryByToolCallId.get(toolCallId);
      const checkpointSummary = directCheckpointSummary ?? findUnattributedTaskSubagentCheckpointSummary({
        conversationTurnId: readStringField(event.fields, "conversationTurnId"),
        subagentName: readStringField(event.fields, "subagentName") ?? subagentNameByToolCallId.get(toolCallId),
        parentVisibleToolResultKind,
        taskExecutionFinishedEvents,
        unattributedCheckpointSummaries,
      });
      const failureExplanation = taskSubagentFinishedSummary?.failureExplanation ?? parentVisibleResult?.failureExplanation;
      const failureKind = taskSubagentFinishedSummary?.failureKind ?? inferTaskSubagentFailureKind({
        parentVisibleToolResultKind,
        failureExplanation,
        checkpointSummary,
      });
      return {
        conversationTurnId: readStringField(event.fields, "conversationTurnId") ?? taskSubagentFinishedSummary?.conversationTurnId,
        toolCallId,
        subagentName: readStringField(event.fields, "subagentName") ?? taskSubagentFinishedSummary?.subagentName ??
          subagentNameByToolCallId.get(toolCallId) ??
          "unknown",
        executorOutcomeKind: readStringField(event.fields, "outcomeKind") ?? taskSubagentFinishedSummary?.executorOutcomeKind ?? "unknown",
        parentVisibleToolResultKind,
        failureKind,
        failureExplanation,
        selectedModelId: selectedRouting.selectedModelId,
        selectedReasoningEffort: selectedRouting.selectedReasoningEffort,
        routingSource: selectedRouting.routingSource,
        durationMs: readOptionalNumberField(event.fields, "durationMs") ?? taskSubagentFinishedSummary?.durationMs ?? 0,
        parentToolResultWaitMs: parentToolResultWaitByToolCallId.get(toolCallId) ?? 0,
        toolResultTextLength: taskSubagentFinishedSummary?.parentToolResultTextLength ?? parentVisibleResult?.toolResultTextLength ??
          toolResultTextLengthByToolCallId.get(toolCallId) ??
          0,
        checkpointReason: checkpointSummary?.checkpointReason,
        checkpointChildToolCallCount: checkpointSummary?.checkpointChildToolCallCount,
        checkpointChildToolResultTextLength: checkpointSummary?.checkpointChildToolResultTextLength,
        checkpointSkippedChildToolCallCount: checkpointSummary?.checkpointSkippedChildToolCallCount,
        checkpointElapsedMilliseconds: checkpointSummary?.checkpointElapsedMilliseconds,
        checkpointSoftElapsedTimeCheckpointMilliseconds: checkpointSummary?.checkpointSoftElapsedTimeCheckpointMilliseconds,
        subagentChildToolCallCount: taskSubagentFinishedSummary?.subagentChildToolCallCount,
      };
    });
}

function buildTaskSubagentFinishedDiagnosticSummaryByToolCallId(
  diagnosticEvents: readonly ProfileDiagnosticEvent[],
): Map<string, TaskSubagentFinishedDiagnosticSummary> {
  const summaryByToolCallId = new Map<string, TaskSubagentFinishedDiagnosticSummary>();
  for (const event of listDiagnosticEvents(diagnosticEvents, "engine", "tool_call.task_subagent_finished")) {
    const toolCallId = readStringField(event.fields, "toolCallId") ?? readStringField(event.fields, "parentTaskToolCallId");
    if (!toolCallId) {
      continue;
    }

    summaryByToolCallId.set(toolCallId, {
      conversationTurnId: readStringField(event.fields, "conversationTurnId"),
      toolCallId,
      subagentName: readStringField(event.fields, "subagentName"),
      executorOutcomeKind: readStringField(event.fields, "executorOutcomeKind"),
      parentVisibleToolResultKind: readStringField(event.fields, "parentVisibleToolResultKind"),
      taskSubagentOutcomeKind: readStringField(event.fields, "taskSubagentOutcomeKind"),
      failureKind: readStringField(event.fields, "failureKind"),
      failureExplanation: readStringField(event.fields, "failureExplanation"),
      selectedModelId: readStringField(event.fields, "taskSubagentSelectedModelId"),
      selectedReasoningEffort: readStringField(event.fields, "taskSubagentSelectedReasoningEffort"),
      durationMs: readOptionalNumberField(event.fields, "durationMs"),
      parentToolResultTextLength: readOptionalNumberField(event.fields, "parentToolResultTextLength"),
      subagentChildToolCallCount: readOptionalNumberField(event.fields, "subagentChildToolCallCount"),
      checkpointSummary: readTaskSubagentFinishedCheckpointSummary(event.fields),
    });
  }

  return summaryByToolCallId;
}

function buildTaskSubagentParentVisibleResultByToolCallId(
  diagnosticEvents: readonly ProfileDiagnosticEvent[],
): Map<string, TaskSubagentParentVisibleResultSummary> {
  const parentVisibleResultByToolCallId = new Map<string, TaskSubagentParentVisibleResultSummary>();
  for (const event of listDiagnosticEvents(diagnosticEvents, "engine", "provider_turn.tool_result_submitted")) {
    const toolCallId = readStringField(event.fields, "toolCallId");
    if (!toolCallId) {
      continue;
    }

    mergeTaskSubagentParentVisibleResult(parentVisibleResultByToolCallId, toolCallId, {
      parentVisibleToolResultKind: readStringField(event.fields, "toolResultKind"),
      failureExplanation: undefined,
      toolResultTextLength: readOptionalNumberField(event.fields, "toolResultTextLength"),
    });
  }

  for (const event of listDiagnosticEvents(diagnosticEvents, "engine", "conversation_history.entry_appended")) {
    const toolCallId = readStringField(event.fields, "toolCallId");
    if (!toolCallId) {
      continue;
    }

    mergeTaskSubagentParentVisibleResult(parentVisibleResultByToolCallId, toolCallId, {
      parentVisibleToolResultKind: readParentVisibleToolResultKindFromConversationEntryKind(readStringField(event.fields, "entryKind")),
      failureExplanation: readStringField(event.fields, "failureExplanation"),
      toolResultTextLength: readOptionalNumberField(event.fields, "toolResultTextLength"),
    });
  }

  return parentVisibleResultByToolCallId;
}

function mergeTaskSubagentParentVisibleResult(
  parentVisibleResultByToolCallId: Map<string, TaskSubagentParentVisibleResultSummary>,
  toolCallId: string,
  incomingResult: TaskSubagentParentVisibleResultSummary,
): void {
  const existingResult = parentVisibleResultByToolCallId.get(toolCallId);
  parentVisibleResultByToolCallId.set(toolCallId, {
    parentVisibleToolResultKind: incomingResult.parentVisibleToolResultKind ?? existingResult?.parentVisibleToolResultKind,
    failureExplanation: incomingResult.failureExplanation ?? existingResult?.failureExplanation,
    toolResultTextLength: incomingResult.toolResultTextLength ?? existingResult?.toolResultTextLength,
  });
}

function readParentVisibleToolResultKindFromConversationEntryKind(entryKind: string | undefined): string | undefined {
  switch (entryKind) {
    case "completed_tool_result":
      return "completed";
    case "failed_tool_result":
      return "failed";
    case "denied_tool_result":
      return "denied";
    default:
      return undefined;
  }
}

function buildTaskSubagentCheckpointSummaryByToolCallId(
  diagnosticEvents: readonly ProfileDiagnosticEvent[],
): Map<string, TaskSubagentCheckpointSummary> {
  const checkpointSummaryByToolCallId = new Map<string, TaskSubagentCheckpointSummary>();
  for (const event of listDiagnosticEvents(diagnosticEvents, "engine", "tool_call.task_subagent_research_checkpoint_requested")) {
    const toolCallId = readStringField(event.fields, "toolCallId") ?? readStringField(event.fields, "parentTaskToolCallId");
    if (!toolCallId) {
      continue;
    }

    checkpointSummaryByToolCallId.set(toolCallId, readTaskSubagentCheckpointRequestedSummary(event.fields));
  }

  return checkpointSummaryByToolCallId;
}

function listUnattributedTaskSubagentCheckpointSummaries(
  diagnosticEvents: readonly ProfileDiagnosticEvent[],
): readonly (Readonly<{
  conversationTurnId: string | undefined;
  subagentName: string | undefined;
  checkpointSummary: TaskSubagentCheckpointSummary;
}>)[] {
  return listDiagnosticEvents(diagnosticEvents, "engine", "tool_call.task_subagent_research_checkpoint_requested")
    .filter((event) => !readStringField(event.fields, "toolCallId") && !readStringField(event.fields, "parentTaskToolCallId"))
    .map((event) => ({
      conversationTurnId: readStringField(event.fields, "conversationTurnId"),
      subagentName: readStringField(event.fields, "subagentName"),
      checkpointSummary: readTaskSubagentCheckpointRequestedSummary(event.fields),
    }));
}

function findUnattributedTaskSubagentCheckpointSummary(input: {
  conversationTurnId: string | undefined;
  subagentName: string | undefined;
  parentVisibleToolResultKind: string;
  taskExecutionFinishedEvents: readonly ProfileDiagnosticEvent[];
  unattributedCheckpointSummaries: readonly (Readonly<{
    conversationTurnId: string | undefined;
    subagentName: string | undefined;
    checkpointSummary: TaskSubagentCheckpointSummary;
  }>)[];
}): TaskSubagentCheckpointSummary | undefined {
  const matchingCheckpointSummaries = input.unattributedCheckpointSummaries.filter((checkpointSummary) =>
    optionalTextFieldsMatch(checkpointSummary.conversationTurnId, input.conversationTurnId) &&
    optionalTextFieldsMatch(checkpointSummary.subagentName, input.subagentName)
  );
  if (matchingCheckpointSummaries.length !== 1) {
    return undefined;
  }

  if (input.parentVisibleToolResultKind === "failed") {
    return matchingCheckpointSummaries[0]?.checkpointSummary;
  }

  const matchingTaskCallCount = input.taskExecutionFinishedEvents.filter((event) =>
    optionalTextFieldsMatch(readStringField(event.fields, "conversationTurnId"), input.conversationTurnId) &&
    optionalTextFieldsMatch(readStringField(event.fields, "subagentName"), input.subagentName)
  ).length;
  return matchingTaskCallCount === 1 ? matchingCheckpointSummaries[0]?.checkpointSummary : undefined;
}

function optionalTextFieldsMatch(leftValue: string | undefined, rightValue: string | undefined): boolean {
  return leftValue === undefined || rightValue === undefined || leftValue === rightValue;
}

function readTaskSubagentFinishedCheckpointSummary(fields: ProfileDiagnosticEvent["fields"] | undefined): TaskSubagentCheckpointSummary {
  return {
    checkpointReason: readStringField(fields, "checkpointReason"),
    checkpointChildToolCallCount: readOptionalNumberField(fields, "checkpointChildToolCallCount"),
    checkpointChildToolResultTextLength: readOptionalNumberField(fields, "checkpointChildToolResultTextLength"),
    checkpointSkippedChildToolCallCount: readOptionalNumberField(fields, "checkpointSkippedChildToolCallCount"),
    checkpointElapsedMilliseconds: readOptionalNumberField(fields, "checkpointElapsedMilliseconds"),
    checkpointSoftElapsedTimeCheckpointMilliseconds: readOptionalNumberField(
      fields,
      "checkpointSoftElapsedTimeCheckpointMilliseconds",
    ),
  };
}

function readTaskSubagentCheckpointRequestedSummary(fields: ProfileDiagnosticEvent["fields"] | undefined): TaskSubagentCheckpointSummary {
  return {
    checkpointReason: readStringField(fields, "checkpointReason"),
    checkpointChildToolCallCount: readOptionalNumberField(fields, "childToolCallCount"),
    checkpointChildToolResultTextLength: readOptionalNumberField(fields, "childToolResultTextLength"),
    checkpointSkippedChildToolCallCount: readOptionalNumberField(fields, "skippedChildToolCallCount"),
    checkpointElapsedMilliseconds: readOptionalNumberField(fields, "elapsedMilliseconds"),
    checkpointSoftElapsedTimeCheckpointMilliseconds: readOptionalNumberField(fields, "softElapsedTimeCheckpointMilliseconds"),
  };
}

function hasTaskSubagentCheckpointSummary(checkpointSummary: TaskSubagentCheckpointSummary): boolean {
  return checkpointSummary.checkpointReason !== undefined || checkpointSummary.checkpointChildToolCallCount !== undefined ||
    checkpointSummary.checkpointChildToolResultTextLength !== undefined ||
    checkpointSummary.checkpointSkippedChildToolCallCount !== undefined ||
    checkpointSummary.checkpointElapsedMilliseconds !== undefined ||
    checkpointSummary.checkpointSoftElapsedTimeCheckpointMilliseconds !== undefined;
}

function selectTaskSubagentRoutingSummary(input: {
  taskSubagentFinishedSummary: TaskSubagentFinishedDiagnosticSummary | undefined;
  providerTurnRouting: TaskSubagentRoutingSummary | undefined;
  modelSelectionRouting: TaskSubagentRoutingSummary | undefined;
}): TaskSubagentRoutingSummary {
  if (input.taskSubagentFinishedSummary?.selectedModelId || input.taskSubagentFinishedSummary?.selectedReasoningEffort) {
    return {
      selectedModelId: input.taskSubagentFinishedSummary.selectedModelId,
      selectedReasoningEffort: input.taskSubagentFinishedSummary.selectedReasoningEffort,
      routingSource: "tool_call.task_subagent_finished",
    };
  }

  return input.providerTurnRouting ?? input.modelSelectionRouting ?? {
    selectedModelId: undefined,
    selectedReasoningEffort: undefined,
    routingSource: undefined,
  };
}

function inferTaskSubagentFailureKind(input: {
  parentVisibleToolResultKind: string;
  failureExplanation: string | undefined;
  checkpointSummary: TaskSubagentCheckpointSummary | undefined;
}): string | undefined {
  if (
    input.parentVisibleToolResultKind === "failed" && input.checkpointSummary &&
    input.failureExplanation?.includes("continued requesting tools after the research checkpoint")
  ) {
    return "requested_tools_after_checkpoint";
  }

  return undefined;
}

function buildTaskSubagentProviderTurnRoutingByParentTaskToolCallId(
  diagnosticEvents: readonly ProfileDiagnosticEvent[],
): Map<string, TaskSubagentRoutingSummary> {
  const providerTurnRoutingByParentTaskToolCallId = new Map<string, TaskSubagentRoutingSummary>();
  for (const providerTurnSummary of listDiagnosticEvents(diagnosticEvents, "openai", "provider_turn.summary")) {
    if (readStringField(providerTurnSummary.fields, "providerTurnKind") !== "task_subagent") {
      continue;
    }

    const parentTaskToolCallId = readStringField(providerTurnSummary.fields, "parentTaskToolCallId");
    if (!parentTaskToolCallId) {
      continue;
    }

    providerTurnRoutingByParentTaskToolCallId.set(parentTaskToolCallId, {
      selectedModelId: readStringField(providerTurnSummary.fields, "selectedModelId"),
      selectedReasoningEffort: readStringField(providerTurnSummary.fields, "selectedReasoningEffort"),
      routingSource: "openai.provider_turn.summary",
    });
  }

  return providerTurnRoutingByParentTaskToolCallId;
}

function buildTaskSubagentModelSelectionRoutingByToolCallId(
  diagnosticEvents: readonly ProfileDiagnosticEvent[],
): Map<string, TaskSubagentRoutingSummary> {
  const modelSelectionRoutingByToolCallId = new Map<string, TaskSubagentRoutingSummary>();
  for (const event of listDiagnosticEvents(diagnosticEvents, "engine", "tool_call.task_subagent_model_selection_resolved")) {
    const toolCallId = readStringField(event.fields, "toolCallId");
    if (!toolCallId) {
      continue;
    }

    modelSelectionRoutingByToolCallId.set(toolCallId, {
      selectedModelId: readStringField(event.fields, "taskSubagentSelectedModelId"),
      selectedReasoningEffort: readStringField(event.fields, "taskSubagentSelectedReasoningEffort"),
      routingSource: "tool_call.task_subagent_model_selection_resolved",
    });
  }

  return modelSelectionRoutingByToolCallId;
}

function buildTaskSubagentNameByToolCallId(diagnosticEvents: readonly ProfileDiagnosticEvent[]): Map<string, string> {
  const subagentNameByToolCallId = new Map<string, string>();
  for (const event of [
    ...listDiagnosticEvents(diagnosticEvents, "engine", "tool_call.requested"),
    ...listDiagnosticEvents(diagnosticEvents, "engine", "tool_call.execution_finished"),
    ...listDiagnosticEvents(diagnosticEvents, "engine", "tool_call.task_subagent_model_selection_resolved"),
    ...listDiagnosticEvents(diagnosticEvents, "engine", "tool_call.task_subagent_research_checkpoint_requested"),
    ...listDiagnosticEvents(diagnosticEvents, "engine", "tool_call.task_subagent_finished"),
    ...listDiagnosticEvents(diagnosticEvents, "engine", "subagent_conversation_limiter.slot_wait_started"),
    ...listDiagnosticEvents(diagnosticEvents, "engine", "subagent_conversation_limiter.slot_acquired"),
    ...listDiagnosticEvents(diagnosticEvents, "engine", "subagent_conversation_limiter.slot_released"),
  ]) {
    const toolCallId = readStringField(event.fields, "toolCallId");
    const subagentName = readStringField(event.fields, "subagentName");
    if (!toolCallId || !subagentName) {
      continue;
    }

    subagentNameByToolCallId.set(toolCallId, subagentName);
  }

  return subagentNameByToolCallId;
}

function buildNumericFieldByToolCallId(input: {
  diagnosticEvents: readonly ProfileDiagnosticEvent[];
  fieldName: string;
}): Map<string, number> {
  const numericFieldByToolCallId = new Map<string, number>();
  for (const diagnosticEvent of input.diagnosticEvents) {
    const toolCallId = readStringField(diagnosticEvent.fields, "toolCallId");
    if (!toolCallId) {
      continue;
    }

    numericFieldByToolCallId.set(
      toolCallId,
      (numericFieldByToolCallId.get(toolCallId) ?? 0) + readNumberField(diagnosticEvent.fields, input.fieldName),
    );
  }

  return numericFieldByToolCallId;
}

function summarizeTaskSubagentCallField(
  taskCallSummaries: readonly TaskSubagentCallSummary[],
  fieldName: "durationMs" | "parentToolResultWaitMs" | "toolResultTextLength",
): NumericFieldAggregate {
  return taskCallSummaries.reduce(
    (aggregate, taskCallSummary) => appendNumericAggregate(aggregate, taskCallSummary[fieldName]),
    { count: 0, total: 0, max: 0 },
  );
}

function formatCountByTaskSubagentName(
  taskCallSummaries: readonly TaskSubagentCallSummary[],
  taskSubagentSlotAcquiredEvents: readonly ProfileDiagnosticEvent[],
): string {
  const countBySubagentName = new Map<string, number>();
  const subagentNames = taskCallSummaries.length > 0
    ? taskCallSummaries.map((taskCallSummary) => taskCallSummary.subagentName)
    : taskSubagentSlotAcquiredEvents.map((event) => readStringField(event.fields, "subagentName") ?? "unknown");
  for (const subagentName of subagentNames) {
    countBySubagentName.set(subagentName, (countBySubagentName.get(subagentName) ?? 0) + 1);
  }

  if (countBySubagentName.size === 0) {
    return "n/a";
  }

  return [...countBySubagentName.entries()].sort((leftEntry, rightEntry) =>
    rightEntry[1] - leftEntry[1] || leftEntry[0].localeCompare(rightEntry[0])
  ).map(([subagentName, count]) => `${subagentName} (${formatInteger(count)})`).join(", ");
}

function formatCountByTaskParentVisibleResultKind(taskCallSummaries: readonly TaskSubagentCallSummary[]): string {
  const countByParentVisibleResultKind = new Map<string, number>();
  for (const taskCallSummary of taskCallSummaries) {
    countByParentVisibleResultKind.set(
      taskCallSummary.parentVisibleToolResultKind,
      (countByParentVisibleResultKind.get(taskCallSummary.parentVisibleToolResultKind) ?? 0) + 1,
    );
  }

  if (countByParentVisibleResultKind.size === 0) {
    return "n/a";
  }

  const preferredResultKindOrder = ["failed", "denied", "completed", "unknown"];
  return [...countByParentVisibleResultKind.entries()].sort((leftEntry, rightEntry) => {
    const leftOrderIndex = preferredResultKindOrder.indexOf(leftEntry[0]);
    const rightOrderIndex = preferredResultKindOrder.indexOf(rightEntry[0]);
    const normalizedLeftOrderIndex = leftOrderIndex === -1 ? preferredResultKindOrder.length : leftOrderIndex;
    const normalizedRightOrderIndex = rightOrderIndex === -1 ? preferredResultKindOrder.length : rightOrderIndex;
    return normalizedLeftOrderIndex - normalizedRightOrderIndex || rightEntry[1] - leftEntry[1] ||
      leftEntry[0].localeCompare(rightEntry[0]);
  }).map(([parentVisibleResultKind, count]) => `${parentVisibleResultKind} (${formatInteger(count)})`).join(", ");
}

function formatTaskSubagentCheckpointFailureDetails(
  taskCallSummaries: readonly TaskSubagentCallSummary[],
): readonly string[] {
  const taskCallsWithCheckpointOrFailure = taskCallSummaries.filter((taskCallSummary) =>
    taskCallSummary.parentVisibleToolResultKind === "failed" || taskCallSummary.failureKind !== undefined ||
    taskCallSummary.failureExplanation !== undefined || taskCallSummary.checkpointReason !== undefined
  );
  if (taskCallsWithCheckpointOrFailure.length === 0) {
    return [];
  }

  return [
    "Checkpoint / Failure details:",
    "",
    "| Turn | Tool Call | Subagent | Failure | Parent Result | Checkpoint | Child Calls | Child Output | Skipped | Elapsed | Soft Limit | Explanation |",
    "| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ...taskCallsWithCheckpointOrFailure.map((taskCallSummary) =>
      `| ${formatShortText(taskCallSummary.conversationTurnId)} | ${formatShortText(taskCallSummary.toolCallId)} | ${taskCallSummary.subagentName} | ${formatOptionalText(taskCallSummary.failureKind)} | ${taskCallSummary.parentVisibleToolResultKind} | ${formatOptionalText(taskCallSummary.checkpointReason)} | ${formatOptionalInteger(taskCallSummary.checkpointChildToolCallCount ?? taskCallSummary.subagentChildToolCallCount)} | ${formatOptionalCompactBytes(taskCallSummary.checkpointChildToolResultTextLength)} | ${formatOptionalInteger(taskCallSummary.checkpointSkippedChildToolCallCount)} | ${formatOptionalMilliseconds(taskCallSummary.checkpointElapsedMilliseconds)} | ${formatOptionalMilliseconds(taskCallSummary.checkpointSoftElapsedTimeCheckpointMilliseconds)} | ${formatMarkdownTableText(taskCallSummary.failureExplanation)} |`
    ),
    "",
  ];
}

function formatOptionalInteger(value: number | undefined): string {
  return value === undefined ? "n/a" : formatInteger(value);
}

function formatOptionalCompactBytes(value: number | undefined): string {
  return value === undefined ? "n/a" : formatCompactBytes(value);
}

function formatCompactBytes(value: number): string {
  if (Math.abs(value) >= 1024 * 1024) {
    return `${formatCompactNumber(value / 1024 / 1024)} MiB`;
  }
  if (Math.abs(value) >= 1024) {
    return `${formatCompactNumber(value / 1024)} KiB`;
  }

  return `${formatInteger(value)} B`;
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (Number.isInteger(value)) {
    return formatInteger(value);
  }

  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatMarkdownTableText(value: string | undefined): string {
  if (!value) {
    return "n/a";
  }

  const singleLineText = value.replace(/\s+/g, " ").replaceAll("|", "\\|").trim();
  return singleLineText.length > 240 ? `${singleLineText.slice(0, 237)}...` : singleLineText;
}

function appendToolNameMappingFromFields(
  toolNameByToolCallId: Map<string, string>,
  fields: ProfileDiagnosticEvent["fields"] | undefined,
): void {
  const toolCallId = readStringField(fields, "toolCallId");
  const toolName = readStringField(fields, "toolName");
  if (!toolCallId || !toolName) {
    return;
  }

  toolNameByToolCallId.set(toolCallId, toolName);
}

function appendToolNameMappingsFromArrayFields(
  toolNameByToolCallId: Map<string, string>,
  fields: ProfileDiagnosticEvent["fields"] | undefined,
): void {
  const toolCallIds = readStringArrayField(fields, "toolCallIds");
  const toolNames = readStringArrayField(fields, "toolNames");
  if (!toolCallIds || !toolNames || toolCallIds.length !== toolNames.length) {
    return;
  }

  for (const [toolCallIndex, toolCallId] of toolCallIds.entries()) {
    const toolName = toolNames[toolCallIndex];
    if (toolName) {
      toolNameByToolCallId.set(toolCallId, toolName);
    }
  }
}

function aggregateToolCallNumericField(input: {
  diagnosticEvents: readonly ProfileDiagnosticEvent[];
  toolNameByToolCallId: ReadonlyMap<string, string>;
  fieldName: string;
}): Map<string, NumericFieldAggregate> {
  const aggregateByToolName = new Map<string, NumericFieldAggregate>();
  for (const diagnosticEvent of input.diagnosticEvents) {
    const toolName = readStringField(diagnosticEvent.fields, "toolName") ??
      input.toolNameByToolCallId.get(readStringField(diagnosticEvent.fields, "toolCallId") ?? "") ??
      "unknown";
    aggregateByToolName.set(
      toolName,
      appendNumericAggregate(aggregateByToolName.get(toolName), readNumberField(diagnosticEvent.fields, input.fieldName)),
    );
  }

  return aggregateByToolName;
}

function formatToolAggregateTable(input: {
  aggregateByToolName: ReadonlyMap<string, NumericFieldAggregate>;
  valueHeader: string;
  formatValue: (value: number) => string;
}): readonly string[] {
  if (input.aggregateByToolName.size === 0) {
    return ["No matching tool events were recorded.", ""];
  }

  return [
    `| Tool | Count | ${input.valueHeader} | Max | Mean |`,
    "| --- | ---: | ---: | ---: | ---: |",
    ...[...input.aggregateByToolName.entries()].sort((leftEntry, rightEntry) =>
      rightEntry[1].total - leftEntry[1].total || leftEntry[0].localeCompare(rightEntry[0])
    ).map(([toolName, aggregate]) =>
      `| ${toolName} | ${formatInteger(aggregate.count)} | ${input.formatValue(aggregate.total)} | ${input.formatValue(aggregate.max)} | ${input.formatValue(aggregate.total / aggregate.count)} |`
    ),
    "",
  ];
}

function formatCountByField(diagnosticEvents: readonly ProfileDiagnosticEvent[], fieldName: string): string {
  const countByFieldValue = new Map<string, number>();
  for (const diagnosticEvent of diagnosticEvents) {
    const fieldValueText = readFieldValueText(diagnosticEvent.fields, fieldName);
    if (!fieldValueText) {
      continue;
    }

    countByFieldValue.set(fieldValueText, (countByFieldValue.get(fieldValueText) ?? 0) + 1);
  }

  if (countByFieldValue.size === 0) {
    return "n/a";
  }

  return [...countByFieldValue.entries()].sort((leftEntry, rightEntry) =>
    rightEntry[1] - leftEntry[1] || leftEntry[0].localeCompare(rightEntry[0])
  ).map(([fieldValueText, count]) => `${fieldValueText} (${formatInteger(count)})`).join(", ");
}

function listCodebaseKnowledgeChangedFileRefreshRows(
  changedFileRefreshEvents: readonly ProfileDiagnosticEvent[],
): readonly CodebaseKnowledgeChangedFileRefreshReportRow[] {
  const rowByActionAndStatus = new Map<string, CodebaseKnowledgeChangedFileRefreshReportRow>();
  for (const changedFileRefreshEvent of changedFileRefreshEvents) {
    const action = readStringField(changedFileRefreshEvent.fields, "action") ?? "unknown";
    const status = readStringField(changedFileRefreshEvent.fields, "status") ?? "unknown";
    const rowKey = `${action}\u0000${status}`;
    const previousRow = rowByActionAndStatus.get(rowKey) ?? {
      action,
      status,
      refreshCount: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      maxMemoryDeltaRssBytes: 0,
      maxMemoryDeltaHeapUsedBytes: 0,
      outputRecordCount: 0,
    };
    const durationMs = readNumberField(changedFileRefreshEvent.fields, "durationMs");
    rowByActionAndStatus.set(rowKey, {
      action,
      status,
      refreshCount: previousRow.refreshCount + 1,
      totalDurationMs: previousRow.totalDurationMs + durationMs,
      maxDurationMs: Math.max(previousRow.maxDurationMs, durationMs),
      maxMemoryDeltaRssBytes: Math.max(
        previousRow.maxMemoryDeltaRssBytes,
        readNumberField(changedFileRefreshEvent.fields, "memoryDeltaRssBytes"),
      ),
      maxMemoryDeltaHeapUsedBytes: Math.max(
        previousRow.maxMemoryDeltaHeapUsedBytes,
        readNumberField(changedFileRefreshEvent.fields, "memoryDeltaHeapUsedBytes"),
      ),
      outputRecordCount: previousRow.outputRecordCount + readNumberField(changedFileRefreshEvent.fields, "outputRecordCount"),
    });
  }

  return [...rowByActionAndStatus.values()].sort((leftRow, rightRow) =>
    rightRow.totalDurationMs - leftRow.totalDurationMs || leftRow.action.localeCompare(rightRow.action) ||
    leftRow.status.localeCompare(rightRow.status)
  );
}

function listCodebaseKnowledgeRepositoryStepRows(
  repositoryStepEvents: readonly ProfileDiagnosticEvent[],
): readonly CodebaseKnowledgeRepositoryStepReportRow[] {
  const rowByOperationStepRoleAndStatus = new Map<string, CodebaseKnowledgeRepositoryStepReportRow>();
  for (const repositoryStepEvent of repositoryStepEvents) {
    const operationName = readStringField(repositoryStepEvent.fields, "operationName") ?? "unknown";
    const stepName = readStringField(repositoryStepEvent.fields, "stepName") ?? "unknown";
    const storedFileRole = readStringField(repositoryStepEvent.fields, "storedFileRole") ?? "unknown";
    const operationStatus = readStringField(repositoryStepEvent.fields, "operationStatus") ?? "unknown";
    const rowKey = `${operationName}\u0000${stepName}\u0000${storedFileRole}\u0000${operationStatus}`;
    const previousRow = rowByOperationStepRoleAndStatus.get(rowKey) ?? {
      operationName,
      stepName,
      storedFileRole,
      operationStatus,
      stepCount: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      maxMemoryDeltaRssBytes: 0,
      maxMemoryDeltaHeapUsedBytes: 0,
      maxMemoryDeltaExternalBytes: 0,
      maxMemoryDeltaArrayBuffersBytes: 0,
      maxFileTextByteLength: 0,
      maxSerializedJsonByteLength: 0,
      maxRecordCount: 0,
      maxIndexedFileCount: 0,
    };
    const durationMs = readNumberField(repositoryStepEvent.fields, "durationMs");
    rowByOperationStepRoleAndStatus.set(rowKey, {
      operationName,
      stepName,
      storedFileRole,
      operationStatus,
      stepCount: previousRow.stepCount + 1,
      totalDurationMs: previousRow.totalDurationMs + durationMs,
      maxDurationMs: Math.max(previousRow.maxDurationMs, durationMs),
      maxMemoryDeltaRssBytes: Math.max(previousRow.maxMemoryDeltaRssBytes, readNumberField(repositoryStepEvent.fields, "memoryDeltaRssBytes")),
      maxMemoryDeltaHeapUsedBytes: Math.max(
        previousRow.maxMemoryDeltaHeapUsedBytes,
        readNumberField(repositoryStepEvent.fields, "memoryDeltaHeapUsedBytes"),
      ),
      maxMemoryDeltaExternalBytes: Math.max(
        previousRow.maxMemoryDeltaExternalBytes,
        readNumberField(repositoryStepEvent.fields, "memoryDeltaExternalBytes"),
      ),
      maxMemoryDeltaArrayBuffersBytes: Math.max(
        previousRow.maxMemoryDeltaArrayBuffersBytes,
        readNumberField(repositoryStepEvent.fields, "memoryDeltaArrayBuffersBytes"),
      ),
      maxFileTextByteLength: Math.max(previousRow.maxFileTextByteLength, readNumberField(repositoryStepEvent.fields, "fileTextByteLength")),
      maxSerializedJsonByteLength: Math.max(
        previousRow.maxSerializedJsonByteLength,
        readNumberField(repositoryStepEvent.fields, "serializedJsonByteLength"),
      ),
      maxRecordCount: Math.max(previousRow.maxRecordCount, readNumberField(repositoryStepEvent.fields, "recordCount")),
      maxIndexedFileCount: Math.max(previousRow.maxIndexedFileCount, readNumberField(repositoryStepEvent.fields, "indexedFileCount")),
    });
  }

  return [...rowByOperationStepRoleAndStatus.values()].sort((leftRow, rightRow) =>
    rightRow.totalDurationMs - leftRow.totalDurationMs || leftRow.operationName.localeCompare(rightRow.operationName) ||
    leftRow.stepName.localeCompare(rightRow.stepName) || leftRow.storedFileRole.localeCompare(rightRow.storedFileRole)
  );
}

function listDiagnosticEvents(
  diagnosticEvents: readonly ProfileDiagnosticEvent[],
  subsystem: ProfileDiagnosticEvent["subsystem"],
  eventName: string,
): readonly ProfileDiagnosticEvent[] {
  return diagnosticEvents.filter((diagnosticEvent) =>
    diagnosticEvent.subsystem === subsystem && diagnosticEvent.eventName === eventName
  );
}

function aggregateNumericField(
  diagnosticEvents: readonly ProfileDiagnosticEvent[],
  fieldName: string,
): NumericFieldAggregate {
  return diagnosticEvents.reduce(
    (aggregate, diagnosticEvent) => appendNumericAggregate(aggregate, readNumberField(diagnosticEvent.fields, fieldName)),
    { count: 0, total: 0, max: 0 },
  );
}

function listOpenAiRequestSizeContributorReportRows(
  responseStepSummaries: readonly ProfileDiagnosticEvent[],
): readonly OpenAiRequestSizeContributorReportRow[] {
  return responseStepSummaries.flatMap((event) => {
    const contributorKinds = readStringArrayField(event.fields, "requestLargestContributorKinds") ?? [];
    const inputItemIndexes = readNumberArrayField(event.fields, "requestLargestContributorInputItemIndexes") ?? [];
    const serializedByteLengths = readNumberArrayField(event.fields, "requestLargestContributorSerializedByteLengths") ?? [];
    const textLengths = readNumberArrayField(event.fields, "requestLargestContributorTextLengths") ?? [];
    return contributorKinds.map((contributorKind, contributorIndex) => ({
      conversationTurnId: readStringField(event.fields, "conversationTurnId"),
      providerTurnKind: readProviderTurnKind(event.fields),
      responseStepIndex: readNumberField(event.fields, "responseStepIndex"),
      contributorKind,
      inputItemIndex: inputItemIndexes[contributorIndex] ?? -1,
      serializedByteLength: serializedByteLengths[contributorIndex] ?? 0,
      textLength: textLengths[contributorIndex] ?? 0,
    }));
  });
}

function listOpenAiWorkingSetVisibilityReasonRows(
  responseStepSummaries: readonly ProfileDiagnosticEvent[],
): readonly OpenAiWorkingSetVisibilityReasonReportRow[] {
  const aggregateByVisibilityReason = new Map<string, OpenAiWorkingSetVisibilityReasonReportRow>();
  for (const event of responseStepSummaries) {
    const visibilityReasons = readStringArrayField(event.fields, "requestWorkingSetVisibilityReasons") ?? [];
    const inputItemCounts = readNumberArrayField(event.fields, "requestWorkingSetVisibilityReasonInputItemCounts") ?? [];
    const textLengths = readNumberArrayField(event.fields, "requestWorkingSetVisibilityReasonTextLengths") ?? [];
    const serializedByteLengths = readNumberArrayField(
      event.fields,
      "requestWorkingSetVisibilityReasonSerializedByteLengths",
    ) ?? [];

    for (const [reasonIndex, visibilityReason] of visibilityReasons.entries()) {
      const previousAggregate = aggregateByVisibilityReason.get(visibilityReason) ?? {
        visibilityReason,
        inputItemCount: 0,
        textLength: 0,
        serializedByteLength: 0,
      };
      aggregateByVisibilityReason.set(visibilityReason, {
        visibilityReason,
        inputItemCount: previousAggregate.inputItemCount + (inputItemCounts[reasonIndex] ?? 0),
        textLength: previousAggregate.textLength + (textLengths[reasonIndex] ?? 0),
        serializedByteLength: previousAggregate.serializedByteLength + (serializedByteLengths[reasonIndex] ?? 0),
      });
    }
  }

  return [...aggregateByVisibilityReason.values()].sort((leftRow, rightRow) =>
    rightRow.serializedByteLength - leftRow.serializedByteLength || leftRow.visibilityReason.localeCompare(rightRow.visibilityReason)
  );
}

function listOpenAiWorkingSetProjectionKindRows(
  responseStepSummaries: readonly ProfileDiagnosticEvent[],
): readonly OpenAiWorkingSetProjectionKindReportRow[] {
  const aggregateByProjectionKind = new Map<string, OpenAiWorkingSetProjectionKindReportRow>();
  for (const event of responseStepSummaries) {
    const projectionKinds = readStringArrayField(event.fields, "requestWorkingSetProjectionKinds") ?? [];
    const inputItemCounts = readNumberArrayField(event.fields, "requestWorkingSetProjectionKindInputItemCounts") ?? [];
    const originalTextLengths = readNumberArrayField(event.fields, "requestWorkingSetProjectionKindOriginalTextLengths") ?? [];
    const projectedTextLengths = readNumberArrayField(event.fields, "requestWorkingSetProjectionKindProjectedTextLengths") ?? [];
    const savedCharacterCounts = readNumberArrayField(event.fields, "requestWorkingSetProjectionKindSavedCharacterCounts") ?? [];
    const originalSerializedByteLengths = readNumberArrayField(
      event.fields,
      "requestWorkingSetProjectionKindOriginalSerializedByteLengths",
    ) ?? [];
    const projectedSerializedByteLengths = readNumberArrayField(
      event.fields,
      "requestWorkingSetProjectionKindProjectedSerializedByteLengths",
    ) ?? [];
    const savedSerializedByteLengths = readNumberArrayField(
      event.fields,
      "requestWorkingSetProjectionKindSavedSerializedByteLengths",
    ) ?? [];

    for (const [projectionKindIndex, projectionKind] of projectionKinds.entries()) {
      const previousAggregate = aggregateByProjectionKind.get(projectionKind) ?? {
        projectionKind,
        inputItemCount: 0,
        originalTextLength: 0,
        projectedTextLength: 0,
        savedCharacterCount: 0,
        originalSerializedByteLength: 0,
        projectedSerializedByteLength: 0,
        savedSerializedByteLength: 0,
      };
      aggregateByProjectionKind.set(projectionKind, {
        projectionKind,
        inputItemCount: previousAggregate.inputItemCount + (inputItemCounts[projectionKindIndex] ?? 0),
        originalTextLength: previousAggregate.originalTextLength + (originalTextLengths[projectionKindIndex] ?? 0),
        projectedTextLength: previousAggregate.projectedTextLength + (projectedTextLengths[projectionKindIndex] ?? 0),
        savedCharacterCount: previousAggregate.savedCharacterCount + (savedCharacterCounts[projectionKindIndex] ?? 0),
        originalSerializedByteLength: previousAggregate.originalSerializedByteLength +
          (originalSerializedByteLengths[projectionKindIndex] ?? 0),
        projectedSerializedByteLength: previousAggregate.projectedSerializedByteLength +
          (projectedSerializedByteLengths[projectionKindIndex] ?? 0),
        savedSerializedByteLength: previousAggregate.savedSerializedByteLength +
          (savedSerializedByteLengths[projectionKindIndex] ?? 0),
      });
    }
  }

  return [...aggregateByProjectionKind.values()].sort((leftRow, rightRow) =>
    rightRow.savedSerializedByteLength - leftRow.savedSerializedByteLength ||
    rightRow.projectedSerializedByteLength - leftRow.projectedSerializedByteLength ||
    leftRow.projectionKind.localeCompare(rightRow.projectionKind)
  );
}

function listOpenAiWorkingSetLargestInputItemRows(
  responseStepSummaries: readonly ProfileDiagnosticEvent[],
): readonly OpenAiWorkingSetLargestInputItemReportRow[] {
  return responseStepSummaries.flatMap((event) => {
    const inputItemIndexes = readNumberArrayField(event.fields, "requestWorkingSetLargestInputItemIndexes") ?? [];
    const visibilityReasons = readStringArrayField(event.fields, "requestWorkingSetLargestInputItemVisibilityReasons") ?? [];
    const projectionKinds = readStringArrayField(event.fields, "requestWorkingSetLargestInputItemProjectionKinds") ?? [];
    const evidenceIds = readNullableStringArrayField(event.fields, "requestWorkingSetLargestInputItemEvidenceIds") ?? [];
    const textLengths = readNumberArrayField(event.fields, "requestWorkingSetLargestInputItemTextLengths") ?? [];
    const serializedByteLengths = readNumberArrayField(event.fields, "requestWorkingSetLargestInputItemSerializedByteLengths") ?? [];
    const currentTurnFlags = readBooleanArrayField(event.fields, "requestWorkingSetLargestInputItemCurrentTurnFlags") ?? [];

    return inputItemIndexes.map((inputItemIndex, largestItemIndex) => ({
      conversationTurnId: readStringField(event.fields, "conversationTurnId"),
      providerTurnKind: readProviderTurnKind(event.fields),
      responseStepIndex: readNumberField(event.fields, "responseStepIndex"),
      inputItemIndex,
      visibilityReason: visibilityReasons[largestItemIndex] ?? "unknown",
      projectionKind: projectionKinds[largestItemIndex] ?? "unknown",
      evidenceId: evidenceIds[largestItemIndex] ?? null,
      textLength: textLengths[largestItemIndex] ?? 0,
      serializedByteLength: serializedByteLengths[largestItemIndex] ?? 0,
      isCurrentTurnItem: currentTurnFlags[largestItemIndex] ?? false,
    }));
  });
}

function calculateNumericFieldGrowth(
  diagnosticEvents: readonly ProfileDiagnosticEvent[],
  fieldName: string,
): { first: number; max: number; last: number; growth: number } {
  const values = diagnosticEvents
    .map((diagnosticEvent) => readNumberField(diagnosticEvent.fields, fieldName))
    .filter((value) => value > 0);
  const first = values[0] ?? 0;
  const last = values.at(-1) ?? 0;
  const max = maxNumber(values) ?? 0;
  return {
    first,
    max,
    last,
    growth: Math.max(0, max - first),
  };
}

function createDurationBottleneckCandidate(input: {
  boundaryName: string;
  evidence: string;
  durationMs: number;
}): BottleneckCandidate {
  return {
    boundaryName: input.boundaryName,
    evidence: input.evidence,
    severityScore: input.durationMs,
    valueText: formatMilliseconds(input.durationMs),
  };
}

function createSizeBottleneckCandidate(input: {
  boundaryName: string;
  evidence: string;
  bytes: number;
}): BottleneckCandidate {
  return {
    boundaryName: input.boundaryName,
    evidence: input.evidence,
    severityScore: input.bytes / 1024,
    valueText: formatBytes(input.bytes),
  };
}

function appendNumericAggregate(
  aggregate: NumericFieldAggregate | undefined,
  value: number,
): NumericFieldAggregate {
  const previousAggregate = aggregate ?? { count: 0, total: 0, max: 0 };
  return {
    count: previousAggregate.count + 1,
    total: previousAggregate.total + value,
    max: Math.max(previousAggregate.max, value),
  };
}

function readNumberField(fields: ProfileDiagnosticEvent["fields"] | undefined, fieldName: string): number {
  const fieldValue = fields?.[fieldName];
  return typeof fieldValue === "number" ? fieldValue : 0;
}

function readOptionalNumberField(fields: ProfileDiagnosticEvent["fields"] | undefined, fieldName: string): number | undefined {
  const fieldValue = fields?.[fieldName];
  return typeof fieldValue === "number" ? fieldValue : undefined;
}

function readStringField(fields: ProfileDiagnosticEvent["fields"] | undefined, fieldName: string): string | undefined {
  const fieldValue = fields?.[fieldName];
  return typeof fieldValue === "string" ? fieldValue : undefined;
}

function readStringArrayField(fields: ProfileDiagnosticEvent["fields"] | undefined, fieldName: string): readonly string[] | undefined {
  const fieldValue = fields?.[fieldName];
  return Array.isArray(fieldValue) && fieldValue.every((fieldItem) => typeof fieldItem === "string") ? fieldValue : undefined;
}

function readNullableStringArrayField(
  fields: ProfileDiagnosticEvent["fields"] | undefined,
  fieldName: string,
): readonly (string | null)[] | undefined {
  const fieldValue = fields?.[fieldName];
  return Array.isArray(fieldValue) && fieldValue.every((fieldItem) => typeof fieldItem === "string" || fieldItem === null)
    ? fieldValue
    : undefined;
}

function readNumberArrayField(fields: ProfileDiagnosticEvent["fields"] | undefined, fieldName: string): readonly number[] | undefined {
  const fieldValue = fields?.[fieldName];
  return Array.isArray(fieldValue) && fieldValue.every((fieldItem) => typeof fieldItem === "number") ? fieldValue : undefined;
}

function readBooleanArrayField(fields: ProfileDiagnosticEvent["fields"] | undefined, fieldName: string): readonly boolean[] | undefined {
  const fieldValue = fields?.[fieldName];
  return Array.isArray(fieldValue) && fieldValue.every((fieldItem) => typeof fieldItem === "boolean") ? fieldValue : undefined;
}

function readFieldValueText(fields: ProfileDiagnosticEvent["fields"] | undefined, fieldName: string): string | undefined {
  const fieldValue = fields?.[fieldName];
  if (typeof fieldValue === "string") {
    return fieldValue;
  }
  if (typeof fieldValue === "number" || typeof fieldValue === "boolean") {
    return String(fieldValue);
  }

  return undefined;
}

function formatShortField(fields: ProfileDiagnosticEvent["fields"] | undefined, fieldName: string): string {
  const fieldValue = readStringField(fields, fieldName);
  return fieldValue ? `\`${fieldValue.slice(0, 8)}\`` : "n/a";
}

function formatShortText(value: string | undefined): string {
  return value ? `\`${value.slice(0, 8)}\`` : "n/a";
}

function formatStringField(fields: ProfileDiagnosticEvent["fields"] | undefined, fieldName: string): string {
  return readStringField(fields, fieldName) ?? "n/a";
}

function formatOptionalText(value: string | undefined): string {
  return value ?? "n/a";
}

function formatNullableText(value: string | null | undefined): string {
  return value ?? "n/a";
}

function formatNumberField(fields: ProfileDiagnosticEvent["fields"] | undefined, fieldName: string): string {
  return formatInteger(readNumberField(fields, fieldName));
}

function formatOptionalNumberField(fields: ProfileDiagnosticEvent["fields"] | undefined, fieldName: string): string {
  const fieldValue = readOptionalNumberField(fields, fieldName);
  return fieldValue === undefined ? "n/a" : formatInteger(fieldValue);
}

function formatNumberFieldWithUnit(
  fields: ProfileDiagnosticEvent["fields"] | undefined,
  fieldName: string,
  unit: string,
): string {
  const fieldValue = fields?.[fieldName];
  return typeof fieldValue === "number" ? `${formatNumber(fieldValue)} ${unit}` : "n/a";
}

function formatInputItemIndex(inputItemIndex: number): string {
  return inputItemIndex < 0 ? "n/a" : formatInteger(inputItemIndex);
}

function parseBuliProfileReportCliOptions(args: readonly string[]): BuliProfileReportCliParseResult {
  if (args.includes("--help") || args.includes("-h")) {
    return { status: "help", output: formatReportUsage() };
  }

  const profileFilePath = readStringOption(args, "--profile") ?? readStringOption(args, "--profile-file");
  if (!profileFilePath) {
    return { status: "error", output: "Missing --profile <profile.jsonl>." };
  }

  return {
    status: "ready",
    options: {
      profileFilePath,
      outputPath: readStringOption(args, "--output"),
    },
  };
}

async function main(args: readonly string[]): Promise<void> {
  const cliOptions = parseBuliProfileReportCliOptions(args);
  if (cliOptions.status === "help") {
    console.log(cliOptions.output);
    return;
  }
  if (cliOptions.status === "error") {
    console.error(cliOptions.output);
    console.error(formatReportUsage());
    process.exitCode = 1;
    return;
  }

  const reportMarkdown = await writeBuliProfileRunReport(cliOptions.options);
  console.log(reportMarkdown);
  if (cliOptions.options.outputPath !== undefined) {
    console.log(`Wrote Buli profile report to ${cliOptions.options.outputPath}`);
  }
}

function formatReportUsage(): string {
  return "Usage: bun run profile:report -- --profile <profile.jsonl> [--output <profile-report.md>]";
}

function readStringOption(args: readonly string[], optionName: string): string | undefined {
  const optionIndex = args.indexOf(optionName);
  if (optionIndex === -1) {
    return undefined;
  }

  const optionValue = args[optionIndex + 1];
  if (!optionValue || optionValue.startsWith("--")) {
    return undefined;
  }

  return optionValue;
}

function formatOptionalBytes(value: number | undefined): string {
  return value === undefined ? "n/a" : formatBytes(value);
}

function formatBytes(value: number): string {
  if (Math.abs(value) >= 1024 * 1024) {
    return `${formatNumber(value / 1024 / 1024)} MiB`;
  }
  if (Math.abs(value) >= 1024) {
    return `${formatNumber(value / 1024)} KiB`;
  }

  return `${formatInteger(value)} B`;
}

function formatOptionalMilliseconds(value: number | undefined): string {
  return value === undefined ? "n/a" : formatMilliseconds(value);
}

function formatMilliseconds(value: number): string {
  return `${formatNumber(value)} ms`;
}

function formatOptionalMicros(value: number | undefined): string {
  return value === undefined ? "n/a" : `${formatInteger(value)} us`;
}

function formatOptionalRatio(value: number | undefined): string {
  return value === undefined ? "n/a" : formatNumber(value);
}

function formatInteger(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "n/a";
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(3);
}

function maxNumber(values: readonly number[]): number | undefined {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return finiteValues.length === 0 ? undefined : Math.max(...finiteValues);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
