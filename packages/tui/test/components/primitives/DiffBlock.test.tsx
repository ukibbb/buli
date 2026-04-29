import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { DiffBlock } from "../../../src/components/primitives/DiffBlock.tsx";

describe("DiffBlock", () => {
  test("renders_addition_removal_and_context_lines", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <DiffBlock
        diffLines={[
          { lineKind: "addition", lineNumber: 1, lineText: "added line" },
          { lineKind: "removal", lineNumber: 2, lineText: "removed line" },
          { lineKind: "context", lineNumber: 3, lineText: "context line" },
        ]}
      />,
      { width: 60, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("+");
    expect(frame).toContain("-");
    expect(frame).toContain("added line");
    expect(frame).toContain("removed line");
    expect(frame).toContain("context line");
  });

  test("keeps_line_number_sigil_and_code_on_one_row", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <DiffBlock
        diffLines={[
          { lineKind: "addition", lineNumber: 53, lineText: "import { ConversationMessageList } from './components/ConversationMessageList.tsx';" },
          { lineKind: "removal", lineNumber: 702, lineText: "<LegacyTranscriptPlaceholder ... />" },
        ]}
      />,
      { width: 96, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    const additionLine = frame.split("\n").find((line) => line.includes("ConversationMessageList"));
    const removalLine = frame.split("\n").find((line) => line.includes("LegacyTranscriptPlaceholder"));

    expect(additionLine).toBeDefined();
    expect(additionLine ?? "").toContain("53");
    expect(additionLine ?? "").toContain("+");
    expect(removalLine).toBeDefined();
    expect(removalLine ?? "").toContain("702");
    expect(removalLine ?? "").toContain("-");
  });

  test("truncates_long_code_lines_instead_of_wrapping_them", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <DiffBlock
        diffLines={[
          {
            lineKind: "addition",
            lineNumber: 53,
            lineText: "import ConversationMessageList from './components/ConversationMessageList.tsx';",
          },
        ]}
      />,
      { width: 42, height: 5 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    const renderedLinesWithCode = frame
      .split("\n")
      .filter((line) => line.includes("import"));

    expect(renderedLinesWithCode).toHaveLength(1);
    expect(renderedLinesWithCode[0] ?? "").toContain("53");
    expect(renderedLinesWithCode[0] ?? "").toContain("+");
    expect(frame).not.toContain("components/ConversationMessageList.tsx");
  });
});
