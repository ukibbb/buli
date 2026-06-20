import { expect, test } from "bun:test";
import type { ProviderTurnReplay } from "@buli/contracts";
import {
  projectProviderTurnReplayForRetainedToolResults,
  RuntimeProviderTurnToolResultRetentionRegistry,
} from "../src/runtimeProviderTurnToolResultRetention.ts";

test("projectProviderTurnReplayForRetainedToolResults replaces marked OpenAI function call outputs", () => {
  const toolResultRetentionRegistry = new RuntimeProviderTurnToolResultRetentionRegistry();
  toolResultRetentionRegistry.registerRetainedToolResult({
    toolCallId: "call-private",
    retainedToolResultText: "Retained summary only.",
  });
  const providerTurnReplay: ProviderTurnReplay = {
    provider: "openai",
    inputItems: [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call-private",
        name: "novibe_teacher_library_note_read",
        arguments: "{}",
      },
      {
        type: "function_call_output",
        call_id: "call-private",
        output: "Full private note body.",
      },
      {
        type: "function_call_output",
        call_id: "call-public",
        output: "Public result.",
      },
    ],
  };
  const originalFunctionCallReplayItem = providerTurnReplay.inputItems[0];
  const originalPublicFunctionCallOutputReplayItem = providerTurnReplay.inputItems[2];
  if (!originalFunctionCallReplayItem || !originalPublicFunctionCallOutputReplayItem) {
    throw new Error("expected test replay items");
  }

  const projectedProviderTurnReplay = projectProviderTurnReplayForRetainedToolResults({
    providerTurnReplay,
    toolResultRetentionRegistry,
  });

  expect(projectedProviderTurnReplay).toEqual({
    provider: "openai",
    inputItems: [
      originalFunctionCallReplayItem,
      {
        type: "function_call_output",
        call_id: "call-private",
        output: "Retained summary only.",
      },
      originalPublicFunctionCallOutputReplayItem,
    ],
  });
  expect(providerTurnReplay.inputItems[1]).toEqual({
    type: "function_call_output",
    call_id: "call-private",
    output: "Full private note body.",
  });
});
