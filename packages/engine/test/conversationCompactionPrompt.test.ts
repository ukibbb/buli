import { expect, test } from "bun:test";
import { CONVERSATION_COMPACTION_PROMPT_TEXT } from "../src/conversationCompaction/conversationCompactionPrompt.ts";

test("conversation compaction prompt preserves resumable task state", () => {
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("active task state");
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("verified facts");
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("uncertainties");
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("inspected files");
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("stop condition");
  expect(CONVERSATION_COMPACTION_PROMPT_TEXT).toContain("Next Steps executable");
});
