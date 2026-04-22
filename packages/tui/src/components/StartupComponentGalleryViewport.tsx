import type { ReactNode, RefObject } from "react";
import { useRef } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import {
  chatScreenTheme,
  comfortableTerminalSizeTier,
  compactTerminalSizeTier,
  minimumTerminalSizeTier,
} from "@buli/assistant-design-tokens";
import type {
  AssistantContentPart,
  ConversationMessage,
  ConversationMessagePart,
  InlineSpan,
  PlanStep,
  ToolCallBashDetail,
  ToolCallEditDetail,
  ToolCallGrepDetail,
  ToolCallReadDetail,
  ToolCallTaskDetail,
  ToolCallTodoWriteDetail,
} from "@buli/contracts";
import type { PromptContextCandidate } from "@buli/engine";
import { ContextWindowMeter } from "./ContextWindowMeter.tsx";
import { ConversationMessageList } from "./ConversationMessageList.tsx";
import { ConversationMessageRow } from "./ConversationMessageRow.tsx";
import { InputPanel } from "./InputPanel.tsx";
import { MinimumHeightPromptStrip } from "./MinimumHeightPromptStrip.tsx";
import { ModelAndReasoningSelectionPane } from "./ModelAndReasoningSelectionPane.tsx";
import { PromptContextSelectionPane } from "./PromptContextSelectionPane.tsx";
import { PromptDraftText } from "./PromptDraftText.tsx";
import { ReasoningCollapsedChip } from "./ReasoningCollapsedChip.tsx";
import { ReasoningStreamBlock } from "./ReasoningStreamBlock.tsx";
import { ShortcutsModal } from "./ShortcutsModal.tsx";
import { SnakeAnimationIndicator } from "./SnakeAnimationIndicator.tsx";
import { TopBar } from "./TopBar.tsx";
import { TurnFooter } from "./TurnFooter.tsx";
import { UserPromptBlock } from "./UserPromptBlock.tsx";
import { ErrorBannerBlock } from "./behavior/ErrorBannerBlock.tsx";
import { IncompleteResponseNoticeBlock } from "./behavior/IncompleteResponseNoticeBlock.tsx";
import { PlanProposalBlock } from "./behavior/PlanProposalBlock.tsx";
import { RateLimitNoticeBlock } from "./behavior/RateLimitNoticeBlock.tsx";
import { ToolApprovalRequestBlock } from "./behavior/ToolApprovalRequestBlock.tsx";
import { AssistantTextPartView } from "./messageParts/AssistantTextPartView.tsx";
import { ReasoningPartView } from "./messageParts/ReasoningPartView.tsx";
import { ToolCallPartView } from "./messageParts/ToolCallPartView.tsx";
import { BulletedList } from "./primitives/BulletedList.tsx";
import { Callout } from "./primitives/Callout.tsx";
import { Checklist } from "./primitives/Checklist.tsx";
import { DataTable } from "./primitives/DataTable.tsx";
import { DiffBlock } from "./primitives/DiffBlock.tsx";
import { FencedCodeBlock } from "./primitives/FencedCodeBlock.tsx";
import { FileReference } from "./primitives/FileReference.tsx";
import { InlineMarkdownText } from "./primitives/InlineMarkdownText.tsx";
import { KeyValueList } from "./primitives/KeyValueList.tsx";
import { NestedList } from "./primitives/NestedList.tsx";
import { NumberedList } from "./primitives/NumberedList.tsx";
import { ShellBlock } from "./primitives/ShellBlock.tsx";
import { StreamingCursor } from "./primitives/StreamingCursor.tsx";
import { SurfaceCard } from "./primitives/SurfaceCard.tsx";
import { RenderAssistantResponseTree } from "../richText/renderAssistantResponseTree.tsx";
import { BashToolCallCard } from "./toolCalls/BashToolCallCard.tsx";
import { EditToolCallCard } from "./toolCalls/EditToolCallCard.tsx";
import { GrepToolCallCard } from "./toolCalls/GrepToolCallCard.tsx";
import { ReadToolCallCard } from "./toolCalls/ReadToolCallCard.tsx";
import { TaskToolCallCard } from "./toolCalls/TaskToolCallCard.tsx";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "./toolCalls/ToolCallCardHeaderSlots.tsx";
import { ToolCallEntryView } from "./toolCalls/ToolCallEntryView.tsx";
import { TodoWriteToolCallCard } from "./toolCalls/TodoWriteToolCallCard.tsx";

const showcaseInlineMarkdownSpans: InlineSpan[] = [
  { spanKind: "plain", spanText: "Plain " },
  { spanKind: "bold", spanText: "bold" },
  { spanKind: "plain", spanText: ", " },
  { spanKind: "italic", spanText: "italic" },
  { spanKind: "plain", spanText: ", " },
  { spanKind: "strike", spanText: "strike" },
  { spanKind: "plain", spanText: ", " },
  { spanKind: "code", spanText: "inlineCode()" },
  { spanKind: "plain", spanText: ", " },
  { spanKind: "highlight", spanText: "highlight" },
  { spanKind: "plain", spanText: ", H" },
  { spanKind: "subscript", spanText: "2" },
  { spanKind: "plain", spanText: "O, x" },
  { spanKind: "superscript", spanText: "2" },
  { spanKind: "plain", spanText: ", " },
  { spanKind: "link", spanText: "internal", hrefUrl: "/docs/gallery" },
  { spanKind: "plain", spanText: ", " },
  { spanKind: "link", spanText: "external", hrefUrl: "https://example.com/gallery" },
  { spanKind: "plain", spanText: "." },
];

const showcaseAssistantContentParts: AssistantContentPart[] = [
  {
    kind: "heading",
    headingLevel: 1,
    inlineSpans: [{ spanKind: "plain", spanText: "Component Gallery" }],
  },
  {
    kind: "heading",
    headingLevel: 2,
    inlineSpans: [{ spanKind: "plain", spanText: "Rich Text Variants" }],
  },
  {
    kind: "heading",
    headingLevel: 3,
    inlineSpans: [{ spanKind: "plain", spanText: "Smaller Heading" }],
  },
  {
    kind: "heading",
    headingLevel: 4,
    inlineSpans: [{ spanKind: "plain", spanText: "Quiet Heading" }],
  },
  {
    kind: "heading",
    headingLevel: 5,
    inlineSpans: [{ spanKind: "plain", spanText: "Muted Heading" }],
  },
  {
    kind: "heading",
    headingLevel: 6,
    inlineSpans: [{ spanKind: "plain", spanText: "Lowest Heading" }],
  },
  {
    kind: "paragraph",
    inlineSpans: showcaseInlineMarkdownSpans,
  },
  {
    kind: "bulleted_list",
    itemSpanArrays: [
      [{ spanKind: "plain", spanText: "first bulleted item" }],
      [{ spanKind: "plain", spanText: "second bulleted item" }],
    ],
  },
  {
    kind: "numbered_list",
    itemSpanArrays: [
      [{ spanKind: "plain", spanText: "first numbered item" }],
      [{ spanKind: "plain", spanText: "second numbered item" }],
    ],
  },
  {
    kind: "checklist",
    items: [
      { itemTitle: "collect redesign notes", itemStatus: "completed" },
      { itemTitle: "mock shell alternatives", itemStatus: "in_progress" },
      { itemTitle: "apply final theme pass", itemStatus: "pending" },
    ],
  },
  {
    kind: "fenced_code_block",
    languageLabel: "ts",
    codeLines: [
      "export function gallerySample() {",
      "  return \"component surface\";",
      "}",
    ],
  },
  {
    kind: "callout",
    severity: "info",
    titleText: "Gallery note",
    inlineSpans: [{ spanKind: "plain", spanText: "Every preview here is temporary and isolated." }],
  },
  { kind: "horizontal_rule" },
];

const showcasePlanSteps: PlanStep[] = [
  {
    stepIndex: 0,
    stepTitle: "Inventory all current renderable surfaces",
    stepDetail: "Transcript rows, tool cards, shell chrome, and direct-only primitives.",
    stepStatus: "completed",
  },
  {
    stepIndex: 1,
    stepTitle: "Compare alternative visual systems",
    stepDetail: "Spacing, hierarchy, and colour language.",
    stepStatus: "in_progress",
  },
  {
    stepIndex: 2,
    stepTitle: "Choose the next terminal visual direction",
    stepDetail: "Apply only after review.",
    stepStatus: "pending",
  },
];

const showcasePromptContextCandidates: PromptContextCandidate[] = [
  {
    kind: "directory",
    displayPath: "packages/tui/src/components",
    promptReferenceText: "@packages/tui/src/components",
  },
  {
    kind: "file",
    displayPath: "packages/tui/src/ChatScreen.tsx",
    promptReferenceText: "@packages/tui/src/ChatScreen.tsx",
  },
  {
    kind: "file",
    displayPath: "packages/assistant-design-tokens/src/chatScreenTheme.ts",
    promptReferenceText: "@packages/assistant-design-tokens/src/chatScreenTheme.ts",
  },
];

const showcaseReadDetail = {
  toolName: "read",
  readFilePath: "packages/tui/src/components/StartupComponentGalleryViewport.tsx",
  readLineCount: 214,
  readByteCount: 7420,
  previewLines: [
    { lineNumber: 1, lineText: 'import type { ReactNode } from "react";' },
    { lineNumber: 2, lineText: 'import { chatScreenTheme } from "@buli/assistant-design-tokens";' },
    { lineNumber: 3, lineText: 'export function StartupComponentGalleryViewport() {' },
    { lineNumber: 4, lineText: '  return <scrollbox />;' },
  ],
} satisfies ToolCallReadDetail;

const showcaseGrepDetail = {
  toolName: "grep",
  searchPattern: "ComponentGallery|StartupComponentGalleryViewport",
  matchedFileCount: 3,
  totalMatchCount: 5,
  matchHits: [
    {
      matchFilePath: "packages/tui/src/ChatScreen.tsx",
      matchLineNumber: 54,
      matchSnippet: 'import { StartupComponentGalleryViewport } from "./components/StartupComponentGalleryViewport.tsx";',
    },
    {
      matchFilePath: "packages/tui/src/components/StartupComponentGalleryViewport.tsx",
      matchLineNumber: 180,
      matchSnippet: "export function StartupComponentGalleryViewport(props: StartupComponentGalleryViewportProps) {",
    },
    {
      matchFilePath: "packages/tui/test/components/ChatScreen.startupGallery.test.tsx",
      matchLineNumber: 22,
      matchSnippet: 'expect(frame).toContain("Startup Component Gallery");',
    },
  ],
} satisfies ToolCallGrepDetail;

const showcaseEditDetail = {
  toolName: "edit",
  editedFilePath: "packages/tui/src/ChatScreen.tsx",
  addedLineCount: 9,
  removedLineCount: 2,
  diffLines: [
    { lineNumber: 52, lineKind: "context", lineText: 'import { ShortcutsModal } from "./components/ShortcutsModal.tsx";' },
    { lineNumber: 53, lineKind: "addition", lineText: 'import { StartupComponentGalleryViewport } from "./components/StartupComponentGalleryViewport.tsx";' },
    { lineNumber: 702, lineKind: "removal", lineText: '          <ConversationMessageList ... />' },
    { lineNumber: 702, lineKind: "addition", lineText: '          <StartupComponentGalleryViewport ... />' },
  ],
} satisfies ToolCallEditDetail;

const showcaseBashDetail = {
  toolName: "bash",
  commandLine: "bun --filter @buli/tui test",
  commandDescription: "Runs the TUI test suite",
  workingDirectoryPath: "~/Desktop/Projekty/buli",
  timeoutMilliseconds: 120000,
  exitCode: 0,
  outputLines: [
    { lineKind: "prompt", lineText: "$ bun --filter @buli/tui test" },
    { lineKind: "stdout", lineText: "bun test v1.3.12" },
    { lineKind: "stdout", lineText: "42 tests passed" },
    { lineKind: "stdout", lineText: "0 tests failed" },
  ],
} satisfies ToolCallBashDetail;

const showcaseTodoWriteDetail = {
  toolName: "todowrite",
  todoItems: [
    { todoItemTitle: "Collect shell redesign references", todoItemStatus: "completed" },
    { todoItemTitle: "Review component gallery spacing", todoItemStatus: "in_progress" },
    { todoItemTitle: "Commit final redesign branch", todoItemStatus: "pending" },
  ],
} satisfies ToolCallTodoWriteDetail;

const showcaseTaskDetail = {
  toolName: "task",
  subagentDescription: "Explore current TUI component boundaries",
  subagentPrompt: "List every renderable component and note which ones are only reachable by direct rendering.",
  subagentResultSummary: "Found four direct-only primitives and confirmed ChatScreen is the cleanest startup insertion point.",
} satisfies ToolCallTaskDetail;

const showcaseReadDetailWithoutPreview = {
  toolName: "read",
  readFilePath: "packages/tui/src/components/TopBar.tsx",
  readLineCount: 31,
  readByteCount: 820,
} satisfies ToolCallReadDetail;

const showcaseGrepDetailWithoutHits = {
  toolName: "grep",
  searchPattern: "renderNothingUseful",
  matchedFileCount: 0,
  totalMatchCount: 0,
  matchHits: [],
} satisfies ToolCallGrepDetail;

const showcaseEditDetailWithoutDiff = {
  toolName: "edit",
  editedFilePath: "packages/tui/src/components/ReasoningCollapsedChip.tsx",
  addedLineCount: 1,
  removedLineCount: 0,
} satisfies ToolCallEditDetail;

const showcaseBashDetailWithNonZeroExit = {
  toolName: "bash",
  commandLine: "bun test missing-file.test.ts",
  commandDescription: "Runs a missing test file",
  workingDirectoryPath: "~/Desktop/Projekty/buli",
  timeoutMilliseconds: 120000,
  exitCode: 1,
  outputLines: [
    { lineKind: "prompt", lineText: "$ bun test missing-file.test.ts" },
    { lineKind: "stderr", lineText: "error: Script not found \"missing-file.test.ts\"" },
  ],
} satisfies ToolCallBashDetail;

const showcaseBashDetailWithLongOutput = {
  toolName: "bash",
  commandLine: "ls -la",
  commandDescription: "Lists files in the working directory",
  exitCode: 0,
  outputLines: Array.from({ length: 30 }, (_value, index) => ({
    lineKind: index === 0 ? "prompt" : "stdout",
    lineText: index === 0 ? "$ ls -la" : `long output line ${index}`,
  })),
} satisfies ToolCallBashDetail;

const showcaseTaskDetailWithoutBody = {
  toolName: "task",
  subagentDescription: "Summarize the redesign delta",
} satisfies ToolCallTaskDetail;

const showcasePromptContextCandidatesWithLateHighlight: PromptContextCandidate[] = Array.from(
  { length: 8 },
  (_value, index) => ({
    kind: "file" as const,
    displayPath: `project/file-${index + 1}.ts`,
    promptReferenceText: `@project/file-${index + 1}.ts`,
  }),
);

const showcasePromptContextCandidatesWithLongPath: PromptContextCandidate[] = [
  {
    kind: "file",
    displayPath:
      "/Users/lukasz/Desktop/Projekty/buli/.bun/install/cache/@babel/helper-annotate-as-pure@7.27.3@@@1/README.md",
    promptReferenceText:
      "@/Users/lukasz/Desktop/Projekty/buli/.bun/install/cache/@babel/helper-annotate-as-pure@7.27.3@@@1/README.md",
  },
];

const showcaseConversationMessages: ConversationMessage[] = [
  {
    id: "gallery-user-message",
    role: "user",
    messageStatus: "completed",
    createdAtMs: 1,
    partIds: ["gallery-user-text"],
  },
  {
    id: "gallery-assistant-message",
    role: "assistant",
    messageStatus: "completed",
    createdAtMs: 2,
    partIds: [
      "gallery-reasoning-completed",
      "gallery-assistant-text-completed",
      "gallery-tool-call-completed",
      "gallery-turn-summary",
    ],
  },
];

const showcaseConversationMessagePartsByMessageId: Record<string, readonly ConversationMessagePart[]> = {
  "gallery-user-message": [
    {
      id: "gallery-user-text",
      partKind: "user_text",
      text: "Show me every renderable component before we redesign the terminal UI.",
    },
  ],
  "gallery-assistant-message": [
    {
      id: "gallery-reasoning-completed",
      partKind: "assistant_reasoning",
      partStatus: "completed",
      reasoningSummaryText: "Walking the component tree and grouping surfaces by role.",
      reasoningStartedAtMs: 10,
      reasoningDurationMs: 1800,
      reasoningTokenCount: 42,
    },
    {
      id: "gallery-assistant-text-completed",
      partKind: "assistant_text",
      partStatus: "completed",
      rawMarkdownText: "# Gallery\nEvery surface is listed below.",
      completedContentParts: [
        {
          kind: "heading",
          headingLevel: 1,
          inlineSpans: [{ spanKind: "plain", spanText: "Gallery" }],
        },
        {
          kind: "paragraph",
          inlineSpans: [{ spanKind: "plain", spanText: "Every surface is listed below." }],
        },
      ],
    },
    {
      id: "gallery-tool-call-completed",
      partKind: "assistant_tool_call",
      toolCallId: "gallery-grep-call",
      toolCallStatus: "completed",
      toolCallStartedAtMs: 20,
      toolCallDetail: showcaseGrepDetail,
      durationMs: 28,
    },
    {
      id: "gallery-turn-summary",
      partKind: "assistant_turn_summary",
      turnDurationMs: 2300,
      modelDisplayName: "gpt-5.4",
      usage: { total: 512, input: 280, output: 180, reasoning: 52, cache: { read: 24, write: 0 } },
    },
  ],
};

export type StartupComponentGalleryViewportProps = {
  conversationMessageScrollBoxRef: RefObject<ScrollBoxRenderable | null>;
  onConversationMessageWheelScroll: (direction: "up" | "down") => void;
};

export function StartupComponentGalleryViewport(props: StartupComponentGalleryViewportProps): ReactNode {
  const showcaseConversationMessageListScrollBoxRef = useRef<ScrollBoxRenderable | null>(null);

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      onMouseScroll={(mouseEvent) => {
        const scrollDirection = mouseEvent.scroll?.direction;
        if (scrollDirection !== "up" && scrollDirection !== "down") {
          return;
        }

        mouseEvent.stopPropagation();
        props.onConversationMessageWheelScroll(scrollDirection);
      }}
      width="100%"
    >
      <scrollbox
        flexDirection="column"
        flexGrow={1}
        ref={props.conversationMessageScrollBoxRef}
        scrollX={false}
        stickyScroll={false}
        verticalScrollbarOptions={{ visible: false, showArrows: false }}
        horizontalScrollbarOptions={{ visible: false, showArrows: false }}
      >
        <box flexDirection="column" paddingBottom={1} width="100%">
          <GalleryHero />

          <GallerySection sectionLabel="// shell" titleText="Shell And Control Surfaces">
            <GalleryExample labelText="TopBar">
              <TopBar workingDirectoryPath="~/Desktop/Projekty/buli" />
            </GalleryExample>

            <GalleryExample labelText="InputPanel idle">
              <InputPanel
                promptDraft="Sketch a calmer, more editorial transcript shell"
                promptDraftCursorOffset={7}
                selectedPromptContextReferenceTexts={[]}
                isPromptInputDisabled={false}
                modeLabel="implementation"
                modelIdentifier="gpt-5.4"
                reasoningEffortLabel="medium"
                assistantResponseStatus="waiting_for_user_input"
                totalContextTokensUsed={18240}
                contextWindowTokenCapacity={128000}
              />
            </GalleryExample>

            <GalleryExample labelText="InputPanel streaming">
              <InputPanel
                promptDraft="The assistant is currently responding"
                promptDraftCursorOffset={36}
                selectedPromptContextReferenceTexts={[]}
                isPromptInputDisabled={true}
                modeLabel="implementation"
                modelIdentifier="gpt-5.4"
                reasoningEffortLabel="high"
                assistantResponseStatus="streaming_assistant_response"
                totalContextTokensUsed={94500}
                contextWindowTokenCapacity={128000}
              />
            </GalleryExample>

            <GalleryExample labelText="InputPanel hint override">
              <InputPanel
                promptDraft="@packages/tui/src/"
                promptDraftCursorOffset={18}
                selectedPromptContextReferenceTexts={[]}
                isPromptInputDisabled={false}
                promptInputHintOverride="@ picker · ↑ ↓ choose · enter insert · esc close"
                modeLabel="implementation"
                modelIdentifier="gpt-5.4"
                reasoningEffortLabel="default"
                assistantResponseStatus="waiting_for_user_input"
                totalContextTokensUsed={undefined}
                contextWindowTokenCapacity={undefined}
              />
            </GalleryExample>

            <GalleryExample labelText="InputPanel empty override">
              <InputPanel
                promptDraft=""
                promptDraftCursorOffset={0}
                selectedPromptContextReferenceTexts={[]}
                isPromptInputDisabled={true}
                promptInputHintOverride=""
                modeLabel="implementation"
                modelIdentifier="gpt-5.4"
                reasoningEffortLabel="default"
                assistantResponseStatus="waiting_for_user_input"
                totalContextTokensUsed={undefined}
                contextWindowTokenCapacity={undefined}
              />
            </GalleryExample>

            <GalleryExample labelText="InputPanel long prompt on one row">
              <InputPanel
                promptDraft="@/Users/lukasz/Desktop/Projekty/buli/.bun/install/cache/@babel/helper-annotate-as-pure@7.27.3@@@1/README.md"
                promptDraftCursorOffset={107}
                selectedPromptContextReferenceTexts={[]}
                isPromptInputDisabled={false}
                modeLabel="implementation"
                modelIdentifier="gpt-5.4"
                reasoningEffortLabel="default"
                assistantResponseStatus="waiting_for_user_input"
                totalContextTokensUsed={undefined}
                contextWindowTokenCapacity={undefined}
              />
            </GalleryExample>

            <GalleryExample labelText="MinimumHeightPromptStrip idle">
              <MinimumHeightPromptStrip
                promptDraft="Redesign the prompt strip first"
                promptDraftCursorOffset={10}
                selectedPromptContextReferenceTexts={[]}
                isPromptInputDisabled={false}
                assistantResponseStatus="waiting_for_user_input"
              />
            </GalleryExample>

            <GalleryExample labelText="MinimumHeightPromptStrip streaming">
              <MinimumHeightPromptStrip
                promptDraft="Waiting"
                promptDraftCursorOffset={7}
                selectedPromptContextReferenceTexts={[]}
                isPromptInputDisabled={true}
                assistantResponseStatus="streaming_assistant_response"
              />
            </GalleryExample>

            <GalleryExample labelText="PromptDraftText with prompt context references">
              <box borderColor={chatScreenTheme.border} borderStyle="rounded" border={true} paddingX={1} paddingY={1} width="100%">
                <PromptDraftText
                  promptDraft="Review @packages/tui/src/ChatScreen.tsx and @packages/tui/src/components before redesigning."
                  promptDraftCursorOffset={55}
                  selectedPromptContextReferenceTexts={[
                    "@packages/tui/src/ChatScreen.tsx",
                    "@packages/tui/src/components",
                  ]}
                  cursorCharacter="█"
                />
              </box>
            </GalleryExample>

            <GalleryExample labelText="ContextWindowMeter states">
              <box flexDirection="column" gap={1} width="100%">
                <ContextWindowMeter totalTokensUsed={undefined} contextWindowTokenCapacity={undefined} />
                <ContextWindowMeter totalTokensUsed={4200} contextWindowTokenCapacity={undefined} />
                <ContextWindowMeter totalTokensUsed={24000} contextWindowTokenCapacity={120000} />
                <ContextWindowMeter totalTokensUsed={84500} contextWindowTokenCapacity={128000} />
                <ContextWindowMeter totalTokensUsed={118000} contextWindowTokenCapacity={128000} />
              </box>
            </GalleryExample>

            <GalleryExample labelText="SnakeAnimationIndicator">
              <box flexDirection="row" gap={2} width="100%">
                <SnakeAnimationIndicator />
                <text fg={chatScreenTheme.textMuted}>Used in the footer while the assistant is working.</text>
              </box>
            </GalleryExample>
          </GallerySection>

          <GallerySection sectionLabel="// wrappers" titleText="Conversation Wrapper Components">
            <GalleryExample labelText="ConversationMessageRow for a user turn">
              <ConversationMessageRow
                conversationMessage={showcaseConversationMessages[0]!}
                conversationMessageParts={showcaseConversationMessagePartsByMessageId["gallery-user-message"] ?? []}
              />
            </GalleryExample>

            <GalleryExample labelText="ConversationMessageRow for an assistant turn">
              <ConversationMessageRow
                conversationMessage={showcaseConversationMessages[1]!}
                conversationMessageParts={showcaseConversationMessagePartsByMessageId["gallery-assistant-message"] ?? []}
              />
            </GalleryExample>

            <GalleryExample labelText="ConversationMessageList">
              <box borderColor={chatScreenTheme.border} borderStyle="rounded" border={true} height={18} overflow="hidden" width="100%">
                <ConversationMessageList
                  conversationMessages={showcaseConversationMessages}
                  resolveConversationMessageParts={(messageId) =>
                    showcaseConversationMessagePartsByMessageId[messageId] ?? []
                  }
                  conversationMessageScrollBoxRef={showcaseConversationMessageListScrollBoxRef}
                  onConversationMessageWheelScroll={props.onConversationMessageWheelScroll}
                />
              </box>
            </GalleryExample>
          </GallerySection>

          <GallerySection sectionLabel="// parts" titleText="Message Part Components">
            <GalleryExample labelText="UserPromptBlock">
              <UserPromptBlock promptText="Please open the component gallery on startup." />
            </GalleryExample>

            <GalleryExample labelText="ReasoningPartView states">
              <box flexDirection="column" gap={1} width="100%">
                <ReasoningPartView
                  assistantReasoningConversationMessagePart={{
                    id: "reasoning-streaming",
                    partKind: "assistant_reasoning",
                    partStatus: "streaming",
                    reasoningSummaryText: "Comparing shell layout patterns and transcript density.",
                    reasoningStartedAtMs: Date.now() - 4200,
                  }}
                />
                <ReasoningPartView
                  assistantReasoningConversationMessagePart={{
                    id: "reasoning-completed",
                    partKind: "assistant_reasoning",
                    partStatus: "completed",
                    reasoningSummaryText: "Done.",
                    reasoningStartedAtMs: 0,
                    reasoningDurationMs: 2400,
                    reasoningTokenCount: 96,
                  }}
                />
              </box>
            </GalleryExample>

            <GalleryExample labelText="ReasoningStreamBlock and ReasoningCollapsedChip">
              <box flexDirection="column" gap={1} width="100%">
                <ReasoningStreamBlock
                  reasoningSummaryText="Comparing denser transcript layouts with more editorial spacing." 
                  reasoningStartedAtMs={Date.now() - 2600}
                />
                <ReasoningCollapsedChip reasoningDurationMs={1800} reasoningTokenCount={72} />
                <ReasoningCollapsedChip reasoningDurationMs={2500} reasoningTokenCount={undefined} />
              </box>
            </GalleryExample>

            <GalleryExample labelText="AssistantTextPartView states">
              <box flexDirection="column" gap={1} width="100%">
                <AssistantTextPartView
                  assistantTextConversationMessagePart={{
                    id: "assistant-text-waiting",
                    partKind: "assistant_text",
                    partStatus: "streaming",
                    rawMarkdownText: "",
                    completedContentParts: [],
                  }}
                />
                <AssistantTextPartView
                  assistantTextConversationMessagePart={{
                    id: "assistant-text-streaming",
                    partKind: "assistant_text",
                    partStatus: "streaming",
                    rawMarkdownText: "Still streaming markdown...",
                    completedContentParts: [],
                    openContentPart: {
                      kind: "streaming_markdown_text",
                      text: "Still streaming markdown...",
                    },
                  }}
                />
                <AssistantTextPartView
                  assistantTextConversationMessagePart={{
                    id: "assistant-text-streaming-code",
                    partKind: "assistant_text",
                    partStatus: "streaming",
                    rawMarkdownText: "```ts\nconst gallery = true;",
                    completedContentParts: [],
                    openContentPart: {
                      kind: "streaming_fenced_code_block",
                      languageLabel: "ts",
                      codeLines: ["const gallery = true;", "return gallery;"],
                    },
                  }}
                />
                <AssistantTextPartView
                  assistantTextConversationMessagePart={{
                    id: "assistant-text-mixed",
                    partKind: "assistant_text",
                    partStatus: "streaming",
                    rawMarkdownText: "## Partial\nStill going",
                    completedContentParts: [
                      {
                        kind: "heading",
                        headingLevel: 2,
                        inlineSpans: [{ spanKind: "plain", spanText: "Partial" }],
                      },
                    ],
                    openContentPart: {
                      kind: "streaming_markdown_text",
                      text: "Still going",
                    },
                  }}
                />
                <AssistantTextPartView
                  assistantTextConversationMessagePart={{
                    id: "assistant-text-completed",
                    partKind: "assistant_text",
                    partStatus: "completed",
                    rawMarkdownText: "Rendered content",
                    completedContentParts: showcaseAssistantContentParts,
                  }}
                />
              </box>
            </GalleryExample>

            <GalleryExample labelText="ToolCallPartView states">
              <box flexDirection="column" gap={1} width="100%">
                <ToolCallPartView
                  assistantToolCallConversationMessagePart={{
                    id: "tool-call-running",
                    partKind: "assistant_tool_call",
                    toolCallId: "running-read",
                    toolCallStatus: "running",
                    toolCallStartedAtMs: 0,
                    toolCallDetail: showcaseReadDetail,
                  }}
                />
                <ToolCallPartView
                  assistantToolCallConversationMessagePart={{
                    id: "tool-call-completed",
                    partKind: "assistant_tool_call",
                    toolCallId: "completed-grep",
                    toolCallStatus: "completed",
                    toolCallStartedAtMs: 0,
                    toolCallDetail: showcaseGrepDetail,
                    durationMs: 44,
                  }}
                />
                <ToolCallPartView
                  assistantToolCallConversationMessagePart={{
                    id: "tool-call-failed",
                    partKind: "assistant_tool_call",
                    toolCallId: "failed-bash",
                    toolCallStatus: "failed",
                    toolCallStartedAtMs: 0,
                    toolCallDetail: showcaseBashDetail,
                    durationMs: 900,
                    errorText: "Permission denied.",
                  }}
                />
                <ToolCallPartView
                  assistantToolCallConversationMessagePart={{
                    id: "tool-call-denied",
                    partKind: "assistant_tool_call",
                    toolCallId: "denied-edit",
                    toolCallStatus: "denied",
                    toolCallStartedAtMs: 0,
                    toolCallDetail: showcaseEditDetail,
                    denialText: "The user denied this edit.",
                  }}
                />
              </box>
            </GalleryExample>

            <GalleryExample labelText="PlanProposalBlock">
              <PlanProposalBlock planTitle="Redesign review pass" planSteps={showcasePlanSteps} />
            </GalleryExample>

            <GalleryExample labelText="RateLimitNoticeBlock">
              <RateLimitNoticeBlock
                retryAfterSeconds={30}
                limitExplanation="The provider asked the client to wait before retrying."
                noticeStartedAtMs={Date.now() - 5000}
              />
            </GalleryExample>

            <GalleryExample labelText="IncompleteResponseNoticeBlock">
              <IncompleteResponseNoticeBlock incompleteReason="max_output_tokens" />
            </GalleryExample>

            <GalleryExample labelText="ErrorBannerBlock">
              <box flexDirection="column" gap={1} width="100%">
                <ErrorBannerBlock errorText="auth failed" />
                <ErrorBannerBlock
                  titleText="Assistant failed"
                  errorText="The provider returned an unexpected stream payload."
                  errorHintText="Retry the turn after checking provider connectivity."
                />
              </box>
            </GalleryExample>

            <GalleryExample labelText="TurnFooter">
              <box flexDirection="column" gap={1} width="100%">
                <TurnFooter modelDisplayName="claude-3-5-sonnet" turnDurationMs={3200} usage={undefined} />
                <TurnFooter
                  modelDisplayName="gpt-5.4"
                  turnDurationMs={3120}
                  usage={{ total: 930, input: 510, output: 300, reasoning: 120, cache: { read: 64, write: 0 } }}
                />
              </box>
            </GalleryExample>
          </GallerySection>

          <GallerySection sectionLabel="// rich text" titleText="Rich Text And Primitive Composition">
            <GalleryExample labelText="InlineMarkdownText">
              <InlineMarkdownText spans={showcaseInlineMarkdownSpans} />
            </GalleryExample>

            <GalleryExample labelText="BulletedList">
              <BulletedList
                itemContents={[
                  <text fg={chatScreenTheme.textPrimary} key="bullet-1">{"Audit the transcript rhythm"}</text>,
                  <text fg={chatScreenTheme.textPrimary} key="bullet-2">{"Compare alternate heading treatments"}</text>,
                ]}
              />
            </GalleryExample>

            <GalleryExample labelText="NumberedList">
              <NumberedList
                startingIndex={5}
                itemContents={[
                  <text fg={chatScreenTheme.textPrimary} key="numbered-1">{"Collect references"}</text>,
                  <text fg={chatScreenTheme.textPrimary} key="numbered-2">{"Mock revised chrome"}</text>,
                ]}
              />
            </GalleryExample>

            <GalleryExample labelText="Checklist">
              <Checklist
                items={[
                  { itemTitle: "calibrate palette", itemStatus: "completed" },
                  { itemTitle: "revisit list markers", itemStatus: "in_progress" },
                  { itemTitle: "ship new hierarchy", itemStatus: "pending" },
                ]}
              />
            </GalleryExample>

            <GalleryExample labelText="Callout variants">
              <box flexDirection="column" gap={1} width="100%">
                <Callout severity="info" titleText="Info" bodyContent={<text fg={chatScreenTheme.textPrimary}>{"Informational callout body."}</text>} />
                <Callout severity="success" titleText="Success" bodyContent={<text fg={chatScreenTheme.textPrimary}>{"Successful completion body."}</text>} />
                <Callout severity="warning" titleText="Warning" bodyContent={<text fg={chatScreenTheme.textPrimary}>{"Warning state body."}</text>} />
                <Callout severity="error" titleText="Error" bodyContent={<text fg={chatScreenTheme.textPrimary}>{"Error state body."}</text>} />
              </box>
            </GalleryExample>

            <GalleryExample labelText="FencedCodeBlock variants">
              <box flexDirection="column" gap={1} width="100%">
                <FencedCodeBlock
                  languageLabel="tsx"
                  codeLines={[
                    { lineNumber: 1, lineText: "export function Gallery() {" },
                    { lineNumber: 2, lineText: "  return <scrollbox />;" },
                    { lineNumber: 3, lineText: "}" },
                  ]}
                />
                <FencedCodeBlock
                  variant="embedded"
                  codeLines={[{ lineText: "embedded sample line" }, { lineText: "no outer border" }]}
                />
                <FencedCodeBlock
                  codeLines={[
                    {
                      lineText: "const highlighted = 1;",
                      syntaxHighlightSpans: [
                        { spanText: "const", spanStyle: "keyword" },
                        { spanText: " highlighted", spanStyle: "identifier" },
                        { spanText: " = ", spanStyle: "symbol" },
                        { spanText: "1", spanStyle: "number" },
                        { spanText: ";", spanStyle: "symbol" },
                      ],
                    },
                  ]}
                />
                <FencedCodeBlock codeLines={[{ lineText: "unlabelled block" }]} />
              </box>
            </GalleryExample>

            <GalleryExample labelText="RenderAssistantResponseTree">
              <RenderAssistantResponseTree assistantContentParts={showcaseAssistantContentParts} />
            </GalleryExample>
          </GallerySection>

          <GallerySection sectionLabel="// tool cards" titleText="Tool Dispatcher And Tool Card Surfaces">
            <GalleryExample labelText="ToolCallEntryView dispatcher samples">
              <box flexDirection="column" gap={1} width="100%">
                <ToolCallEntryView renderState="completed" toolCallDetail={showcaseReadDetail} durationMs={20} />
                <ToolCallEntryView renderState="completed" toolCallDetail={showcaseGrepDetail} durationMs={28} />
                <ToolCallEntryView renderState="completed" toolCallDetail={showcaseEditDetail} durationMs={54} />
                <ToolCallEntryView renderState="completed" toolCallDetail={showcaseBashDetail} durationMs={930} />
                <ToolCallEntryView renderState="completed" toolCallDetail={showcaseTodoWriteDetail} durationMs={35} />
                <ToolCallEntryView renderState="completed" toolCallDetail={showcaseTaskDetail} durationMs={120} />
              </box>
            </GalleryExample>

            <GalleryExample labelText="ReadToolCallCard states">
              <box flexDirection="column" gap={1} width="100%">
                <ReadToolCallCard renderState="streaming" toolCallDetail={showcaseReadDetail} />
                <ReadToolCallCard renderState="completed" toolCallDetail={showcaseReadDetail} durationMs={20} />
                <ReadToolCallCard renderState="completed" toolCallDetail={showcaseReadDetailWithoutPreview} durationMs={12} />
                <ReadToolCallCard
                  renderState="failed"
                  toolCallDetail={showcaseReadDetail}
                  durationMs={20}
                  errorText="The file path does not exist."
                />
              </box>
            </GalleryExample>

            <GalleryExample labelText="GrepToolCallCard states">
              <box flexDirection="column" gap={1} width="100%">
                <GrepToolCallCard renderState="streaming" toolCallDetail={showcaseGrepDetail} />
                <GrepToolCallCard renderState="completed" toolCallDetail={showcaseGrepDetail} durationMs={28} />
                <GrepToolCallCard renderState="completed" toolCallDetail={showcaseGrepDetailWithoutHits} durationMs={10} />
                <GrepToolCallCard
                  renderState="failed"
                  toolCallDetail={showcaseGrepDetail}
                  durationMs={28}
                  errorText="Search backend unavailable."
                />
              </box>
            </GalleryExample>

            <GalleryExample labelText="EditToolCallCard states">
              <box flexDirection="column" gap={1} width="100%">
                <EditToolCallCard renderState="streaming" toolCallDetail={showcaseEditDetail} />
                <EditToolCallCard renderState="completed" toolCallDetail={showcaseEditDetail} durationMs={54} />
                <EditToolCallCard renderState="completed" toolCallDetail={showcaseEditDetailWithoutDiff} durationMs={18} />
                <EditToolCallCard
                  renderState="failed"
                  toolCallDetail={showcaseEditDetail}
                  durationMs={54}
                  errorText="Patch rejected because the file changed on disk."
                />
              </box>
            </GalleryExample>

            <GalleryExample labelText="BashToolCallCard states">
              <box flexDirection="column" gap={1} width="100%">
                <BashToolCallCard renderState="streaming" toolCallDetail={showcaseBashDetail} />
                <BashToolCallCard renderState="completed" toolCallDetail={showcaseBashDetail} durationMs={930} />
                <BashToolCallCard
                  renderState="completed"
                  toolCallDetail={showcaseBashDetailWithNonZeroExit}
                  durationMs={120}
                />
                <BashToolCallCard renderState="completed" toolCallDetail={showcaseBashDetailWithLongOutput} durationMs={620} />
                <BashToolCallCard
                  renderState="failed"
                  toolCallDetail={{ ...showcaseBashDetail, exitCode: 1 }}
                  durationMs={930}
                  errorText="Command exited with code 1."
                />
              </box>
            </GalleryExample>

            <GalleryExample labelText="TodoWriteToolCallCard states">
              <box flexDirection="column" gap={1} width="100%">
                <TodoWriteToolCallCard renderState="streaming" toolCallDetail={showcaseTodoWriteDetail} />
                <TodoWriteToolCallCard renderState="completed" toolCallDetail={showcaseTodoWriteDetail} durationMs={35} />
                <TodoWriteToolCallCard
                  renderState="failed"
                  toolCallDetail={showcaseTodoWriteDetail}
                  durationMs={35}
                  errorText="Plan update failed."
                />
              </box>
            </GalleryExample>

            <GalleryExample labelText="TaskToolCallCard states">
              <box flexDirection="column" gap={1} width="100%">
                <TaskToolCallCard renderState="streaming" toolCallDetail={showcaseTaskDetail} />
                <TaskToolCallCard renderState="completed" toolCallDetail={showcaseTaskDetail} durationMs={180} />
                <TaskToolCallCard renderState="completed" toolCallDetail={showcaseTaskDetailWithoutBody} durationMs={42} />
                <TaskToolCallCard
                  renderState="failed"
                  toolCallDetail={showcaseTaskDetail}
                  durationMs={180}
                  errorText="Sub-agent returned no result."
                />
              </box>
            </GalleryExample>
          </GallerySection>

          <GallerySection sectionLabel="// direct primitives" titleText="Directly Rendered Primitive Surfaces">
            <GalleryExample labelText="ToolCallHeaderLeft and ToolCallHeaderRight">
              <box borderColor={chatScreenTheme.border} borderStyle="rounded" border={true} flexDirection="row" justifyContent="space-between" paddingX={2} paddingY={1} width="100%">
                <ToolCallHeaderLeft
                  toolGlyph="⌘"
                  toolGlyphColor={chatScreenTheme.accentPurple}
                  toolNameLabel="Task"
                  toolTargetContent={<text fg={chatScreenTheme.textSecondary}>{"Summarize direct-only primitives"}</text>}
                />
                <ToolCallHeaderRight statusColor={chatScreenTheme.accentGreen} statusKind="success" statusLabel="returned" />
              </box>
            </GalleryExample>

            <GalleryExample labelText="SurfaceCard">
              <box flexDirection="column" gap={1} width="100%">
                <SurfaceCard
                  stripeColor={chatScreenTheme.accentCyan}
                  headerLeft={<text fg={chatScreenTheme.textPrimary}>{"SurfaceCard skeleton"}</text>}
                  headerRight={<text fg={chatScreenTheme.textMuted}>{"header-right"}</text>}
                  bodyContent={
                    <box paddingX={1} width="100%">
                      <text fg={chatScreenTheme.textSecondary}>{"Shared chrome for framed blocks."}</text>
                    </box>
                  }
                />
                <SurfaceCard
                  stripeColor={chatScreenTheme.accentAmber}
                  headerLeft={<text fg={chatScreenTheme.textPrimary}>{"Bodyless SurfaceCard"}</text>}
                />
              </box>
            </GalleryExample>

            <GalleryExample labelText="FileReference variants">
              <box flexDirection="column" gap={1} width="100%">
                <FileReference variant="inline" filePath="packages/tui/src/ChatScreen.tsx" lineNumber={712} />
                <FileReference variant="pill" filePath="packages/tui/src/components" />
                <FileReference variant="symbol" filePath="packages/tui/src/components/StartupComponentGalleryViewport.tsx" />
              </box>
            </GalleryExample>

            <GalleryExample labelText="ShellBlock">
              <ShellBlock
                maxVisibleLines={2}
                outputLines={[
                  { lineKind: "prompt", lineText: "$ bun --filter @buli/tui test" },
                  { lineKind: "stdout", lineText: "42 tests passed" },
                  { lineKind: "stderr", lineText: "hidden sample line" },
                ]}
              />
            </GalleryExample>

            <GalleryExample labelText="DiffBlock">
              <DiffBlock diffLines={showcaseEditDetail.diffLines ?? []} />
            </GalleryExample>

            <GalleryExample labelText="NestedList">
              <NestedList
                items={[
                  {
                    itemContent: <text fg={chatScreenTheme.textPrimary}>{"layout system"}</text>,
                    childItems: [
                      {
                        itemContent: <text fg={chatScreenTheme.textSecondary}>{"transcript density"}</text>,
                        childItems: [
                          { itemContent: <text fg={chatScreenTheme.textSecondary}>{"line spacing"}</text> },
                        ],
                      },
                    ],
                  },
                  { itemContent: <text fg={chatScreenTheme.textPrimary}>{"colour system"}</text> },
                ]}
              />
            </GalleryExample>

            <GalleryExample labelText="KeyValueList">
              <KeyValueList
                entries={[
                  {
                    entryKeyLabel: "mode",
                    entryValueContent: <text fg={chatScreenTheme.textPrimary}>{"implementation"}</text>,
                  },
                  {
                    entryKeyLabel: "aesthetic",
                    entryValueContent: <text fg={chatScreenTheme.textPrimary}>{"quiet editorial terminal"}</text>,
                  },
                ]}
              />
            </GalleryExample>

            <GalleryExample labelText="DataTable">
              <DataTable
                columnHeaderLabels={["Surface", "State", "Notes"]}
                columnWidths={[18, 14]}
                bodyRowValues={[
                  [
                    <text fg={chatScreenTheme.textPrimary} key="row-1-surface">{"InputPanel"}</text>,
                    <text fg={chatScreenTheme.textPrimary} key="row-1-state">{"streaming"}</text>,
                    <text fg={chatScreenTheme.textSecondary} key="row-1-notes">{"Shows working footer and disabled input."}</text>,
                  ],
                  [
                    <text fg={chatScreenTheme.textPrimary} key="row-2-surface">{"Prompt picker"}</text>,
                    <text fg={chatScreenTheme.textPrimary} key="row-2-state">{"populated"}</text>,
                    <text fg={chatScreenTheme.textSecondary} key="row-2-notes">{"Highlights one candidate at a time."}</text>,
                  ],
                ]}
              />
            </GalleryExample>

            <GalleryExample labelText="StreamingCursor variants">
              <box flexDirection="row" gap={2} width="100%">
                <StreamingCursor variant="amber" />
                <StreamingCursor variant="green" />
                <StreamingCursor variant="cyan" />
                <StreamingCursor variant="dim" />
              </box>
            </GalleryExample>
          </GallerySection>

          <GallerySection sectionLabel="// overlays" titleText="Overlay And Picker Surfaces">
            <GalleryExample labelText="ShortcutsModal comfortable tier">
              <box width="100%">
                <ShortcutsModal
                  onCloseRequested={() => {}}
                  availableModalRowCount={18}
                  terminalSizeTierForChatScreen={comfortableTerminalSizeTier}
                />
              </box>
            </GalleryExample>

            <GalleryExample labelText="ShortcutsModal compact tier">
              <box width="100%">
                <ShortcutsModal
                  onCloseRequested={() => {}}
                  availableModalRowCount={12}
                  terminalSizeTierForChatScreen={compactTerminalSizeTier}
                />
              </box>
            </GalleryExample>

            <GalleryExample labelText="ShortcutsModal compact tier without help section">
              <box width="100%">
                <ShortcutsModal
                  onCloseRequested={() => {}}
                  availableModalRowCount={7}
                  terminalSizeTierForChatScreen={compactTerminalSizeTier}
                />
              </box>
            </GalleryExample>

            <GalleryExample labelText="ShortcutsModal minimum tier">
              <box width="100%">
                <ShortcutsModal
                  onCloseRequested={() => {}}
                  availableModalRowCount={5}
                  terminalSizeTierForChatScreen={minimumTerminalSizeTier}
                />
              </box>
            </GalleryExample>

            <GalleryExample labelText="PromptContextSelectionPane populated">
              <PromptContextSelectionPane
                promptContextCandidates={showcasePromptContextCandidates}
                highlightedPromptContextCandidateIndex={1}
              />
            </GalleryExample>

            <GalleryExample labelText="PromptContextSelectionPane empty">
              <PromptContextSelectionPane
                promptContextCandidates={[]}
                highlightedPromptContextCandidateIndex={0}
              />
            </GalleryExample>

            <GalleryExample labelText="PromptContextSelectionPane highlighted after the first six results">
              <PromptContextSelectionPane
                promptContextCandidates={showcasePromptContextCandidatesWithLateHighlight}
                highlightedPromptContextCandidateIndex={6}
              />
            </GalleryExample>

            <GalleryExample labelText="PromptContextSelectionPane long path on one row">
              <PromptContextSelectionPane
                promptContextCandidates={showcasePromptContextCandidatesWithLongPath}
                highlightedPromptContextCandidateIndex={0}
              />
            </GalleryExample>

            <GalleryExample labelText="ModelAndReasoningSelectionPane for models">
              <ModelAndReasoningSelectionPane
                headingText="Choose model"
                visibleChoices={["GPT-5.4", "GPT-5.4 mini", "o4-mini"]}
                highlightedChoiceIndex={1}
              />
            </GalleryExample>

            <GalleryExample labelText="ModelAndReasoningSelectionPane for reasoning">
              <ModelAndReasoningSelectionPane
                headingText="Choose reasoning for GPT-5.4"
                visibleChoices={["Default", "Low", "Medium", "High"]}
                highlightedChoiceIndex={2}
              />
            </GalleryExample>

            <GalleryExample labelText="ToolApprovalRequestBlock">
              <ToolApprovalRequestBlock
                pendingToolCallDetail={{
                  toolName: "bash",
                  commandLine: "rm -rf build",
                  commandDescription: "Deletes the build directory",
                }}
                riskExplanation="This command is destructive and removes files from disk."
              />
            </GalleryExample>

            <GalleryExample labelText="ToolApprovalRequestBlock states by tool kind">
              <box flexDirection="column" gap={1} width="100%">
                <ToolApprovalRequestBlock pendingToolCallDetail={showcaseReadDetail} riskExplanation="Reads the requested file path from disk." />
                <ToolApprovalRequestBlock pendingToolCallDetail={showcaseGrepDetail} riskExplanation="Searches through local workspace contents." />
                <ToolApprovalRequestBlock pendingToolCallDetail={showcaseEditDetail} riskExplanation="Edits a tracked source file in place." />
                <ToolApprovalRequestBlock pendingToolCallDetail={showcaseBashDetail} riskExplanation="Runs a shell command in the workspace." />
                <ToolApprovalRequestBlock pendingToolCallDetail={showcaseTodoWriteDetail} riskExplanation="Updates the task list shown to the user." />
                <ToolApprovalRequestBlock pendingToolCallDetail={showcaseTaskDetail} riskExplanation="Dispatches a sub-agent with repository context." />
              </box>
            </GalleryExample>
          </GallerySection>

          <GallerySection sectionLabel="// chat screen" titleText="ChatScreen Branch Previews">
            <GalleryExample labelText="ChatScreen branch: loading models">
              <GalleryChatScreenShellPreview
                middleContent={
                  <box alignItems="center" flexGrow={1} justifyContent="center" minHeight={8}>
                    <text fg={chatScreenTheme.accentAmber}>Loading models...</text>
                  </box>
                }
                bottomContent={
                  <InputPanel
                    promptDraft="Pick a different model for the redesign pass"
                    promptDraftCursorOffset={9}
                    selectedPromptContextReferenceTexts={[]}
                    isPromptInputDisabled={true}
                    promptInputHintOverride="Selection is open. Press Esc to close it."
                    modeLabel="implementation"
                    modelIdentifier="gpt-5.4"
                    reasoningEffortLabel="default"
                    assistantResponseStatus="waiting_for_user_input"
                    totalContextTokensUsed={undefined}
                    contextWindowTokenCapacity={undefined}
                  />
                }
              />
            </GalleryExample>

            <GalleryExample labelText="ChatScreen branch: model loading error">
              <GalleryChatScreenShellPreview
                middleContent={
                  <ErrorBannerBlock
                    titleText="Could not load models"
                    errorText="missing client_version"
                    errorHintText="Press Esc to close."
                  />
                }
                bottomContent={
                  <InputPanel
                    promptDraft="Pick a different model for the redesign pass"
                    promptDraftCursorOffset={9}
                    selectedPromptContextReferenceTexts={[]}
                    isPromptInputDisabled={true}
                    promptInputHintOverride="Selection is open. Press Esc to close it."
                    modeLabel="implementation"
                    modelIdentifier="gpt-5.4"
                    reasoningEffortLabel="default"
                    assistantResponseStatus="waiting_for_user_input"
                    totalContextTokensUsed={undefined}
                    contextWindowTokenCapacity={undefined}
                  />
                }
              />
            </GalleryExample>

            <GalleryExample labelText="ChatScreen branch: shortcuts modal open">
              <GalleryChatScreenShellPreview
                middleContent={
                  <box alignItems="center" flexGrow={1} justifyContent="center" minHeight={16}>
                    <ShortcutsModal
                      onCloseRequested={() => {}}
                      availableModalRowCount={16}
                      terminalSizeTierForChatScreen={comfortableTerminalSizeTier}
                    />
                  </box>
                }
                bottomContent={
                  <InputPanel
                    promptDraft=""
                    promptDraftCursorOffset={0}
                    selectedPromptContextReferenceTexts={[]}
                    isPromptInputDisabled={false}
                    promptInputHintOverride="[ esc ] close shortcuts"
                    modeLabel="implementation"
                    modelIdentifier="gpt-5.4"
                    reasoningEffortLabel="default"
                    assistantResponseStatus="waiting_for_user_input"
                    totalContextTokensUsed={undefined}
                    contextWindowTokenCapacity={undefined}
                  />
                }
              />
            </GalleryExample>

            <GalleryExample labelText="ChatScreen branch: prompt context picker open">
              <GalleryChatScreenShellPreview
                middleContent={<GalleryTranscriptPreview />}
                bottomContent={
                  <box flexDirection="column" width="100%">
                    <PromptContextSelectionPane
                      promptContextCandidates={showcasePromptContextCandidates}
                      highlightedPromptContextCandidateIndex={1}
                    />
                    <InputPanel
                      promptDraft="Review @packages/tui/src/"
                      promptDraftCursorOffset={25}
                      selectedPromptContextReferenceTexts={[]}
                      isPromptInputDisabled={false}
                      promptInputHintOverride="@ picker · ↑ ↓ choose · enter insert · esc close"
                      modeLabel="implementation"
                      modelIdentifier="gpt-5.4"
                      reasoningEffortLabel="default"
                      assistantResponseStatus="waiting_for_user_input"
                      totalContextTokensUsed={undefined}
                      contextWindowTokenCapacity={undefined}
                    />
                  </box>
                }
              />
            </GalleryExample>

            <GalleryExample labelText="ChatScreen branch: waiting for tool approval">
              <GalleryChatScreenShellPreview
                middleContent={<GalleryTranscriptPreview />}
                bottomContent={
                  <box flexDirection="column" width="100%">
                    <ToolApprovalRequestBlock
                      pendingToolCallDetail={{ toolName: "bash", commandLine: "rm -rf build" }}
                      riskExplanation="This command is destructive."
                    />
                    <InputPanel
                      promptDraft=""
                      promptDraftCursorOffset={0}
                      selectedPromptContextReferenceTexts={[]}
                      isPromptInputDisabled={true}
                      promptInputHintOverride="approval required · [ y ] approve · [ n ] deny"
                      modeLabel="implementation"
                      modelIdentifier="gpt-5.4"
                      reasoningEffortLabel="default"
                      assistantResponseStatus="waiting_for_tool_approval"
                      totalContextTokensUsed={undefined}
                      contextWindowTokenCapacity={undefined}
                    />
                  </box>
                }
              />
            </GalleryExample>

            <GalleryExample labelText="ChatScreen branch: active transcript while streaming">
              <GalleryChatScreenShellPreview
                middleContent={<GalleryTranscriptPreview />}
                bottomContent={
                  <InputPanel
                    promptDraft="show me the live transcript"
                    promptDraftCursorOffset={26}
                    selectedPromptContextReferenceTexts={[]}
                    isPromptInputDisabled={true}
                    modeLabel="implementation"
                    modelIdentifier="gpt-5.4"
                    reasoningEffortLabel="high"
                    assistantResponseStatus="streaming_assistant_response"
                    totalContextTokensUsed={90500}
                    contextWindowTokenCapacity={128000}
                  />
                }
              />
            </GalleryExample>

            <GalleryExample labelText="ChatScreen branch: minimum tier shell">
              <GalleryChatScreenShellPreview
                middleContent={<GalleryTranscriptPreview />}
                bottomContent={
                  <MinimumHeightPromptStrip
                    promptDraft="tiny shell preview"
                    promptDraftCursorOffset={4}
                    selectedPromptContextReferenceTexts={[]}
                    isPromptInputDisabled={false}
                    assistantResponseStatus="waiting_for_user_input"
                  />
                }
              />
            </GalleryExample>
          </GallerySection>
        </box>
      </scrollbox>
    </box>
  );
}

function GalleryHero(): ReactNode {
  return (
    <box flexDirection="column" width="100%">
      <text fg={chatScreenTheme.accentCyan}>
        <b>{"Startup Component Gallery"}</b>
      </text>
      <box marginTop={1} width="100%">
        <text fg={chatScreenTheme.textSecondary}>
          {"Temporary redesign surface. This file and one ChatScreen branch can be deleted when the review is over."}
        </text>
      </box>
      <box marginTop={1} width="100%">
        <text fg={chatScreenTheme.textMuted}>
          {"The surrounding screen is the live ChatScreen shell. Everything below is rendered inside the startup viewport for visual review."}
        </text>
      </box>
    </box>
  );
}

function GallerySection(props: {
  sectionLabel: string;
  titleText: string;
  children: ReactNode;
}): ReactNode {
  return (
    <box flexDirection="column" marginTop={2} width="100%">
      <text fg={chatScreenTheme.accentGreen}>{props.sectionLabel}</text>
      <box marginTop={1} width="100%">
        <text fg={chatScreenTheme.textPrimary}>
          <b>{props.titleText}</b>
        </text>
      </box>
      <box backgroundColor={chatScreenTheme.borderSubtle} height={1} marginTop={1} width="100%" />
      <box flexDirection="column" marginTop={1} width="100%">
        {props.children}
      </box>
    </box>
  );
}

function GalleryChatScreenShellPreview(props: {
  middleContent: ReactNode;
  bottomContent: ReactNode;
}): ReactNode {
  return (
    <box borderColor={chatScreenTheme.border} borderStyle="rounded" border={true} flexDirection="column" width="100%">
      <TopBar workingDirectoryPath="~/Desktop/Projekty/buli" />
      <box flexDirection="column" minHeight={12} overflow="hidden" paddingX={2} paddingTop={1} width="100%">
        {props.middleContent}
      </box>
      <box flexDirection="column" width="100%">
        {props.bottomContent}
      </box>
    </box>
  );
}

function GalleryTranscriptPreview(): ReactNode {
  return (
    <box borderColor={chatScreenTheme.borderSubtle} borderStyle="rounded" border={true} flexDirection="column" paddingX={1} paddingY={1} width="100%">
      <ConversationMessageRow
        conversationMessage={showcaseConversationMessages[0]!}
        conversationMessageParts={showcaseConversationMessagePartsByMessageId["gallery-user-message"] ?? []}
      />
      <box marginTop={1} width="100%">
        <ConversationMessageRow
          conversationMessage={showcaseConversationMessages[1]!}
          conversationMessageParts={showcaseConversationMessagePartsByMessageId["gallery-assistant-message"] ?? []}
        />
      </box>
    </box>
  );
}

function GalleryExample(props: {
  labelText: string;
  children: ReactNode;
}): ReactNode {
  return (
    <box flexDirection="column" marginTop={1} width="100%">
      <text fg={chatScreenTheme.textDim}>{props.labelText}</text>
      <box
        borderColor={chatScreenTheme.borderSubtle}
        borderStyle="rounded"
        border={true}
        flexDirection="column"
        marginTop={1}
        paddingX={1}
        paddingY={1}
        width="100%"
      >
        {props.children}
      </box>
    </box>
  );
}
