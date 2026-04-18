import { PassThrough, Writable } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import { expect, test } from "bun:test";
import { render, type Instance } from "ink";
import React from "react";
import type { AssistantConversationRunner, PromptContextCandidate } from "@buli/engine";
import { ChatScreen } from "../src/ChatScreen.tsx";

const neverEmittingAssistantConversationRunner: AssistantConversationRunner = {
  startConversationTurn() {
    return {
      // eslint-disable-next-line require-yield -- intentional: stub never yields a turn.
      async *streamAssistantResponseEvents() {
        return;
      },
      async approvePendingToolCall() {},
      async denyPendingToolCall() {},
    };
  },
};

const noopAvailableModelsLoader = async () => [];
const ARROW_DOWN_KEY_SEQUENCE = "\u001B[B";
const ARROW_LEFT_KEY_SEQUENCE = "\u001B[D";
const ARROW_RIGHT_KEY_SEQUENCE = "\u001B[C";
const ENTER_KEY_SEQUENCE = "\r";
const ESCAPE_KEY_SEQUENCE = "\u001B";

class MockTerminalInputStream extends PassThrough {
  public isTTY = true;

  public setRawMode(_isRawModeEnabled: boolean): void {}

  public ref(): this {
    return this;
  }

  public unref(): this {
    return this;
  }
}

class MockTerminalOutputStream extends Writable {
  public readonly columns: number;
  public readonly rows: number;
  public readonly isTTY = true;
  private pendingRenderedChunkTexts: string[] = [];

  public constructor(input: { columns: number; rows: number }) {
    super();
    this.columns = input.columns;
    this.rows = input.rows;
  }

  public override _write(
    chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.pendingRenderedChunkTexts.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    callback();
  }

  public drainRenderedOutput(): string {
    const renderedOutput = stripVTControlCharacters(this.pendingRenderedChunkTexts.join(""));
    this.pendingRenderedChunkTexts = [];
    return renderedOutput;
  }
}

function createDeferredPromptContextCandidatesLoad(): {
  pendingPromptContextCandidatesPromise: Promise<readonly PromptContextCandidate[]>;
  resolvePromptContextCandidates: (promptContextCandidates: readonly PromptContextCandidate[]) => void;
} {
  let resolvePromptContextCandidates: (promptContextCandidates: readonly PromptContextCandidate[]) => void = (_promptContextCandidates) => {
    throw new Error("prompt-context candidates load was resolved before initialization");
  };
  const pendingPromptContextCandidatesPromise = new Promise<readonly PromptContextCandidate[]>((resolve) => {
    resolvePromptContextCandidates = resolve;
  });

  return {
    pendingPromptContextCandidatesPromise,
    resolvePromptContextCandidates,
  };
}

type InkChatScreenHarness = {
  captureRenderedFrame(): Promise<string>;
  cleanup(): Promise<void>;
  pressArrowDown(): Promise<string>;
  pressArrowLeft(): Promise<string>;
  pressArrowRight(): Promise<string>;
  pressEnter(): Promise<string>;
  pressEscape(): Promise<string>;
  typeText(text: string): Promise<string>;
  waitForFrame(delayMs: number): Promise<string>;
};

async function renderChatScreenWithMockTerminal(input: {
  loadPromptContextCandidates: (promptContextQueryText: string) => Promise<readonly PromptContextCandidate[]>;
}): Promise<InkChatScreenHarness> {
  const mockTerminalInputStream = new MockTerminalInputStream();
  const mockTerminalOutputStream = new MockTerminalOutputStream({ columns: 120, rows: 24 });
  const renderedChatScreenInstance = render(
    <ChatScreen
      selectedModelId="gpt-5.4"
      loadAvailableAssistantModels={noopAvailableModelsLoader}
      loadPromptContextCandidates={input.loadPromptContextCandidates}
      assistantConversationRunner={neverEmittingAssistantConversationRunner}
    />,
    {
      stdin: mockTerminalInputStream as unknown as NodeJS.ReadStream,
      stdout: mockTerminalOutputStream as unknown as NodeJS.WriteStream,
      stderr: mockTerminalOutputStream as unknown as NodeJS.WriteStream,
      debug: true,
      exitOnCtrlC: false,
      interactive: true,
    },
  );
  let latestRenderedFrame = "";

  const captureRenderedFrame = async (): Promise<string> => {
    await Promise.resolve();
    await renderedChatScreenInstance.waitUntilRenderFlush();
    await Promise.resolve();

    const renderedOutput = mockTerminalOutputStream.drainRenderedOutput();
    if (renderedOutput.length > 0) {
      latestRenderedFrame = renderedOutput;
    }

    return latestRenderedFrame;
  };

  const writeInputSequence = async (inputSequence: string): Promise<string> => {
    mockTerminalInputStream.write(inputSequence);
    return captureRenderedFrame();
  };

  await captureRenderedFrame();

  return {
    async captureRenderedFrame(): Promise<string> {
      return captureRenderedFrame();
    },
    async cleanup(): Promise<void> {
      renderedChatScreenInstance.unmount();
      await renderedChatScreenInstance.waitUntilExit();
    },
    async pressArrowDown(): Promise<string> {
      return writeInputSequence(ARROW_DOWN_KEY_SEQUENCE);
    },
    async pressArrowLeft(): Promise<string> {
      return writeInputSequence(ARROW_LEFT_KEY_SEQUENCE);
    },
    async pressArrowRight(): Promise<string> {
      return writeInputSequence(ARROW_RIGHT_KEY_SEQUENCE);
    },
    async pressEnter(): Promise<string> {
      return writeInputSequence(ENTER_KEY_SEQUENCE);
    },
    async pressEscape(): Promise<string> {
      mockTerminalInputStream.write(ESCAPE_KEY_SEQUENCE);
      await new Promise((resolve) => setTimeout(resolve, 25));
      return captureRenderedFrame();
    },
    async typeText(text: string): Promise<string> {
      let renderedFrame = latestRenderedFrame;
      for (const character of text) {
        renderedFrame = await writeInputSequence(character);
      }

      return renderedFrame;
    },
    async waitForFrame(delayMs: number): Promise<string> {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return captureRenderedFrame();
    },
  };
}

test("ChatScreen keeps a dismissed prompt-context query closed after late results arrive and moves the visible highlight", async () => {
  const deferredPromptContextCandidatesLoad = createDeferredPromptContextCandidatesLoad();
  const initialPromptContextCandidates: readonly PromptContextCandidate[] = [
    {
      kind: "file",
      displayPath: "project/file-1.ts",
      promptReferenceText: "@project/file-1.ts",
    },
    {
      kind: "file",
      displayPath: "project/file-2.ts",
      promptReferenceText: "@project/file-2.ts",
    },
  ];
  const loadPromptContextCandidates = async (promptContextQueryText: string): Promise<readonly PromptContextCandidate[]> => {
    switch (promptContextQueryText) {
      case "p":
      case "pr": {
        return initialPromptContextCandidates;
      }

      case "pro": {
        return deferredPromptContextCandidatesLoad.pendingPromptContextCandidatesPromise;
      }

      default: {
        return [];
      }
    }
  };

  const renderedChatScreen = await renderChatScreenWithMockTerminal({ loadPromptContextCandidates });

  try {
    await renderedChatScreen.typeText("@pr");
    expect(await renderedChatScreen.waitForFrame(150)).toContain("project/file-1.ts");

    expect(await renderedChatScreen.pressArrowDown()).toMatch(/>\s+project\/file-2\.ts/);

    await renderedChatScreen.typeText("o");

    const renderedFrameAfterEscape = await renderedChatScreen.pressEscape();
    expect(renderedFrameAfterEscape).not.toContain("Context");
    expect(renderedFrameAfterEscape).toContain("@pro");

    deferredPromptContextCandidatesLoad.resolvePromptContextCandidates([
      ...initialPromptContextCandidates,
      {
        kind: "file",
        displayPath: "project/file-3.ts",
        promptReferenceText: "@project/file-3.ts",
      },
    ]);

    const renderedFrameAfterLateResults = await renderedChatScreen.captureRenderedFrame();
    expect(renderedFrameAfterLateResults).not.toContain("Context");
    expect(renderedFrameAfterLateResults).toContain("@pro");
  } finally {
    await renderedChatScreen.cleanup();
  }
});

test("ChatScreen closes the prompt-context popup after selecting a directory", async () => {
  const loadPromptContextCandidates = async (promptContextQueryText: string): Promise<readonly PromptContextCandidate[]> => {
    switch (promptContextQueryText) {
      case "a":
      case "ap":
      case "app": {
        return [
          {
            kind: "directory",
            displayPath: "apps/",
            promptReferenceText: "@apps/",
          },
        ];
      }

      default: {
        return [];
      }
    }
  };
  const renderedChatScreen = await renderChatScreenWithMockTerminal({ loadPromptContextCandidates });

  try {
    await renderedChatScreen.typeText("@app");
    expect(await renderedChatScreen.waitForFrame(150)).toContain("apps/");

    const renderedFrameAfterSelection = await renderedChatScreen.pressEnter();
    expect(renderedFrameAfterSelection).not.toContain("Context");
    expect(renderedFrameAfterSelection).toContain("@apps/");
  } finally {
    await renderedChatScreen.cleanup();
  }
});

test("ChatScreen inserts typed text at the caret instead of always appending at the end", async () => {
  const renderedChatScreen = await renderChatScreenWithMockTerminal({
    loadPromptContextCandidates: async () => [],
  });

  try {
    await renderedChatScreen.typeText("hello");
    await renderedChatScreen.pressArrowLeft();
    await renderedChatScreen.pressArrowLeft();

    const renderedFrameAfterInsert = await renderedChatScreen.typeText("x");
    expect(renderedFrameAfterInsert).toMatch(/helx.?lo/);
  } finally {
    await renderedChatScreen.cleanup();
  }
});

test("ChatScreen reopens the prompt-context popup when the caret moves back into a middle @query", async () => {
  const loadPromptContextCandidates = async (promptContextQueryText: string): Promise<readonly PromptContextCandidate[]> => {
    if (promptContextQueryText === "app") {
      return [
        {
          kind: "directory",
          displayPath: "apps/",
          promptReferenceText: "@apps/",
        },
      ];
    }

    return [];
  };

  const renderedChatScreen = await renderChatScreenWithMockTerminal({ loadPromptContextCandidates });

  try {
    expect(await renderedChatScreen.typeText("Inspect @app later")).not.toContain("Context");

    await renderedChatScreen.pressArrowLeft();
    await renderedChatScreen.pressArrowLeft();
    await renderedChatScreen.pressArrowLeft();
    await renderedChatScreen.pressArrowLeft();
    await renderedChatScreen.pressArrowLeft();
    const renderedFrameInsideQuery = await renderedChatScreen.pressArrowLeft();

    expect(renderedFrameInsideQuery).not.toContain("apps/");
    expect(await renderedChatScreen.waitForFrame(150)).toContain("apps/");

    const renderedFrameAfterSelection = await renderedChatScreen.pressEnter();
    expect(renderedFrameAfterSelection).toMatch(/Inspect @apps\/ .*later/);
    expect(renderedFrameAfterSelection).not.toContain("No matching files or folders.");
  } finally {
    await renderedChatScreen.cleanup();
  }
});

test("ChatScreen keeps the highlighted prompt-context candidate when the same query refreshes after a caret move", async () => {
  const initialPromptContextCandidates: readonly PromptContextCandidate[] = [
    {
      kind: "file",
      displayPath: "project/file-1.ts",
      promptReferenceText: "@project/file-1.ts",
    },
    {
      kind: "file",
      displayPath: "project/file-2.ts",
      promptReferenceText: "@project/file-2.ts",
    },
  ];
  const refreshedPromptContextCandidates: readonly PromptContextCandidate[] = [
    ...initialPromptContextCandidates,
    {
      kind: "file",
      displayPath: "project/file-3.ts",
      promptReferenceText: "@project/file-3.ts",
    },
  ];
  let sameQueryLoadCount = 0;

  const loadPromptContextCandidates = async (promptContextQueryText: string): Promise<readonly PromptContextCandidate[]> => {
    if (promptContextQueryText !== "pr") {
      return [];
    }

    sameQueryLoadCount += 1;
    if (sameQueryLoadCount === 1) {
      return initialPromptContextCandidates;
    }

    return refreshedPromptContextCandidates;
  };

  const renderedChatScreen = await renderChatScreenWithMockTerminal({ loadPromptContextCandidates });

  try {
    await renderedChatScreen.typeText("@pr");
    expect(await renderedChatScreen.waitForFrame(150)).toContain("project/file-1.ts");
    expect(await renderedChatScreen.pressArrowDown()).toMatch(/>\s+project\/file-2\.ts/);

    await renderedChatScreen.pressArrowLeft();

    const renderedFrameAfterRefresh = await renderedChatScreen.captureRenderedFrame();
    expect(renderedFrameAfterRefresh).toMatch(/>\s+project\/file-2\.ts/);
  } finally {
    await renderedChatScreen.cleanup();
  }
});

test("ChatScreen debounces fuzzy prompt-context queries before loading candidates", async () => {
  const requestedPromptContextQueryTexts: string[] = [];
  const renderedChatScreen = await renderChatScreenWithMockTerminal({
    loadPromptContextCandidates: async (promptContextQueryText) => {
      requestedPromptContextQueryTexts.push(promptContextQueryText);
      return [];
    },
  });

  try {
    await renderedChatScreen.typeText("@pr");
    expect(requestedPromptContextQueryTexts).not.toContain("pr");

    await renderedChatScreen.waitForFrame(150);
    expect(requestedPromptContextQueryTexts).toContain("pr");
  } finally {
    await renderedChatScreen.cleanup();
  }
});
