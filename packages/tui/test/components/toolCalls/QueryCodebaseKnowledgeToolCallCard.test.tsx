import { describe, expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "../../testRenderWithCleanup.ts";
import { QueryCodebaseKnowledgeToolCallCard } from "../../../src/components/toolCalls/QueryCodebaseKnowledgeToolCallCard.tsx";

describe("QueryCodebaseKnowledgeToolCallCard", () => {
  test("streaming_shows_bracketed_problem", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <QueryCodebaseKnowledgeToolCallCard
        renderState="streaming"
        toolCallDetail={{
          toolName: "query_codebase_knowledge",
          codebaseProblemDescription: "Find runtime dispatch",
        }}
      />,
      { width: 90, height: 10 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Knowledge");
    expect(frame).toContain("[Find runtime dispatch]");
    expect(frame).toContain("querying");
  });

  test("completed_expands_known_context", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <QueryCodebaseKnowledgeToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "query_codebase_knowledge",
          codebaseProblemDescription: "Find runtime dispatch",
          knownRelevantFilePaths: ["packages/engine/src/runtimeToolCallExecution.ts"],
          knownRelevantSymbolNames: ["streamAssistantResponseEventsForRequestedToolCalls"],
          matchedKnowledgeCount: 2,
          recommendedReadCount: 3,
        }}
      />,
      { width: 120, height: 16 },
    );
    await renderOnce();

    expect(captureCharFrame()).toContain("2 matches");
    expect(captureCharFrame()).toContain("3 reads");
    expect(captureCharFrame()).not.toContain("known file");

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("[-]");
    expect(frame).toContain("known file");
    expect(frame).toContain("packages/engine/src/runtimeToolCallExecution.ts");
    expect(frame).toContain("known symbol streamAssistantResponseEventsForRequestedToolCalls");
  });

  test("failed_shows_error", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <QueryCodebaseKnowledgeToolCallCard
        renderState="failed"
        errorText="index file is unreadable"
        toolCallDetail={{
          toolName: "query_codebase_knowledge",
          codebaseProblemDescription: "Find runtime dispatch",
        }}
      />,
      { width: 90, height: 10 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("[Find runtime dispatch]");
    expect(frame).toContain("index file is unreadable");
  });
});
