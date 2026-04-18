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
          type: "string",
          description: "Optional working directory inside the workspace.",
        },
        timeout: {
          type: "integer",
          description: "Optional timeout in milliseconds.",
        },
      },
      required: ["command", "description"],
      additionalProperties: false,
    },
    strict: true,
  };
}
