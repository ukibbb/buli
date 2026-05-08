export function createBashToolDefinition() {
  return {
    type: "function",
    name: "bash",
    description: "Run a command line inside the current workspace and return stdout, stderr, and the exit code. Provide the command directly; do not wrap it in bash -lc, sh -c, or another shell. Do not use bash for simple file reads, file discovery, or text search; use read, glob, or grep instead.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Command line to run directly. The app already executes it through the user's shell.",
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

export function createReadToolDefinition() {
  return {
    type: "function",
    name: "read",
    description: "Read a file or directory inside the current workspace. Use this instead of bash for known files and directories. For files, lines are returned with 1-indexed line numbers.",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Path to the file or directory to read. Relative paths are resolved from the workspace root.",
        },
        offset: {
          type: ["integer", "null"],
          description: "1-indexed first line to return, or null to start at line 1.",
        },
        limit: {
          type: ["integer", "null"],
          description: "Maximum number of lines or directory entries to return, or null for the default limit.",
        },
      },
      required: ["filePath", "offset", "limit"],
      additionalProperties: false,
    },
    strict: true,
  };
}

export function createGlobToolDefinition() {
  return {
    type: "function",
    name: "glob",
    description: "Find files inside the current workspace by filename glob pattern. Use this instead of bash for file discovery.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: 'Glob pattern to match, such as "**/*.ts" or "package.json".',
        },
        path: {
          type: ["string", "null"],
          description: "Directory to search in, or null to search from the workspace root.",
        },
      },
      required: ["pattern", "path"],
      additionalProperties: false,
    },
    strict: true,
  };
}

export function createGrepToolDefinition() {
  return {
    type: "function",
    name: "grep",
    description: "Search text inside files in the current workspace using a JavaScript regular expression. Use this instead of bash for text search.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Regular expression pattern to search for.",
        },
        path: {
          type: ["string", "null"],
          description: "File or directory to search, or null to search from the workspace root.",
        },
        include: {
          type: ["string", "null"],
          description: 'Optional file glob to include, such as "*.ts" or "**/*.{ts,tsx}"; null searches all text files.',
        },
      },
      required: ["pattern", "path", "include"],
      additionalProperties: false,
    },
    strict: true,
  };
}

export function createOpenAiToolDefinitions() {
  return [
    createBashToolDefinition(),
    createReadToolDefinition(),
    createGlobToolDefinition(),
    createGrepToolDefinition(),
  ];
}
