import { expect, test } from "bun:test";
import { SameTurnReadCoverageTracker, deriveReturnedReadFileLineRange } from "../src/readOnlyToolCallReadCoverage.ts";

function createReadDetail(input: {
  readFilePath?: string;
  startLineNumber?: number;
  returnedLineCount?: number;
  readByteCount?: number;
}) {
  return {
    toolName: "read" as const,
    readFilePath: input.readFilePath ?? "src/app.ts",
    returnedLineCount: input.returnedLineCount ?? 10,
    readByteCount: input.readByteCount ?? 200,
    previewLines: input.startLineNumber === undefined
      ? []
      : [{ lineNumber: input.startLineNumber, lineText: `line ${input.startLineNumber}` }],
  };
}

test("deriveReturnedReadFileLineRange derives the returned line window from read detail", () => {
  expect(deriveReturnedReadFileLineRange(createReadDetail({ startLineNumber: 10, returnedLineCount: 5 }))).toEqual({
    readFilePath: "src/app.ts",
    startLineNumber: 10,
    endLineNumber: 14,
    returnedLineCount: 5,
  });
});

test("deriveReturnedReadFileLineRange ignores directories, empty reads, and unknown line windows", () => {
  expect(deriveReturnedReadFileLineRange({
    toolName: "read",
    readFilePath: "src",
    returnedLineCount: 10,
    previewLines: [{ lineNumber: 1, lineText: "app.ts" }],
  })).toBeUndefined();
  expect(deriveReturnedReadFileLineRange(createReadDetail({ startLineNumber: 1, returnedLineCount: 0 }))).toBeUndefined();
  expect(deriveReturnedReadFileLineRange(createReadDetail({ returnedLineCount: 5 }))).toBeUndefined();
});

test("SameTurnReadCoverageTracker returns no advisory for a first visible read", () => {
  const readCoverageTracker = new SameTurnReadCoverageTracker();

  expect(readCoverageTracker.createReadOverlapAdvisory({
    toolCallId: "call_read_1",
    toolCallDetail: createReadDetail({ startLineNumber: 10, returnedLineCount: 20 }),
  })).toBeUndefined();
});

test("SameTurnReadCoverageTracker advises when all returned lines were already visible", () => {
  const readCoverageTracker = new SameTurnReadCoverageTracker();
  readCoverageTracker.recordProviderVisibleReadCoverage({
    toolCallId: "call_read_1",
    toolCallDetail: createReadDetail({ startLineNumber: 10, returnedLineCount: 20 }),
  });

  const advisory = readCoverageTracker.createReadOverlapAdvisory({
    toolCallId: "call_read_2",
    toolCallDetail: createReadDetail({ startLineNumber: 12, returnedLineCount: 3 }),
  });

  expect(advisory).toMatchObject({
    currentReadLineRange: expect.objectContaining({ startLineNumber: 12, endLineNumber: 14 }),
    overlappedLineCount: 3,
    returnedLineCount: 3,
    missingLineRanges: [],
  });
  expect(advisory?.advisoryText).toContain("<same_turn_read_overlap_advisory");
  expect(advisory?.advisoryText).toContain("lines 10-29 from tool_call_id call_read_1");
  expect(advisory?.advisoryText).toContain("none; this returned range was already fully visible");
});

test("SameTurnReadCoverageTracker advises for significant partial overlap and lists missing lines", () => {
  const readCoverageTracker = new SameTurnReadCoverageTracker();
  readCoverageTracker.recordProviderVisibleReadCoverage({
    toolCallId: "call_read_1",
    toolCallDetail: createReadDetail({ startLineNumber: 10, returnedLineCount: 21 }),
  });

  const advisory = readCoverageTracker.createReadOverlapAdvisory({
    toolCallId: "call_read_2",
    toolCallDetail: createReadDetail({ startLineNumber: 20, returnedLineCount: 21 }),
  });

  expect(advisory).toMatchObject({
    overlappedLineCount: 11,
    returnedLineCount: 21,
    missingLineRanges: [{ startLineNumber: 31, endLineNumber: 40 }],
  });
  expect(advisory?.advisoryText).toContain("<overlap_ratio_percent>52</overlap_ratio_percent>");
  expect(advisory?.advisoryText).toContain("- lines 31-40");
  expect(advisory?.advisoryText).toContain("request only the missing line ranges");
});

test("SameTurnReadCoverageTracker stays quiet for low-overlap reads", () => {
  const readCoverageTracker = new SameTurnReadCoverageTracker();
  readCoverageTracker.recordProviderVisibleReadCoverage({
    toolCallId: "call_read_1",
    toolCallDetail: createReadDetail({ startLineNumber: 10, returnedLineCount: 6 }),
  });

  expect(readCoverageTracker.createReadOverlapAdvisory({
    toolCallId: "call_read_2",
    toolCallDetail: createReadDetail({ startLineNumber: 1, returnedLineCount: 20 }),
  })).toBeUndefined();
});

test("SameTurnReadCoverageTracker escapes advisory XML-facing values", () => {
  const readCoverageTracker = new SameTurnReadCoverageTracker();
  readCoverageTracker.recordProviderVisibleReadCoverage({
    toolCallId: "call<&\"1",
    toolCallDetail: createReadDetail({ readFilePath: "src/a<&\".ts", startLineNumber: 1, returnedLineCount: 5 }),
  });

  const advisory = readCoverageTracker.createReadOverlapAdvisory({
    toolCallId: "call<&\"2",
    toolCallDetail: createReadDetail({ readFilePath: "src/a<&\".ts", startLineNumber: 1, returnedLineCount: 5 }),
  });

  expect(advisory?.advisoryText).toContain('read_file_path="src/a&lt;&amp;&quot;.ts"');
  expect(advisory?.advisoryText).toContain("call&lt;&amp;\"1");
  expect(advisory?.advisoryText).toContain("call&lt;&amp;\"2");
});

test("SameTurnReadCoverageTracker clears same-turn coverage after invalidation", () => {
  const readCoverageTracker = new SameTurnReadCoverageTracker();
  readCoverageTracker.recordProviderVisibleReadCoverage({
    toolCallId: "call_read_1",
    toolCallDetail: createReadDetail({ startLineNumber: 10, returnedLineCount: 20 }),
  });
  readCoverageTracker.clear();

  expect(readCoverageTracker.createReadOverlapAdvisory({
    toolCallId: "call_read_2",
    toolCallDetail: createReadDetail({ startLineNumber: 10, returnedLineCount: 20 }),
  })).toBeUndefined();
});
