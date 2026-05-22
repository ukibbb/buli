import { useState, type ReactNode } from "react";
import type {
  AssistantCodeExecutionWalkthroughConversationMessagePart,
  CodeExecutionCodeExample,
  CodeExecutionLineExplanation,
  CodeExecutionWalkthroughKind,
  CodeExecutionWalkthroughStep,
} from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { createClickableControlMouseDownHandler } from "../primitives/clickableControl.ts";

export function AssistantCodeExecutionWalkthroughPartView(props: {
  assistantCodeExecutionWalkthroughConversationMessagePart: AssistantCodeExecutionWalkthroughConversationMessagePart;
}): ReactNode {
  const codeExecutionWalkthroughPart = props.assistantCodeExecutionWalkthroughConversationMessagePart;
  const [isWalkthroughExpanded, setIsWalkthroughExpanded] = useState(false);
  const stepCountLabel = codeExecutionWalkthroughPart.steps.length === 1
    ? "1 step"
    : `${codeExecutionWalkthroughPart.steps.length} steps`;
  const disclosureLabel = isWalkthroughExpanded ? "[-]" : "[+]";

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
        <box
          flexShrink={1}
          minWidth={0}
          onMouseDown={createClickableControlMouseDownHandler(() => {
            setIsWalkthroughExpanded((currentIsWalkthroughExpanded) => !currentIsWalkthroughExpanded);
          })}
        >
          <text fg={chatScreenTheme.textPrimary} selectable={false}>
            <span fg={chatScreenTheme.accentCyan}>{`${disclosureLabel} `}</span>
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
      {isWalkthroughExpanded ? (
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
      ) : (
        <CodeExecutionWalkthroughCollapsedStepList walkthroughSteps={codeExecutionWalkthroughPart.steps} />
      )}
    </box>
  );
}

function CodeExecutionWalkthroughCollapsedStepList(props: {
  walkthroughSteps: readonly CodeExecutionWalkthroughStep[];
}): ReactNode {
  return (
    <box flexDirection="column" marginTop={1} paddingLeft={1} width="100%">
      {props.walkthroughSteps.map((walkthroughStep, walkthroughStepIndex) => (
        <box flexDirection="row" key={`collapsed-code-execution-walkthrough-step-${walkthroughStepIndex}`} width="100%">
          <box flexShrink={0} marginRight={1} width={3}>
            <text fg={chatScreenTheme.accentCyan}>{`${walkthroughStepIndex + 1}.`.padStart(3, " ")}</text>
          </box>
          <box flexShrink={1} minWidth={0}>
            <text fg={chatScreenTheme.textPrimary}>{walkthroughStep.stepTitle}</text>
          </box>
        </box>
      ))}
      <box marginTop={1} width="100%">
        <text fg={chatScreenTheme.textDim}>expand to render source evidence</text>
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
        <box flexShrink={1} minWidth={0}>
          <text fg={chatScreenTheme.textPrimary}>{walkthroughStep.stepTitle}</text>
        </box>
      </box>
      <box flexDirection="column" paddingLeft={4} width="100%">
        <box width="100%">
          <text fg={chatScreenTheme.textSecondary} wrapMode="word" width="100%">
            {buildWalkthroughStepNarrativeText(walkthroughStep)}
          </text>
        </box>
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

function CodeExecutionCodeExampleBlock(props: {
  codeExample: CodeExecutionCodeExample;
  marginTop?: number;
}): ReactNode {
  const { codeExample } = props;
  const annotatedCodeExampleLines = buildAnnotatedCodeExampleLines(codeExample);
  const lineNumberGutterWidth = computeCodeExampleLineNumberGutterWidth(annotatedCodeExampleLines);
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
          <text fg={chatScreenTheme.textSecondary} wrapMode="word" width="100%">{codeExample.explanationText}</text>
        </box>
      ) : null}
      <box
        border={["left"]}
        borderColor={chatScreenTheme.accentPrimaryMuted}
        flexDirection="column"
        marginTop={1}
        paddingLeft={1}
        width="100%"
      >
        {annotatedCodeExampleLines.map((annotatedCodeExampleLine, index) => (
          <AnnotatedCodeExampleLineBlock
            annotatedCodeExampleLine={annotatedCodeExampleLine}
            key={`annotated-code-example-line-${index}`}
            lineNumberGutterWidth={lineNumberGutterWidth}
          />
        ))}
      </box>
    </box>
  );
}

type AnnotatedCodeExampleLine = {
  lineNumber: number;
  lineText: string;
  lineExplanation?: CodeExecutionLineExplanation | undefined;
};

function AnnotatedCodeExampleLineBlock(props: {
  annotatedCodeExampleLine: AnnotatedCodeExampleLine;
  lineNumberGutterWidth: number;
}): ReactNode {
  const { annotatedCodeExampleLine } = props;
  return (
    <box flexDirection="column" width="100%">
      <box flexDirection="row" width="100%">
        <box flexShrink={0} marginRight={1} width={props.lineNumberGutterWidth}>
          <text fg={chatScreenTheme.textDim}>{String(annotatedCodeExampleLine.lineNumber).padStart(props.lineNumberGutterWidth, " ")}</text>
        </box>
        <box flexShrink={1} minWidth={0} overflow="hidden" width="100%">
          <text fg={chatScreenTheme.textPrimary} truncate={true} wrapMode="none" width="100%">
            {annotatedCodeExampleLine.lineText}
          </text>
        </box>
      </box>
      {annotatedCodeExampleLine.lineExplanation ? (
        <LineExplanationBlock
          lineExplanation={annotatedCodeExampleLine.lineExplanation}
          paddingLeft={props.lineNumberGutterWidth + 1}
        />
      ) : null}
    </box>
  );
}

function LineExplanationBlock(props: {
  lineExplanation: CodeExecutionLineExplanation;
  paddingLeft: number;
}): ReactNode {
  const { lineExplanation } = props;
  return (
    <box flexDirection="column" paddingLeft={props.paddingLeft} width="100%">
      <CodeExplanationCommentLine labelText="explain" detailText={lineExplanation.explanationText} labelColor={chatScreenTheme.textSecondary} />
      <OptionalCodeExplanationCommentLine labelText="project model" detailText={lineExplanation.projectModelText} labelColor={chatScreenTheme.accentCyan} />
      <OptionalCodeExplanationCommentLine labelText="framework lifecycle" detailText={lineExplanation.frameworkLifecycleText} labelColor={chatScreenTheme.accentPurple} />
      <OptionalCodeExplanationCommentLine labelText="language mechanics" detailText={lineExplanation.languageMechanicsText} labelColor={chatScreenTheme.accentAmber} />
      <OptionalCodeExplanationCommentLine labelText="plain pseudocode" detailText={lineExplanation.plainPseudocodeText} labelColor={chatScreenTheme.accentGreen} />
      <OptionalCodeExplanationCommentLine labelText="not verified" detailText={lineExplanation.uncertaintyText} labelColor={chatScreenTheme.accentRed} />
    </box>
  );
}

function OptionalCodeExplanationCommentLine(props: {
  labelText: string;
  detailText?: string | undefined;
  labelColor: string;
}): ReactNode {
  if (props.detailText === undefined) {
    return null;
  }

  return <CodeExplanationCommentLine labelText={props.labelText} detailText={props.detailText} labelColor={props.labelColor} />;
}

function CodeExplanationCommentLine(props: {
  labelText: string;
  detailText: string;
  labelColor: string;
}): ReactNode {
  return (
    <box width="100%">
      <text wrapMode="word" width="100%">
        <span fg={chatScreenTheme.textDim}>// </span>
        <span fg={props.labelColor}>{`${props.labelText}: `}</span>
        <span fg={chatScreenTheme.textSecondary}>{props.detailText}</span>
      </text>
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

function buildAnnotatedCodeExampleLines(codeExample: CodeExecutionCodeExample): AnnotatedCodeExampleLine[] {
  const lineExplanationByLineNumber = new Map(
    (codeExample.lineExplanations ?? []).map((lineExplanation) => [lineExplanation.lineNumber, lineExplanation]),
  );
  return codeExample.codeText.split("\n").map((lineText, lineIndex) => {
    const lineNumber = codeExample.startLineNumber + lineIndex;
    return {
      lineNumber,
      lineText,
      ...(lineExplanationByLineNumber.has(lineNumber)
        ? { lineExplanation: lineExplanationByLineNumber.get(lineNumber) }
        : {}),
    };
  });
}

function computeCodeExampleLineNumberGutterWidth(annotatedCodeExampleLines: readonly AnnotatedCodeExampleLine[]): number {
  return Math.max(2, String(annotatedCodeExampleLines.at(-1)?.lineNumber ?? 1).length);
}

function buildWalkthroughStepNarrativeText(walkthroughStep: CodeExecutionWalkthroughStep): string {
  return [
    walkthroughStep.whenText !== undefined
      ? `${capitalizeFirstCharacter(trimTrailingSentencePunctuation(walkthroughStep.whenText))}, ${lowercaseFirstCharacter(walkthroughStep.whatHappensText)}`
      : walkthroughStep.whatHappensText,
    ...(walkthroughStep.dataStateText !== undefined ? [`The important data/state is: ${walkthroughStep.dataStateText}`] : []),
    ...(walkthroughStep.decisionText !== undefined ? [`The decision point is: ${walkthroughStep.decisionText}`] : []),
    ...(walkthroughStep.stateChangeText !== undefined ? [`State changes like this: ${walkthroughStep.stateChangeText}`] : []),
    ...(walkthroughStep.nextStepText !== undefined ? [`Next: ${walkthroughStep.nextStepText}`] : []),
  ].map(ensureSentencePunctuation).join(" ");
}

function ensureSentencePunctuation(text: string): string {
  const trimmedText = text.trim();
  return /[.!?`]$/.test(trimmedText) ? trimmedText : `${trimmedText}.`;
}

function trimTrailingSentencePunctuation(text: string): string {
  return text.trim().replace(/[.!?]+$/, "");
}

function lowercaseFirstCharacter(text: string): string {
  const trimmedText = text.trim();
  const firstCharacter = trimmedText[0];
  if (!firstCharacter || firstCharacter.toLowerCase() === firstCharacter) {
    return trimmedText;
  }

  return `${firstCharacter.toLowerCase()}${trimmedText.slice(1)}`;
}

function capitalizeFirstCharacter(text: string): string {
  const trimmedText = text.trim();
  const firstCharacter = trimmedText[0];
  if (!firstCharacter || firstCharacter.toUpperCase() === firstCharacter) {
    return trimmedText;
  }

  return `${firstCharacter.toUpperCase()}${trimmedText.slice(1)}`;
}
