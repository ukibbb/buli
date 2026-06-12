import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PerformanceScenario } from "../../model/performanceScenario.ts";
import { readVisibleFunctionCallOutputText } from "../evalRequestInspection.ts";
import {
  buildReadToolArgumentsJsonText,
  createEvalIterationPaths,
  createEvalLargeFillerText,
  createEvalOutcomeMetrics,
  createEvalSecretToken,
  readEvalSecretTokenFromVisibleText,
} from "../evalScenarioSupport.ts";
import { runScriptedOpenAiEvalConversationTurn } from "../scriptedOpenAiEvalRuntime.ts";

const EVAL_NAME = "file-exploration";
const SECRET_TOKEN_PREFIX = "EVAL_EXPLORE";
const MAX_RECOVERY_READ_COUNT = 2;

export const fileExplorationEval: PerformanceScenario = {
  scenarioName: "eval-file-exploration",
  description: "Scripted model reads a fixture file and must answer with a planted fact extracted from the visible tool result.",
  defaultWarmupCount: 0,
  defaultRepeatCount: 1,
  async runIteration(input) {
    const iterationPaths = await createEvalIterationPaths({
      evalName: EVAL_NAME,
      runOutputDirectoryPath: input.runOutputDirectoryPath,
      iterationIndex: input.iterationIndex,
      isWarmup: input.isWarmup,
    });
    const secretToken = createEvalSecretToken(SECRET_TOKEN_PREFIX);
    await writeFile(
      join(iterationPaths.workspaceRootPath, "notes.md"),
      `# Exploration Notes\n\n${createEvalLargeFillerText(120)}\n\nThe planted secret is ${secretToken} and appears only here.\n`,
      "utf8",
    );

    let recoveryToolCallCount = 0;
    let issuedReadCallCount = 0;
    const turnResult = await runScriptedOpenAiEvalConversationTurn({
      workspaceRootPath: iterationPaths.workspaceRootPath,
      evalStateDirectoryPath: iterationPaths.evalStateDirectoryPath,
      userPromptText: "Find the planted secret token in notes.md and report it.",
      scriptedEvalModel: (context) => {
        if (context.requestIndex === 0) {
          issuedReadCallCount += 1;
          return {
            functionCalls: [{
              toolCallId: "call_eval_explore_read_0",
              functionName: "read",
              argumentsJsonText: buildReadToolArgumentsJsonText({
                filePath: "notes.md",
                inspectionQuestion: "What is the planted secret token?",
              }),
            }],
          };
        }

        const visibleSecretToken = readEvalSecretTokenFromVisibleText(
          readVisibleFunctionCallOutputText(context.requestBody, `call_eval_explore_read_${issuedReadCallCount - 1}`),
          SECRET_TOKEN_PREFIX,
        );
        if (visibleSecretToken !== undefined) {
          return { assistantText: `The planted secret token is ${visibleSecretToken}.` };
        }
        if (recoveryToolCallCount < MAX_RECOVERY_READ_COUNT) {
          recoveryToolCallCount += 1;
          issuedReadCallCount += 1;
          return {
            functionCalls: [{
              toolCallId: `call_eval_explore_read_${issuedReadCallCount - 1}`,
              functionName: "read",
              argumentsJsonText: buildReadToolArgumentsJsonText({
                filePath: "notes.md",
                inspectionQuestion: "Re-read for the planted secret token.",
              }),
            }],
          };
        }
        return { assistantText: "EVIDENCE_MISSING: the secret token was not visible in any request." };
      },
    });

    const taskCompleted = turnResult.finalAssistantMessageText.includes(secretToken);
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
