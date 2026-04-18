export function createBashToolDefinition() {
  return {
    type: "function",
    name: "bash",
    description: "Run a shell command inside the current workspace and return stdout, stderr, and the exit code.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Shell command to run.",
        },
        description: {
          type: "string",
          description: "Very short reason for running the command.",
        },
        workdir: {
          type: ["string", "null"],
          description: "Working directory inside the workspace, or null to use the workspace root.",
        },
        timeout: {
          type: ["integer", "null"],
          description: "Timeout in milliseconds, or null to use the default timeout.",
        },
      },
      required: ["command", "description", "workdir", "timeout"],
      additionalProperties: false,
    },
    strict: true,
  };
}
