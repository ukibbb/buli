import type { ReactNode } from "react";
import type {
  AssistantCodeExecutionWalkthroughConversationMessagePart,
  CodeExecutionCodeExample,
  CodeExecutionWalkthroughKind,
  CodeExecutionWalkthroughStep,
} from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "../glyphs.ts";
import { FencedCodeBlock, type FencedCodeBlockLine } from "../primitives/FencedCodeBlock.tsx";

export function AssistantCodeExecutionWalkthroughPartView(props: {
  assistantCodeExecutionWalkthroughConversationMessagePart: AssistantCodeExecutionWalkthroughConversationMessagePart;
}): ReactNode {
  const codeExecutionWalkthroughPart = props.assistantCodeExecutionWalkthroughConversationMessagePart;
  const stepCountLabel = codeExecutionWalkthroughPart.steps.length === 1
    ? "1 step"
    : `${codeExecutionWalkthroughPart.steps.length} steps`;

  return (
    <box
      backgroundColor={chatScreenTheme.learningSurfaceBg}
      borderColor={chatScreenTheme.accentCyan}
      borderStyle="rounded"
      flexDirection="column"
      paddingX={1}
      paddingY={1}
      width="100%"
    >
      <box flexDirection="row" justifyContent="space-between" width="100%">
        <box flexShrink={1} minWidth={0}>
          <text fg={chatScreenTheme.textPrimary}>
            <b>{codeExecutionWalkthroughPart.titleText}</b>
          </text>
        </box>
        <box flexShrink={0} marginLeft={1}>
          <text fg={chatScreenTheme.textMuted}>{stepCountLabel}</text>
        </box>
      </box>
      <box marginTop={1} width="100%">
        <text fg={chatScreenTheme.accentCyan}>{formatCodeExecutionWalkthroughKindLabel(codeExecutionWalkthroughPart.walkthroughKind)}</text>
      </box>
      {codeExecutionWalkthroughPart.summaryText !== undefined ? (
        <box marginTop={1} width="100%">
          <text fg={chatScreenTheme.textSecondary}>{codeExecutionWalkthroughPart.summaryText}</text>
        </box>
      ) : null}
      <box flexDirection="column" marginTop={1} width="100%">
        {codeExecutionWalkthroughPart.steps.map((walkthroughStep, walkthroughStepIndex) => (
          <CodeExecutionWalkthroughStepBlock
            key={`code-execution-walkthrough-step-${walkthroughStepIndex}`}
            stepNumber={walkthroughStepIndex + 1}
            walkthroughStep={walkthroughStep}
            {...(walkthroughStepIndex > 0 ? { marginTop: 1 } : {})}
          />
        ))}
      </box>
    </box>
  );
}

function CodeExecutionWalkthroughStepBlock(props: {
  stepNumber: number;
  walkthroughStep: CodeExecutionWalkthroughStep;
  marginTop?: number;
}): ReactNode {
  const { walkthroughStep } = props;
  return (
    <box flexDirection="column" {...(props.marginTop !== undefined ? { marginTop: props.marginTop } : {})} width="100%">
      <box flexDirection="row" width="100%">
        <box flexShrink={0} marginRight={1} width={3}>
          <text fg={chatScreenTheme.accentCyan}>{`${props.stepNumber}.`.padStart(3, " ")}</text>
        </box>
        <box flexShrink={0} marginRight={1}>
          <text fg={chatScreenTheme.accentPrimaryMuted}>{glyphs.chevronRight}</text>
        </box>
        <box flexShrink={1} minWidth={0}>
          <text fg={chatScreenTheme.textPrimary}>{walkthroughStep.stepTitle}</text>
        </box>
      </box>
      <box flexDirection="column" paddingLeft={5} width="100%">
        <OptionalWalkthroughDetailLine labelText="when" detailText={walkthroughStep.whenText} />
        <OptionalWalkthroughDetailLine labelText="what happens" detailText={walkthroughStep.whatHappensText} />
        <OptionalWalkthroughDetailLine labelText="data/state" detailText={walkthroughStep.dataStateText} />
        <OptionalWalkthroughDetailLine labelText="decision" detailText={walkthroughStep.decisionText} />
        <OptionalWalkthroughDetailLine labelText="state change" detailText={walkthroughStep.stateChangeText} />
        <OptionalWalkthroughDetailLine labelText="next" detailText={walkthroughStep.nextStepText} />
        <box flexDirection="column" marginTop={1} width="100%">
          {walkthroughStep.codeExamples.map((codeExample, codeExampleIndex) => (
            <CodeExecutionCodeExampleBlock
              key={`code-example-${codeExampleIndex}`}
              codeExample={codeExample}
              {...(codeExampleIndex > 0 ? { marginTop: 1 } : {})}
            />
          ))}
        </box>
      </box>
    </box>
  );
}

function OptionalWalkthroughDetailLine(props: { labelText: string; detailText?: string | undefined }): ReactNode {
  if (props.detailText === undefined) {
    return null;
  }

  return (
    <box width="100%">
      <text fg={chatScreenTheme.textDim}>{`${props.labelText}: `}</text>
      <text fg={chatScreenTheme.textSecondary}>{props.detailText}</text>
    </box>
  );
}

function CodeExecutionCodeExampleBlock(props: {
  codeExample: CodeExecutionCodeExample;
  marginTop?: number;
}): ReactNode {
  const { codeExample } = props;
  return (
    <box flexDirection="column" {...(props.marginTop !== undefined ? { marginTop: props.marginTop } : {})} width="100%">
      <box width="100%">
        <text>
          <span fg={chatScreenTheme.accentCyan}>{formatCodeExampleSourceRangeLabel(codeExample)}</span>
          {codeExample.sourceSymbolName ? <span fg={chatScreenTheme.textMuted}>{` · ${codeExample.sourceSymbolName}`}</span> : null}
        </text>
      </box>
      {codeExample.explanationText !== undefined ? (
        <box width="100%">
          <text fg={chatScreenTheme.textDim}>{codeExample.explanationText}</text>
        </box>
      ) : null}
      <box
        border={["left"]}
        borderColor={chatScreenTheme.textDim}
        flexDirection="column"
        marginTop={1}
        paddingLeft={1}
        width="100%"
      >
        <FencedCodeBlock
          variant="embedded"
          filePath={codeExample.sourceFilePath}
          showLabel={false}
          {...(codeExample.languageLabel !== undefined ? { languageLabel: codeExample.languageLabel } : {})}
          codeLines={buildCodeExampleLines(codeExample)}
        />
      </box>
    </box>
  );
}

function formatCodeExecutionWalkthroughKindLabel(walkthroughKind: CodeExecutionWalkthroughKind): string {
  return walkthroughKind === "observed_runtime_trace" ? "observed runtime trace" : "source walkthrough";
}

function formatCodeExampleSourceRangeLabel(codeExample: CodeExecutionCodeExample): string {
  const lineRange = codeExample.startLineNumber === codeExample.endLineNumber
    ? `${codeExample.startLineNumber}`
    : `${codeExample.startLineNumber}-${codeExample.endLineNumber}`;
  return `${codeExample.sourceFilePath}:${lineRange}`;
}

function buildCodeExampleLines(codeExample: CodeExecutionCodeExample): FencedCodeBlockLine[] {
  return codeExample.codeText.split("\n").map((lineText, lineIndex) => ({
    lineNumber: codeExample.startLineNumber + lineIndex,
    lineText,
  }));
}
