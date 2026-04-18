import { expect, test } from "bun:test";
import { createOpenAiResponsesInputItems } from "../src/provider/request.ts";

test("createOpenAiResponsesInputItems serializes replayed conversation messages as plain string content", () => {
  expect(
    createOpenAiResponsesInputItems([
      { itemKind: "user_message", messageText: "Tell me a joke" },
      { itemKind: "assistant_message", messageText: "Knock knock." },
    ]),
  ).toEqual([
    {
      role: "user",
      content: "Tell me a joke",
    },
    {
      role: "assistant",
      content: "Knock knock.",
    },
  ]);
});
