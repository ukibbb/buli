import { MarkdownRenderable } from "@opentui/core";
import { createTestRenderer, MockTreeSitterClient } from "@opentui/core/testing";
import { createAssistantMarkdownUnifiedRenderNode } from "../components/primitives/assistantMarkdownUnifiedRenderNode.ts";
import { assistantMarkdownSyntaxStyle } from "../components/primitives/codeRenderingTheme.ts";
import {
  assistantMarkdownTableOptions,
  defaultAssistantMarkdownTerminalColumnCount,
} from "../components/primitives/assistantMarkdownTerminalTheme.ts";

// Headless driver for the assistant markdown render path. `MarkdownRenderable` runs
// its incremental parse and block reconciliation synchronously inside the `content`
// setter, so timing `applyMarkdownUpdate` captures the full per-update content cost.
// Uses a mock tree-sitter client so measurements never include highlight worker
// startup or WASM downloads.
export type AssistantMarkdownUnifiedRenderableUpdateStats = Readonly<{
  blockCount: number;
  stableBlockCount: number;
  reusedBlockRenderableCount: number;
}>;

export type AssistantMarkdownUnifiedRenderableProbe = Readonly<{
  applyMarkdownUpdate: (input: { markdownText: string; isStreaming: boolean }) => AssistantMarkdownUnifiedRenderableUpdateStats;
  resetMarkdownContent: () => void;
  renderFrame: () => Promise<void>;
  dispose: () => Promise<void>;
}>;

export type AssistantMarkdownUnifiedRenderableProbeOptions = Readonly<{
  terminalColumnCount?: number | undefined;
  terminalRowCount?: number | undefined;
}>;

export async function createAssistantMarkdownUnifiedRenderableProbe(
  options: AssistantMarkdownUnifiedRenderableProbeOptions = {},
): Promise<AssistantMarkdownUnifiedRenderableProbe> {
  const terminalColumnCount = options.terminalColumnCount ?? defaultAssistantMarkdownTerminalColumnCount;
  const testRendererSetup = await createTestRenderer({
    consoleMode: "disabled",
    width: terminalColumnCount,
    height: options.terminalRowCount ?? 40,
  });
  const mockTreeSitterClient = new MockTreeSitterClient();
  mockTreeSitterClient.setMockResult({ highlights: [] });

  const markdownRenderable = new MarkdownRenderable(testRendererSetup.renderer, {
    id: "assistant-markdown-unified-renderable-probe",
    content: "",
    conceal: true,
    concealCode: false,
    internalBlockMode: "top-level",
    renderNode: createAssistantMarkdownUnifiedRenderNode(),
    streaming: true,
    syntaxStyle: assistantMarkdownSyntaxStyle,
    tableOptions: assistantMarkdownTableOptions,
    treeSitterClient: mockTreeSitterClient,
    width: "100%",
  });
  testRendererSetup.renderer.root.add(markdownRenderable);

  return {
    applyMarkdownUpdate(input) {
      const previousBlockRenderables = markdownRenderable._blockStates.map((blockState) => blockState.renderable);
      markdownRenderable.streaming = input.isStreaming;
      markdownRenderable.content = input.markdownText;
      const reusedBlockRenderableCount = markdownRenderable._blockStates.reduce(
        (reusedCount, blockState, blockIndex) =>
          previousBlockRenderables[blockIndex] === blockState.renderable ? reusedCount + 1 : reusedCount,
        0,
      );
      return {
        blockCount: markdownRenderable._blockStates.length,
        stableBlockCount: markdownRenderable._stableBlockCount,
        reusedBlockRenderableCount,
      };
    },
    resetMarkdownContent() {
      markdownRenderable.streaming = true;
      markdownRenderable.content = "";
    },
    async renderFrame() {
      await testRendererSetup.renderOnce();
    },
    async dispose() {
      // Pending highlight promises keep the probe alive; resolve them before teardown.
      mockTreeSitterClient.resolveAllHighlightOnce();
      testRendererSetup.renderer.destroy();
      await mockTreeSitterClient.destroy();
    },
  };
}
