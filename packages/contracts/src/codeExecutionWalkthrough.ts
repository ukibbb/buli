import { z } from "zod";

const CodeExecutionWalkthroughTextSchema = z.string().trim().min(1);
const CodeExecutionWalkthroughCodeTextSchema = z.string().min(1);

export const CodeExecutionWalkthroughKindSchema = z.enum(["source_walkthrough", "observed_runtime_trace"]);

export const CodeExecutionCodeExampleSchema = z
  .object({
    sourceFilePath: CodeExecutionWalkthroughTextSchema,
    sourceSymbolName: CodeExecutionWalkthroughTextSchema.optional(),
    startLineNumber: z.number().int().positive(),
    endLineNumber: z.number().int().positive(),
    languageLabel: CodeExecutionWalkthroughTextSchema.optional(),
    codeText: CodeExecutionWalkthroughCodeTextSchema,
    explanationText: CodeExecutionWalkthroughTextSchema.optional(),
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
    `${codeFence}${codeFenceInfo}`,
    codeExample.codeText,
    codeFence,
    "",
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
