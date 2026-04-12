import { expect, test } from "bun:test";
import {
  AuthStoreSchema,
  ProviderFinishEventSchema,
  TokenUsageSchema,
  TurnEventSchema,
} from "../src/index.ts";

test("AuthStoreSchema parses an OpenAI OAuth store", () => {
  const store = AuthStoreSchema.parse({
    openai: {
      provider: "openai",
      method: "oauth",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: 1_764_000_000,
      accountId: "acct_123",
    },
  });

  expect(store.openai?.provider).toBe("openai");
  expect(store.openai?.accountId).toBe("acct_123");
});

test("TokenUsageSchema parses reasoning token usage", () => {
  const usage = TokenUsageSchema.parse({
    total: 171,
    input: 100,
    output: 40,
    reasoning: 21,
    cache: {
      read: 10,
      write: 0,
    },
  });

  expect(usage.total).toBe(171);
  expect(usage.reasoning).toBe(21);
  expect(usage.cache.read).toBe(10);
});

test("ProviderFinishEventSchema parses final usage", () => {
  const event = ProviderFinishEventSchema.parse({
    type: "finish",
    usage: {
      total: 220,
      input: 120,
      output: 60,
      reasoning: 40,
      cache: {
        read: 15,
        write: 0,
      },
    },
  });

  expect(event.usage.output).toBe(60);
  expect(event.usage.reasoning).toBe(40);
});

test("TurnEventSchema parses a completed assistant turn", () => {
  const event = TurnEventSchema.parse({
    type: "assistant_stream_finished",
    message: {
      id: "msg_1",
      role: "assistant",
      text: "Hello from the model",
    },
    usage: {
      total: 90,
      input: 50,
      output: 30,
      reasoning: 10,
      cache: {
        read: 0,
        write: 0,
      },
    },
  });

  expect(event.type).toBe("assistant_stream_finished");
  if (event.type !== "assistant_stream_finished") {
    throw new Error("expected assistant_stream_finished event");
  }

  expect(event.message.role).toBe("assistant");
  expect(event.usage.reasoning).toBe(10);
});
