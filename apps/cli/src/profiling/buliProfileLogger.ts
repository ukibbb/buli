import { appendFile } from "node:fs/promises";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import type { BuliDiagnosticLogEvent, BuliDiagnosticLogger } from "@buli/contracts";

type InteractiveChatProfileEnvironment = Readonly<Record<string, string | undefined>>;

type ProfileEventFields = Readonly<Record<string, string | number | boolean | null | readonly (string | number | boolean | null)[]>>;

type ProfileLifecycleEvent = Readonly<{
  type: "profile_started" | "profile_stopped";
  atMs: number;
  profileFilePath: string;
  sampleIntervalMs: number;
}>;

type ProfileDiagnosticEvent = Readonly<{
  type: "diagnostic_event";
  atMs: number;
  subsystem: BuliDiagnosticLogEvent["subsystem"];
  eventName: string;
  fields?: ProfileEventFields | undefined;
}>;

type ProfileProcessSampleEvent = Readonly<{
  type: "process_sample";
  atMs: number;
  activeConversationTurnId: string | null;
  activeConversationTurnCount: number;
  sampleDurationMs: number;
  rssBytes: number;
  heapTotalBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
  cpuUserMicros: number;
  cpuSystemMicros: number;
  cpuUserDeltaMicros: number;
  cpuSystemDeltaMicros: number;
  eventLoopUtilization: number;
  eventLoopDelayMeanMs: number;
  eventLoopDelayMaxMs: number;
  eventLoopDelayP95Ms: number;
}>;

type ProfileLoggerSummaryEvent = Readonly<{
  type: "profile_logger_summary";
  atMs: number;
  profileFilePath: string;
  sampleIntervalMs: number;
  recordedEventCount: number;
  writtenEventCount: number;
  failedWriteEventCount: number;
  flushCount: number;
  failedFlushCount: number;
  bytesWritten: number;
  bufferedEventCount: number;
  maxBufferedEventCount: number;
  totalFlushDurationMs: number;
  maxFlushDurationMs: number;
  hasActiveFlush: boolean;
}>;

export type BuliProfileEvent = ProfileLifecycleEvent | ProfileDiagnosticEvent | ProfileProcessSampleEvent | ProfileLoggerSummaryEvent;

export type BuliProfileLoggerInstallation = Readonly<{
  diagnosticLogger: BuliDiagnosticLogger | undefined;
  profileFilePath: string | undefined;
  dispose: () => Promise<void>;
}>;

const privateProfileLogDirectoryMode = 0o700;
const privateProfileLogFileMode = 0o600;
const defaultProfileSampleIntervalMs = 250;
const minimumProfileSampleIntervalMs = 50;
const maximumBufferedProfileEventCountBeforeFlush = 256;
const profileFlushDelayMs = 250;
const nanosecondsPerMillisecond = 1_000_000;

export function installBuliProfileLogger(input: {
  environment: InteractiveChatProfileEnvironment;
}): BuliProfileLoggerInstallation {
  const profileFilePath = input.environment["BULI_PROFILE_FILE"]?.trim();
  if (!profileFilePath) {
    return {
      diagnosticLogger: undefined,
      profileFilePath: undefined,
      dispose: async () => {},
    };
  }

  const sampleIntervalMs = resolveProfileSampleIntervalMs(input.environment["BULI_PROFILE_SAMPLE_MS"]);
  const profileLogger = new BufferedBuliProfileLogger({ profileFilePath, sampleIntervalMs });
  profileLogger.start();

  return {
    diagnosticLogger: (diagnosticLogEvent) => profileLogger.recordDiagnosticEvent(diagnosticLogEvent),
    profileFilePath,
    dispose: () => profileLogger.dispose(),
  };
}

export function combineBuliDiagnosticLoggers(
  diagnosticLoggers: readonly (BuliDiagnosticLogger | undefined)[],
): BuliDiagnosticLogger | undefined {
  const activeDiagnosticLoggers = diagnosticLoggers.filter((diagnosticLogger): diagnosticLogger is BuliDiagnosticLogger =>
    diagnosticLogger !== undefined
  );
  if (activeDiagnosticLoggers.length === 0) {
    return undefined;
  }

  return (diagnosticLogEvent) => {
    for (const diagnosticLogger of activeDiagnosticLoggers) {
      diagnosticLogger(diagnosticLogEvent);
    }
  };
}

class BufferedBuliProfileLogger {
  private readonly profileFilePath: string;
  private readonly sampleIntervalMs: number;
  private readonly eventLoopDelayMonitor = monitorEventLoopDelay({ resolution: 20 });
  private profileEventBuffer: string[] = [];
  private flushTimeout: ReturnType<typeof setTimeout> | undefined;
  private sampleInterval: ReturnType<typeof setInterval> | undefined;
  private activeFlushPromise: Promise<void> | undefined;
  private hasPendingFlushAfterActiveFlush = false;
  private previousEventLoopUtilization = performance.eventLoopUtilization();
  private previousCpuUsage = process.cpuUsage();
  private previousProcessSampleAtMs = Date.now();
  private readonly activeConversationTurnIds = new Set<string>();
  private recordedEventCount = 0;
  private writtenEventCount = 0;
  private failedWriteEventCount = 0;
  private flushCount = 0;
  private failedFlushCount = 0;
  private bytesWritten = 0;
  private maxBufferedEventCount = 0;
  private totalFlushDurationMs = 0;
  private maxFlushDurationMs = 0;
  private isDisposed = false;

  constructor(input: { profileFilePath: string; sampleIntervalMs: number }) {
    this.profileFilePath = input.profileFilePath;
    this.sampleIntervalMs = input.sampleIntervalMs;
    ensurePrivateProfileLogDirectory(dirname(input.profileFilePath));
    tightenExistingProfileLogFilePermissions(input.profileFilePath);
  }

  start(): void {
    this.eventLoopDelayMonitor.enable();
    this.recordProfileEvent({
      type: "profile_started",
      atMs: Date.now(),
      profileFilePath: this.profileFilePath,
      sampleIntervalMs: this.sampleIntervalMs,
    });
    this.sampleInterval = setInterval(() => this.recordProcessSample(), this.sampleIntervalMs);
    unrefTimer(this.sampleInterval);
  }

  recordDiagnosticEvent(diagnosticLogEvent: BuliDiagnosticLogEvent): void {
    this.trackActiveConversationTurnFromDiagnosticEvent(diagnosticLogEvent);
    this.recordProfileEvent({
      type: "diagnostic_event",
      atMs: Date.now(),
      subsystem: diagnosticLogEvent.subsystem,
      eventName: diagnosticLogEvent.eventName,
      ...(diagnosticLogEvent.fields ? { fields: diagnosticLogEvent.fields } : {}),
    });
  }

  private trackActiveConversationTurnFromDiagnosticEvent(diagnosticLogEvent: BuliDiagnosticLogEvent): void {
    if (diagnosticLogEvent.subsystem !== "engine") {
      return;
    }

    const conversationTurnId = diagnosticLogEvent.fields?.["conversationTurnId"];
    if (typeof conversationTurnId !== "string" || conversationTurnId.length === 0) {
      return;
    }

    if (diagnosticLogEvent.eventName === "conversation_turn.stream_started") {
      this.activeConversationTurnIds.add(conversationTurnId);
      return;
    }

    if (diagnosticLogEvent.eventName === "conversation_turn.summary") {
      this.activeConversationTurnIds.delete(conversationTurnId);
    }
  }

  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    if (this.sampleInterval) {
      clearInterval(this.sampleInterval);
      this.sampleInterval = undefined;
    }
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = undefined;
    }
    this.recordProcessSample();
    this.recordProfileLoggerSummary();
    this.recordProfileEvent({
      type: "profile_stopped",
      atMs: Date.now(),
      profileFilePath: this.profileFilePath,
      sampleIntervalMs: this.sampleIntervalMs,
    });
    this.isDisposed = true;
    this.eventLoopDelayMonitor.disable();
    await this.flushProfileEvents();
    if (this.activeFlushPromise) {
      await this.activeFlushPromise;
    }
    tightenExistingProfileLogFilePermissions(this.profileFilePath);
  }

  private recordProcessSample(): void {
    const nowMs = Date.now();
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const previousCpuUsage = this.previousCpuUsage;
    const eventLoopUtilizationDelta = performance.eventLoopUtilization(this.previousEventLoopUtilization);
    this.previousEventLoopUtilization = performance.eventLoopUtilization();
    this.previousCpuUsage = cpuUsage;
    this.recordProfileEvent({
      type: "process_sample",
      atMs: nowMs,
      activeConversationTurnId: this.resolveSingleActiveConversationTurnId(),
      activeConversationTurnCount: this.activeConversationTurnIds.size,
      sampleDurationMs: Math.max(0, nowMs - this.previousProcessSampleAtMs),
      rssBytes: memoryUsage.rss,
      heapTotalBytes: memoryUsage.heapTotal,
      heapUsedBytes: memoryUsage.heapUsed,
      externalBytes: memoryUsage.external,
      arrayBuffersBytes: memoryUsage.arrayBuffers,
      cpuUserMicros: cpuUsage.user,
      cpuSystemMicros: cpuUsage.system,
      cpuUserDeltaMicros: Math.max(0, cpuUsage.user - previousCpuUsage.user),
      cpuSystemDeltaMicros: Math.max(0, cpuUsage.system - previousCpuUsage.system),
      eventLoopUtilization: eventLoopUtilizationDelta.utilization,
      eventLoopDelayMeanMs: convertEventLoopDelayNanosecondsToMilliseconds(this.eventLoopDelayMonitor.mean),
      eventLoopDelayMaxMs: convertEventLoopDelayNanosecondsToMilliseconds(this.eventLoopDelayMonitor.max),
      eventLoopDelayP95Ms: convertEventLoopDelayNanosecondsToMilliseconds(this.eventLoopDelayMonitor.percentile(95)),
    });
    this.previousProcessSampleAtMs = nowMs;
    this.eventLoopDelayMonitor.reset();
  }

  private resolveSingleActiveConversationTurnId(): string | null {
    return this.activeConversationTurnIds.size === 1 ? [...this.activeConversationTurnIds][0] ?? null : null;
  }

  private recordProfileLoggerSummary(): void {
    this.recordProfileEvent({
      type: "profile_logger_summary",
      atMs: Date.now(),
      profileFilePath: this.profileFilePath,
      sampleIntervalMs: this.sampleIntervalMs,
      recordedEventCount: this.recordedEventCount,
      writtenEventCount: this.writtenEventCount,
      failedWriteEventCount: this.failedWriteEventCount,
      flushCount: this.flushCount,
      failedFlushCount: this.failedFlushCount,
      bytesWritten: this.bytesWritten,
      bufferedEventCount: this.profileEventBuffer.length,
      maxBufferedEventCount: this.maxBufferedEventCount,
      totalFlushDurationMs: this.totalFlushDurationMs,
      maxFlushDurationMs: this.maxFlushDurationMs,
      hasActiveFlush: this.activeFlushPromise !== undefined,
    });
  }

  private recordProfileEvent(profileEvent: BuliProfileEvent): void {
    if (this.isDisposed && profileEvent.type !== "profile_stopped") {
      return;
    }

    this.recordedEventCount += 1;
    this.profileEventBuffer.push(`${JSON.stringify(profileEvent)}\n`);
    this.maxBufferedEventCount = Math.max(this.maxBufferedEventCount, this.profileEventBuffer.length);
    if (this.profileEventBuffer.length >= maximumBufferedProfileEventCountBeforeFlush) {
      void this.flushProfileEvents();
      return;
    }
    this.scheduleProfileEventFlush();
  }

  private scheduleProfileEventFlush(): void {
    if (this.flushTimeout || this.isDisposed) {
      return;
    }

    this.flushTimeout = setTimeout(() => {
      this.flushTimeout = undefined;
      void this.flushProfileEvents();
    }, profileFlushDelayMs);
    unrefTimer(this.flushTimeout);
  }

  private async flushProfileEvents(): Promise<void> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = undefined;
    }

    if (this.activeFlushPromise) {
      this.hasPendingFlushAfterActiveFlush = true;
      await this.activeFlushPromise;
      if (this.hasPendingFlushAfterActiveFlush) {
        this.hasPendingFlushAfterActiveFlush = false;
        return this.flushProfileEvents();
      }
      return;
    }

    const profileEventsToFlush = this.profileEventBuffer;
    if (profileEventsToFlush.length === 0) {
      return;
    }

    this.profileEventBuffer = [];
    const flushStartedAtMs = Date.now();
    const profileEventsTextToFlush = profileEventsToFlush.join("");
    this.activeFlushPromise = appendFile(this.profileFilePath, profileEventsTextToFlush, {
      encoding: "utf8",
      mode: privateProfileLogFileMode,
    }).then(() => {
      this.flushCount += 1;
      this.writtenEventCount += profileEventsToFlush.length;
      this.bytesWritten += Buffer.byteLength(profileEventsTextToFlush, "utf8");
    }).catch(() => {
      this.failedFlushCount += 1;
      this.failedWriteEventCount += profileEventsToFlush.length;
      // Profiling must never change product behavior.
    }).finally(() => {
      const flushDurationMs = Math.max(0, Date.now() - flushStartedAtMs);
      this.totalFlushDurationMs += flushDurationMs;
      this.maxFlushDurationMs = Math.max(this.maxFlushDurationMs, flushDurationMs);
      this.activeFlushPromise = undefined;
    });
    await this.activeFlushPromise;
  }
}

function ensurePrivateProfileLogDirectory(logDirectoryPath: string): void {
  if (existsSync(logDirectoryPath)) {
    chmodSync(logDirectoryPath, privateProfileLogDirectoryMode);
    return;
  }

  mkdirSync(logDirectoryPath, { recursive: true, mode: privateProfileLogDirectoryMode });
  chmodSync(logDirectoryPath, privateProfileLogDirectoryMode);
}

function tightenExistingProfileLogFilePermissions(profileFilePath: string): void {
  if (existsSync(profileFilePath)) {
    chmodSync(profileFilePath, privateProfileLogFileMode);
  }
}

function resolveProfileSampleIntervalMs(rawSampleIntervalMs: string | undefined): number {
  const sampleIntervalMs = rawSampleIntervalMs ? Number(rawSampleIntervalMs) : defaultProfileSampleIntervalMs;
  if (!Number.isFinite(sampleIntervalMs)) {
    return defaultProfileSampleIntervalMs;
  }

  return Math.max(minimumProfileSampleIntervalMs, Math.floor(sampleIntervalMs));
}

function convertEventLoopDelayNanosecondsToMilliseconds(delayNanoseconds: number): number {
  return Number.isFinite(delayNanoseconds) ? delayNanoseconds / nanosecondsPerMillisecond : 0;
}

function unrefTimer(timer: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>): void {
  (timer as { unref?: () => void }).unref?.();
}
