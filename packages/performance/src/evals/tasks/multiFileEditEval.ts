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

const EVAL_NAME = "multi-file-edit";
const ALPHA_TOKEN_PREFIX = "EVAL_ALPHA";
const BETA_TOKEN_PREFIX = "EVAL_BETA";
const MAX_RECOVERY_READ_COUNT = 2;

export const multiFileEditEval: PerformanceScenario = {
  scenarioName: "eval-multi-file-edit",
  description:
    "Scripted model reads two files, then edits each in a later separate response step using exact text extracted from the visible read results.",
  defaultWarmupCount: 0,
  defaultRepeatCount: 1,
  async runIteration(input) {
    const iterationPaths = await createEvalIterationPaths({
      evalName: EVAL_NAME,
      runOutputDirectoryPath: input.runOutputDirectoryPath,
      iterationIndex: input.iterationIndex,
      isWarmup: input.isWarmup,
    });
    const alphaToken = createEvalSecretToken(ALPHA_TOKEN_PREFIX);
    const betaToken = createEvalSecretToken(BETA_TOKEN_PREFIX);
    const alphaFilePath = join(iterationPaths.workspaceRootPath, "alpha.ts");
    const betaFilePath = join(iterationPaths.workspaceRootPath, "beta.ts");
    await writeFile(alphaFilePath, `// alpha module\n${createEvalLargeFillerText(110)}\nexport const alphaValue = "${alphaToken}";\n`, "utf8");
    await writeFile(betaFilePath, `// beta module\n${createEvalLargeFillerText(110)}\nexport const betaValue = "${betaToken}";\n`, "utf8");

    let recoveryToolCallCount = 0;
    let recoveryReadCallCount = 0;
    let hasEditedAlpha = false;
    let hasEditedBeta = false;
    const turnResult = await runScriptedOpenAiEvalConversationTurn({
      workspaceRootPath: iterationPaths.workspaceRootPath,
      evalStateDirectoryPath: iterationPaths.evalStateDirectoryPath,
      userPromptText: "Patch the exported values in alpha.ts and beta.ts.",
      assistantOperatingMode: "implementation",
      scriptedEvalModel: (context) => {
        if (context.requestIndex === 0) {
          return {
            functionCalls: [
              {
                toolCallId: "call_eval_edit_read_alpha",
                functionName: "read",
                argumentsJsonText: buildReadToolArgumentsJsonText({
                  filePath: "alpha.ts",
                  inspectionQuestion: "What is the exported alpha value?",
                }),
              },
              {
                toolCallId: "call_eval_edit_read_beta",
                functionName: "read",
                argumentsJsonText: buildReadToolArgumentsJsonText({
                  filePath: "beta.ts",
                  inspectionQuestion: "What is the exported beta value?",
                }),
              },
            ],
          };
        }

        if (!hasEditedAlpha) {
          const visibleAlphaToken = readEvalSecretTokenFromVisibleText(
            readVisibleFunctionCallOutputText(context.requestBody, "call_eval_edit_read_alpha"),
            ALPHA_TOKEN_PREFIX,
          ) ?? readEvalSecretTokenFromVisibleText(
            readVisibleFunctionCallOutputText(context.requestBody, `call_eval_edit_recovery_${recoveryReadCallCount - 1}`),
            ALPHA_TOKEN_PREFIX,
          );
          if (visibleAlphaToken === undefined) {
            return requestRecoveryReadOrGiveUp("alpha.ts");
          }
          hasEditedAlpha = true;
          return {
            functionCalls: [{
              toolCallId: "call_eval_edit_alpha",
              functionName: "edit",
              argumentsJsonText: buildEditToolArgumentsJsonText({
                filePath: "alpha.ts",
                oldString: visibleAlphaToken,
                newString: `${visibleAlphaToken}_PATCHED`,
              }),
            }],
          };
        }

        if (!hasEditedBeta) {
          const visibleBetaToken = readEvalSecretTokenFromVisibleText(
            readVisibleFunctionCallOutputText(context.requestBody, "call_eval_edit_read_beta"),
            BETA_TOKEN_PREFIX,
          ) ?? readEvalSecretTokenFromVisibleText(
            readVisibleFunctionCallOutputText(context.requestBody, `call_eval_edit_recovery_${recoveryReadCallCount - 1}`),
            BETA_TOKEN_PREFIX,
          );
          if (visibleBetaToken === undefined) {
            return requestRecoveryReadOrGiveUp("beta.ts");
          }
          hasEditedBeta = true;
          return {
            functionCalls: [{
              toolCallId: "call_eval_edit_beta",
              functionName: "edit",
              argumentsJsonText: buildEditToolArgumentsJsonText({
                filePath: "beta.ts",
                oldString: visibleBetaToken,
                newString: `${visibleBetaToken}_PATCHED`,
              }),
            }],
          };
        }

        return { assistantText: "Both exported values were patched." };

        function requestRecoveryReadOrGiveUp(recoveryFilePath: string) {
          if (recoveryToolCallCount >= MAX_RECOVERY_READ_COUNT) {
            return { assistantText: `EVIDENCE_MISSING: exact content of ${recoveryFilePath} was not visible.` };
          }
          recoveryToolCallCount += 1;
          recoveryReadCallCount += 1;
          return {
            functionCalls: [{
              toolCallId: `call_eval_edit_recovery_${recoveryReadCallCount - 1}`,
              functionName: "read",
              argumentsJsonText: buildReadToolArgumentsJsonText({
                filePath: recoveryFilePath,
                inspectionQuestion: "Re-read to recover the exact exported value.",
              }),
            }],
          };
        }
      },
    });

    const patchedAlphaText = await readFile(alphaFilePath, "utf8");
    const patchedBetaText = await readFile(betaFilePath, "utf8");
    const taskCompleted = patchedAlphaText.includes(`${alphaToken}_PATCHED`) && patchedBetaText.includes(`${betaToken}_PATCHED`);
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
