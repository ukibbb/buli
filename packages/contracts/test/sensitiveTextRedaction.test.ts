import { expect, test } from "bun:test";
import { redactSensitiveText } from "../src/index.ts";

test("redactSensitiveText redacts authentication headers and bearer tokens", () => {
  const redactedText = redactSensitiveText(
    "Authorization: Bearer secret-token\nProxy-Authorization: Basic dXNlcjpwYXNz\nstandalone Bearer another-secret",
  );

  expect(redactedText).toContain("Authorization: [REDACTED]");
  expect(redactedText).toContain("Proxy-Authorization: [REDACTED]");
  expect(redactedText).toContain("Bearer [REDACTED]");
  expect(redactedText).not.toContain("secret-token");
  expect(redactedText).not.toContain("dXNlcjpwYXNz");
  expect(redactedText).not.toContain("another-secret");
});

test("redactSensitiveText redacts common key value and JSON secret fields", () => {
  const redactedText = redactSensitiveText(
    'access_token=abc123 refreshToken: xyz789 {"client_secret":"json-secret","password":"hunter2"}',
  );

  expect(redactedText).toContain("access_token=[REDACTED]");
  expect(redactedText).toContain("refreshToken: [REDACTED]");
  expect(redactedText).toContain('"client_secret":"[REDACTED]"');
  expect(redactedText).toContain('"password":"[REDACTED]"');
  expect(redactedText).not.toContain("abc123");
  expect(redactedText).not.toContain("xyz789");
  expect(redactedText).not.toContain("json-secret");
  expect(redactedText).not.toContain("hunter2");
});

test("redactSensitiveText redacts cookies, JWTs, private keys, and database URL credentials", () => {
  const jwtText = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturepart12345";
  const redactedText = redactSensitiveText([
    "Cookie: session=abc; refresh=xyz",
    `jwt=${jwtText}`,
    "postgres://demo_user:demo_password@localhost:5432/app",
    "-----BEGIN PRIVATE KEY-----\nsecret-key-body\n-----END PRIVATE KEY-----",
  ].join("\n"));

  expect(redactedText).toContain("Cookie: [REDACTED]");
  expect(redactedText).toContain("jwt=[REDACTED]");
  expect(redactedText).toContain("postgres://[REDACTED]@localhost:5432/app");
  expect(redactedText).toContain("[REDACTED]");
  expect(redactedText).not.toContain("session=abc");
  expect(redactedText).not.toContain(jwtText);
  expect(redactedText).not.toContain("demo_password");
  expect(redactedText).not.toContain("secret-key-body");
});

test("redactSensitiveText redacts common provider token prefixes", () => {
  const openAiProjectToken = ["sk", "-proj-abc123456789"].join("");
  const anthropicToken = ["sk", "-ant-api03-abc123456789"].join("");
  const githubToken = ["gh", "p_abcdefghijklmnopqrstuvwxyz123456"].join("");
  const githubFineGrainedToken = ["github", "_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"].join("");
  const slackBotToken = ["xo", "xb", "-123456789012-123456789012-abcdefghijklmnop"].join("");
  const awsAccessKeyId = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
  const googleApiKey = ["AIza", "SyD123456789012345678901234567890123"].join("");
  const redactedText = redactSensitiveText([
    openAiProjectToken,
    anthropicToken,
    githubToken,
    githubFineGrainedToken,
    slackBotToken,
    awsAccessKeyId,
    googleApiKey,
  ].join("\n"));

  expect(redactedText).not.toContain(openAiProjectToken);
  expect(redactedText).not.toContain(anthropicToken);
  expect(redactedText).not.toContain(githubToken);
  expect(redactedText).not.toContain(githubFineGrainedToken);
  expect(redactedText).not.toContain(slackBotToken);
  expect(redactedText).not.toContain(awsAccessKeyId);
  expect(redactedText).not.toContain(googleApiKey);
});

test("redactSensitiveText caps redacted text length", () => {
  const redactedText = redactSensitiveText(`Bearer secret-token ${"x".repeat(100)}`, { maxLength: 40 });

  expect(redactedText).toContain("Bearer [REDACTED]");
  expect(redactedText).toContain("chars omitted");
  expect(redactedText).not.toContain("secret-token");
});
