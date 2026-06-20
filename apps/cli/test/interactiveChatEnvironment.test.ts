import { expect, test } from "bun:test";
import {
  DEFAULT_NOVIBE_MCP_TIMEOUT_MS,
  DEFAULT_NOVIBE_MCP_URL,
  resolveInteractiveChatBashToolApprovalMode,
  resolveInteractiveChatMcpServersConfiguration,
  resolveInteractiveChatNoVibeMcpConfiguration,
  resolveInteractiveChatTaskSubagentProviderModelSelectionPolicy,
  resolveInteractiveChatTaskSubagentSoftElapsedTimeCheckpointMilliseconds,
} from "../src/interactiveChat/interactiveChatEnvironment.ts";

test("interactive chat uses trusted bash approval by default", () => {
  const resolvedBashToolApprovalMode = resolveInteractiveChatBashToolApprovalMode({
    requestedBashToolApprovalMode: undefined,
    environment: {},
  });

  expect(resolvedBashToolApprovalMode).toBe("trusted");
});

test("interactive chat lets the bash approval environment variable override the default", () => {
  const resolvedBashToolApprovalMode = resolveInteractiveChatBashToolApprovalMode({
    requestedBashToolApprovalMode: undefined,
    environment: { BULI_BASH_APPROVAL_MODE: "risk_based" },
  });

  expect(resolvedBashToolApprovalMode).toBe("risk_based");
});

test("interactive chat lets explicit bash approval input override the environment", () => {
  const resolvedBashToolApprovalMode = resolveInteractiveChatBashToolApprovalMode({
    requestedBashToolApprovalMode: "risk_based",
    environment: { BULI_BASH_APPROVAL_MODE: "trusted" },
  });

  expect(resolvedBashToolApprovalMode).toBe("risk_based");
});

test("interactive chat leaves task subagent provider model selection unconfigured by default", () => {
  const resolvedPolicy = resolveInteractiveChatTaskSubagentProviderModelSelectionPolicy({
    environment: {},
  });

  expect(resolvedPolicy).toEqual({ status: "resolved" });
});

test("interactive chat leaves task subagent elapsed-time checkpoint unconfigured by default", () => {
  const resolvedSoftElapsedTimeCheckpoint = resolveInteractiveChatTaskSubagentSoftElapsedTimeCheckpointMilliseconds({
    environment: {},
  });

  expect(resolvedSoftElapsedTimeCheckpoint).toEqual({ status: "resolved" });
});

test("interactive chat resolves task subagent elapsed-time checkpoint environment override", () => {
  const resolvedSoftElapsedTimeCheckpoint = resolveInteractiveChatTaskSubagentSoftElapsedTimeCheckpointMilliseconds({
    environment: { BULI_TASK_SUBAGENT_SOFT_ELAPSED_TIME_CHECKPOINT_MS: " 300000 " },
  });

  expect(resolvedSoftElapsedTimeCheckpoint).toEqual({ status: "resolved", value: 300_000 });
});

test("interactive chat rejects invalid task subagent elapsed-time checkpoint environment overrides", () => {
  const resolvedSoftElapsedTimeCheckpoint = resolveInteractiveChatTaskSubagentSoftElapsedTimeCheckpointMilliseconds({
    environment: { BULI_TASK_SUBAGENT_SOFT_ELAPSED_TIME_CHECKPOINT_MS: "0" },
  });

  expect(resolvedSoftElapsedTimeCheckpoint).toEqual({ status: "invalid" });
});

test("interactive chat resolves task subagent model and reasoning effort environment overrides", () => {
  const resolvedPolicy = resolveInteractiveChatTaskSubagentProviderModelSelectionPolicy({
    environment: {
      BULI_TASK_SUBAGENT_MODEL: " gpt-5.4-mini ",
      BULI_TASK_SUBAGENT_MAX_REASONING_EFFORT: "low",
    },
  });

  expect(resolvedPolicy).toEqual({
    status: "resolved",
    policy: {
      selectedModelIdOverride: "gpt-5.4-mini",
      maximumReasoningEffort: "low",
    },
  });
});

test("interactive chat rejects invalid task subagent reasoning effort environment overrides", () => {
  const resolvedPolicy = resolveInteractiveChatTaskSubagentProviderModelSelectionPolicy({
    environment: { BULI_TASK_SUBAGENT_MAX_REASONING_EFFORT: "too-much" },
  });

  expect(resolvedPolicy).toEqual({ status: "invalid" });
});

test("interactive chat leaves NoVibe MCP disabled by default", () => {
  const resolvedNoVibeMcpConfiguration = resolveInteractiveChatNoVibeMcpConfiguration({
    environment: {},
  });

  expect(resolvedNoVibeMcpConfiguration).toEqual({ status: "disabled" });
});

test("interactive chat resolves NoVibe MCP defaults when the bearer token is configured", () => {
  const resolvedNoVibeMcpConfiguration = resolveInteractiveChatNoVibeMcpConfiguration({
    environment: { BULI_NOVIBE_MCP_BEARER_TOKEN: " raw-dev-token " },
  });

  expect(resolvedNoVibeMcpConfiguration).toEqual({
    status: "resolved",
    configuration: {
      mcpUrl: DEFAULT_NOVIBE_MCP_URL,
      bearerToken: "raw-dev-token",
      timeoutMs: DEFAULT_NOVIBE_MCP_TIMEOUT_MS,
    },
  });
});

test("interactive chat resolves NoVibe MCP URL and timeout overrides", () => {
  const resolvedNoVibeMcpConfiguration = resolveInteractiveChatNoVibeMcpConfiguration({
    environment: {
      BULI_NOVIBE_MCP_BEARER_TOKEN: "raw-dev-token",
      BULI_NOVIBE_MCP_URL: " https://novibe.example.test/v1/mcp ",
      BULI_NOVIBE_MCP_TIMEOUT_MS: " 45000 ",
    },
  });

  expect(resolvedNoVibeMcpConfiguration).toEqual({
    status: "resolved",
    configuration: {
      mcpUrl: "https://novibe.example.test/v1/mcp",
      bearerToken: "raw-dev-token",
      timeoutMs: 45_000,
    },
  });
});

test("interactive chat rejects NoVibe MCP URL or timeout without a bearer token", () => {
  expect(resolveInteractiveChatNoVibeMcpConfiguration({
    environment: { BULI_NOVIBE_MCP_URL: "http://localhost:8001/v1/mcp" },
  })).toEqual({ status: "invalid", invalidReason: "missing_bearer_token" });
  expect(resolveInteractiveChatNoVibeMcpConfiguration({
    environment: { BULI_NOVIBE_MCP_TIMEOUT_MS: "45000" },
  })).toEqual({ status: "invalid", invalidReason: "missing_bearer_token" });
});

test("interactive chat rejects invalid NoVibe MCP URL and timeout values", () => {
  expect(resolveInteractiveChatNoVibeMcpConfiguration({
    environment: {
      BULI_NOVIBE_MCP_BEARER_TOKEN: "raw-dev-token",
      BULI_NOVIBE_MCP_URL: "not-a-url",
    },
  })).toEqual({ status: "invalid", invalidReason: "invalid_url" });
  expect(resolveInteractiveChatNoVibeMcpConfiguration({
    environment: {
      BULI_NOVIBE_MCP_BEARER_TOKEN: "raw-dev-token",
      BULI_NOVIBE_MCP_TIMEOUT_MS: "0",
    },
  })).toEqual({ status: "invalid", invalidReason: "invalid_timeout" });
});

test("interactive chat leaves generic MCP servers disabled by default", () => {
  expect(resolveInteractiveChatMcpServersConfiguration({ environment: {} })).toEqual({ status: "disabled" });
});

test("interactive chat resolves generic streamable HTTP MCP servers from JSON", () => {
  const resolvedMcpServersConfiguration = resolveInteractiveChatMcpServersConfiguration({
    environment: {
      DOCS_MCP_TOKEN: " docs-token ",
      BULI_MCP_SERVERS_JSON: JSON.stringify({
        docs: {
          transport: "streamable_http",
          url: " http://localhost:9001/mcp ",
          displayName: "Docs",
          bearerTokenEnv: "DOCS_MCP_TOKEN",
          timeoutMs: 12_345,
          headers: { "X-Client": "buli" },
          toolResultRetention: "summary",
          toolExecutionPolicy: "read_only_auto_approved",
        },
      }),
    },
  });

  expect(resolvedMcpServersConfiguration).toEqual({
    status: "resolved",
    configuration: {
      serverConfigurations: [
        {
          serverName: "docs",
          displayName: "Docs",
          transport: "streamable_http",
          url: "http://localhost:9001/mcp",
          bearerToken: "docs-token",
          timeoutMs: 12_345,
          headers: [{ name: "X-Client", value: "buli" }],
          toolResultRetention: "summary",
          toolExecutionPolicy: "read_only_auto_approved",
        },
      ],
    },
  });
});

test("interactive chat reports invalid generic MCP JSON", () => {
  expect(resolveInteractiveChatMcpServersConfiguration({
    environment: { BULI_MCP_SERVERS_JSON: "not-json" },
  })).toEqual({ status: "invalid", invalidReason: "invalid_json" });
});

test("interactive chat reports missing generic MCP bearer token env", () => {
  expect(resolveInteractiveChatMcpServersConfiguration({
    environment: {
      BULI_MCP_SERVERS_JSON: JSON.stringify({
        docs: {
          transport: "streamable_http",
          url: "http://localhost:9001/mcp",
          bearerTokenEnv: "DOCS_MCP_TOKEN",
        },
      }),
    },
  })).toEqual({ status: "invalid", invalidReason: "missing_bearer_token_env" });
});

test("interactive chat reports invalid generic MCP retention", () => {
  expect(resolveInteractiveChatMcpServersConfiguration({
    environment: {
      BULI_MCP_SERVERS_JSON: JSON.stringify({
        docs: {
          transport: "streamable_http",
          url: "http://localhost:9001/mcp",
          toolResultRetention: "forever",
        },
      }),
    },
  })).toEqual({ status: "invalid", invalidReason: "invalid_tool_result_retention" });
});

test("interactive chat reports invalid generic MCP tool execution policy", () => {
  expect(resolveInteractiveChatMcpServersConfiguration({
    environment: {
      BULI_MCP_SERVERS_JSON: JSON.stringify({
        docs: {
          transport: "streamable_http",
          url: "http://localhost:9001/mcp",
          toolExecutionPolicy: "auto_run_everything",
        },
      }),
    },
  })).toEqual({ status: "invalid", invalidReason: "invalid_tool_execution_policy" });
});

test("interactive chat synthesizes legacy NoVibe MCP env into a generic MCP server", () => {
  expect(resolveInteractiveChatMcpServersConfiguration({
    environment: { BULI_NOVIBE_MCP_BEARER_TOKEN: " raw-dev-token " },
  })).toEqual({
    status: "resolved",
    configuration: {
      serverConfigurations: [
        {
          serverName: "novibe",
          displayName: "NoVibe",
          transport: "streamable_http",
          url: DEFAULT_NOVIBE_MCP_URL,
          bearerToken: "raw-dev-token",
          timeoutMs: DEFAULT_NOVIBE_MCP_TIMEOUT_MS,
          toolExecutionPolicy: "read_only_auto_approved",
        },
      ],
    },
  });
});

test("interactive chat lets generic novibe config override the legacy NoVibe shortcut", () => {
  expect(resolveInteractiveChatMcpServersConfiguration({
    environment: {
      BULI_NOVIBE_MCP_BEARER_TOKEN: "legacy-token",
      BULI_MCP_SERVERS_JSON: JSON.stringify({
        novibe: {
          transport: "streamable_http",
          url: "http://localhost:9999/mcp",
        },
      }),
    },
  })).toEqual({
    status: "resolved",
    configuration: {
      serverConfigurations: [
        {
          serverName: "novibe",
          transport: "streamable_http",
          url: "http://localhost:9999/mcp",
          timeoutMs: DEFAULT_NOVIBE_MCP_TIMEOUT_MS,
        },
      ],
    },
  });
});
