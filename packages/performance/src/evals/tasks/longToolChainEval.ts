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

const EVAL_NAME = "long-tool-chain";
const DEEP_TOKEN_PREFIX = "EVAL_DEEP";
const SMALL_TOKEN_PREFIX = "EVAL_SMALL";
const SMALL_FILE_COUNT = 3;
const MAX_RECOVERY_READ_COUNT = 2;

export const longToolChainEval: PerformanceScenario = {
  scenarioName: "eval-long-tool-chain",
  description:
    "Scripted model reads a large file early, then several small files across later steps; the final answer needs the earliest large evidence and may pay a bounded recovery re-read when it was compacted.",
  defaultWarmupCount: 0,
  defaultRepeatCount: 1,
  async runIteration(input) {
    const iterationPaths = await createEvalIterationPaths({
      evalName: EVAL_NAME,
      runOutputDirectoryPath: input.runOutputDirectoryPath,
      iterationIndex: input.iterationIndex,
      isWarmup: input.isWarmup,
    });
    const deepToken = createEvalSecretToken(DEEP_TOKEN_PREFIX);
    const smallTokens = Array.from({ length: SMALL_FILE_COUNT }, () => createEvalSecretToken(SMALL_TOKEN_PREFIX));
    await writeFile(
      join(iterationPaths.workspaceRootPath, "big.md"),
      `# Large Evidence\n\n${createEvalLargeFillerText(140)}\n\nDeep conclusion marker: ${deepToken}\n`,
      "utf8",
    );
    for (const [smallFileIndex, smallToken] of smallTokens.entries()) {
      await writeFile(
        join(iterationPaths.workspaceRootPath, `small-${smallFileIndex}.md`),
        `# Small Evidence ${smallFileIndex}\n\nSmall marker: ${smallToken}\n`,
        "utf8",
      );
    }

    let recoveryToolCallCount = 0;
    let recoveryReadCallCount = 0;
    let readSmallFileCount = 0;
    const turnResult = await runScriptedOpenAiEvalConversationTurn({
      workspaceRootPath: iterationPaths.workspaceRootPath,
      evalStateDirectoryPath: iterationPaths.evalStateDirectoryPath,
      userPromptText: "Survey big.md and every small-*.md file, then report the deep marker and the first small marker.",
      scriptedEvalModel: (context) => {
        if (context.requestIndex === 0) {
          return {
            functionCalls: [{
              toolCallId: "call_eval_chain_read_big",
              functionName: "read",
              argumentsJsonText: buildReadToolArgumentsJsonText({
                filePath: "big.md",
                inspectionQuestion: "What is the deep conclusion marker?",
              }),
            }],
          };
        }

        if (readSmallFileCount < SMALL_FILE_COUNT) {
          const smallFileIndex = readSmallFileCount;
          readSmallFileCount += 1;
          return {
            functionCalls: [{
              toolCallId: `call_eval_chain_read_small_${smallFileIndex}`,
              functionName: "read",
              argumentsJsonText: buildReadToolArgumentsJsonText({
                filePath: `small-${smallFileIndex}.md`,
                inspectionQuestion: "What is the small marker?",
              }),
            }],
          };
        }

        const visibleDeepToken = readEvalSecretTokenFromVisibleText(
          readVisibleFunctionCallOutputText(context.requestBody, "call_eval_chain_read_big"),
          DEEP_TOKEN_PREFIX,
        ) ?? readEvalSecretTokenFromVisibleText(
          readVisibleFunctionCallOutputText(context.requestBody, `call_eval_chain_recovery_${recoveryReadCallCount - 1}`),
          DEEP_TOKEN_PREFIX,
        );
        const visibleFirstSmallToken = readEvalSecretTokenFromVisibleText(
          readVisibleFunctionCallOutputText(context.requestBody, "call_eval_chain_read_small_0"),
          SMALL_TOKEN_PREFIX,
        );
        if (visibleDeepToken !== undefined && visibleFirstSmallToken !== undefined) {
          return { assistantText: `Deep marker ${visibleDeepToken}; first small marker ${visibleFirstSmallToken}.` };
        }
        if (recoveryToolCallCount < MAX_RECOVERY_READ_COUNT) {
          recoveryToolCallCount += 1;
          recoveryReadCallCount += 1;
          return {
            functionCalls: [{
              toolCallId: `call_eval_chain_recovery_${recoveryReadCallCount - 1}`,
              functionName: "read",
              argumentsJsonText: buildReadToolArgumentsJsonText({
                filePath: visibleDeepToken === undefined ? "big.md" : "small-0.md",
                inspectionQuestion: "Re-read to recover the missing marker evidence.",
              }),
            }],
          };
        }
        return { assistantText: "EVIDENCE_MISSING: marker evidence was not visible." };
      },
    });

    const taskCompleted = turnResult.finalAssistantMessageText.includes(deepToken) &&
      turnResult.finalAssistantMessageText.includes(smallTokens[0] ?? "");
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
