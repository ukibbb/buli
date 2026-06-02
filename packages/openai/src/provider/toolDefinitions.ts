import {
  ASSISTANT_TOOL_REQUEST_NAMES,
  AssistantToolCallRequestSchema,
  MAX_BASH_TOOL_TIMEOUT_MILLISECONDS,
  MAX_CODEBASE_KNOWLEDGE_REFERENCE_COUNT,
  MAX_EDIT_MANY_TOOL_EDIT_COUNT,
  MAX_GREP_CONTEXT_LINE_COUNT,
  MAX_INSPECTION_QUESTION_LENGTH,
  MAX_PATCH_TOOL_PATCH_TEXT_LENGTH,
  MAX_READ_TOOL_LINE_COUNT,
  MAX_SKILL_NAME_LENGTH,
  MAX_WORKFLOW_HANDOFF_FILE_COUNT,
  MAX_WORKFLOW_HANDOFF_LIST_ITEM_COUNT,
  MAX_WORKFLOW_HANDOFF_TEXT_LENGTH,
  MAX_WORKFLOW_HANDOFF_VERIFICATION_COMMAND_COUNT,
  isAssistantSubagentName,
  isAssistantToolRequestName,
  SKILL_NAME_PATTERN_TEXT,
  WorkflowHandoffSchema,
  type AssistantToolCallRequest,
  type AssistantSubagentName,
  type AssistantToolRequestName,
  type ProviderAvailableToolName,
  type ToolCallRequestByName,
} from "@buli/contracts";
import type { ZodIssue } from "zod";

type OpenAiJsonSchemaTypeName = "string" | "integer" | "object" | "array" | "boolean" | "null";

type OpenAiProviderFunctionName = AssistantToolRequestName;

type OpenAiToolParameterProperty = {
  readonly type?: OpenAiJsonSchemaTypeName | readonly OpenAiJsonSchemaTypeName[];
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
  readonly anyOf?: readonly OpenAiToolParameterProperty[];
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
  readonly toolCallRequest: AssistantToolCallRequest;
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
    description: `Read an exact evidenced workspace file or directory window. Do not infer paths; discover uncertain paths with glob or grep first. Lines are 1-indexed. Prefer small bounded windows; use null offset/limit only for the default ${MAX_READ_TOOL_LINE_COUNT}-line window. Continue only from line counts returned by previous reads. When many independent windows are needed, request separate read calls together instead of one broad read.`,
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
          maximum: MAX_READ_TOOL_LINE_COUNT,
          description: `Maximum lines or directory entries to return, up to ${MAX_READ_TOOL_LINE_COUNT}; null uses the default window.`,
        },
        inspectionQuestion: {
          type: "string",
          maxLength: MAX_INSPECTION_QUESTION_LENGTH,
          description: "Question this read should answer for the current task. This becomes a purpose-aware evidence note if useful later.",
        },
      },
      required: ["filePath", "offset", "limit", "inspectionQuestion"],
      additionalProperties: false,
    },
    strict: true,
  };
}

export function createGlobToolDefinition(): OpenAiToolDefinition<"glob"> {
  return {
    type: "function",
    name: "glob",
    description: "Find workspace files by filename glob. Use instead of bash for discovery. The path argument is one directory only. Split broad discovery by parent directory or pattern and batch independent glob calls instead of one oversized lookup.",
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
        inspectionQuestion: {
          type: "string",
          maxLength: MAX_INSPECTION_QUESTION_LENGTH,
          description: "Question this discovery should answer for the current task. This becomes a purpose-aware evidence note if useful later.",
        },
      },
      required: ["pattern", "path", "inspectionQuestion"],
      additionalProperties: false,
    },
    strict: true,
  };
}

export function createGrepToolDefinition(): OpenAiToolDefinition<"grep"> {
  return {
    type: "function",
    name: "grep",
    description: "Search workspace text with a JavaScript regular expression. Use instead of bash for text search. The path argument is one file or directory; keep contextLineCount small or null for broad discovery. Split broad searches by path, include, or pattern and batch independent grep calls instead of one oversized search.",
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
        inspectionQuestion: {
          type: "string",
          maxLength: MAX_INSPECTION_QUESTION_LENGTH,
          description: "Question this text search should answer for the current task. This becomes a purpose-aware evidence note if useful later.",
        },
      },
      required: ["pattern", "path", "include", "contextLineCount", "inspectionQuestion"],
      additionalProperties: false,
    },
    strict: true,
  };
}

export function createLocateCodebaseSymbolsToolDefinition(): OpenAiToolDefinition<"locate_codebase_symbols"> {
  return {
    type: "function",
    name: "locate_codebase_symbols",
    description: "Resolve known exact symbol names to definition locations: file, kind, exported flag, start-end line span, and a precise read target. Use grep/glob for discovery first, then locate_codebase_symbols for exact definitions, then read to verify current source. filePaths are optional filters only, not file overview queries. For many names, split symbolNames into small batches and make multiple concurrent locate_codebase_symbols calls instead of one large lookup.",
    parameters: {
      type: "object",
      properties: {
        symbolNames: {
          type: "array",
          minItems: 1,
          maxItems: MAX_CODEBASE_KNOWLEDGE_REFERENCE_COUNT,
          description: "Exact function, class, type, interface, enum, or variable names to locate. Required and non-empty.",
          items: {
            type: "string",
            description: "Known exact symbol name. Use grep or glob first when unsure of the spelling or case.",
          },
        },
        filePaths: {
          type: ["array", "null"],
          maxItems: MAX_CODEBASE_KNOWLEDGE_REFERENCE_COUNT,
          description: "Optional workspace file paths used only to filter/disambiguate symbol definitions, or null for no file filter.",
          items: {
            type: "string",
            description: "Workspace-relative file path filter.",
          },
        },
      },
      required: ["symbolNames", "filePaths"],
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

function createWorkflowHandoffToolParameterProperty(): OpenAiToolParameterProperty {
  return {
    description: "Typed workflow handoff payload. Use handoffKind understanding in Understand mode, plan in Plan mode, and implementation in Implementation mode.",
    anyOf: [
      createUnderstandingWorkflowHandoffToolParameterProperty(),
      createPlanWorkflowHandoffToolParameterProperty(),
      createImplementationWorkflowHandoffToolParameterProperty(),
    ],
  };
}

function createUnderstandingWorkflowHandoffToolParameterProperty(): OpenAiToolParameterProperty {
  return {
    type: "object",
    description: "Understand-mode handoff describing what is known, unknown, evidenced, and worth doing next.",
    properties: {
      handoffKind: createWorkflowHandoffLiteralProperty("understanding", "Marks this as an Understand-mode handoff."),
      userGoal: createWorkflowHandoffTextProperty("The user's goal or learning question this understanding supports."),
      currentUnderstanding: createWorkflowHandoffTextProperty("The current concise understanding of the system, decision, or issue."),
      importantFindings: createWorkflowHandoffTextListProperty("Important findings that later modes should preserve."),
      evidenceReferences: createWorkflowHandoffEvidenceReferencesProperty(),
      constraints: createWorkflowHandoffTextListProperty("Constraints, preferences, safety boundaries, or project rules that shaped the understanding."),
      openQuestions: createWorkflowHandoffTextListProperty("Questions or uncertainties that remain open."),
      recommendedNextStep: createWorkflowHandoffTextProperty("The recommended next step after this understanding turn."),
    },
    required: [
      "handoffKind",
      "userGoal",
      "currentUnderstanding",
      "importantFindings",
      "evidenceReferences",
      "constraints",
      "openQuestions",
      "recommendedNextStep",
    ],
    additionalProperties: false,
  };
}

function createPlanWorkflowHandoffToolParameterProperty(): OpenAiToolParameterProperty {
  return {
    type: "object",
    description: "Plan-mode handoff describing the agreed goal, selected approach, exact target files, steps, verification, and readiness.",
    properties: {
      handoffKind: createWorkflowHandoffLiteralProperty("plan", "Marks this as a Plan-mode handoff."),
      agreedGoal: createWorkflowHandoffTextProperty("The goal that was agreed or selected for implementation."),
      currentStateSummary: createWorkflowHandoffTextProperty("A concise summary of the current code/system state the plan is based on."),
      chosenApproach: createWorkflowHandoffTextProperty("The selected implementation approach and why it was chosen."),
      targetFiles: createWorkflowHandoffFileOperationsProperty(),
      implementationSteps: createWorkflowHandoffTextListProperty("Ordered implementation steps that the Implementation mode should apply."),
      verificationCommands: createWorkflowHandoffVerificationCommandsProperty(),
      risks: createWorkflowHandoffTextListProperty("Risks, edge cases, or plan caveats that Implementation should keep in mind."),
      isReadyForImplementation: {
        type: "boolean",
        description: "Whether Implementation can safely start from this handoff without more product decisions.",
      },
      requiredPreApplyReads: createWorkflowHandoffTextListProperty("Exact bounded files or ranges Implementation should read before mutating, if any."),
    },
    required: [
      "handoffKind",
      "agreedGoal",
      "currentStateSummary",
      "chosenApproach",
      "targetFiles",
      "implementationSteps",
      "verificationCommands",
      "risks",
      "isReadyForImplementation",
      "requiredPreApplyReads",
    ],
    additionalProperties: false,
  };
}

function createImplementationWorkflowHandoffToolParameterProperty(): OpenAiToolParameterProperty {
  return {
    type: "object",
    description: "Implementation-mode handoff describing what changed, what verification ran, and what remains next.",
    properties: {
      handoffKind: createWorkflowHandoffLiteralProperty("implementation", "Marks this as an Implementation-mode handoff."),
      implementedOutcome: createWorkflowHandoffTextProperty("The concrete outcome implemented in this turn."),
      changedFiles: createWorkflowHandoffFileChangesProperty(),
      verificationResults: createWorkflowHandoffVerificationResultsProperty(),
      remainingIssues: createWorkflowHandoffTextListProperty("Known remaining issues after this implementation turn, or an empty list when none remain."),
      recommendedNextStep: createWorkflowHandoffTextProperty("The recommended next step after this implementation turn."),
    },
    required: [
      "handoffKind",
      "implementedOutcome",
      "changedFiles",
      "verificationResults",
      "remainingIssues",
      "recommendedNextStep",
    ],
    additionalProperties: false,
  };
}

function createWorkflowHandoffLiteralProperty(literalValue: string, description: string): OpenAiToolParameterProperty {
  return {
    type: "string",
    enum: [literalValue],
    description,
  };
}

function createWorkflowHandoffTextProperty(description: string): OpenAiToolParameterProperty {
  return {
    type: "string",
    maxLength: MAX_WORKFLOW_HANDOFF_TEXT_LENGTH,
    description,
  };
}

function createWorkflowHandoffTextListProperty(description: string): OpenAiToolParameterProperty {
  return {
    type: "array",
    maxItems: MAX_WORKFLOW_HANDOFF_LIST_ITEM_COUNT,
    description,
    items: createWorkflowHandoffTextProperty("One handoff list item."),
  };
}

function createWorkflowHandoffEvidenceReferencesProperty(): OpenAiToolParameterProperty {
  return {
    type: "array",
    maxItems: MAX_WORKFLOW_HANDOFF_LIST_ITEM_COUNT,
    description: "Evidence references supporting the understanding handoff.",
    items: {
      type: "object",
      description: "One source, test, documentation, runtime, tool, or user-decision reference.",
      properties: {
        evidenceKind: {
          type: "string",
          enum: ["source_code", "test", "documentation", "runtime_output", "tool_result", "user_decision"],
          description: "The kind of evidence this reference points to.",
        },
        referenceText: createWorkflowHandoffTextProperty("The concrete file, command, message, or artifact reference."),
        summary: createWorkflowHandoffTextProperty("What this evidence proves or contributes."),
      },
      required: ["evidenceKind", "referenceText", "summary"],
      additionalProperties: false,
    },
  };
}

function createWorkflowHandoffFileOperationsProperty(): OpenAiToolParameterProperty {
  return {
    type: "array",
    maxItems: MAX_WORKFLOW_HANDOFF_FILE_COUNT,
    description: "Files the implementation plan expects to inspect or mutate.",
    items: {
      type: "object",
      description: "One planned file operation.",
      properties: {
        filePath: createWorkflowHandoffTextProperty("Workspace-relative file path."),
        operationKind: {
          type: "string",
          enum: ["add", "update", "delete", "rename", "inspect"],
          description: "The planned operation for this file.",
        },
        reason: createWorkflowHandoffTextProperty("Why this file is part of the plan."),
      },
      required: ["filePath", "operationKind", "reason"],
      additionalProperties: false,
    },
  };
}

function createWorkflowHandoffVerificationCommandsProperty(): OpenAiToolParameterProperty {
  return {
    type: "array",
    maxItems: MAX_WORKFLOW_HANDOFF_VERIFICATION_COMMAND_COUNT,
    description: "Commands Implementation should run to verify the plan.",
    items: {
      type: "object",
      description: "One verification command and why it matters.",
      properties: {
        command: createWorkflowHandoffTextProperty("Command line to run."),
        reason: createWorkflowHandoffTextProperty("Why this command verifies the planned change."),
      },
      required: ["command", "reason"],
      additionalProperties: false,
    },
  };
}

function createWorkflowHandoffFileChangesProperty(): OpenAiToolParameterProperty {
  return {
    type: "array",
    maxItems: MAX_WORKFLOW_HANDOFF_FILE_COUNT,
    description: "Files changed by the implementation turn.",
    items: {
      type: "object",
      description: "One changed file summary.",
      properties: {
        filePath: createWorkflowHandoffTextProperty("Workspace-relative changed file path."),
        changeSummary: createWorkflowHandoffTextProperty("What changed in this file."),
      },
      required: ["filePath", "changeSummary"],
      additionalProperties: false,
    },
  };
}

function createWorkflowHandoffVerificationResultsProperty(): OpenAiToolParameterProperty {
  return {
    type: "array",
    maxItems: MAX_WORKFLOW_HANDOFF_VERIFICATION_COMMAND_COUNT,
    description: "Verification results from the implementation turn.",
    items: {
      type: "object",
      description: "One verification result.",
      properties: {
        command: createWorkflowHandoffTextProperty("Command line that was run or intentionally not run."),
        outcomeKind: {
          type: "string",
          enum: ["passed", "failed", "not_run"],
          description: "Whether the verification passed, failed, or was not run.",
        },
        summary: createWorkflowHandoffTextProperty("Short result summary."),
      },
      required: ["command", "outcomeKind", "summary"],
      additionalProperties: false,
    },
  };
}

export function createRecordWorkflowHandoffToolDefinition(): OpenAiToolDefinition<"record_workflow_handoff"> {
  return {
    type: "function",
    name: "record_workflow_handoff",
    description: "Record the current assistant mode's typed workflow handoff so later Understand, Plan, or Implementation turns can reuse the useful context without enforcing a strict pipeline.",
    parameters: {
      type: "object",
      properties: {
        workflowHandoff: createWorkflowHandoffToolParameterProperty(),
      },
      required: ["workflowHandoff"],
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
  locate_codebase_symbols: {
    toolName: "locate_codebase_symbols",
    definition: createLocateCodebaseSymbolsToolDefinition(),
    parseToolCallRequest: parseLocateCodebaseSymbolsOpenAiToolCallRequest,
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
  record_workflow_handoff: {
    toolName: "record_workflow_handoff",
    definition: createRecordWorkflowHandoffToolDefinition(),
    parseToolCallRequest: parseRecordWorkflowHandoffOpenAiToolCallRequest,
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
}): AssistantToolCallRequest {
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
  toolCallRequest: AssistantToolCallRequest;
}): AssistantToolCallRequest {
  const parsedToolCallRequest = AssistantToolCallRequestSchema.safeParse(input.toolCallRequest);
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
  const inspectionQuestion = readOptionalStringToolArgument(parsedArguments, "inspectionQuestion", "read");
  return {
    toolName: "read",
    readTargetPath: readRequiredStringToolArgument(parsedArguments, "filePath", "read"),
    ...(offsetLineNumber !== undefined ? { offsetLineNumber } : {}),
    ...(maximumLineCount !== undefined ? { maximumLineCount } : {}),
    ...(inspectionQuestion !== undefined ? { inspectionQuestion } : {}),
  };
}

function parseGlobOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"glob"> {
  const searchDirectoryPath = readOptionalStringToolArgument(parsedArguments, "path", "glob");
  const inspectionQuestion = readOptionalStringToolArgument(parsedArguments, "inspectionQuestion", "glob");
  return {
    toolName: "glob",
    globPattern: readRequiredStringToolArgument(parsedArguments, "pattern", "glob"),
    ...(searchDirectoryPath !== undefined ? { searchDirectoryPath } : {}),
    ...(inspectionQuestion !== undefined ? { inspectionQuestion } : {}),
  };
}

function parseGrepOpenAiToolCallRequest(parsedArguments: JsonObjectRecord): ToolCallRequestByName<"grep"> {
  const searchPath = readOptionalStringToolArgument(parsedArguments, "path", "grep");
  const includeGlobPattern = readOptionalStringToolArgument(parsedArguments, "include", "grep");
  const contextLineCount = readOptionalNonNegativeIntegerToolArgument(parsedArguments, "contextLineCount", "grep");
  const inspectionQuestion = readOptionalStringToolArgument(parsedArguments, "inspectionQuestion", "grep");
  return {
    toolName: "grep",
    regexPattern: readRequiredStringToolArgument(parsedArguments, "pattern", "grep"),
    ...(searchPath !== undefined ? { searchPath } : {}),
    ...(includeGlobPattern !== undefined ? { includeGlobPattern } : {}),
    ...(contextLineCount !== undefined ? { contextLineCount } : {}),
    ...(inspectionQuestion !== undefined ? { inspectionQuestion } : {}),
  };
}

function parseLocateCodebaseSymbolsOpenAiToolCallRequest(
  parsedArguments: JsonObjectRecord,
): ToolCallRequestByName<"locate_codebase_symbols"> {
  const symbolNames = readOptionalStringArrayToolArgument(
    parsedArguments,
    "symbolNames",
    "locate_codebase_symbols",
  );
  const filePaths = readOptionalStringArrayToolArgument(
    parsedArguments,
    "filePaths",
    "locate_codebase_symbols",
  );

  if (!symbolNames || symbolNames.length === 0) {
    throw new Error(
      "OpenAI function call for locate_codebase_symbols requires a non-empty symbolNames array",
    );
  }

  return {
    toolName: "locate_codebase_symbols",
    symbolNames,
    ...(filePaths !== undefined ? { filePaths } : {}),
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

function parseRecordWorkflowHandoffOpenAiToolCallRequest(
  parsedArguments: JsonObjectRecord,
): ToolCallRequestByName<"record_workflow_handoff"> {
  const workflowHandoffArgument = readRequiredObjectToolArgument(
    parsedArguments,
    "workflowHandoff",
    "record_workflow_handoff",
  );
  const parsedWorkflowHandoff = WorkflowHandoffSchema.safeParse(workflowHandoffArgument);
  if (!parsedWorkflowHandoff.success) {
    const contractViolationText = parsedWorkflowHandoff.error.issues.map(formatToolCallContractViolation).join("; ");
    throw new Error(
      `OpenAI function call for record_workflow_handoff violates Buli workflow handoff contract: ${contractViolationText}`,
    );
  }

  return {
    toolName: "record_workflow_handoff",
    workflowHandoff: parsedWorkflowHandoff.data,
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

function readRequiredObjectToolArgument(
  parsedArguments: JsonObjectRecord,
  argumentName: string,
  toolName: string,
): JsonObjectRecord {
  const argumentValue = parsedArguments[argumentName];
  if (typeof argumentValue === "object" && argumentValue !== null && !Array.isArray(argumentValue)) {
    return argumentValue as JsonObjectRecord;
  }

  throw new Error(`OpenAI function call for ${toolName} is missing required object argument: ${argumentName}`);
}

function readOptionalStringArrayToolArgument(
  parsedArguments: JsonObjectRecord,
  argumentName: string,
  toolName: string,
): string[] | undefined {
  const argumentValue = parsedArguments[argumentName];
  if (argumentValue === undefined || argumentValue === null) {
    return undefined;
  }
  if (!Array.isArray(argumentValue)) {
    throw new Error(`OpenAI function call for ${toolName} has invalid string array argument: ${argumentName}`);
  }

  return argumentValue.map((arrayItemValue, arrayItemIndex) => {
    if (typeof arrayItemValue === "string" && arrayItemValue.length > 0) {
      return arrayItemValue;
    }

    throw new Error(
      `OpenAI function call for ${toolName} has invalid string array item: ${argumentName}[${arrayItemIndex}]`,
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
