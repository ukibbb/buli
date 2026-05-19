import {
  ASSISTANT_PRESENTATION_FUNCTION_NAMES,
  ASSISTANT_TOOL_REQUEST_NAMES,
  LearningSequenceSchema,
  MAX_BASH_TOOL_TIMEOUT_MILLISECONDS,
  ToolCallRequestSchema,
  isAssistantPresentationFunctionName,
  isAssistantSubagentName,
  isAssistantToolRequestName,
  type AssistantSubagentName,
  type AssistantPresentationFunctionName,
  type AssistantToolRequestName,
  type LearningSequence,
  type ProviderAvailablePresentationFunctionName,
  type ProviderAvailableToolName,
  type ToolCallRequest,
  type ToolCallRequestByName,
} from "@buli/contracts";
import type { ZodIssue } from "zod";

type OpenAiJsonSchemaTypeName = "string" | "integer" | "object" | "array" | "boolean" | "null";

type OpenAiProviderFunctionName = AssistantToolRequestName | AssistantPresentationFunctionName;

type OpenAiToolParameterProperty = {
  readonly type: OpenAiJsonSchemaTypeName | readonly OpenAiJsonSchemaTypeName[];
  readonly description: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minItems?: number;
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

export type OpenAiLearningSequencePresentationFunctionCallIntent = {
  readonly intentKind: "learning_sequence_presentation";
  readonly functionCallId: string;
  readonly learningSequence: LearningSequence;
};

export type OpenAiProviderFunctionCallIntent =
  | OpenAiExecutableToolCallIntent
  | OpenAiLearningSequencePresentationFunctionCallIntent;

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

export function createTaskToolDefinition(): OpenAiToolDefinition<"task"> {
  return {
    type: "function",
    name: "task",
    description: "Launch a built-in Buli subagent and return its concise result. Use this for broad, independent codebase investigation that benefits from a separate read-only agent. Currently available subagent: explore.",
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

export function createPresentLearningSequenceToolDefinition(): OpenAiToolDefinition<"present_learning_sequence"> {
  return {
    type: "function",
    name: "present_learning_sequence",
    description: "Render a structured, non-executable learning sequence in the Buli UI. Use this instead of Markdown code fences when a lifecycle, data flow, or cause/effect chain would be clearer as a compact visual block.",
    parameters: {
      type: "object",
      properties: {
        titleText: {
          type: "string",
          description: "Short title for the learning sequence.",
        },
        summaryText: {
          type: ["string", "null"],
          description: "Optional one-sentence context, or null when no summary is needed.",
        },
        sequenceItems: {
          type: "array",
          minItems: 1,
          description: "Ordered sequence items to render.",
          items: {
            type: "object",
            description: "One stage in the sequence.",
            properties: {
              labelText: {
                type: "string",
                description: "Short label for this stage.",
              },
              detailText: {
                type: ["string", "null"],
                description: "Optional detail for this stage, or null when no detail is needed.",
              },
            },
            required: ["labelText", "detailText"],
            additionalProperties: false,
          },
        },
      },
      required: ["titleText", "summaryText", "sequenceItems"],
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
  task: {
    toolName: "task",
    definition: createTaskToolDefinition(),
    parseToolCallRequest: parseTaskOpenAiToolCallRequest,
  },
};

const openAiPresentationFunctionDefinitionByName: {
  readonly [FunctionName in AssistantPresentationFunctionName]: OpenAiToolDefinition<FunctionName>;
} = {
  present_learning_sequence: createPresentLearningSequenceToolDefinition(),
};

export function createOpenAiToolDefinitions(input: {
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
  availablePresentationFunctionNames?: readonly ProviderAvailablePresentationFunctionName[] | undefined;
} = {}): OpenAiToolDefinition[] {
  const availableToolNameSet = input.availableToolNames
    ? new Set<ProviderAvailableToolName>(input.availableToolNames)
    : undefined;
  const availablePresentationFunctionNameSet = input.availablePresentationFunctionNames
    ? new Set<ProviderAvailablePresentationFunctionName>(input.availablePresentationFunctionNames)
    : undefined;

  const executableToolDefinitions = ASSISTANT_TOOL_REQUEST_NAMES
    .filter((toolName) => !availableToolNameSet || availableToolNameSet.has(toolName))
    .map((toolName) => openAiToolAdapterByName[toolName].definition);
  const presentationFunctionDefinitions = ASSISTANT_PRESENTATION_FUNCTION_NAMES
    .filter((functionName) => !availablePresentationFunctionNameSet || availablePresentationFunctionNameSet.has(functionName))
    .map((functionName) => openAiPresentationFunctionDefinitionByName[functionName]);

  return [...executableToolDefinitions, ...presentationFunctionDefinitions];
}

export function isOpenAiExecutableToolCallIntent(
  providerFunctionCallIntent: OpenAiProviderFunctionCallIntent,
): providerFunctionCallIntent is OpenAiExecutableToolCallIntent {
  return providerFunctionCallIntent.intentKind === "executable_tool";
}

export function isOpenAiLearningSequencePresentationFunctionCallIntent(
  providerFunctionCallIntent: OpenAiProviderFunctionCallIntent,
): providerFunctionCallIntent is OpenAiLearningSequencePresentationFunctionCallIntent {
  return providerFunctionCallIntent.intentKind === "learning_sequence_presentation";
}

export function createOpenAiProviderFunctionCallIntent(input: {
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

  if (isAssistantPresentationFunctionName(input.functionName)) {
    return parseOpenAiPresentationFunctionCallIntent({
      functionCallId: input.functionCallId,
      functionName: input.functionName,
      parsedArguments,
    });
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

function parseOpenAiPresentationFunctionCallIntent(input: {
  functionCallId: string;
  functionName: AssistantPresentationFunctionName;
  parsedArguments: JsonObjectRecord;
}): OpenAiProviderFunctionCallIntent {
  if (input.functionName === "present_learning_sequence") {
    return {
      intentKind: "learning_sequence_presentation",
      functionCallId: input.functionCallId,
      learningSequence: parseLearningSequencePresentationFunctionArguments(input.parsedArguments),
    };
  }

  return assertUnhandledPresentationFunctionName(input.functionName);
}

function parseLearningSequencePresentationFunctionArguments(parsedArguments: JsonObjectRecord): LearningSequence {
  const summaryText = readOptionalStringToolArgument(parsedArguments, "summaryText", "present_learning_sequence");
  const learningSequenceCandidate = {
    titleText: readRequiredStringToolArgument(parsedArguments, "titleText", "present_learning_sequence"),
    ...(summaryText !== undefined ? { summaryText } : {}),
    sequenceItems: readRequiredObjectArrayFunctionArgument(
      parsedArguments,
      "sequenceItems",
      "present_learning_sequence",
    ).map((sequenceItemArguments) => {
      const detailText = readOptionalStringToolArgument(sequenceItemArguments, "detailText", "present_learning_sequence");
      return {
        labelText: readRequiredStringToolArgument(sequenceItemArguments, "labelText", "present_learning_sequence"),
        ...(detailText !== undefined ? { detailText } : {}),
      };
    }),
  };
  const parsedLearningSequence = LearningSequenceSchema.safeParse(learningSequenceCandidate);
  if (parsedLearningSequence.success) {
    return parsedLearningSequence.data;
  }

  const contractViolationText = parsedLearningSequence.error.issues.map(formatToolCallContractViolation).join("; ");
  throw new Error(`OpenAI function call for present_learning_sequence violates Buli learning sequence contract: ${contractViolationText}`);
}

function assertUnhandledPresentationFunctionName(functionName: never): never {
  throw new Error(`Unhandled presentation function: ${functionName}`);
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

function parseTaskOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"task"> {
  return {
    toolName: "task",
    subagentName: readRequiredAssistantSubagentNameToolArgument(parsedArguments, "subagent", "task"),
    subagentDescription: readRequiredStringToolArgument(parsedArguments, "description", "task"),
    subagentPrompt: readRequiredStringToolArgument(parsedArguments, "prompt", "task"),
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

function readRequiredObjectArrayFunctionArgument(
  parsedArguments: JsonObjectRecord,
  argumentName: string,
  functionName: string,
): JsonObjectRecord[] {
  const argumentValue = parsedArguments[argumentName];
  if (!Array.isArray(argumentValue)) {
    throw new Error(`OpenAI function call for ${functionName} is missing required object array argument: ${argumentName}`);
  }

  return argumentValue.map((arrayItem, arrayItemIndex) => {
    if (typeof arrayItem !== "object" || arrayItem === null || Array.isArray(arrayItem)) {
      throw new Error(`OpenAI function call for ${functionName} has invalid object at ${argumentName}[${arrayItemIndex}]`);
    }

    return arrayItem as JsonObjectRecord;
  });
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
