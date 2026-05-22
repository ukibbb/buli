import { z } from "zod";

const CodeExecutionWalkthroughTextSchema = z.string().trim().min(1);
const CodeExecutionWalkthroughCodeTextSchema = z.string().min(1);

export const CodeExecutionWalkthroughKindSchema = z.enum(["source_walkthrough", "observed_runtime_trace"]);

export const CodeExecutionLineExplanationSchema = z
  .object({
    lineNumber: z.number().int().positive(),
    explanationText: CodeExecutionWalkthroughTextSchema,
    projectModelText: CodeExecutionWalkthroughTextSchema.optional(),
    frameworkLifecycleText: CodeExecutionWalkthroughTextSchema.optional(),
    languageMechanicsText: CodeExecutionWalkthroughTextSchema.optional(),
    plainPseudocodeText: CodeExecutionWalkthroughTextSchema.optional(),
    uncertaintyText: CodeExecutionWalkthroughTextSchema.optional(),
  })
  .strict();

export const CodeExecutionCodeExampleSchema = z
  .object({
    sourceFilePath: CodeExecutionWalkthroughTextSchema,
    sourceSymbolName: CodeExecutionWalkthroughTextSchema.optional(),
    startLineNumber: z.number().int().positive(),
    endLineNumber: z.number().int().positive(),
    languageLabel: CodeExecutionWalkthroughTextSchema.optional(),
    codeText: CodeExecutionWalkthroughCodeTextSchema,
    explanationText: CodeExecutionWalkthroughTextSchema.optional(),
    lineExplanations: z.array(CodeExecutionLineExplanationSchema).optional(),
  })
  .strict()
  .superRefine((codeExample, context) => {
    if (codeExample.endLineNumber < codeExample.startLineNumber) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endLineNumber"],
        message: "endLineNumber must be greater than or equal to startLineNumber",
      });
    }

    for (const lineExplanation of codeExample.lineExplanations ?? []) {
      if (lineExplanation.lineNumber < codeExample.startLineNumber || lineExplanation.lineNumber > codeExample.endLineNumber) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lineExplanations"],
          message: "lineExplanations lineNumber must be inside the code example line range",
        });
      }
    }
  });

export const CodeExecutionWalkthroughStepSchema = z
  .object({
    stepTitle: CodeExecutionWalkthroughTextSchema,
    whenText: CodeExecutionWalkthroughTextSchema.optional(),
    whatHappensText: CodeExecutionWalkthroughTextSchema,
    dataStateText: CodeExecutionWalkthroughTextSchema.optional(),
    decisionText: CodeExecutionWalkthroughTextSchema.optional(),
    stateChangeText: CodeExecutionWalkthroughTextSchema.optional(),
    nextStepText: CodeExecutionWalkthroughTextSchema.optional(),
    codeExamples: z.array(CodeExecutionCodeExampleSchema).min(1),
  })
  .strict();

export const CodeExecutionWalkthroughSchema = z
  .object({
    titleText: CodeExecutionWalkthroughTextSchema,
    summaryText: CodeExecutionWalkthroughTextSchema.optional(),
    walkthroughKind: CodeExecutionWalkthroughKindSchema,
    steps: z.array(CodeExecutionWalkthroughStepSchema).min(1),
  })
  .strict();

export type CodeExecutionWalkthroughKind = z.infer<typeof CodeExecutionWalkthroughKindSchema>;
export type CodeExecutionLineExplanation = z.infer<typeof CodeExecutionLineExplanationSchema>;
export type CodeExecutionCodeExample = z.infer<typeof CodeExecutionCodeExampleSchema>;
export type CodeExecutionWalkthroughStep = z.infer<typeof CodeExecutionWalkthroughStepSchema>;
export type CodeExecutionWalkthrough = z.infer<typeof CodeExecutionWalkthroughSchema>;

export function formatCodeExecutionWalkthroughAsMarkdownText(
  codeExecutionWalkthrough: CodeExecutionWalkthrough,
): string {
  return [
    `**${codeExecutionWalkthrough.titleText}**`,
    ...(codeExecutionWalkthrough.summaryText !== undefined ? [codeExecutionWalkthrough.summaryText] : []),
    `Walkthrough kind: ${formatCodeExecutionWalkthroughKind(codeExecutionWalkthrough.walkthroughKind)}`,
    "",
    ...codeExecutionWalkthrough.steps.flatMap((walkthroughStep, walkthroughStepIndex) =>
      formatCodeExecutionWalkthroughStepAsMarkdown(walkthroughStep, walkthroughStepIndex)
    ),
  ].join("\n");
}

function formatCodeExecutionWalkthroughKind(walkthroughKind: CodeExecutionWalkthroughKind): string {
  return walkthroughKind === "observed_runtime_trace" ? "observed runtime trace" : "source walkthrough";
}

function formatCodeExecutionWalkthroughStepAsMarkdown(
  walkthroughStep: CodeExecutionWalkthroughStep,
  walkthroughStepIndex: number,
): string[] {
  return [
    `${walkthroughStepIndex + 1}. ${walkthroughStep.stepTitle}`,
    ...(walkthroughStep.whenText !== undefined ? [`When: ${walkthroughStep.whenText}`] : []),
    `What happens: ${walkthroughStep.whatHappensText}`,
    ...(walkthroughStep.dataStateText !== undefined ? [`Data/state: ${walkthroughStep.dataStateText}`] : []),
    ...(walkthroughStep.decisionText !== undefined ? [`Decision: ${walkthroughStep.decisionText}`] : []),
    ...(walkthroughStep.stateChangeText !== undefined ? [`State change: ${walkthroughStep.stateChangeText}`] : []),
    ...(walkthroughStep.nextStepText !== undefined ? [`Next: ${walkthroughStep.nextStepText}`] : []),
    "",
    ...walkthroughStep.codeExamples.flatMap(formatCodeExecutionCodeExampleAsMarkdown),
  ];
}

function formatCodeExecutionCodeExampleAsMarkdown(codeExample: CodeExecutionCodeExample): string[] {
  const codeFence = createMarkdownFenceForCodeText(codeExample.codeText);
  const codeFenceInfo = [
    codeExample.languageLabel ?? "text",
    `path=${JSON.stringify(formatCodeExecutionCodeExampleSourceRange(codeExample))}`,
  ].join(" ");
  return [
    `Source: ${formatCodeExecutionCodeExampleSourceRange(codeExample)}`,
    ...(codeExample.explanationText !== undefined ? [`Why it matters: ${codeExample.explanationText}`] : []),
    ...formatCodeExecutionLineExplanationsAsMarkdown(codeExample),
    `${codeFence}${codeFenceInfo}`,
    codeExample.codeText,
    codeFence,
    "",
  ];
}

function formatCodeExecutionLineExplanationsAsMarkdown(codeExample: CodeExecutionCodeExample): string[] {
  if (!codeExample.lineExplanations || codeExample.lineExplanations.length === 0) {
    return [];
  }

  return [
    "Line-by-line explanation:",
    ...codeExample.lineExplanations.flatMap((lineExplanation) => [
      `- Line ${lineExplanation.lineNumber}: ${lineExplanation.explanationText}`,
      ...(lineExplanation.projectModelText !== undefined ? [`  Project model: ${lineExplanation.projectModelText}`] : []),
      ...(lineExplanation.frameworkLifecycleText !== undefined ? [`  Framework/lifecycle: ${lineExplanation.frameworkLifecycleText}`] : []),
      ...(lineExplanation.languageMechanicsText !== undefined ? [`  Language mechanics: ${lineExplanation.languageMechanicsText}`] : []),
      ...(lineExplanation.plainPseudocodeText !== undefined ? [`  Plain pseudocode: ${lineExplanation.plainPseudocodeText}`] : []),
      ...(lineExplanation.uncertaintyText !== undefined ? [`  Not verified: ${lineExplanation.uncertaintyText}`] : []),
    ]),
  ];
}

function formatCodeExecutionCodeExampleSourceRange(codeExample: CodeExecutionCodeExample): string {
  const lineRange = codeExample.startLineNumber === codeExample.endLineNumber
    ? `${codeExample.startLineNumber}`
    : `${codeExample.startLineNumber}-${codeExample.endLineNumber}`;
  return `${codeExample.sourceFilePath}:${lineRange}`;
}

function createMarkdownFenceForCodeText(codeText: string): string {
  const longestBacktickRunLength = Math.max(
    0,
    ...Array.from(codeText.matchAll(/`+/g), (backtickMatch) => backtickMatch[0].length),
  );
  return "`".repeat(Math.max(3, longestBacktickRunLength + 1));
}
