import {
  ASSISTANT_TOOL_REQUEST_NAMES,
  MAX_BASH_TOOL_TIMEOUT_MILLISECONDS,
  ToolCallRequestSchema,
  isAssistantToolRequestName,
  type AssistantToolRequestName,
  type ProviderAvailableToolName,
  type ToolCallRequest,
  type ToolCallRequestByName,
} from "@buli/contracts";
import type { ZodIssue } from "zod";

type OpenAiJsonSchemaTypeName = "string" | "integer" | "object" | "array" | "boolean" | "null";

type OpenAiToolParameterProperty = {
  readonly type: OpenAiJsonSchemaTypeName | readonly OpenAiJsonSchemaTypeName[];
  readonly description: string;
  readonly minimum?: number;
  readonly maximum?: number;
};

type OpenAiToolParameters = {
  readonly type: "object";
  readonly properties: Record<string, OpenAiToolParameterProperty>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
};

export type OpenAiToolDefinition<ToolName extends AssistantToolRequestName = AssistantToolRequestName> = {
  readonly type: "function";
  readonly name: ToolName;
  readonly description: string;
  readonly parameters: OpenAiToolParameters;
  readonly strict: true;
};

type JsonObjectRecord = {
  readonly [fieldName: string]: unknown;
};

type OpenAiToolAdapter<ToolName extends AssistantToolRequestName> = {
  readonly toolName: ToolName;
  readonly definition: OpenAiToolDefinition<ToolName>;
  parseToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<ToolName>;
};

export function createBashToolDefinition(): OpenAiToolDefinition<"bash"> {
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
          minimum: 1,
          maximum: MAX_BASH_TOOL_TIMEOUT_MILLISECONDS,
          description: "Timeout in milliseconds, or null to use the default timeout.",
        },
      },
      required: ["command", "description", "workdir", "timeout"],
      additionalProperties: false,
    },
    strict: true,
  };
}

export function createReadToolDefinition(): OpenAiToolDefinition<"read"> {
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
          minimum: 1,
          description: "1-indexed first line to return, or null to start at line 1.",
        },
        limit: {
          type: ["integer", "null"],
          minimum: 1,
          description: "Maximum number of lines or directory entries to return, or null for the default limit.",
        },
      },
      required: ["filePath", "offset", "limit"],
      additionalProperties: false,
    },
    strict: true,
  };
}

export function createGlobToolDefinition(): OpenAiToolDefinition<"glob"> {
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

export function createGrepToolDefinition(): OpenAiToolDefinition<"grep"> {
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

export function createEditToolDefinition(): OpenAiToolDefinition<"edit"> {
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

export function createWriteToolDefinition(): OpenAiToolDefinition<"write"> {
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

export function createExploreToolDefinition(): OpenAiToolDefinition<"explore"> {
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

const openAiToolAdapterByName: { readonly [ToolName in AssistantToolRequestName]: OpenAiToolAdapter<ToolName> } = {
  bash: {
    toolName: "bash",
    definition: createBashToolDefinition(),
    parseToolCallRequest: parseBashOpenAiToolCallRequest,
  },
  read: {
    toolName: "read",
    definition: createReadToolDefinition(),
    parseToolCallRequest: parseReadOpenAiToolCallRequest,
  },
  glob: {
    toolName: "glob",
    definition: createGlobToolDefinition(),
    parseToolCallRequest: parseGlobOpenAiToolCallRequest,
  },
  grep: {
    toolName: "grep",
    definition: createGrepToolDefinition(),
    parseToolCallRequest: parseGrepOpenAiToolCallRequest,
  },
  edit: {
    toolName: "edit",
    definition: createEditToolDefinition(),
    parseToolCallRequest: parseEditOpenAiToolCallRequest,
  },
  write: {
    toolName: "write",
    definition: createWriteToolDefinition(),
    parseToolCallRequest: parseWriteOpenAiToolCallRequest,
  },
  explore: {
    toolName: "explore",
    definition: createExploreToolDefinition(),
    parseToolCallRequest: parseExploreOpenAiToolCallRequest,
  },
};

export function createOpenAiToolDefinitions(input: {
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
} = {}): OpenAiToolDefinition[] {
  const availableToolNameSet = input.availableToolNames
    ? new Set<ProviderAvailableToolName>(input.availableToolNames)
    : undefined;

  return ASSISTANT_TOOL_REQUEST_NAMES
    .filter((toolName) => !availableToolNameSet || availableToolNameSet.has(toolName))
    .map((toolName) => openAiToolAdapterByName[toolName].definition);
}

export function createOpenAiToolCallRequest(input: {
  toolName: string;
  argumentsText: string;
}): ToolCallRequest {
  const parsedArguments = parseOpenAiToolArguments(input);
  if (!isAssistantToolRequestName(input.toolName)) {
    throw new Error(`Unsupported tool requested by OpenAI: ${input.toolName}`);
  }

  return parseOpenAiToolCallRequestContract({
    toolName: input.toolName,
    toolCallRequest: openAiToolAdapterByName[input.toolName].parseToolCallRequest(parsedArguments),
  });
}

function parseOpenAiToolCallRequestContract(input: {
  toolName: AssistantToolRequestName;
  toolCallRequest: ToolCallRequest;
}): ToolCallRequest {
  const parsedToolCallRequest = ToolCallRequestSchema.safeParse(input.toolCallRequest);
  if (parsedToolCallRequest.success) {
    return parsedToolCallRequest.data;
  }

  const contractViolationText = parsedToolCallRequest.error.issues.map(formatToolCallContractViolation).join("; ");
  throw new Error(`OpenAI function call for ${input.toolName} violates Buli tool contract: ${contractViolationText}`);
}

function formatToolCallContractViolation(issue: ZodIssue): string {
  const fieldPath = issue.path.length > 0 ? issue.path.join(".") : "request";
  return `${fieldPath}: ${issue.message}`;
}

function parseBashOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"bash"> {
  const workingDirectoryPath = readOptionalStringToolArgument(parsedArguments, "workdir", "bash");
  const timeoutMilliseconds = readOptionalPositiveIntegerToolArgument(parsedArguments, "timeout", "bash");
  return {
    toolName: "bash",
    shellCommand: readRequiredStringToolArgument(parsedArguments, "command", "bash"),
    commandDescription: readRequiredStringToolArgument(parsedArguments, "description", "bash"),
    ...(workingDirectoryPath !== undefined ? { workingDirectoryPath } : {}),
    ...(timeoutMilliseconds !== undefined ? { timeoutMilliseconds } : {}),
  };
}

function parseReadOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"read"> {
  const offsetLineNumber = readOptionalPositiveIntegerToolArgument(parsedArguments, "offset", "read");
  const maximumLineCount = readOptionalPositiveIntegerToolArgument(parsedArguments, "limit", "read");
  return {
    toolName: "read",
    readTargetPath: readRequiredStringToolArgument(parsedArguments, "filePath", "read"),
    ...(offsetLineNumber !== undefined ? { offsetLineNumber } : {}),
    ...(maximumLineCount !== undefined ? { maximumLineCount } : {}),
  };
}

function parseGlobOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"glob"> {
  const searchDirectoryPath = readOptionalStringToolArgument(parsedArguments, "path", "glob");
  return {
    toolName: "glob",
    globPattern: readRequiredStringToolArgument(parsedArguments, "pattern", "glob"),
    ...(searchDirectoryPath !== undefined ? { searchDirectoryPath } : {}),
  };
}

function parseGrepOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"grep"> {
  const searchPath = readOptionalStringToolArgument(parsedArguments, "path", "grep");
  const includeGlobPattern = readOptionalStringToolArgument(parsedArguments, "include", "grep");
  return {
    toolName: "grep",
    regexPattern: readRequiredStringToolArgument(parsedArguments, "pattern", "grep"),
    ...(searchPath !== undefined ? { searchPath } : {}),
    ...(includeGlobPattern !== undefined ? { includeGlobPattern } : {}),
  };
}

function parseEditOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"edit"> {
  return {
    toolName: "edit",
    editTargetPath: readRequiredStringToolArgument(parsedArguments, "filePath", "edit"),
    oldString: readRequiredStringToolArgument(parsedArguments, "oldString", "edit"),
    newString: readRequiredTextToolArgument(parsedArguments, "newString", "edit"),
  };
}

function parseWriteOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"write"> {
  return {
    toolName: "write",
    writeTargetPath: readRequiredStringToolArgument(parsedArguments, "filePath", "write"),
    fileContent: readRequiredTextToolArgument(parsedArguments, "content", "write"),
  };
}

function parseExploreOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"explore"> {
  return {
    toolName: "explore",
    explorationDescription: readRequiredStringToolArgument(parsedArguments, "description", "explore"),
    explorationPrompt: readRequiredStringToolArgument(parsedArguments, "prompt", "explore"),
  };
}

function parseOpenAiToolArguments(input: { toolName: string; argumentsText: string }): JsonObjectRecord {
  let parsedArguments: unknown;
  try {
    parsedArguments = JSON.parse(input.argumentsText) as unknown;
  } catch (error) {
    const parsingFailureExplanation = error instanceof Error ? error.message : String(error);
    throw new Error(`OpenAI function call for ${input.toolName} has malformed JSON arguments: ${parsingFailureExplanation}`);
  }
  if (typeof parsedArguments !== "object" || parsedArguments === null || Array.isArray(parsedArguments)) {
    throw new Error(`OpenAI function call for ${input.toolName} has non-object arguments`);
  }

  return parsedArguments as JsonObjectRecord;
}

function readRequiredStringToolArgument(
  parsedArguments: JsonObjectRecord,
  argumentName: string,
  toolName: string,
): string {
  const argumentValue = parsedArguments[argumentName];
  if (typeof argumentValue !== "string" || argumentValue.length === 0) {
    throw new Error(`OpenAI function call for ${toolName} is missing required string argument: ${argumentName}`);
  }

  return argumentValue;
}

function readRequiredTextToolArgument(
  parsedArguments: JsonObjectRecord,
  argumentName: string,
  toolName: string,
): string {
  const argumentValue = parsedArguments[argumentName];
  if (typeof argumentValue !== "string") {
    throw new Error(`OpenAI function call for ${toolName} is missing required string argument: ${argumentName}`);
  }

  return argumentValue;
}

function readOptionalStringToolArgument(
  parsedArguments: JsonObjectRecord,
  argumentName: string,
  toolName: string,
): string | undefined {
  const argumentValue = parsedArguments[argumentName];
  if (argumentValue === undefined || argumentValue === null) {
    return undefined;
  }
  if (typeof argumentValue === "string" && argumentValue.length > 0) {
    return argumentValue;
  }

  throw new Error(`OpenAI function call for ${toolName} has invalid string argument: ${argumentName}`);
}

function readOptionalPositiveIntegerToolArgument(
  parsedArguments: JsonObjectRecord,
  argumentName: string,
  toolName: string,
): number | undefined {
  const argumentValue = parsedArguments[argumentName];
  if (argumentValue === undefined || argumentValue === null) {
    return undefined;
  }
  if (typeof argumentValue === "number" && Number.isInteger(argumentValue) && argumentValue > 0) {
    return argumentValue;
  }

  throw new Error(`OpenAI function call for ${toolName} has invalid positive integer argument: ${argumentName}`);
}
