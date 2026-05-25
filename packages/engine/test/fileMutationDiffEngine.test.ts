import { expect, test } from "bun:test";
import goldenFileMutationDiffCases from "./fixtures/file-mutation-diff-golden-cases.json" with { type: "json" };
import {
  TypeScriptFileMutationDiffEngine,
  createUnifiedFileDiff,
  type FileMutationDiffRequest,
  type FileMutationDiffResult,
} from "../src/index.ts";

type GoldenFileMutationDiffCase = Readonly<{
  caseName: string;
  request: Readonly<{
    displayPath: string;
    beforeText: string | null;
    afterText: string;
  }>;
  expectedResult: FileMutationDiffResult;
}>;

const typedGoldenFileMutationDiffCases = goldenFileMutationDiffCases satisfies readonly GoldenFileMutationDiffCase[];

function createFileMutationDiffRequest(goldenCase: GoldenFileMutationDiffCase): FileMutationDiffRequest {
  return {
    displayPath: goldenCase.request.displayPath,
    beforeText: goldenCase.request.beforeText ?? undefined,
    afterText: goldenCase.request.afterText,
  };
}

for (const goldenCase of typedGoldenFileMutationDiffCases) {
  test(`TypeScriptFileMutationDiffEngine matches golden case: ${goldenCase.caseName}`, () => {
    const diffEngine = new TypeScriptFileMutationDiffEngine();

    expect(diffEngine.createFileMutationDiff(createFileMutationDiffRequest(goldenCase))).toEqual(goldenCase.expectedResult);
  });
}

test("createUnifiedFileDiff delegates through the default diff engine contract", () => {
  const goldenCase = typedGoldenFileMutationDiffCases[0];
  if (!goldenCase) {
    throw new Error("Expected at least one golden file-mutation diff case.");
  }

  expect(createUnifiedFileDiff(createFileMutationDiffRequest(goldenCase))).toEqual(goldenCase.expectedResult);
});
