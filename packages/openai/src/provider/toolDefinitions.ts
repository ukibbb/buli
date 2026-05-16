import type { ProviderAvailableToolName } from "@buli/contracts";

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
    description: "Read a file or directory inside the current workspace. Use this instead of bash for known files and directories. For files, lines are returned with 1-indexed line numbers. If output is truncated and the missing lines may affect the answer, continue with offset before concluding.",
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

export function createEditToolDefinition() {
  return {
    type: "function",
    name: "edit",
    description: "Replace one exact text occurrence in an existing workspace file. Use this for targeted file changes after reading the relevant file. The app shows a diff and requires approval before applying the edit.",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Path to the existing file to edit. Relative paths are resolved from the workspace root.",
        },
        oldString: {
          type: "string",
          description: "Exact text to replace. It must appear exactly once in the file.",
        },
        newString: {
          type: "string",
          description: "Replacement text. Use an empty string only when intentionally deleting oldString.",
        },
      },
      required: ["filePath", "oldString", "newString"],
      additionalProperties: false,
    },
    strict: true,
  };
}

export function createWriteToolDefinition() {
  return {
    type: "function",
    name: "write",
    description: "Create or overwrite a workspace file with complete file content. Use this for new files or full-file rewrites. The app shows a diff and requires approval before writing.",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Path to the file to create or overwrite. Relative paths are resolved from the workspace root.",
        },
        content: {
          type: "string",
          description: "Complete desired file content.",
        },
      },
      required: ["filePath", "content"],
      additionalProperties: false,
    },
    strict: true,
  };
}

export function createExploreToolDefinition() {
  return {
    type: "function",
    name: "explore",
    description: "Ask a read-only Explorer subagent to inspect the codebase with read, glob, and grep, then return a concise report. Use this for broad or multi-step discovery before deciding what to explain or change. Ask it to identify inspected files and remaining context gaps.",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Short description of what the Explorer should investigate.",
        },
        prompt: {
          type: "string",
          description: "Detailed exploration instructions, including what files, patterns, flows, or questions to answer.",
        },
      },
      required: ["description", "prompt"],
      additionalProperties: false,
    },
    strict: true,
  };
}

export function createOpenAiToolDefinitions(input: {
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
} = {}) {
  const toolDefinitions = [
    createBashToolDefinition(),
    createReadToolDefinition(),
    createGlobToolDefinition(),
    createGrepToolDefinition(),
    createEditToolDefinition(),
    createWriteToolDefinition(),
    createExploreToolDefinition(),
  ];

  if (!input.availableToolNames) {
    return toolDefinitions;
  }

  const availableToolNameSet = new Set<ProviderAvailableToolName>(input.availableToolNames);
  return toolDefinitions.filter((toolDefinition) => availableToolNameSet.has(toolDefinition.name as ProviderAvailableToolName));
}
