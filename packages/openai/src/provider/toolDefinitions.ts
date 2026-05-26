import {
  ASSISTANT_TOOL_REQUEST_NAMES,
  MAX_BASH_TOOL_TIMEOUT_MILLISECONDS,
  MAX_EDIT_MANY_TOOL_EDIT_COUNT,
  MAX_GREP_CONTEXT_LINE_COUNT,
  MAX_PATCH_TOOL_PATCH_TEXT_LENGTH,
  MAX_SKILL_NAME_LENGTH,
  ToolCallRequestSchema,
  isAssistantSubagentName,
  isAssistantToolRequestName,
  SKILL_NAME_PATTERN_TEXT,
  type AssistantSubagentName,
  type AssistantToolRequestName,
  type ProviderAvailableToolName,
  type ToolCallRequest,
  type ToolCallRequestByName,
} from "@buli/contracts";
import type { ZodIssue } from "zod";

type OpenAiJsonSchemaTypeName = "string" | "integer" | "object" | "array" | "boolean" | "null";

type OpenAiProviderFunctionName = AssistantToolRequestName;

type OpenAiToolParameterProperty = {
  readonly type: OpenAiJsonSchemaTypeName | readonly OpenAiJsonSchemaTypeName[];
  readonly description: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly maxItems?: number;
  readonly maxLength?: number;
  readonly minItems?: number;
  readonly enum?: readonly string[];
  readonly pattern?: string;
  readonly items?: OpenAiToolParameterProperty;
  readonly properties?: Record<string, OpenAiToolParameterProperty>;
  readonly required?: readonly string[];
  readonly additionalProperties?: false;
};

type OpenAiToolParameters = {
  readonly type: "object";
  readonly properties: Record<string, OpenAiToolParameterProperty>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
};

export type OpenAiToolDefinition<FunctionName extends OpenAiProviderFunctionName = OpenAiProviderFunctionName> = {
  readonly type: "function";
  readonly name: FunctionName;
  readonly description: string;
  readonly parameters: OpenAiToolParameters;
  readonly strict: true;
};

type JsonObjectRecord = {
  readonly [fieldName: string]: unknown;
};

export type OpenAiExecutableToolCallIntent = {
  readonly intentKind: "executable_tool";
  readonly functionCallId: string;
  readonly toolCallRequest: ToolCallRequest;
};

export type OpenAiInvalidFunctionCallIntent = {
  readonly intentKind: "invalid_function_call";
  readonly functionCallId: string;
  readonly functionName: string;
  readonly invalidCallExplanation: string;
};

export type OpenAiProviderFunctionCallIntent =
  | OpenAiExecutableToolCallIntent
  | OpenAiInvalidFunctionCallIntent;

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
    description: "Read a file or directory inside the current workspace. Use this only for exact paths already evidenced by the user, search_many, glob, grep, a previous directory read, or a previous successful read. Do not read paths inferred from imports, symbols, filenames, likely extensions, or project conventions; discover uncertain paths with search_many, glob, or grep first. For files, lines are returned with 1-indexed line numbers. Do not guess offsets; if output is truncated and the missing lines may affect the answer, continue only from line counts returned by previous reads.",
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

export function createReadManyToolDefinition(): OpenAiToolDefinition<"read_many"> {
  return {
    type: "function",
    name: "read_many",
    description: "Read multiple files or directories inside the current workspace in one batched call. Use this when several exact paths are already evidenced by the user, search_many, glob, grep, a previous directory read, or a previous successful read. Prefer one larger independent read_many batch over many small sequential read calls because batch children run concurrently. Do not include paths inferred from imports, symbols, filenames, likely extensions, or project conventions; discover uncertain paths with search_many, glob, or grep first. Each target uses the same offset and limit semantics as read.",
    parameters: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          minItems: 1,
          description: "Files or directories to read. Use only exact evidenced paths.",
          items: {
            type: "object",
            description: "One file or directory read target.",
            properties: {
              filePath: {
                type: "string",
                description: "Path to the file or directory to read. Relative paths are resolved from the workspace root.",
              },
              offset: {
                type: ["integer", "null"],
                minimum: 1,
                description: "1-indexed first line to return for this target, or null to start at line 1.",
              },
              limit: {
                type: ["integer", "null"],
                minimum: 1,
                description: "Maximum number of lines or directory entries to return for this target, or null for the default limit.",
              },
            },
            required: ["filePath", "offset", "limit"],
            additionalProperties: false,
          },
        },
      },
      required: ["targets"],
      additionalProperties: false,
    },
    strict: true,
  };
}

export function createSearchManyToolDefinition(): OpenAiToolDefinition<"search_many"> {
  return {
    type: "function",
    name: "search_many",
    description: "Run multiple independent glob and grep searches inside the current workspace in one batched call. Use this first for broad file discovery or text-search mapping when the searches do not depend on each other. Prefer one larger independent search_many batch over many small sequential glob/grep calls because batch children run concurrently. For grep searches, set contextLineCount to a small number only when the surrounding lines are likely needed. Use read_many after search_many when several exact paths from the search results need inspection.",
    parameters: {
      type: "object",
      properties: {
        searches: {
          type: "array",
          minItems: 1,
          description: "Independent searches to run. Put unrelated glob and grep mapping searches in the same call instead of separate function calls.",
          items: {
            type: "object",
            description: "One glob or grep search.",
            properties: {
              searchKind: {
                type: "string",
                enum: ["glob", "grep"],
                description: "Search type: glob finds file paths by filename pattern; grep searches file contents by regular expression.",
              },
              pattern: {
                type: "string",
                description: "Glob pattern for glob searches, or JavaScript regular expression pattern for grep searches.",
              },
              path: {
                type: ["string", "null"],
                description: "Single directory for glob, single file or directory for grep, or null to search from the workspace root. Do not pass multiple paths.",
              },
              include: {
                type: ["string", "null"],
                description: "Optional grep include glob, such as *.ts or **/*.{ts,tsx}; use null for glob searches.",
              },
              contextLineCount: {
                type: ["integer", "null"],
                minimum: 0,
                maximum: MAX_GREP_CONTEXT_LINE_COUNT,
                description: `For grep searches, number of context lines before and after each returned match, 0-${MAX_GREP_CONTEXT_LINE_COUNT}; use null for glob searches or broad mapping.`,
              },
            },
            required: ["searchKind", "pattern", "path", "include", "contextLineCount"],
            additionalProperties: false,
          },
        },
      },
      required: ["searches"],
      additionalProperties: false,
    },
    strict: true,
  };
}

export function createGlobToolDefinition(): OpenAiToolDefinition<"glob"> {
  return {
    type: "function",
    name: "glob",
    description: "Find files inside the current workspace by filename glob pattern. Use this instead of bash for file discovery. The path argument is one directory only; do not pass multiple directories, shell globs, or a trailing * there.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: 'Glob pattern to match, such as "**/*.ts" or "package.json".',
        },
        path: {
          type: ["string", "null"],
          description: "Single directory to search in, or null to search from the workspace root. Do not pass multiple paths, spaces as separators, shell globs, or a trailing *; use pattern for matching or make separate glob calls.",
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
    description: "Search text inside files in the current workspace using a JavaScript regular expression. Use this instead of bash for text search. The path argument is one file or directory only; do not pass multiple paths, shell globs, or a trailing * there. Set contextLineCount to a small number only when surrounding lines are likely needed; use null or 0 for broad discovery.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Regular expression pattern to search for.",
        },
        path: {
          type: ["string", "null"],
          description: "Single file or directory to search, or null to search from the workspace root. Do not pass multiple paths, spaces as separators, shell globs, or a trailing *; use include to narrow files under one directory or make separate grep calls.",
        },
        include: {
          type: ["string", "null"],
          description: 'Optional file glob to include, such as "*.ts" or "**/*.{ts,tsx}"; null searches all text files.',
        },
        contextLineCount: {
          type: ["integer", "null"],
          minimum: 0,
          maximum: MAX_GREP_CONTEXT_LINE_COUNT,
          description: `Number of context lines before and after each returned match, 0-${MAX_GREP_CONTEXT_LINE_COUNT}; use null or 0 for broad discovery.`,
        },
      },
      required: ["pattern", "path", "include", "contextLineCount"],
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

export function createEditManyToolDefinition(): OpenAiToolDefinition<"edit_many"> {
  return {
    type: "function",
    name: "edit_many",
    description: "Apply multiple exact text replacements across one or more existing workspace files in one approval. Prefer this over several edit calls when changing multiple places, especially multiple places in the same file. Use patch or patch_many instead when a structured multi-line hunk is clearer than exact oldString replacements.",
    parameters: {
      type: "object",
      properties: {
        edits: {
          type: "array",
          minItems: 1,
          maxItems: MAX_EDIT_MANY_TOOL_EDIT_COUNT,
          description: "Ordered exact replacements to apply. Later edits see earlier edits in the same file.",
          items: {
            type: "object",
            description: "One exact text replacement.",
            properties: {
              filePath: {
                type: "string",
                description: "Path to the existing file to edit. Relative paths are resolved from the workspace root.",
              },
              oldString: {
                type: "string",
                description: "Exact text to replace. It must appear exactly once unless replaceAll is true.",
              },
              newString: {
                type: "string",
                description: "Replacement text. Use an empty string only when intentionally deleting oldString.",
              },
              replaceAll: {
                type: ["boolean", "null"],
                description: "True to replace every occurrence of oldString in that file; null or false requires exactly one match.",
              },
            },
            required: ["filePath", "oldString", "newString", "replaceAll"],
            additionalProperties: false,
          },
        },
      },
      required: ["edits"],
      additionalProperties: false,
    },
    strict: true,
  };
}

export function createPatchToolDefinition(): OpenAiToolDefinition<"patch"> {
  return {
    type: "function",
    name: "patch",
    description: `Apply exactly one file section as a structured patch to the workspace in one approval. Use this for a single-file add/update/delete/move when a hunk is clearer than exact oldString replacement. Use patch_many for coordinated multi-file or multi-section changes. Patch syntax:\n*** Begin Patch\n*** Update File: src/app.ts\n@@\n-old\n+new\n*** End Patch`,
    parameters: {
      type: "object",
      properties: {
        patchText: {
          type: "string",
          maxLength: MAX_PATCH_TOOL_PATCH_TEXT_LENGTH,
          description: "Full patch text. Must contain exactly one file section inside *** Begin Patch / *** End Patch.",
        },
      },
      required: ["patchText"],
      additionalProperties: false,
    },
    strict: true,
  };
}

export function createPatchManyToolDefinition(): OpenAiToolDefinition<"patch_many"> {
  return {
    type: "function",
    name: "patch_many",
    description: `Apply a structured patch with one or more file sections in one approval. Prefer this for multi-file changes, multiple hunks in one file, or coordinated add/update/delete operations. Patch syntax:\n*** Begin Patch\n*** Add File: src/new.ts\n+export const value = true;\n*** Update File: src/app.ts\n@@\n-old\n+new\n*** Delete File: src/obsolete.ts\n*** End Patch`,
    parameters: {
      type: "object",
      properties: {
        patchText: {
          type: "string",
          maxLength: MAX_PATCH_TOOL_PATCH_TEXT_LENGTH,
          description: "Full patch text with one or more file sections inside *** Begin Patch / *** End Patch.",
        },
      },
      required: ["patchText"],
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

export function createTaskToolDefinition(): OpenAiToolDefinition<"task"> {
  return {
    type: "function",
    name: "task",
    description: "Launch a built-in Buli subagent and return its concise result. Use this for broad, independent codebase investigation that benefits from a separate read-only agent. When research naturally separates into independent areas, request multiple task calls in the same response instead of one oversized generic prompt. Give each task a focused scope, exact known paths or patterns, the question to answer, and the expected concise report shape. Currently available subagent: explore.",
    parameters: {
      type: "object",
      properties: {
        subagent: {
          type: "string",
          description: "Built-in subagent to run. Currently only explore is available.",
        },
        description: {
          type: "string",
          description: "Short description of the subagent task.",
        },
        prompt: {
          type: "string",
          description: "Detailed subagent instructions, including what files, patterns, flows, or questions to answer.",
        },
      },
      required: ["subagent", "description", "prompt"],
      additionalProperties: false,
    },
    strict: true,
  };
}

export function createSkillToolDefinition(): OpenAiToolDefinition<"skill"> {
  return {
    type: "function",
    name: "skill",
    description: "Load a Buli skill's full instructions by exact skill name. Use this when the user's task matches a skill listed in <available_skills>. The model initially sees only skill names and descriptions; call this tool to lazy-load the full markdown instructions before applying that specialized workflow.",
    parameters: {
      type: "object",
      properties: {
        skillName: {
          type: "string",
          maxLength: MAX_SKILL_NAME_LENGTH,
          pattern: SKILL_NAME_PATTERN_TEXT,
          description: "Exact skill name from <available_skills> to load.",
        },
      },
      required: ["skillName"],
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
  read_many: {
    toolName: "read_many",
    definition: createReadManyToolDefinition(),
    parseToolCallRequest: parseReadManyOpenAiToolCallRequest,
  },
  search_many: {
    toolName: "search_many",
    definition: createSearchManyToolDefinition(),
    parseToolCallRequest: parseSearchManyOpenAiToolCallRequest,
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
  edit_many: {
    toolName: "edit_many",
    definition: createEditManyToolDefinition(),
    parseToolCallRequest: parseEditManyOpenAiToolCallRequest,
  },
  patch: {
    toolName: "patch",
    definition: createPatchToolDefinition(),
    parseToolCallRequest: parsePatchOpenAiToolCallRequest,
  },
  patch_many: {
    toolName: "patch_many",
    definition: createPatchManyToolDefinition(),
    parseToolCallRequest: parsePatchManyOpenAiToolCallRequest,
  },
  write: {
    toolName: "write",
    definition: createWriteToolDefinition(),
    parseToolCallRequest: parseWriteOpenAiToolCallRequest,
  },
  task: {
    toolName: "task",
    definition: createTaskToolDefinition(),
    parseToolCallRequest: parseTaskOpenAiToolCallRequest,
  },
  skill: {
    toolName: "skill",
    definition: createSkillToolDefinition(),
    parseToolCallRequest: parseSkillOpenAiToolCallRequest,
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

export function createOpenAiProviderFunctionCallIntent(input: {
  functionCallId: string;
  functionName: string;
  argumentsText: string;
}): OpenAiProviderFunctionCallIntent {
  try {
    return createValidOpenAiProviderFunctionCallIntent(input);
  } catch (error) {
    return {
      intentKind: "invalid_function_call",
      functionCallId: input.functionCallId,
      functionName: input.functionName,
      invalidCallExplanation: error instanceof Error ? error.message : String(error),
    };
  }
}

function createValidOpenAiProviderFunctionCallIntent(input: {
  functionCallId: string;
  functionName: string;
  argumentsText: string;
}): OpenAiProviderFunctionCallIntent {
  const parsedArguments = parseOpenAiFunctionArguments({
    functionName: input.functionName,
    argumentsText: input.argumentsText,
  });
  if (isAssistantToolRequestName(input.functionName)) {
    return {
      intentKind: "executable_tool",
      functionCallId: input.functionCallId,
      toolCallRequest: parseOpenAiToolCallRequestContract({
        toolName: input.functionName,
        toolCallRequest: openAiToolAdapterByName[input.functionName].parseToolCallRequest(parsedArguments),
      }),
    };
  }

  throw new Error(`Unsupported function requested by OpenAI: ${input.functionName}`);
}

export function createOpenAiToolCallRequest(input: {
  toolName: string;
  argumentsText: string;
}): ToolCallRequest {
  const parsedArguments = parseOpenAiFunctionArguments({
    functionName: input.toolName,
    argumentsText: input.argumentsText,
  });
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

function parseReadManyOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"read_many"> {
  const readTargetArguments = readRequiredObjectArrayToolArgument(parsedArguments, "targets", "read_many");
  return {
    toolName: "read_many",
    readTargets: readTargetArguments.map((targetArguments) => {
      const offsetLineNumber = readOptionalPositiveIntegerToolArgument(targetArguments, "offset", "read_many");
      const maximumLineCount = readOptionalPositiveIntegerToolArgument(targetArguments, "limit", "read_many");
      return {
        readTargetPath: readRequiredStringToolArgument(targetArguments, "filePath", "read_many"),
        ...(offsetLineNumber !== undefined ? { offsetLineNumber } : {}),
        ...(maximumLineCount !== undefined ? { maximumLineCount } : {}),
      };
    }),
  };
}

function parseSearchManyOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"search_many"> {
  const searchArguments = readRequiredObjectArrayToolArgument(parsedArguments, "searches", "search_many");
  return {
    toolName: "search_many",
    searches: searchArguments.map(parseSearchManySearchOpenAiToolCallRequest),
  };
}

function parseSearchManySearchOpenAiToolCallRequest(
  searchArguments: JsonObjectRecord,
): ToolCallRequestByName<"search_many">["searches"][number] {
  const searchKind = readRequiredStringToolArgument(searchArguments, "searchKind", "search_many");
  const pattern = readRequiredStringToolArgument(searchArguments, "pattern", "search_many");
  const searchPath = readOptionalStringToolArgument(searchArguments, "path", "search_many");
  const includeGlobPattern = readOptionalStringToolArgument(searchArguments, "include", "search_many");
  const contextLineCount = readOptionalNonNegativeIntegerToolArgument(searchArguments, "contextLineCount", "search_many");

  if (searchKind === "glob") {
    if (includeGlobPattern !== undefined) {
      throw new Error("OpenAI function call for search_many has invalid glob search include argument: include must be null");
    }
    if (contextLineCount !== undefined) {
      throw new Error("OpenAI function call for search_many has invalid glob search contextLineCount argument: contextLineCount must be null");
    }

    return {
      searchKind: "glob",
      globPattern: pattern,
      ...(searchPath !== undefined ? { searchDirectoryPath: searchPath } : {}),
    };
  }

  if (searchKind === "grep") {
    return {
      searchKind: "grep",
      regexPattern: pattern,
      ...(searchPath !== undefined ? { searchPath } : {}),
      ...(includeGlobPattern !== undefined ? { includeGlobPattern } : {}),
      ...(contextLineCount !== undefined ? { contextLineCount } : {}),
    };
  }

  throw new Error(`OpenAI function call for search_many has unsupported searchKind: ${searchKind}`);
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
  const contextLineCount = readOptionalNonNegativeIntegerToolArgument(parsedArguments, "contextLineCount", "grep");
  return {
    toolName: "grep",
    regexPattern: readRequiredStringToolArgument(parsedArguments, "pattern", "grep"),
    ...(searchPath !== undefined ? { searchPath } : {}),
    ...(includeGlobPattern !== undefined ? { includeGlobPattern } : {}),
    ...(contextLineCount !== undefined ? { contextLineCount } : {}),
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

function parseEditManyOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"edit_many"> {
  const editArguments = readRequiredObjectArrayToolArgument(parsedArguments, "edits", "edit_many");
  return {
    toolName: "edit_many",
    edits: editArguments.map((editArgument) => {
      const replaceAll = readOptionalBooleanToolArgument(editArgument, "replaceAll", "edit_many");
      return {
        editTargetPath: readRequiredStringToolArgument(editArgument, "filePath", "edit_many"),
        oldString: readRequiredStringToolArgument(editArgument, "oldString", "edit_many"),
        newString: readRequiredTextToolArgument(editArgument, "newString", "edit_many"),
        ...(replaceAll !== undefined ? { replaceAll } : {}),
      };
    }),
  };
}

function parsePatchOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"patch"> {
  return {
    toolName: "patch",
    patchText: readRequiredStringToolArgument(parsedArguments, "patchText", "patch"),
  };
}

function parsePatchManyOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"patch_many"> {
  return {
    toolName: "patch_many",
    patchText: readRequiredStringToolArgument(parsedArguments, "patchText", "patch_many"),
  };
}

function parseWriteOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"write"> {
  return {
    toolName: "write",
    writeTargetPath: readRequiredStringToolArgument(parsedArguments, "filePath", "write"),
    fileContent: readRequiredTextToolArgument(parsedArguments, "content", "write"),
  };
}

function parseTaskOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"task"> {
  return {
    toolName: "task",
    subagentName: readRequiredAssistantSubagentNameToolArgument(parsedArguments, "subagent", "task"),
    subagentDescription: readRequiredStringToolArgument(parsedArguments, "description", "task"),
    subagentPrompt: readRequiredStringToolArgument(parsedArguments, "prompt", "task"),
  };
}

function parseSkillOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"skill"> {
  return {
    toolName: "skill",
    skillName: readRequiredStringToolArgument(parsedArguments, "skillName", "skill"),
  };
}

function parseOpenAiFunctionArguments(input: { functionName: string; argumentsText: string }): JsonObjectRecord {
  let parsedArguments: unknown;
  try {
    parsedArguments = JSON.parse(input.argumentsText) as unknown;
  } catch (error) {
    const parsingFailureExplanation = error instanceof Error ? error.message : String(error);
    throw new Error(`OpenAI function call for ${input.functionName} has malformed JSON arguments: ${parsingFailureExplanation}`);
  }
  if (typeof parsedArguments !== "object" || parsedArguments === null || Array.isArray(parsedArguments)) {
    throw new Error(`OpenAI function call for ${input.functionName} has non-object arguments`);
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

function readRequiredAssistantSubagentNameToolArgument(
  parsedArguments: JsonObjectRecord,
  argumentName: string,
  toolName: string,
): AssistantSubagentName {
  const argumentValue = readRequiredStringToolArgument(parsedArguments, argumentName, toolName);
  if (isAssistantSubagentName(argumentValue)) {
    return argumentValue;
  }

  throw new Error(`OpenAI function call for ${toolName} has unsupported subagent argument: ${argumentName}`);
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

function readOptionalBooleanToolArgument(
  parsedArguments: JsonObjectRecord,
  argumentName: string,
  toolName: string,
): boolean | undefined {
  const argumentValue = parsedArguments[argumentName];
  if (argumentValue === undefined || argumentValue === null) {
    return undefined;
  }
  if (typeof argumentValue === "boolean") {
    return argumentValue;
  }

  throw new Error(`OpenAI function call for ${toolName} has invalid boolean argument: ${argumentName}`);
}

function readRequiredObjectArrayToolArgument(
  parsedArguments: JsonObjectRecord,
  argumentName: string,
  toolName: string,
): readonly JsonObjectRecord[] {
  const argumentValue = parsedArguments[argumentName];
  if (!Array.isArray(argumentValue)) {
    throw new Error(`OpenAI function call for ${toolName} is missing required object array argument: ${argumentName}`);
  }

  return argumentValue.map((arrayItemValue, arrayItemIndex) => {
    if (typeof arrayItemValue === "object" && arrayItemValue !== null && !Array.isArray(arrayItemValue)) {
      return arrayItemValue as JsonObjectRecord;
    }

    throw new Error(
      `OpenAI function call for ${toolName} has invalid object array item: ${argumentName}[${arrayItemIndex}]`,
    );
  });
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

function readOptionalNonNegativeIntegerToolArgument(
  parsedArguments: JsonObjectRecord,
  argumentName: string,
  toolName: string,
): number | undefined {
  const argumentValue = parsedArguments[argumentName];
  if (argumentValue === undefined || argumentValue === null) {
    return undefined;
  }
  if (typeof argumentValue === "number" && Number.isInteger(argumentValue) && argumentValue >= 0) {
    return argumentValue;
  }

  throw new Error(`OpenAI function call for ${toolName} has invalid non-negative integer argument: ${argumentName}`);
}
