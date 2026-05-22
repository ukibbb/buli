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
import { FencedCodeBlock, type FencedCodeBlockLine } from "../primitives/FencedCodeBlock.tsx";

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
  const explainedCodeBlockLines = buildExplainedCodeBlockLines(codeExample);
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
        <FencedCodeBlock
          variant="embedded"
          codeLines={explainedCodeBlockLines}
          filePath={codeExample.sourceFilePath}
          {...(codeExample.languageLabel !== undefined ? { languageLabel: codeExample.languageLabel } : {})}
          showLabel={false}
          wrapMode="char"
        />
      </box>
    </box>
  );
}

function formatCodeExecutionWalkthroughKindLabel(walkthroughKind: CodeExecutionWalkthroughKind): string {
  return walkthroughKind === "observed_runtime_trace" ? "observed runtime trace" : "source evidence";
}

function formatCodeExampleSourceRangeLabel(codeExample: CodeExecutionCodeExample): string {
  const lineRange = codeExample.startLineNumber === codeExample.endLineNumber
    ? `${codeExample.startLineNumber}`
    : `${codeExample.startLineNumber}-${codeExample.endLineNumber}`;
  return `${codeExample.sourceFilePath}:${lineRange}`;
}

function buildExplainedCodeBlockLines(codeExample: CodeExecutionCodeExample): FencedCodeBlockLine[] {
  const lineExplanationByLineNumber = new Map(
    (codeExample.lineExplanations ?? []).map((lineExplanation) => [lineExplanation.lineNumber, lineExplanation]),
  );
  const commentSyntax = resolveCodeExplanationCommentSyntax(codeExample);
  const explainedCodeBlockLines: FencedCodeBlockLine[] = [];

  for (const [lineIndex, lineText] of codeExample.codeText.split("\n").entries()) {
    const lineNumber = codeExample.startLineNumber + lineIndex;
    const lineExplanation = lineExplanationByLineNumber.get(lineNumber);

    if (lineExplanation !== undefined) {
      explainedCodeBlockLines.push(...buildCodeExplanationCommentLines(lineExplanation, commentSyntax));
    }

    explainedCodeBlockLines.push({
      lineNumber,
      lineText,
    });
  }

  return explainedCodeBlockLines;
}

type CodeExplanationCommentSyntax =
  | { syntaxKind: "lineComment"; linePrefix: string }
  | { syntaxKind: "blockComment"; openingText: string; closingText: string };

type CodeExplanationLayer = {
  labelText: string;
  detailText: string;
};

const codeExplanationCommentWrapColumnCount = 96;

function buildCodeExplanationCommentLines(
  lineExplanation: CodeExecutionLineExplanation,
  commentSyntax: CodeExplanationCommentSyntax,
): FencedCodeBlockLine[] {
  return buildCodeExplanationLayers(lineExplanation).flatMap((codeExplanationLayer) =>
    wrapCodeExplanationCommentLayer(codeExplanationLayer, commentSyntax).map((lineText) => ({ lineText }))
  );
}

function buildCodeExplanationLayers(lineExplanation: CodeExecutionLineExplanation): CodeExplanationLayer[] {
  return [
    { labelText: "explain", detailText: lineExplanation.explanationText },
    ...(lineExplanation.projectModelText !== undefined ? [{ labelText: "project model", detailText: lineExplanation.projectModelText }] : []),
    ...(lineExplanation.frameworkLifecycleText !== undefined ? [{ labelText: "framework lifecycle", detailText: lineExplanation.frameworkLifecycleText }] : []),
    ...(lineExplanation.languageMechanicsText !== undefined ? [{ labelText: "language mechanics", detailText: lineExplanation.languageMechanicsText }] : []),
    ...(lineExplanation.plainPseudocodeText !== undefined ? [{ labelText: "plain pseudocode", detailText: lineExplanation.plainPseudocodeText }] : []),
    ...(lineExplanation.uncertaintyText !== undefined ? [{ labelText: "not verified", detailText: lineExplanation.uncertaintyText }] : []),
  ];
}

function wrapCodeExplanationCommentLayer(
  codeExplanationLayer: CodeExplanationLayer,
  commentSyntax: CodeExplanationCommentSyntax,
): string[] {
  const firstLinePrefix = `${codeExplanationLayer.labelText}: `;
  const wrappedDetailLines = wrapTextForCodeExplanationComment(
    codeExplanationLayer.detailText,
    Math.max(20, codeExplanationCommentWrapColumnCount - firstLinePrefix.length),
  );
  if (commentSyntax.syntaxKind === "blockComment") {
    return wrappedDetailLines.map((wrappedDetailLine, wrappedDetailLineIndex) => {
      const lineBody = wrappedDetailLineIndex === 0
        ? `${firstLinePrefix}${wrappedDetailLine}`
        : `  ${wrappedDetailLine}`;
      return `${commentSyntax.openingText} ${lineBody} ${commentSyntax.closingText}`;
    });
  }

  return wrappedDetailLines.map((wrappedDetailLine, wrappedDetailLineIndex) => {
    const lineBody = wrappedDetailLineIndex === 0
      ? `${firstLinePrefix}${wrappedDetailLine}`
      : `  ${wrappedDetailLine}`;
    return `${commentSyntax.linePrefix} ${lineBody}`;
  });
}

function wrapTextForCodeExplanationComment(text: string, maximumLineLength: number): string[] {
  const normalizedText = text.trim().replace(/\s+/g, " ");
  if (normalizedText.length <= maximumLineLength) {
    return [normalizedText];
  }

  const wrappedLines: string[] = [];
  let currentLine = "";
  for (const word of normalizedText.split(" ")) {
    if (word.length > maximumLineLength) {
      if (currentLine.length > 0) {
        wrappedLines.push(currentLine);
        currentLine = "";
      }
      wrappedLines.push(word);
      continue;
    }

    const nextLine = currentLine.length === 0 ? word : `${currentLine} ${word}`;
    if (nextLine.length > maximumLineLength) {
      wrappedLines.push(currentLine);
      currentLine = word;
      continue;
    }

    currentLine = nextLine;
  }

  if (currentLine.length > 0) {
    wrappedLines.push(currentLine);
  }

  return wrappedLines.length > 0 ? wrappedLines : [normalizedText];
}

function resolveCodeExplanationCommentSyntax(codeExample: CodeExecutionCodeExample): CodeExplanationCommentSyntax {
  const sourceLanguageHints = buildSourceLanguageHintsForCommentSyntax(codeExample);

  if (sourceLanguageHints.some(isHtmlLikeSourceLanguageHint)) {
    return { syntaxKind: "blockComment", openingText: "<!--", closingText: "-->" };
  }

  if (sourceLanguageHints.some(isSqlOrLuaSourceLanguageHint)) {
    return { syntaxKind: "lineComment", linePrefix: "--" };
  }

  if (sourceLanguageHints.some(isHashCommentSourceLanguageHint)) {
    return { syntaxKind: "lineComment", linePrefix: "#" };
  }

  return { syntaxKind: "lineComment", linePrefix: "//" };
}

function isHashCommentSourceLanguageHint(sourceLanguageHint: string): boolean {
  return hashCommentSourceLanguageHints.has(sourceLanguageHint);
}

function isSqlOrLuaSourceLanguageHint(sourceLanguageHint: string): boolean {
  return sqlOrLuaSourceLanguageHints.has(sourceLanguageHint);
}

function isHtmlLikeSourceLanguageHint(sourceLanguageHint: string): boolean {
  return htmlLikeSourceLanguageHints.has(sourceLanguageHint);
}

const hashCommentSourceLanguageHints = new Set([
  "bash",
  "dockerfile",
  "fish",
  "makefile",
  "ps1",
  "py",
  "python",
  "rb",
  "ruby",
  "sh",
  "toml",
  "yaml",
  "yml",
  "zsh",
]);

const sqlOrLuaSourceLanguageHints = new Set(["lua", "sql"]);

const htmlLikeSourceLanguageHints = new Set([
  "html",
  "markdown",
  "md",
  "mdx",
  "svg",
  "xml",
]);

function buildSourceLanguageHintsForCommentSyntax(codeExample: CodeExecutionCodeExample): string[] {
  const sourceFileName = codeExample.sourceFilePath.split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
  const sourceFileExtension = readSourceFileExtension(sourceFileName);
  return [
    codeExample.languageLabel?.trim().toLowerCase(),
    sourceFileExtension,
    sourceFileName,
  ].filter((sourceLanguageHint): sourceLanguageHint is string => sourceLanguageHint !== undefined && sourceLanguageHint.length > 0);
}

function readSourceFileExtension(sourceFileName: string): string | undefined {
  const finalDotIndex = sourceFileName.lastIndexOf(".");
  if (finalDotIndex === -1 || finalDotIndex === sourceFileName.length - 1) {
    return undefined;
  }

  return sourceFileName.slice(finalDotIndex + 1);
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
