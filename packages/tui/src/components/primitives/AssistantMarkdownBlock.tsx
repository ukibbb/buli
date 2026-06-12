import { memo, useMemo, type ReactNode } from "react";
import { RGBA, SyntaxStyle } from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import {
  formatAssistantMarkdownTaskListMarkers,
  prepareAssistantMarkdownTextForRendering,
  repeatAssistantMarkdownChromeRule,
} from "./assistantMarkdownTextFormatting.ts";
import { createAssistantMarkdownUnifiedRenderNode } from "./assistantMarkdownUnifiedRenderNode.ts";
import { assistantMarkdownSyntaxStyle } from "./codeRenderingTheme.ts";
import {
  assistantMarkdownTableOptions,
  defaultAssistantMarkdownTerminalColumnCount,
} from "./assistantMarkdownTerminalTheme.ts";
import { openTuiSharedTreeSitterClient } from "./openTuiSharedTreeSitterClient.ts";

// The whole assistant text part is handed to one OpenTUI `<markdown>` element, relying
// on its incremental parser and in-place block reconciliation; buli-specific chrome
// (fences, diffs, callouts, prose decoration) is applied through `renderNode` in
// `assistantMarkdownUnifiedRenderNode.ts`. Measured by the
// `assistant-markdown-unified-renderable` performance scenario.
export type AssistantMarkdownBlockProps = {
  markdownText: string;
  isStreaming: boolean;
  horizontalRuleColor: string;
  terminalColumnCount?: number | undefined;
};

function AssistantMarkdownBlockComponent(props: AssistantMarkdownBlockProps): ReactNode {
  const terminalColumnCount = props.terminalColumnCount ?? defaultAssistantMarkdownTerminalColumnCount;
  const markdownChromeColumnCount = Math.max(20, terminalColumnCount - 4);
  const horizontalRuleText = useMemo(
    () => repeatAssistantMarkdownChromeRule({ availableColumnCount: markdownChromeColumnCount }),
    [markdownChromeColumnCount],
  );
  const horizontalRuleSyntaxStyle = useMemo(
    () => SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(props.horizontalRuleColor) } }),
    [props.horizontalRuleColor],
  );
  const unifiedChromeRenderNode = useMemo(
    () => createAssistantMarkdownUnifiedRenderNode({ horizontalRuleSyntaxStyle, horizontalRuleText }),
    [horizontalRuleSyntaxStyle, horizontalRuleText],
  );

  return (
    <markdown
      bg={chatScreenTheme.bg}
      conceal={true}
      concealCode={false}
      content={formatAssistantMarkdownTaskListMarkers(
        prepareAssistantMarkdownTextForRendering(props.markdownText, props.isStreaming),
      )}
      fg={chatScreenTheme.textPrimary}
      internalBlockMode="top-level"
      renderNode={unifiedChromeRenderNode}
      // Permanently streaming, like opencode's session view: flipping the flag on
      // completion would re-render the whole block tree once just to "finalize" a
      // trailing block whose content has already stopped changing. Code fence
      // highlight finalization is independent of this flag — the fence renderers
      // derive it from the closing fence in token.raw.
      streaming={true}
      syntaxStyle={assistantMarkdownSyntaxStyle}
      tableOptions={assistantMarkdownTableOptions}
      treeSitterClient={openTuiSharedTreeSitterClient}
      width="100%"
    />
  );
}

function areAssistantMarkdownBlockPropsEqual(
  previousProps: AssistantMarkdownBlockProps,
  nextProps: AssistantMarkdownBlockProps,
): boolean {
  return previousProps.markdownText === nextProps.markdownText &&
    previousProps.isStreaming === nextProps.isStreaming &&
    previousProps.horizontalRuleColor === nextProps.horizontalRuleColor &&
    previousProps.terminalColumnCount === nextProps.terminalColumnCount;
}

export const AssistantMarkdownBlock = memo(AssistantMarkdownBlockComponent, areAssistantMarkdownBlockPropsEqual);
