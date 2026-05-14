import { expect, test } from "bun:test";
import type { AssistantConversationRunner, PromptContextCandidate } from "@buli/engine";
import {
  renderChatScreenInTerminalWithRuntime,
  type ReactRootForChatScreenRuntime,
  type RenderChatScreenInTerminalInput,
  type TerminalRendererCreateOptionsForChatScreen,
  type TerminalRendererForChatScreenRuntime,
} from "../src/index.ts";

class FakeTerminalRenderer implements TerminalRendererForChatScreenRuntime {
  isDestroyed = false;
  destroyCount = 0;
  private destroyListeners: Array<() => void> = [];

  constructor(private readonly actions: string[]) {}

  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    this.destroyCount += 1;
    this.actions.push("destroy");
    for (const destroyListener of this.destroyListeners) {
      destroyListener();
    }
  }

  once(eventName: "destroy", listener: () => void): void {
    if (eventName === "destroy") {
      this.destroyListeners.push(listener);
    }
  }
}

const noopAssistantConversationRunner: AssistantConversationRunner = {
  startConversationTurn() {
    return {
      async *streamAssistantResponseEvents() {
        return;
      },
      async approvePendingToolCall() {},
      async denyPendingToolCall() {},
      interrupt() {},
    };
  },
};

function createRuntimeTestInput(): RenderChatScreenInTerminalInput {
  return {
    selectedModelId: "gpt-5.5",
    loadAvailableAssistantModels: async () => [],
    loadPromptContextCandidates: async (): Promise<readonly PromptContextCandidate[]> => [],
    assistantConversationRunner: noopAssistantConversationRunner,
  };
}

function createRuntimeHarness() {
  const actions: string[] = [];
  const fakeTerminalRenderer = new FakeTerminalRenderer(actions);
  const createdRendererOptions: TerminalRendererCreateOptionsForChatScreen[] = [];
  let unmountCount = 0;
  let renderedChatScreenElementCount = 0;

  return {
    actions,
    fakeTerminalRenderer,
    getUnmountCount: () => unmountCount,
    getRenderedChatScreenElementCount: () => renderedChatScreenElementCount,
    getCreatedRendererOptions: () => createdRendererOptions,
    runtime: {
      async createTerminalRenderer(options: TerminalRendererCreateOptionsForChatScreen): Promise<FakeTerminalRenderer> {
        createdRendererOptions.push(options);
        return fakeTerminalRenderer;
      },
      createChatScreenRoot(): ReactRootForChatScreenRuntime {
        return {
          render() {
            renderedChatScreenElementCount += 1;
            actions.push("render");
          },
          unmount() {
            unmountCount += 1;
            actions.push("unmount");
          },
        };
      },
      createChatScreenElement() {
        return "chat-screen";
      },
    },
  };
}

function restoreEnvironmentVariable(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

test("renderChatScreenInTerminalWithRuntime unmounts React before destroying OpenTUI", async () => {
  const runtimeHarness = createRuntimeHarness();
  const chatScreen = await renderChatScreenInTerminalWithRuntime(createRuntimeTestInput(), runtimeHarness.runtime);

  chatScreen.destroy();
  chatScreen.destroy();
  await chatScreen.waitUntilExit();

  expect(runtimeHarness.actions).toEqual(["render", "unmount", "destroy"]);
  expect(runtimeHarness.fakeTerminalRenderer.destroyCount).toBe(1);
  expect(runtimeHarness.getUnmountCount()).toBe(1);
  expect(runtimeHarness.getRenderedChatScreenElementCount()).toBe(1);
});

test("renderChatScreenInTerminalWithRuntime unmounts React when OpenTUI destroys itself", async () => {
  const runtimeHarness = createRuntimeHarness();
  const chatScreen = await renderChatScreenInTerminalWithRuntime(createRuntimeTestInput(), runtimeHarness.runtime);

  runtimeHarness.fakeTerminalRenderer.destroy();
  await chatScreen.waitUntilExit();

  expect(runtimeHarness.actions).toEqual(["render", "destroy", "unmount"]);
  expect(runtimeHarness.getUnmountCount()).toBe(1);
});

test("renderChatScreenInTerminalWithRuntime disables OpenTUI console capture while console file logging is active", async () => {
  const previousConsoleLogFilePath = process.env.BULI_CONSOLE_LOG_FILE;
  const previousOpenTuiUseConsole = process.env.OTUI_USE_CONSOLE;
  process.env.BULI_CONSOLE_LOG_FILE = "/tmp/buli-opentui-console.log";
  process.env.OTUI_USE_CONSOLE = "true";

  try {
    const runtimeHarness = createRuntimeHarness();
    const chatScreen = await renderChatScreenInTerminalWithRuntime(createRuntimeTestInput(), runtimeHarness.runtime);

    expect(runtimeHarness.getCreatedRendererOptions()).toEqual([
      {
        screenMode: "alternate-screen",
        useMouse: true,
        enableMouseMovement: true,
        consoleMode: "disabled",
      },
    ]);
    expect(process.env.OTUI_USE_CONSOLE).toBe("false");

    chatScreen.destroy();
    await chatScreen.waitUntilExit();

    expect(process.env.OTUI_USE_CONSOLE).toBe("true");
  } finally {
    restoreEnvironmentVariable("BULI_CONSOLE_LOG_FILE", previousConsoleLogFilePath);
    restoreEnvironmentVariable("OTUI_USE_CONSOLE", previousOpenTuiUseConsole);
  }
});
