import { appendFileSync, chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { inspect } from "node:util";

const ENABLED_ENVIRONMENT_VALUES = new Set(["1", "true", "yes", "on"]);
const privateConsoleLogDirectoryMode = 0o700;
const privateConsoleLogFileMode = 0o600;
export type ConsoleFileLogLevel = "debug" | "error" | "info" | "log" | "warn";

export type ConsoleFileLoggerEnvironment = Readonly<{
  [environmentVariableName: string]: string | undefined;
  BULI_CONSOLE_LOG_FILE?: string | undefined;
  BULI_CONSOLE_LOG_RESET?: string | undefined;
}>;

export type ConsoleMethodTarget = Record<ConsoleFileLogLevel, (...consoleArguments: unknown[]) => void>;

export type ConsoleFileLoggerInstallation = {
  isInstalled: boolean;
  logFilePath?: string;
  restore(): void;
};

export type ConsoleFileLoggerOptions = {
  environment?: ConsoleFileLoggerEnvironment;
  consoleTarget?: ConsoleMethodTarget;
  now?: () => Date;
};

const consoleFileLogLevels: readonly ConsoleFileLogLevel[] = ["debug", "error", "info", "log", "warn"];

let activeGlobalConsoleFileLoggerInstallation: ConsoleFileLoggerInstallation | undefined;

export function installConsoleFileLogger(options: ConsoleFileLoggerOptions = {}): ConsoleFileLoggerInstallation {
  const environment = options.environment ?? process.env;
  const requestedLogFilePath = environment.BULI_CONSOLE_LOG_FILE?.trim();
  if (!requestedLogFilePath) {
    return createInactiveConsoleFileLoggerInstallation();
  }

  const isInstallingGlobalConsoleLogger = options.consoleTarget === undefined;
  if (isInstallingGlobalConsoleLogger && activeGlobalConsoleFileLoggerInstallation?.isInstalled) {
    return activeGlobalConsoleFileLoggerInstallation;
  }

  const consoleTarget = options.consoleTarget ?? console;
  const now = options.now ?? (() => new Date());
  const originalConsoleMethods = captureOriginalConsoleMethods(consoleTarget);

  ensurePrivateConsoleLogDirectory(dirname(requestedLogFilePath));
  if (isEnabledEnvironmentValue(environment.BULI_CONSOLE_LOG_RESET)) {
    writeFileSync(requestedLogFilePath, "", { encoding: "utf8", mode: privateConsoleLogFileMode });
    chmodSync(requestedLogFilePath, privateConsoleLogFileMode);
  } else {
    tightenExistingConsoleLogFilePermissions(requestedLogFilePath);
  }

  for (const consoleFileLogLevel of consoleFileLogLevels) {
    consoleTarget[consoleFileLogLevel] = (...consoleArguments: unknown[]) => {
      appendFileSync(
        requestedLogFilePath,
        formatConsoleFileLogLine({
          consoleFileLogLevel,
          consoleArguments,
          loggedAt: now(),
        }),
        { encoding: "utf8", mode: privateConsoleLogFileMode },
      );
      chmodSync(requestedLogFilePath, privateConsoleLogFileMode);

    };
  }

  const consoleFileLoggerInstallation: ConsoleFileLoggerInstallation = {
    isInstalled: true,
    logFilePath: requestedLogFilePath,
    restore() {
      for (const consoleFileLogLevel of consoleFileLogLevels) {
        consoleTarget[consoleFileLogLevel] = originalConsoleMethods[consoleFileLogLevel];
      }
      if (isInstallingGlobalConsoleLogger) {
        activeGlobalConsoleFileLoggerInstallation = undefined;
      }
    },
  };

  if (isInstallingGlobalConsoleLogger) {
    activeGlobalConsoleFileLoggerInstallation = consoleFileLoggerInstallation;
  }

  return consoleFileLoggerInstallation;
}

function createInactiveConsoleFileLoggerInstallation(): ConsoleFileLoggerInstallation {
  return {
    isInstalled: false,
    restore() {},
  };
}

function captureOriginalConsoleMethods(consoleTarget: ConsoleMethodTarget): ConsoleMethodTarget {
  return {
    debug: consoleTarget.debug,
    error: consoleTarget.error,
    info: consoleTarget.info,
    log: consoleTarget.log,
    warn: consoleTarget.warn,
  };
}

function ensurePrivateConsoleLogDirectory(logDirectoryPath: string): void {
  if (existsSync(logDirectoryPath)) {
    return;
  }

  mkdirSync(logDirectoryPath, { recursive: true, mode: privateConsoleLogDirectoryMode });
  chmodSync(logDirectoryPath, privateConsoleLogDirectoryMode);
}

function tightenExistingConsoleLogFilePermissions(logFilePath: string): void {
  if (existsSync(logFilePath)) {
    chmodSync(logFilePath, privateConsoleLogFileMode);
  }
}

function formatConsoleFileLogLine(input: {
  consoleFileLogLevel: ConsoleFileLogLevel;
  consoleArguments: readonly unknown[];
  loggedAt: Date;
}): string {
  const formattedArguments = input.consoleArguments.map(formatConsoleArgument).join(" ");
  return `[${input.loggedAt.toISOString()}] [${input.consoleFileLogLevel}] ${formattedArguments}\n`;
}

function formatConsoleArgument(consoleArgument: unknown): string {
  if (typeof consoleArgument === "string") {
    return consoleArgument;
  }

  return inspect(consoleArgument, {
    breakLength: 100,
    colors: false,
    compact: false,
    depth: 8,
  });
}

function isEnabledEnvironmentValue(rawValue: string | undefined): boolean {
  return rawValue ? ENABLED_ENVIRONMENT_VALUES.has(rawValue.trim().toLowerCase()) : false;
}
