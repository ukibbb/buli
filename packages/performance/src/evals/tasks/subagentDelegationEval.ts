import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PerformanceScenario } from "../../model/performanceScenario.ts";
import { isExactTextVisibleInRequestInputItems, listRequestInputItems } from "../evalRequestInspection.ts";
import {
  buildReadToolArgumentsJsonText,
  createEvalIterationPaths,
  createEvalOutcomeMetrics,
  createEvalSecretToken,
  readEvalSecretTokenFromVisibleText,
} from "../evalScenarioSupport.ts";
import { runScriptedOpenAiEvalConversationTurn } from "../scriptedOpenAiEvalRuntime.ts";

const EVAL_NAME = "subagent-delegation";
const MISSION_TOKEN_PREFIX = "EVAL_MISSION";
const SUBAGENT_ROUTING_MARKER = "SUBAGENT_MISSION";

export const subagentDelegationEval: PerformanceScenario = {
  scenarioName: "eval-subagent-delegation",
  description:
    "Scripted parent delegates to a task subagent; the parent answer must use the fact carried by the parent-visible task result.",
  defaultWarmupCount: 0,
  defaultRepeatCount: 1,
  async runIteration(input) {
    const iterationPaths = await createEvalIterationPaths({
      evalName: EVAL_NAME,
      runOutputDirectoryPath: input.runOutputDirectoryPath,
      iterationIndex: input.iterationIndex,
      isWarmup: input.isWarmup,
    });
    const missionToken = createEvalSecretToken(MISSION_TOKEN_PREFIX);
    await writeFile(
      join(iterationPaths.workspaceRootPath, "mission.md"),
      `# Mission Briefing\n\nThe mission marker is ${missionToken}.\n`,
      "utf8",
    );

    let subagentRequestCount = 0;
    const turnResult = await runScriptedOpenAiEvalConversationTurn({
      workspaceRootPath: iterationPaths.workspaceRootPath,
      evalStateDirectoryPath: iterationPaths.evalStateDirectoryPath,
      userPromptText: "Delegate exploration of the briefing to a subagent and report the mission marker.",
      scriptedEvalModel: (context) => {
        const isSubagentRequest = isExactTextVisibleInRequestInputItems(context.requestBody, SUBAGENT_ROUTING_MARKER);
        if (isSubagentRequest) {
          subagentRequestCount += 1;
          if (subagentRequestCount === 1) {
            return {
              functionCalls: [{
                toolCallId: "call_eval_subagent_read_mission",
                functionName: "read",
                argumentsJsonText: buildReadToolArgumentsJsonText({
                  filePath: "mission.md",
                  inspectionQuestion: "What is the mission marker?",
                }),
              }],
            };
          }
          const visibleMissionToken = readEvalSecretTokenFromVisibleText(
            readAllFunctionCallOutputText(context.requestBody),
            MISSION_TOKEN_PREFIX,
          );
          return {
            assistantText: visibleMissionToken !== undefined
              ? `Mission marker confirmed: ${visibleMissionToken}.`
              : "EVIDENCE_MISSING: the mission file content was not visible to the subagent.",
          };
        }

        if (context.requestIndex === 0) {
          return {
            functionCalls: [{
              toolCallId: "call_eval_subagent_task",
              functionName: "task",
              argumentsJsonText: JSON.stringify({
                subagent: "explore",
                description: "Find the mission marker",
                prompt: `${SUBAGENT_ROUTING_MARKER}: read mission.md and report the exact mission marker value.`,
              }),
            }],
          };
        }

        const visibleMissionToken = readEvalSecretTokenFromVisibleText(
          readAllFunctionCallOutputText(context.requestBody),
          MISSION_TOKEN_PREFIX,
        );
        return {
          assistantText: visibleMissionToken !== undefined
            ? `The subagent reports the mission marker ${visibleMissionToken}.`
            : "EVIDENCE_MISSING: the task result did not carry the mission marker.",
        };
      },
    });

    const taskCompleted = turnResult.finalAssistantMessageText.includes(missionToken);
    return {
      iterationLabel: `${input.isWarmup ? "warmup" : "repeat"}-${input.iterationIndex}`,
      metrics: createEvalOutcomeMetrics({
        evalName: EVAL_NAME,
        taskCompletionFailureCount: taskCompleted ? 0 : 1,
        recoveryToolCallCount: 0,
        requestRecords: turnResult.requestRecords,
      }),
      diagnosticEvents: turnResult.diagnosticEvents,
    };
  },
};

function readAllFunctionCallOutputText(requestBody: Record<string, unknown>): string {
  return listRequestInputItems(requestBody)
    .filter((inputItem) => inputItem["type"] === "function_call_output" && typeof inputItem["output"] === "string")
    .map((inputItem) => inputItem["output"] as string)
    .join("\n");
}
