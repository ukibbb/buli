import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenAiAuthStore } from "../src/auth/store.ts";
import { OpenAiProvider } from "../src/provider/client.ts";
import { parseOpenAiStream } from "../src/provider/stream.ts";

test("parseOpenAiStream yields text deltas and final usage", async () => {
  const response = new Response(
    [
      'data: {"type":"response.created","response":{"id":"resp_1","created_at":1,"model":"gpt-5.4","service_tier":null}}\n\n',
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Hello"}\n\n',
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":" world"}\n\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":120,"input_tokens_details":{"cached_tokens":20},"output_tokens":60,"output_tokens_details":{"reasoning_tokens":10},"total_tokens":180},"service_tier":null}}\n\n',
    ].join(""),
    {
      headers: {
        "Content-Type": "text/event-stream",
      },
    },
  );

  const events = [];
  for await (const event of parseOpenAiStream(response)) {
    events.push(event);
  }

  expect(events).toEqual([
    { type: "text_chunk", text: "Hello" },
    { type: "text_chunk", text: " world" },
    {
      type: "completed",
      usage: {
        total: 180,
        input: 100,
        output: 50,
        reasoning: 10,
        cache: { read: 20, write: 0 },
      },
    },
  ]);
});

test("parseOpenAiStream accepts CRLF-delimited SSE frames", async () => {
  const response = new Response(
    [
      'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Hello"}\r\n\r\n',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":5}}}\r\n\r\n',
    ].join(""),
    {
      headers: {
        "Content-Type": "text/event-stream",
      },
    },
  );

  const events = [];
  for await (const event of parseOpenAiStream(response)) {
    events.push(event);
  }

  expect(events).toEqual([
    { type: "text_chunk", text: "Hello" },
    {
      type: "completed",
      usage: {
        total: 15,
        input: 10,
        output: 5,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    },
  ]);
});

test("OpenAiProvider sends auth headers and streams assistant response provider events", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-stream-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
    accountId: "acct_123",
  });

  const requests: Array<{ headers: Headers; body: string }> = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({
        headers: new Headers(request.headers as Record<string, string>),
        body,
      });

      response.writeHead(200, {
        "Content-Type": "text/event-stream",
      });
      response.write('data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Hello from server"}\n\n');
      response.write(
        'data: {"type":"response.completed","response":{"usage":{"input_tokens":90,"input_tokens_details":{"cached_tokens":10},"output_tokens":45,"output_tokens_details":{"reasoning_tokens":5},"total_tokens":135},"service_tier":null}}\n\n',
      );
      response.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("stream test server address unavailable");
  }

  try {
    const provider = new OpenAiProvider({
      endpoint: `http://127.0.0.1:${address.port}`,
      store,
    });

    const events = [];
    for await (const event of provider.streamAssistantResponse({
      promptText: "Say hello",
      selectedModelId: "gpt-5.4",
    })) {
      events.push(event);
    }

    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer access-token");
    expect(requests[0]?.headers.get("chatgpt-account-id")).toBe("acct_123");
    expect(JSON.parse(requests[0]?.body ?? "{}")).toEqual({
      model: "gpt-5.4",
      instructions: "You are buli, a local terminal coding assistant. Answer directly and concisely.",
      store: false,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Say hello",
            },
          ],
        },
      ],
      stream: true,
    });
    expect(events).toEqual([
      { type: "text_chunk", text: "Hello from server" },
      {
        type: "completed",
        usage: {
          total: 135,
          input: 80,
          output: 40,
          reasoning: 5,
          cache: { read: 10, write: 0 },
        },
      },
    ]);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("OpenAiProvider includes reasoning effort when one is selected", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-stream-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
  });

  const requests: string[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push(body);

      response.writeHead(200, {
        "Content-Type": "text/event-stream",
      });
      response.write('data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":5}}}\n\n');
      response.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("stream test server address unavailable");
  }

  try {
    const provider = new OpenAiProvider({
      endpoint: `http://127.0.0.1:${address.port}`,
      store,
    });

    for await (const _event of provider.streamAssistantResponse({
      promptText: "Think harder",
      selectedModelId: "gpt-5.4",
      selectedReasoningEffort: "high",
    })) {
      // Consume the stream to capture the request body.
    }

    expect(JSON.parse(requests[0] ?? "{}")).toEqual({
      model: "gpt-5.4",
      instructions: "You are buli, a local terminal coding assistant. Answer directly and concisely.",
      store: false,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Think harder",
            },
          ],
        },
      ],
      reasoning: {
        effort: "high",
      },
      stream: true,
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("OpenAiProvider includes backend error details when the request fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-stream-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
  });

  const server = createServer((_request, response) => {
    response.writeHead(400, {
      "Content-Type": "text/plain; charset=utf-8",
      "x-request-id": "req_123",
    });
    response.end("input must be a message array");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("stream test server address unavailable");
  }

  try {
    const provider = new OpenAiProvider({
      endpoint: `http://127.0.0.1:${address.port}`,
      store,
    });

    await expect(
      (async () => {
        for await (const _event of provider.streamAssistantResponse({
          promptText: "Say hello",
          selectedModelId: "gpt-5.4",
        })) {
          // This turn should fail before any events are emitted.
        }
      })(),
    ).rejects.toThrow("OpenAI stream request failed: 400 | input must be a message array | request_id=req_123");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});
