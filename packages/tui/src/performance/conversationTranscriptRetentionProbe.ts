import { MarkdownRenderable, ScrollBoxRenderable } from "@opentui/core";
import { createTestRenderer, MockTreeSitterClient } from "@opentui/core/testing";
import { createAssistantMarkdownUnifiedRenderNode } from "../components/primitives/assistantMarkdownUnifiedRenderNode.ts";
import { assistantMarkdownSyntaxStyle } from "../components/primitives/codeRenderingTheme.ts";
import {
  assistantMarkdownTableOptions,
  defaultAssistantMarkdownTerminalColumnCount,
} from "../components/primitives/assistantMarkdownTerminalTheme.ts";

// Approximates transcript retention cost: every completed assistant message stays
// mounted as a live MarkdownRenderable inside the conversation scrollbox forever.
// This probe mounts message renderables directly (without buli's React component
// stack), so it measures the renderable-tree floor — real transcript cost sits above
// it. Used to decide whether virtualization or scrollback commits are worth building.
export type ConversationTranscriptRetentionProbe = Readonly<{
  mountCompletedMessages: (input: { messageMarkdownTexts: readonly string[] }) => void;
  mountedMessageCount: () => number;
  scrollToBottomAndRenderFrame: () => Promise<void>;
  dispose: () => Promise<void>;
}>;

export async function createConversationTranscriptRetentionProbe(): Promise<ConversationTranscriptRetentionProbe> {
  const terminalColumnCount = defaultAssistantMarkdownTerminalColumnCount;
  const testRendererSetup = await createTestRenderer({
    consoleMode: "disabled",
    width: terminalColumnCount,
    height: 40,
  });
  const mockTreeSitterClient = new MockTreeSitterClient();
  mockTreeSitterClient.setMockResult({ highlights: [] });

  const transcriptScrollBox = new ScrollBoxRenderable(testRendererSetup.renderer, {
    id: "conversation-transcript-retention-scrollbox",
    width: "100%",
    height: "100%",
  });
  testRendererSetup.renderer.root.add(transcriptScrollBox);

  const unifiedRenderNode = createAssistantMarkdownUnifiedRenderNode();

  let mountedMessageCount = 0;

  return {
    mountCompletedMessages(input) {
      for (const messageMarkdownText of input.messageMarkdownTexts) {
        transcriptScrollBox.add(
          new MarkdownRenderable(testRendererSetup.renderer, {
            id: `conversation-transcript-retention-message-${mountedMessageCount}`,
            content: messageMarkdownText,
            conceal: true,
            concealCode: false,
            internalBlockMode: "top-level",
            renderNode: unifiedRenderNode,
            streaming: true,
            syntaxStyle: assistantMarkdownSyntaxStyle,
            tableOptions: assistantMarkdownTableOptions,
            treeSitterClient: mockTreeSitterClient,
            width: "100%",
            marginBottom: 1,
          }),
        );
        mountedMessageCount += 1;
      }
    },
    mountedMessageCount() {
      return mountedMessageCount;
    },
    async scrollToBottomAndRenderFrame() {
      transcriptScrollBox.scrollTo(transcriptScrollBox.scrollHeight);
      await testRendererSetup.renderOnce();
    },
    async dispose() {
      mockTreeSitterClient.resolveAllHighlightOnce();
      testRendererSetup.renderer.destroy();
      await mockTreeSitterClient.destroy();
    },
  };
}
