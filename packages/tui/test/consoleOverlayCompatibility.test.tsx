import { afterEach, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createRoot } from "@opentui/react";
import { act } from "react";
import { restoreConsoleTimeStampAfterOpentuiActivation } from "../src/restoreConsoleTimeStampAfterOpentuiActivation.ts";

type ConsoleWithOptionalTimeStamp = typeof globalThis.console & {
  timeStamp?: (...args: unknown[]) => void;
};

const originalConsole = globalThis.console as ConsoleWithOptionalTimeStamp;

afterEach(() => {
  globalThis.console = originalConsole;
});

test("preserves console timestamp support when the opentui console overlay becomes active", async () => {
  let root: ReturnType<typeof createRoot> | undefined;

  const testSetup = await createTestRenderer({
    width: 24,
    height: 6,
    consoleMode: "console-overlay",
  });

  try {
    restoreConsoleTimeStampAfterOpentuiActivation({ originalConsole });

    const activeConsole = globalThis.console as ConsoleWithOptionalTimeStamp;
    expect(typeof activeConsole.timeStamp).toBe("function");
    expect(() => activeConsole.timeStamp?.("OpenTUI scheduler track")).not.toThrow();

    root = createRoot(testSetup.renderer);
    await act(async () => {
      root?.render(
        <box>
          <text>overlay</text>
        </box>,
      );
    });
    await act(async () => {
      await testSetup.renderOnce();
    });

    expect(testSetup.captureCharFrame()).toContain("overlay");
  } finally {
    if (root) {
      await act(async () => {
        root?.unmount();
        root = undefined;
      });
    }

    testSetup.renderer.destroy();
    globalThis.console = originalConsole;
  }
});
