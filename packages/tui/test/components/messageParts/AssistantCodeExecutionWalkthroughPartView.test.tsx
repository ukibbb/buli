import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { AssistantCodeExecutionWalkthroughPartView } from "../../../src/components/messageParts/AssistantCodeExecutionWalkthroughPartView.tsx";

describe("AssistantCodeExecutionWalkthroughPartView", () => {
  test("shows_debug_walkthrough_steps_source_paths_and_code", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantCodeExecutionWalkthroughPartView
        assistantCodeExecutionWalkthroughConversationMessagePart={{
          id: "code-walkthrough-1",
          partKind: "assistant_code_execution_walkthrough",
          titleText: "Runtime flow",
          summaryText: "The main stages in one turn.",
          walkthroughKind: "source_walkthrough",
          steps: [
            {
              stepTitle: "Provider event is translated",
              whenText: "after the provider emits a stream event",
              whatHappensText: "The engine creates an assistant message part.",
              dataStateText: "providerStreamEvent.type is code_execution_walkthrough_presented",
              nextStepText: "chat state stores the part",
              codeExamples: [
                {
                  sourceFilePath: "packages/engine/src/runtimeProviderStreamEventTranslator.ts",
                  sourceSymbolName: "translateProviderStreamEvent",
                  startLineNumber: 145,
                  endLineNumber: 147,
                  languageLabel: "ts",
                  codeText: "if (input.providerStreamEvent.type === \"code_execution_walkthrough_presented\") {\n  return this.translateCodeExecutionWalkthroughPresentedProviderStreamEvent(input.providerStreamEvent.codeExecutionWalkthrough);\n}",
                  explanationText: "This branch chooses the walkthrough translation path.",
                },
              ],
            },
          ],
        }}
      />,
      { width: 120, height: 30 },
    );
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Runtime flow");
    expect(frame).toContain("source walkthrough");
    expect(frame).toContain("Provider event is translated");
    expect(frame).toContain("packages/engine/src/runtimeProviderStreamEventTranslator.ts:145-147");
    expect(frame).toContain("translateProviderStreamEvent");
    expect(frame).toContain("code_execution_walkthrough_presented");
  });

  test("uses_singular_step_count_for_one_step", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantCodeExecutionWalkthroughPartView
        assistantCodeExecutionWalkthroughConversationMessagePart={{
          id: "code-walkthrough-1",
          partKind: "assistant_code_execution_walkthrough",
          titleText: "Single step",
          walkthroughKind: "observed_runtime_trace",
          steps: [
            {
              stepTitle: "Only step",
              whatHappensText: "Runtime value was observed.",
              codeExamples: [
                {
                  sourceFilePath: "src/example.ts",
                  startLineNumber: 1,
                  endLineNumber: 1,
                  codeText: "const observed = true;",
                },
              ],
            },
          ],
        }}
      />,
      { width: 80, height: 14 },
    );
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("1 step");
    expect(frame).not.toContain("1 steps");
    expect(frame).toContain("observed runtime trace");
  });
});
