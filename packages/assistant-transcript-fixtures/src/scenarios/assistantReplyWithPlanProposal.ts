import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const assistantReplyWithPlanProposal: AssistantTranscriptScenario = {
  scenarioName: "assistantReplyWithPlanProposal",
  responseEventSequence: [
    { type: "assistant_response_started", model: "gpt-5.4" },
    {
      type: "assistant_plan_proposed",
      planId: "plan-001",
      planTitle: "Refactor authentication module",
      planSteps: [
        { stepIndex: 0, stepTitle: "Audit existing auth code", stepDetail: "Read all files under src/auth/", stepStatus: "pending" },
        { stepIndex: 1, stepTitle: "Extract token validation", stepDetail: "Move to src/auth/tokenValidator.ts", stepStatus: "pending" },
        { stepIndex: 2, stepTitle: "Update tests", stepStatus: "pending" },
      ],
    },
  ],
  expectedConversationTranscriptEntries: [
    {
      kind: "plan_proposal",
      planId: "plan-001",
      planTitle: "Refactor authentication module",
      planSteps: [
        { stepIndex: 0, stepTitle: "Audit existing auth code", stepDetail: "Read all files under src/auth/", stepStatus: "pending" },
        { stepIndex: 1, stepTitle: "Extract token validation", stepDetail: "Move to src/auth/tokenValidator.ts", stepStatus: "pending" },
        { stepIndex: 2, stepTitle: "Update tests", stepStatus: "pending" },
      ],
    },
  ],
};
