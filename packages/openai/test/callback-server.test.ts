import { expect, test } from "bun:test";
import { OpenAiCallbackServer } from "../src/auth/callback-server.ts";

test("OpenAiCallbackServer resolves a valid callback", async () => {
  const server = new OpenAiCallbackServer({ port: 0 });
  const { redirectUri } = await server.start();
  const pending = server.waitForCode("expected-state");

  expect(redirectUri).toContain("http://localhost:");
  const response = await fetch(`${redirectUri}?code=auth-code&state=expected-state`);
  const result = await pending;

  expect(response.status).toBe(200);
  expect(result.code).toBe("auth-code");

  await server.stop();
});

test("OpenAiCallbackServer ignores an invalid state without cancelling pending login", async () => {
  const server = new OpenAiCallbackServer({ port: 0 });
  const { redirectUri } = await server.start();
  const pending = server.waitForCode("expected-state");

  const invalidStateResponse = await fetch(`${redirectUri}?code=wrong-code&state=wrong-state`);
  await invalidStateResponse.text();
  const validStateResponse = await fetch(`${redirectUri}?code=auth-code&state=expected-state`);
  const result = await pending;

  expect(invalidStateResponse.status).toBe(400);
  expect(validStateResponse.status).toBe(200);
  expect(result.code).toBe("auth-code");

  await server.stop();
});

test("OpenAiCallbackServer rejects an OAuth error callback", async () => {
  const server = new OpenAiCallbackServer({ port: 0 });
  const { redirectUri } = await server.start();
  const pending = server.waitForCode("expected-state");
  const failure = pending
    .then(() => {
      throw new Error("expected callback rejection");
    })
    .catch((error) => {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("User cancelled");
    });

  const response = await fetch(`${redirectUri}?error=access_denied&error_description=User%20cancelled&state=expected-state`);
  await response.text();

  await failure;
  expect(response.status).toBe(200);

  await server.stop();
});

test("OpenAiCallbackServer escapes OAuth error text before rendering HTML", async () => {
  const server = new OpenAiCallbackServer({ port: 0 });
  const { redirectUri } = await server.start();
  const pending = server.waitForCode("expected-state");
  const failure = pending
    .then(() => {
      throw new Error("expected callback rejection");
    })
    .catch((error) => {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("<script>alert(1)</script>");
    });

  const response = await fetch(
    `${redirectUri}?error=access_denied&error_description=%3Cscript%3Ealert(1)%3C%2Fscript%3E&state=expected-state`,
  );
  const responseHtml = await response.text();

  await failure;
  expect(response.status).toBe(200);
  expect(responseHtml).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(responseHtml).not.toContain("<script>alert(1)</script>");

  await server.stop();
});

test("OpenAiCallbackServer ignores OAuth errors with invalid state", async () => {
  const server = new OpenAiCallbackServer({ port: 0 });
  const { redirectUri } = await server.start();
  const pending = server.waitForCode("expected-state");

  const invalidStateResponse = await fetch(
    `${redirectUri}?error=access_denied&error_description=Wrong%20state&state=wrong-state`,
  );
  await invalidStateResponse.text();
  const validStateResponse = await fetch(`${redirectUri}?code=auth-code&state=expected-state`);
  const result = await pending;

  expect(invalidStateResponse.status).toBe(400);
  expect(validStateResponse.status).toBe(200);
  expect(result.code).toBe("auth-code");

  await server.stop();
});
