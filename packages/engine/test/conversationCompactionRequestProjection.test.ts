import { expect, test } from "bun:test";
import type { ConversationSessionEntry } from "@buli/contracts";
import { prepareConversationEntriesForCompactionRequest } from "../src/index.ts";

test("prepareConversationEntriesForCompactionRequest strips heavyweight context without mutating canonical entries", () => {
  const longToolResultText = "x".repeat(2_100);
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Inspect the image",
      modelFacingPromptText: "Inspect the image",
      imageAttachments: [
        {
          attachmentId: "image-1",
          mimeType: "image/png",
          fileName: "cat.png",
          dataUrl: `data:image/png;base64,${"a".repeat(1_000)}`,
        },
      ],
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_read",
      toolCallRequest: {
        toolName: "read",
        readTargetPath: "large.log",
      },
    },
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_read",
      toolCallDetail: {
        toolName: "read",
        readFilePath: "large.log",
      },
      toolResultText: longToolResultText,
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "I read the large log.",
      providerTurnReplay: {
        provider: "openai",
        inputItems: [
          {
            type: "function_call_output",
            call_id: "call_read",
            output: "raw replay output".repeat(1_000),
          },
        ],
      },
    },
  ];

  const projection = prepareConversationEntriesForCompactionRequest({ conversationSessionEntries });

  expect(conversationSessionEntries[0]).toMatchObject({
    entryKind: "user_prompt",
    imageAttachments: [expect.objectContaining({ dataUrl: expect.stringContaining("data:image/png;base64,") })],
  });
  expect(conversationSessionEntries[2]).toMatchObject({
    entryKind: "completed_tool_result",
    toolResultText: longToolResultText,
  });
  expect(conversationSessionEntries[3]).toMatchObject({
    entryKind: "assistant_message",
    providerTurnReplay: expect.objectContaining({ provider: "openai" }),
  });

  expect(projection.conversationSessionEntries[0]).toEqual({
    entryKind: "user_prompt",
    promptText: "Inspect the image",
    modelFacingPromptText: "Inspect the image\n\n[Attached image/png: cat.png]",
  });
  expect(projection.conversationSessionEntries[2]).toMatchObject({
    entryKind: "completed_tool_result",
    toolResultText: expect.stringContaining("[Tool result truncated for compaction: omitted 100 chars]"),
  });
  expect(projection.conversationSessionEntries[3]).toEqual({
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "I read the large log.",
  });
  expect(projection.strippedImageAttachmentCount).toBe(1);
  expect(projection.truncatedToolResultCount).toBe(1);
  expect(projection.removedProviderTurnReplayCount).toBe(1);
  expect(projection.projectedCharacterCount).toBeLessThan(projection.originalCharacterCount);
});
