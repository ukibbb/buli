import { describe, expect, test } from "bun:test";
import { TranscriptMessageSchema } from "../src/messages.ts";

describe("TranscriptMessageSchema", () => {
  test("parses_user_message_without_assistant_content_parts", () => {
    const parsed = TranscriptMessageSchema.parse({
      id: "m-1",
      role: "user",
      text: "hello",
    });
    expect(parsed.assistantContentParts).toBeUndefined();
  });

  test("parses_assistant_message_with_assistant_content_parts", () => {
    const parsed = TranscriptMessageSchema.parse({
      id: "m-2",
      role: "assistant",
      text: "Hello world",
      assistantContentParts: [
        { kind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "Hello world" }] },
      ],
    });
    expect(parsed.assistantContentParts?.length).toBe(1);
  });

  test("parses_assistant_message_without_assistant_content_parts_for_legacy_compat", () => {
    const parsed = TranscriptMessageSchema.parse({
      id: "m-3",
      role: "assistant",
      text: "plain",
    });
    expect(parsed.assistantContentParts).toBeUndefined();
  });

  test("rejects_message_with_unknown_field", () => {
    expect(() =>
      TranscriptMessageSchema.parse({
        id: "m-4",
        role: "user",
        text: "x",
        extraField: true,
      }),
    ).toThrow();
  });
});
