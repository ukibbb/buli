import { expect, test } from "bun:test";
import { buildModelFacingPromptTextFromPromptContextReferences } from "../src/index.ts";

test("buildModelFacingPromptTextFromPromptContextReferences stops when aborted", async () => {
  const abortController = new AbortController();
  abortController.abort();

  await expect(
    buildModelFacingPromptTextFromPromptContextReferences({
      promptText: "Read @package.json",
      promptContextBrowseRootPath: process.cwd(),
      abortSignal: abortController.signal,
    }),
  ).rejects.toThrow("Prompt context expansion interrupted");
});
