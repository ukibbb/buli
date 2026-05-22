import { describe, expect, test } from "bun:test";
import {
  isMarkdownDocumentReadFilePath,
  resolveReadFilePreviewRenderKind,
} from "../../../src/components/primitives/ReadFilePreviewBlock.tsx";

describe("ReadFilePreviewBlock", () => {
  test("recognizes_common_markdown_document_paths", () => {
    expect(isMarkdownDocumentReadFilePath("README.md")).toBe(true);
    expect(isMarkdownDocumentReadFilePath("docs/guide.markdown")).toBe(true);
    expect(isMarkdownDocumentReadFilePath("content/page.mdx")).toBe(true);
    expect(isMarkdownDocumentReadFilePath("src/app.ts")).toBe(false);
  });

  test("renders_only_complete_markdown_documents_as_markdown", () => {
    expect(
      resolveReadFilePreviewRenderKind({
        readFilePath: "README.md",
        readLineCount: 2,
        returnedLineCount: 2,
        previewLines: [
          { lineNumber: 1, lineText: "# Title" },
          { lineNumber: 2, lineText: "Body" },
        ],
      }),
    ).toBe("renderedMarkdownDocument");

    expect(
      resolveReadFilePreviewRenderKind({
        readFilePath: "README.md",
        readLineCount: 3,
        returnedLineCount: 2,
        previewLines: [
          { lineNumber: 2, lineText: "# Later" },
          { lineNumber: 3, lineText: "Body" },
        ],
      }),
    ).toBe("sourceText");

    expect(
      resolveReadFilePreviewRenderKind({
        readFilePath: "README.md",
        readLineCount: 3,
        returnedLineCount: 2,
        previewLines: [
          { lineNumber: 1, lineText: "# Title" },
          { lineNumber: 2, lineText: "Body" },
        ],
        wasLineCountTruncated: true,
      }),
    ).toBe("sourceText");
  });

  test("keeps_non_markdown_files_in_source_view", () => {
    expect(
      resolveReadFilePreviewRenderKind({
        readFilePath: "src/app.ts",
        readLineCount: 1,
        returnedLineCount: 1,
        previewLines: [
          { lineNumber: 1, lineText: "export const app = true;" },
        ],
      }),
    ).toBe("sourceText");
  });
});
