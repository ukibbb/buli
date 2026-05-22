import { describe, expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "../../testRenderWithCleanup.ts";
import { AssistantCodeExecutionWalkthroughPartView } from "../../../src/components/messageParts/AssistantCodeExecutionWalkthroughPartView.tsx";

describe("AssistantCodeExecutionWalkthroughPartView", () => {
  test("shows_debug_walkthrough_steps_source_paths_and_code", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
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
                  lineExplanations: [
                    {
                      lineNumber: 145,
                      explanationText: "This line checks whether the provider event is a walkthrough presentation.",
                      projectModelText: "The walkthrough is rendered as a message part, not as an executable tool call.",
                      languageMechanicsText: "The string literal comparison narrows which event branch is safe to run.",
                      plainPseudocodeText: "If this event is a walkthrough, use the walkthrough renderer path.",
                    },
                  ],
                },
              ],
            },
          ],
        }}
      />,
      { width: 120, height: 40 },
    );
    await renderOnce();

    const collapsedFrame = captureCharFrame();
    expect(collapsedFrame).toContain("[+]");
    expect(collapsedFrame).toContain("Runtime flow");
    expect(collapsedFrame).toContain("source walkthrough");
    expect(collapsedFrame).toContain("Provider event is translated");
    expect(collapsedFrame).not.toContain("packages/engine/src/runtimeProviderStreamEventTranslator.ts:145-147");

    await act(async () => {
      await mockMouse.click(3, 2);
    });
    await renderOnce();

    const expandedFrame = captureCharFrame();
    expect(expandedFrame).toContain("[-]");
    expect(expandedFrame).toContain("After the provider emits a stream event");
    expect(expandedFrame).toContain("important data/state");
    expect(expandedFrame).toContain("packages/engine/src/runtimeProviderStreamEventTranslator.ts:145-147");
    expect(expandedFrame).toContain("translateProviderStreamEvent");
    expect(expandedFrame).toContain("code_execution_walkthrough_presented");
    expect(expandedFrame).toContain("// explain:");
    expect(expandedFrame).toContain("project model:");
    expect(expandedFrame).toContain("language mechanics:");
    expect(expandedFrame).toContain("plain pseudocode:");
    expect(expandedFrame).not.toContain("// packages/engine/src/runtimeProviderStreamEventTranslator.ts");
    expect(expandedFrame).not.toContain("// ts");
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

  test("keeps_multi_step_walkthrough_collapsed_until_requested", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <AssistantCodeExecutionWalkthroughPartView
        assistantCodeExecutionWalkthroughConversationMessagePart={{
          id: "code-walkthrough-1",
          partKind: "assistant_code_execution_walkthrough",
          titleText: "Large flow",
          summaryText: "Two moments in the runtime.",
          walkthroughKind: "source_walkthrough",
          steps: [
            {
              stepTitle: "First step",
              whenText: "after the request starts",
              whatHappensText: "The request is accepted.",
              codeExamples: [
                {
                  sourceFilePath: "src/first.ts",
                  startLineNumber: 1,
                  endLineNumber: 1,
                  codeText: "const first = true;",
                },
              ],
            },
            {
              stepTitle: "Second step",
              whatHappensText: "The provider receives control.",
              codeExamples: [
                {
                  sourceFilePath: "src/second.ts",
                  sourceSymbolName: "startProviderTurn",
                  startLineNumber: 10,
                  endLineNumber: 10,
                  codeText: "startProviderTurn();",
                },
              ],
            },
          ],
        }}
      />,
      { width: 100, height: 24 },
    );
    await renderOnce();

    const collapsedFrame = captureCharFrame();
    expect(collapsedFrame).toContain("[+]");
    expect(collapsedFrame).toContain("Large flow");
    expect(collapsedFrame).toContain("2 steps");
    expect(collapsedFrame).toContain("First step");
    expect(collapsedFrame).toContain("Second step");
    expect(collapsedFrame).not.toContain("src/first.ts");
    expect(collapsedFrame).not.toContain("const first = true;");
    expect(collapsedFrame).not.toContain("startProviderTurn");

    await act(async () => {
      await mockMouse.click(3, 2);
    });
    await renderOnce();

    const expandedFrame = captureCharFrame();
    expect(expandedFrame).toContain("[-]");
    expect(expandedFrame).not.toContain("when:");
    expect(expandedFrame).toContain("src/first.ts:1");
    expect(expandedFrame).toContain("const first = true;");
    expect(expandedFrame).toContain("startProviderTurn");
  });

  test("renders_all_source_lines_and_optional_uncertainty_when_expanded", async () => {
    const codeText = Array.from({ length: 45 }, (_value, index) => `snippet-line-${String(index + 1).padStart(2, "0")}`).join("\n");
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <AssistantCodeExecutionWalkthroughPartView
        assistantCodeExecutionWalkthroughConversationMessagePart={{
          id: "code-walkthrough-1",
          partKind: "assistant_code_execution_walkthrough",
          titleText: "Long snippet flow",
          walkthroughKind: "source_walkthrough",
          steps: [
            {
              stepTitle: "Read long source",
              whatHappensText: "Only the visible prefix should render.",
              codeExamples: [
                {
                  sourceFilePath: "src/long.ts",
                  startLineNumber: 1,
                  endLineNumber: 45,
                  codeText,
                  lineExplanations: [
                    {
                      lineNumber: 45,
                      explanationText: "This final line is still rendered after expansion.",
                      uncertaintyText: "No framework internals were verified for this line.",
                    },
                  ],
                },
              ],
            },
          ],
        }}
      />,
      { width: 100, height: 80 },
    );
    await renderOnce();

    expect(captureCharFrame()).toContain("[+]");

    await act(async () => {
      await mockMouse.click(3, 2);
    });
    await renderOnce();

    const expandedFrame = captureCharFrame();
    expect(expandedFrame).not.toContain("showing first 40 of 45 code lines");
    expect(expandedFrame).toContain("snippet-line-45");
    expect(expandedFrame).toContain("not verified:");
  });
});
