import { expect, test } from "bun:test";
import { AssistantPresentationBlockStreamParser } from "../src/assistantPresentationBlockParser.ts";

const learningSequenceJsonText = JSON.stringify({
  titleText: "Runtime flow",
  sequenceItems: [
    { labelText: "Prompt accepted" },
    { labelText: "Provider streams", detailText: "Chunks become events." },
  ],
});

test("AssistantPresentationBlockStreamParser parses learning sequence fences across chunks", () => {
  const assistantPresentationBlockStreamParser = new AssistantPresentationBlockStreamParser();

  expect(assistantPresentationBlockStreamParser.appendAssistantText("Intro\n```buli.learn")).toEqual([
    { segmentKind: "plain_text", text: "Intro\n" },
  ]);
  expect(assistantPresentationBlockStreamParser.appendAssistantText(`ing_sequence\n${learningSequenceJsonText}\n`)).toEqual([]);
  expect(assistantPresentationBlockStreamParser.appendAssistantText("```\nOutro")).toEqual([
    {
      segmentKind: "learning_sequence",
      learningSequence: {
        titleText: "Runtime flow",
        sequenceItems: [
          { labelText: "Prompt accepted" },
          { labelText: "Provider streams", detailText: "Chunks become events." },
        ],
      },
      fallbackMarkdownText: "**Runtime flow**\nPrompt accepted -> Provider streams\n\n- Provider streams: Chunks become events.",
    },
    { segmentKind: "plain_text", text: "Outro" },
  ]);
});

test("AssistantPresentationBlockStreamParser accepts whitespace around fence markers", () => {
  const assistantPresentationBlockStreamParser = new AssistantPresentationBlockStreamParser();

  expect(assistantPresentationBlockStreamParser.appendAssistantText([
    "```buli.learning_sequence   ",
    learningSequenceJsonText,
    "```   ",
  ].join("\n"))).toEqual([
    expect.objectContaining({
      segmentKind: "learning_sequence",
      learningSequence: expect.objectContaining({ titleText: "Runtime flow" }),
    }),
  ]);
});

test("AssistantPresentationBlockStreamParser keeps malformed blocks as plain text", () => {
  const assistantPresentationBlockStreamParser = new AssistantPresentationBlockStreamParser();
  const malformedBlockText = "```buli.learning_sequence\n{not-json}\n```";

  expect(assistantPresentationBlockStreamParser.appendAssistantText(malformedBlockText)).toEqual([
    { segmentKind: "plain_text", text: malformedBlockText },
  ]);
});

test("AssistantPresentationBlockStreamParser flushes unterminated blocks as plain text", () => {
  const assistantPresentationBlockStreamParser = new AssistantPresentationBlockStreamParser();
  const unterminatedBlockText = `Before\n\`\`\`buli.learning_sequence\n${learningSequenceJsonText}`;

  expect(assistantPresentationBlockStreamParser.appendAssistantText(unterminatedBlockText)).toEqual([
    { segmentKind: "plain_text", text: "Before\n" },
  ]);
  expect(assistantPresentationBlockStreamParser.flushPendingAssistantText()).toEqual([
    { segmentKind: "plain_text", text: `\`\`\`buli.learning_sequence\n${learningSequenceJsonText}` },
  ]);
});
