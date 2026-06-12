import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PerformanceScenario } from "../../model/performanceScenario.ts";
import { readVisibleFunctionCallOutputText } from "../evalRequestInspection.ts";
import {
  buildEditToolArgumentsJsonText,
  buildReadToolArgumentsJsonText,
  createEvalIterationPaths,
  createEvalLargeFillerText,
  createEvalOutcomeMetrics,
  createEvalSecretToken,
  readEvalSecretTokenFromVisibleText,
} from "../evalScenarioSupport.ts";
import { runScriptedOpenAiEvalConversationTurn } from "../scriptedOpenAiEvalRuntime.ts";

const EVAL_NAME = "debugging";
const EXPECTED_TOKEN_PREFIX = "EVAL_EXPECTED";
const BUGGY_TOKEN_PREFIX = "EVAL_BUGGY";
const MAX_RECOVERY_READ_COUNT = 2;

export const debuggingEval: PerformanceScenario = {
  scenarioName: "eval-debugging",
  description:
    "Scripted model reads failing-test evidence and the buggy source in separate steps, then fixes the source using both visible results.",
  defaultWarmupCount: 0,
  defaultRepeatCount: 1,
  async runIteration(input) {
    const iterationPaths = await createEvalIterationPaths({
      evalName: EVAL_NAME,
      runOutputDirectoryPath: input.runOutputDirectoryPath,
      iterationIndex: input.iterationIndex,
      isWarmup: input.isWarmup,
    });
    const expectedToken = createEvalSecretToken(EXPECTED_TOKEN_PREFIX);
    const buggyToken = createEvalSecretToken(BUGGY_TOKEN_PREFIX);
    const calculatorFilePath = join(iterationPaths.workspaceRootPath, "calculator.ts");
    await writeFile(
      join(iterationPaths.workspaceRootPath, "test-output.txt"),
      `1 test failed.\n\ncalculator returns the release label\n  Expected: "${expectedToken}"\n  Received: "${buggyToken}"\n`,
      "utf8",
    );
    await writeFile(
      calculatorFilePath,
      `// calculator module\n${createEvalLargeFillerText(110)}\nexport function releaseLabel(): string {\n  return "${buggyToken}";\n}\n`,
      "utf8",
    );

    let recoveryToolCallCount = 0;
    let recoveryReadCallCount = 0;
    let hasReadCalculator = false;
    let hasEditedCalculator = false;
    const turnResult = await runScriptedOpenAiEvalConversationTurn({
      workspaceRootPath: iterationPaths.workspaceRootPath,
      evalStateDirectoryPath: iterationPaths.evalStateDirectoryPath,
      userPromptText: "The test suite is failing. Inspect test-output.txt, find the bug, and fix it.",
      assistantOperatingMode: "implementation",
      scriptedEvalModel: (context) => {
        if (context.requestIndex === 0) {
          return {
            functionCalls: [{
              toolCallId: "call_eval_debug_read_test_output",
              functionName: "read",
              argumentsJsonText: buildReadToolArgumentsJsonText({
                filePath: "test-output.txt",
                inspectionQuestion: "Which value did the failing test expect?",
              }),
            }],
          };
        }

        if (!hasReadCalculator) {
          hasReadCalculator = true;
          return {
            functionCalls: [{
              toolCallId: "call_eval_debug_read_calculator",
              functionName: "read",
              argumentsJsonText: buildReadToolArgumentsJsonText({
                filePath: "calculator.ts",
                inspectionQuestion: "Which value does releaseLabel currently return?",
              }),
            }],
          };
        }

        if (!hasEditedCalculator) {
          const visibleExpectedToken = readEvalSecretTokenFromVisibleText(
            readVisibleFunctionCallOutputText(context.requestBody, "call_eval_debug_read_test_output"),
            EXPECTED_TOKEN_PREFIX,
          );
          const visibleBuggyToken = readEvalSecretTokenFromVisibleText(
            readVisibleFunctionCallOutputText(context.requestBody, "call_eval_debug_read_calculator"),
            BUGGY_TOKEN_PREFIX,
          ) ?? readEvalSecretTokenFromVisibleText(
            readVisibleFunctionCallOutputText(context.requestBody, `call_eval_debug_recovery_${recoveryReadCallCount - 1}`),
            BUGGY_TOKEN_PREFIX,
          );
          if (visibleExpectedToken === undefined || visibleBuggyToken === undefined) {
            if (recoveryToolCallCount >= MAX_RECOVERY_READ_COUNT) {
              return { assistantText: "EVIDENCE_MISSING: failure evidence or source content was not visible." };
            }
            recoveryToolCallCount += 1;
            recoveryReadCallCount += 1;
            return {
              functionCalls: [{
                toolCallId: `call_eval_debug_recovery_${recoveryReadCallCount - 1}`,
                functionName: "read",
                argumentsJsonText: buildReadToolArgumentsJsonText({
                  filePath: visibleExpectedToken === undefined ? "test-output.txt" : "calculator.ts",
                  inspectionQuestion: "Re-read to recover the missing failure evidence.",
                }),
              }],
            };
          }
          hasEditedCalculator = true;
          return {
            functionCalls: [{
              toolCallId: "call_eval_debug_edit_calculator",
              functionName: "edit",
              argumentsJsonText: buildEditToolArgumentsJsonText({
                filePath: "calculator.ts",
                oldString: visibleBuggyToken,
                newString: visibleExpectedToken,
              }),
            }],
          };
        }

        return { assistantText: "Fixed releaseLabel to return the expected value reported by the failing test." };
      },
    });

    const fixedCalculatorText = await readFile(calculatorFilePath, "utf8");
    const taskCompleted = fixedCalculatorText.includes(expectedToken) && !fixedCalculatorText.includes(buggyToken);
    return {
      iterationLabel: `${input.isWarmup ? "warmup" : "repeat"}-${input.iterationIndex}`,
      metrics: createEvalOutcomeMetrics({
        evalName: EVAL_NAME,
        taskCompletionFailureCount: taskCompleted ? 0 : 1,
        recoveryToolCallCount,
        requestRecords: turnResult.requestRecords,
      }),
      diagnosticEvents: turnResult.diagnosticEvents,
    };
  },
};
