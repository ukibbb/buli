type ConsoleTimeStamp = typeof globalThis.console.timeStamp;

type ConsoleWithOptionalTimeStamp = typeof globalThis.console & {
  timeStamp?: ConsoleTimeStamp;
};

const noopConsoleTimeStamp: ConsoleTimeStamp = (_label?: string) => {};

export function restoreConsoleTimeStampAfterOpentuiActivation(input: {
  originalConsole: ConsoleWithOptionalTimeStamp;
  activeConsole?: ConsoleWithOptionalTimeStamp;
}): void {
  const activeConsole = input.activeConsole ?? (globalThis.console as ConsoleWithOptionalTimeStamp);
  if (typeof activeConsole.timeStamp === "function") {
    return;
  }

  activeConsole.timeStamp =
    typeof input.originalConsole.timeStamp === "function"
      ? input.originalConsole.timeStamp.bind(input.originalConsole)
      : noopConsoleTimeStamp;
}
