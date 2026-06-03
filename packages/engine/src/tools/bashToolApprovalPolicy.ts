import type { BashToolCallRequest } from "@buli/contracts";

export const BASH_TOOL_APPROVAL_MODES = ["risk_based", "trusted"] as const;
export type BashToolApprovalMode = (typeof BASH_TOOL_APPROVAL_MODES)[number];
export const DEFAULT_BASH_TOOL_APPROVAL_MODE: BashToolApprovalMode = "risk_based";

export type BashCommandRiskKind =
  | "ambiguous_shell_syntax"
  | "cloud_state_change"
  | "filesystem_change"
  | "git_mutation"
  | "github_mutation"
  | "indirect_command_execution"
  | "network_side_effect"
  | "privilege_or_process_change"
  | "unclassified_command";

export type BashToolApprovalDecision =
  | {
      approvalPolicy: "auto_run";
      isReadOnly: boolean;
    }
  | {
      approvalPolicy: "requires_user_approval";
      matchedRiskKind: BashCommandRiskKind;
      riskExplanation: string;
    };

const SAFE_READ_ONLY_COMMAND_NAMES = new Set([
  "basename",
  "cat",
  "cut",
  "date",
  "df",
  "dirname",
  "du",
  "echo",
  "file",
  "grep",
  "head",
  "id",
  "jq",
  "ls",
  "printf",
  "ps",
  "pwd",
  "readlink",
  "realpath",
  "rg",
  "shasum",
  "sort",
  "stat",
  "tail",
  "tree",
  "tr",
  "uname",
  "uniq",
  "wc",
  "which",
  "whoami",
]);

const FILESYSTEM_MUTATION_COMMAND_NAMES = new Set([
  "chmod",
  "chown",
  "cp",
  "dd",
  "install",
  "ln",
  "mkdir",
  "mktemp",
  "mv",
  "rm",
  "rmdir",
  "touch",
  "truncate",
  "unlink",
]);

const PRIVILEGED_OR_PROCESS_MUTATION_COMMAND_NAMES = new Set([
  "doas",
  "kill",
  "killall",
  "pkill",
  "sudo",
  "su",
]);

const SHELL_INTERPRETER_COMMAND_NAMES = new Set(["bash", "dash", "env", "exec", "fish", "ksh", "sh", "zsh"]);

const PACKAGE_INSTALL_OR_GENERATOR_COMMAND_NAMES = new Set(["brew", "bunx", "npx"]);

const SAFE_BUN_VERIFICATION_SCRIPT_NAMES = new Set(["test", "typecheck"]);
const BUN_DEPENDENCY_MUTATION_SUBCOMMAND_NAMES = new Set([
  "add",
  "install",
  "link",
  "outdated",
  "patch",
  "pm",
  "remove",
  "unlink",
  "update",
]);

const SAFE_GIT_SUBCOMMAND_NAMES = new Set([
  "blame",
  "diff",
  "grep",
  "log",
  "ls-files",
  "rev-parse",
  "show",
  "status",
  "symbolic-ref",
]);
const SAFE_GITHUB_PR_SUBCOMMAND_NAMES = new Set(["checks", "diff", "list", "status", "view"]);
const SAFE_GITHUB_ISSUE_SUBCOMMAND_NAMES = new Set(["list", "view"]);
const SAFE_GITHUB_REPO_SUBCOMMAND_NAMES = new Set(["view"]);
const SAFE_GITHUB_RUN_SUBCOMMAND_NAMES = new Set(["list", "view"]);
const SAFE_GITHUB_RELEASE_SUBCOMMAND_NAMES = new Set(["list", "view"]);

const AWS_GLOBAL_OPTIONS_WITH_SEPARATE_VALUE = new Set([
  "--ca-bundle",
  "--cli-binary-format",
  "--cli-connect-timeout",
  "--cli-read-timeout",
  "--color",
  "--endpoint-url",
  "--max-items",
  "--output",
  "--page-size",
  "--profile",
  "--query",
  "--region",
  "--starting-token",
]);
const AWS_GLOBAL_OPTIONS_WITH_INLINE_VALUE_PREFIXES = [...AWS_GLOBAL_OPTIONS_WITH_SEPARATE_VALUE].map(
  (awsGlobalOptionName) => `${awsGlobalOptionName}=`,
);
const AWS_GLOBAL_OPTIONS_WITHOUT_VALUE = new Set([
  "--debug",
  "--no-cli-auto-prompt",
  "--no-cli-pager",
  "--no-paginate",
  "--no-sign-request",
  "--no-verify-ssl",
  "--version",
]);
const AWS_CLOUD_STATE_CHANGING_OPERATION_PREFIXES = [
  "accept-",
  "add-",
  "allocate-",
  "associate-",
  "attach-",
  "authorize-",
  "cancel-",
  "complete-",
  "configure",
  "copy-",
  "create-",
  "delete-",
  "deregister-",
  "detach-",
  "disable-",
  "disassociate-",
  "enable-",
  "invoke",
  "modify-",
  "move-",
  "put-",
  "reboot-",
  "register-",
  "reject-",
  "remove-",
  "restore-",
  "revoke-",
  "run-",
  "send-",
  "set-",
  "start-",
  "stop-",
  "submit-",
  "sync",
  "tag-",
  "terminate-",
  "untag-",
  "update-",
  "upload-",
];

export function parseBashToolApprovalMode(rawBashToolApprovalMode: string): BashToolApprovalMode | undefined {
  const normalizedBashToolApprovalMode = rawBashToolApprovalMode.trim().toLowerCase().replace(/-/g, "_");
  return BASH_TOOL_APPROVAL_MODES.find(
    (bashToolApprovalMode) => bashToolApprovalMode === normalizedBashToolApprovalMode,
  );
}

export function classifyBashToolApprovalRequirement(
  bashToolCallRequest: BashToolCallRequest,
  bashToolApprovalMode: BashToolApprovalMode = DEFAULT_BASH_TOOL_APPROVAL_MODE,
): BashToolApprovalDecision {
  if (bashToolApprovalMode === "trusted") {
    return { approvalPolicy: "auto_run", isReadOnly: false };
  }

  const trimmedShellCommand = bashToolCallRequest.shellCommand.trim();
  if (trimmedShellCommand.length === 0) {
    return requiresUserApproval(
      "unclassified_command",
      "This bash command is empty or malformed, so it still requires explicit user approval.",
    );
  }

  const ambiguousShellSyntaxDecision = classifyAmbiguousShellSyntax(trimmedShellCommand);
  if (ambiguousShellSyntaxDecision) {
    return ambiguousShellSyntaxDecision;
  }

  const commandSegments = splitCommandSegments(trimmedShellCommand);
  if (commandSegments.some((commandSegment) => commandSegment.length === 0)) {
    return requiresUserApproval(
      "ambiguous_shell_syntax",
      "This bash command uses compound shell control flow that is not classified as safe, so it still requires explicit user approval.",
    );
  }

  for (const commandSegment of commandSegments) {
    const commandSegmentDecision = classifyCommandSegment(commandSegment);
    if (commandSegmentDecision.approvalPolicy === "requires_user_approval") {
      return commandSegmentDecision;
    }
  }

  return { approvalPolicy: "auto_run", isReadOnly: true };
}

function classifyAmbiguousShellSyntax(shellCommand: string): BashToolApprovalDecision | undefined {
  if (/\r|\n/.test(shellCommand)) {
    return requiresUserApproval(
      "ambiguous_shell_syntax",
      "This bash command spans multiple shell lines, so it still requires explicit user approval.",
    );
  }

  if (shellCommand.includes("||") || shellCommand.includes(";")) {
    return requiresUserApproval(
      "ambiguous_shell_syntax",
      "This bash command uses shell control flow that is not classified as safe, so it still requires explicit user approval.",
    );
  }

  if (/(^|[^&])&([^&]|$)/.test(shellCommand)) {
    return requiresUserApproval(
      "ambiguous_shell_syntax",
      "This bash command starts a background job, so it still requires explicit user approval.",
    );
  }

  if (/(^|[^|])\|([^|]|$)/.test(shellCommand)) {
    return requiresUserApproval(
      "ambiguous_shell_syntax",
      "This bash command pipes data between commands, so it still requires explicit user approval.",
    );
  }

  if (shellCommand.includes(">") || shellCommand.includes("<")) {
    return requiresUserApproval(
      "filesystem_change",
      "This bash command uses shell redirection, which can write or rewrite files, so it still requires explicit user approval.",
    );
  }

  if (shellCommand.includes("$(") || shellCommand.includes("`")) {
    return requiresUserApproval(
      "indirect_command_execution",
      "This bash command uses command substitution, so it still requires explicit user approval.",
    );
  }

  return undefined;
}

function splitCommandSegments(shellCommand: string): string[] {
  return shellCommand.split("&&").map((commandSegment) => commandSegment.trim());
}

function classifyCommandSegment(commandSegment: string): BashToolApprovalDecision {
  const commandTokens = tokenizeShellCommand(commandSegment);
  if (commandTokens.length === 0) {
    return requiresUserApproval(
      "unclassified_command",
      "This bash command could not be classified safely, so it still requires explicit user approval.",
    );
  }

  const commandTokenIndex = findCommandTokenIndex(commandTokens);
  if (commandTokenIndex >= commandTokens.length) {
    return { approvalPolicy: "auto_run", isReadOnly: true };
  }

  const commandName = normalizeCommandName(commandTokens[commandTokenIndex]!);
  const commandArguments = commandTokens.slice(commandTokenIndex + 1);

  if (FILESYSTEM_MUTATION_COMMAND_NAMES.has(commandName)) {
    return requiresUserApproval(
      "filesystem_change",
      "This bash command can create, remove, or rewrite files or directories, so it still requires explicit user approval.",
    );
  }

  if (PRIVILEGED_OR_PROCESS_MUTATION_COMMAND_NAMES.has(commandName)) {
    return requiresUserApproval(
      "privilege_or_process_change",
      "This bash command changes system or process state, so it still requires explicit user approval.",
    );
  }

  if (PACKAGE_INSTALL_OR_GENERATOR_COMMAND_NAMES.has(commandName)) {
    return requiresUserApproval(
      "indirect_command_execution",
      "This bash command can install packages or execute downloaded tooling, so it still requires explicit user approval.",
    );
  }

  if (SHELL_INTERPRETER_COMMAND_NAMES.has(commandName)) {
    return classifyShellInterpreterCommand(commandName, commandArguments);
  }

  if (commandName === "git") {
    return classifyGitCommand(commandArguments);
  }

  if (commandName === "bun") {
    return classifyBunCommand(commandArguments);
  }

  if (commandName === "tsc") {
    return classifyTypeScriptCompilerCommand(commandArguments);
  }

  if (commandName === "curl") {
    return classifyCurlCommand(commandArguments);
  }

  if (commandName === "wget") {
    return classifyWgetCommand(commandArguments);
  }

  if (commandName === "gh") {
    return classifyGitHubCliCommand(commandArguments);
  }

  if (commandName === "aws") {
    return classifyAwsCliCommand(commandArguments);
  }

  if (SAFE_READ_ONLY_COMMAND_NAMES.has(commandName)) {
    return { approvalPolicy: "auto_run", isReadOnly: true };
  }

  return requiresUserApproval(
    "unclassified_command",
    "This bash command is not classified as clearly non-destructive, so it still requires explicit user approval.",
  );
}

function classifyAwsCliCommand(commandArguments: string[]): BashToolApprovalDecision {
  const awsCliCommand = parseAwsCliServiceCommand(commandArguments);
  if (!awsCliCommand) {
    return requiresUserApproval(
      "cloud_state_change",
      "This AWS CLI command is malformed or uses options that are not classified as read-only, so it still requires explicit user approval.",
    );
  }

  if (awsCliCommand.serviceName === "configure") {
    return requiresUserApproval(
      "cloud_state_change",
      "This AWS CLI command can read or change local AWS credentials or configuration, so it still requires explicit user approval.",
    );
  }

  const awsOperationName = awsCliCommand.operationName;
  if (!awsOperationName) {
    return requiresUserApproval(
      "cloud_state_change",
      "This AWS CLI command does not name a classified read-only operation, so it still requires explicit user approval.",
    );
  }

  if (isClassifiedAwsReadOnlyOperation({ serviceName: awsCliCommand.serviceName, operationName: awsOperationName })) {
    return { approvalPolicy: "auto_run", isReadOnly: true };
  }

  if (isKnownAwsCloudStateChangingOperation(awsOperationName)) {
    return requiresUserApproval(
      "cloud_state_change",
      "This AWS CLI command can change cloud account state, invoke cloud workloads, or write local files, so it still requires explicit user approval.",
    );
  }

  return requiresUserApproval(
    "cloud_state_change",
    "This AWS CLI command is not classified as read-only, so it still requires explicit user approval.",
  );
}

function parseAwsCliServiceCommand(commandArguments: string[]): { serviceName: string; operationName?: string } | undefined {
  let commandArgumentIndex = 0;

  while (commandArgumentIndex < commandArguments.length) {
    const commandArgument = commandArguments[commandArgumentIndex]!;

    if (AWS_GLOBAL_OPTIONS_WITHOUT_VALUE.has(commandArgument) || isAwsGlobalOptionWithInlineValue(commandArgument)) {
      commandArgumentIndex += 1;
      continue;
    }

    if (AWS_GLOBAL_OPTIONS_WITH_SEPARATE_VALUE.has(commandArgument)) {
      if (commandArgumentIndex + 1 >= commandArguments.length) {
        return undefined;
      }
      commandArgumentIndex += 2;
      continue;
    }

    if (commandArgument.startsWith("-")) {
      return undefined;
    }

    const operationName = commandArguments[commandArgumentIndex + 1];
    if (operationName?.startsWith("-")) {
      return undefined;
    }
    return {
      serviceName: commandArgument,
      ...(operationName !== undefined ? { operationName } : {}),
    };
  }

  return undefined;
}

function isAwsGlobalOptionWithInlineValue(commandArgument: string): boolean {
  return AWS_GLOBAL_OPTIONS_WITH_INLINE_VALUE_PREFIXES.some((awsGlobalOptionPrefix) =>
    commandArgument.startsWith(awsGlobalOptionPrefix)
  );
}

function isClassifiedAwsReadOnlyOperation(awsCliCommand: { serviceName: string; operationName: string }): boolean {
  if (awsCliCommand.serviceName === "sts") {
    return awsCliCommand.operationName === "get-caller-identity";
  }

  if (awsCliCommand.serviceName === "ec2") {
    return awsCliCommand.operationName.startsWith("describe-");
  }

  if (awsCliCommand.serviceName === "cloudformation") {
    return awsCliCommand.operationName.startsWith("list-");
  }

  if (awsCliCommand.serviceName === "s3") {
    return awsCliCommand.operationName === "ls";
  }

  if (awsCliCommand.serviceName === "s3api") {
    return awsCliCommand.operationName.startsWith("list-") ||
      awsCliCommand.operationName.startsWith("head-") ||
      (awsCliCommand.operationName.startsWith("get-") && awsCliCommand.operationName !== "get-object");
  }

  return false;
}

function isKnownAwsCloudStateChangingOperation(operationName: string): boolean {
  return AWS_CLOUD_STATE_CHANGING_OPERATION_PREFIXES.some((operationPrefix) =>
    operationName === operationPrefix.slice(0, -1) || operationName.startsWith(operationPrefix)
  );
}

function classifyShellInterpreterCommand(commandName: string, commandArguments: string[]): BashToolApprovalDecision {
  if (commandName === "env") {
    return classifyEnvCommand(commandArguments);
  }

  return requiresUserApproval(
    "indirect_command_execution",
    "This bash command launches another shell or indirect command runner, so it still requires explicit user approval.",
  );
}

function classifyEnvCommand(commandArguments: string[]): BashToolApprovalDecision {
  let commandArgumentIndex = 0;

  while (commandArgumentIndex < commandArguments.length) {
    const commandArgument = commandArguments[commandArgumentIndex]!;

    if (commandArgument === "-i" || commandArgument === "--ignore-environment") {
      commandArgumentIndex += 1;
      continue;
    }

    if (commandArgument === "-u" || commandArgument === "--unset") {
      if (commandArgumentIndex + 1 >= commandArguments.length) {
        return requiresUserApproval(
          "indirect_command_execution",
          "This env command is malformed or incomplete, so it still requires explicit user approval.",
        );
      }
      commandArgumentIndex += 2;
      continue;
    }

    if (isEnvironmentVariableAssignment(commandArgument)) {
      commandArgumentIndex += 1;
      continue;
    }

    return requiresUserApproval(
      "indirect_command_execution",
      "This env command launches another command, so it still requires explicit user approval.",
    );
  }

  return { approvalPolicy: "auto_run", isReadOnly: true };
}

function classifyGitCommand(commandArguments: string[]): BashToolApprovalDecision {
  if (commandArguments.length === 0) {
    return { approvalPolicy: "auto_run", isReadOnly: true };
  }

  const gitSubcommand = commandArguments[0]!;
  if (SAFE_GIT_SUBCOMMAND_NAMES.has(gitSubcommand)) {
    return { approvalPolicy: "auto_run", isReadOnly: true };
  }

  return requiresUserApproval(
    "git_mutation",
    "This git command can change repository state or is not classified as read-only, so it still requires explicit user approval.",
  );
}

function classifyBunCommand(commandArguments: string[]): BashToolApprovalDecision {
  const bunCommand = parseBunCommandAfterSafeGlobalOptions(commandArguments);
  if (!bunCommand) {
    return requiresUserApproval(
      "indirect_command_execution",
      "This bun command uses options that are not classified as local verification, so it still requires explicit user approval.",
    );
  }

  if (bunCommand.bunSubcommand === "run") {
    return classifyBunRunCommand(bunCommand.bunSubcommandArguments);
  }

  if (
    SAFE_BUN_VERIFICATION_SCRIPT_NAMES.has(bunCommand.bunSubcommand) &&
    bunCommand.bunSubcommandArguments.length === 0
  ) {
    return { approvalPolicy: "auto_run", isReadOnly: true };
  }

  if (BUN_DEPENDENCY_MUTATION_SUBCOMMAND_NAMES.has(bunCommand.bunSubcommand)) {
    return requiresUserApproval(
      "indirect_command_execution",
      "This bun command can install, update, or link dependencies, so it still requires explicit user approval.",
    );
  }

  return requiresUserApproval(
    "indirect_command_execution",
    "This bun command can execute project code that is not classified as local verification, so it still requires explicit user approval.",
  );
}

function classifyBunRunCommand(commandArguments: string[]): BashToolApprovalDecision {
  const bunRunScript = parseBunRunScriptAfterSafeOptions(commandArguments);
  if (!bunRunScript) {
    return requiresUserApproval(
      "indirect_command_execution",
      "This bun run command is not classified as local verification, so it still requires explicit user approval.",
    );
  }

  if (SAFE_BUN_VERIFICATION_SCRIPT_NAMES.has(bunRunScript.scriptName) && bunRunScript.scriptArguments.length === 0) {
    return { approvalPolicy: "auto_run", isReadOnly: true };
  }

  return requiresUserApproval(
    "indirect_command_execution",
    "This bun run script is not classified as local verification, so it still requires explicit user approval.",
  );
}

function parseBunCommandAfterSafeGlobalOptions(
  commandArguments: string[],
): { bunSubcommand: string; bunSubcommandArguments: string[] } | undefined {
  let commandArgumentIndex = 0;

  while (commandArgumentIndex < commandArguments.length) {
    const commandArgument = commandArguments[commandArgumentIndex]!;

    if (commandArgument === "--filter") {
      if (commandArgumentIndex + 1 >= commandArguments.length) {
        return undefined;
      }
      commandArgumentIndex += 2;
      continue;
    }

    if (commandArgument.startsWith("--filter=")) {
      commandArgumentIndex += 1;
      continue;
    }

    if (commandArgument.startsWith("-")) {
      return undefined;
    }

    return {
      bunSubcommand: commandArgument,
      bunSubcommandArguments: commandArguments.slice(commandArgumentIndex + 1),
    };
  }

  return undefined;
}

function parseBunRunScriptAfterSafeOptions(
  commandArguments: string[],
): { scriptName: string; scriptArguments: string[] } | undefined {
  let commandArgumentIndex = 0;

  while (commandArgumentIndex < commandArguments.length) {
    const commandArgument = commandArguments[commandArgumentIndex]!;

    if (commandArgument === "--filter") {
      if (commandArgumentIndex + 1 >= commandArguments.length) {
        return undefined;
      }
      commandArgumentIndex += 2;
      continue;
    }

    if (commandArgument.startsWith("--filter=")) {
      commandArgumentIndex += 1;
      continue;
    }

    if (commandArgument === "--workspaces" || commandArgument === "--if-present") {
      commandArgumentIndex += 1;
      continue;
    }

    if (commandArgument.startsWith("-")) {
      return undefined;
    }

    return {
      scriptName: commandArgument,
      scriptArguments: commandArguments.slice(commandArgumentIndex + 1),
    };
  }

  return undefined;
}

function classifyTypeScriptCompilerCommand(commandArguments: string[]): BashToolApprovalDecision {
  if (isSafeNoEmitTypeScriptCompilerCommand(commandArguments)) {
    return { approvalPolicy: "auto_run", isReadOnly: true };
  }

  return requiresUserApproval(
    "filesystem_change",
    "This tsc command can write build outputs unless no-emit verification is clearly classified, so it still requires explicit user approval.",
  );
}

function isSafeNoEmitTypeScriptCompilerCommand(commandArguments: string[]): boolean {
  let hasNoEmitOption = false;

  for (let commandArgumentIndex = 0; commandArgumentIndex < commandArguments.length; commandArgumentIndex += 1) {
    const commandArgument = commandArguments[commandArgumentIndex]!;

    if (commandArgument === "--noEmit") {
      const nextCommandArgument = commandArguments[commandArgumentIndex + 1];
      if (nextCommandArgument === "false") {
        return false;
      }
      if (nextCommandArgument === "true") {
        commandArgumentIndex += 1;
      }
      hasNoEmitOption = true;
      continue;
    }

    if (commandArgument === "--noEmit=true") {
      hasNoEmitOption = true;
      continue;
    }

    if (commandArgument === "--noEmit=false") {
      return false;
    }

    if (commandArgument === "--project" || commandArgument === "-p") {
      if (commandArgumentIndex + 1 >= commandArguments.length) {
        return false;
      }
      commandArgumentIndex += 1;
      continue;
    }

    if (commandArgument.startsWith("--project=")) {
      continue;
    }

    if (commandArgument === "--pretty") {
      const nextCommandArgument = commandArguments[commandArgumentIndex + 1];
      if (nextCommandArgument === "true" || nextCommandArgument === "false") {
        commandArgumentIndex += 1;
      }
      continue;
    }

    if (commandArgument.startsWith("--pretty=")) {
      continue;
    }

    if (commandArgument.startsWith("-")) {
      return false;
    }
  }

  return hasNoEmitOption;
}

function classifyCurlCommand(commandArguments: string[]): BashToolApprovalDecision {
  for (let commandArgumentIndex = 0; commandArgumentIndex < commandArguments.length; commandArgumentIndex += 1) {
    const commandArgument = commandArguments[commandArgumentIndex]!;

    if (commandArgument === "-X" || commandArgument === "--request") {
      const requestMethod = commandArguments[commandArgumentIndex + 1];
      if (!requestMethod || !isReadOnlyHttpMethod(requestMethod)) {
        return requiresUserApproval(
          "network_side_effect",
          "This curl command can send a non-read-only HTTP request, so it still requires explicit user approval.",
        );
      }
      commandArgumentIndex += 1;
      continue;
    }

    if (commandArgument.startsWith("-X") && commandArgument !== "-X") {
      const requestMethod = commandArgument.slice(2);
      if (!isReadOnlyHttpMethod(requestMethod)) {
        return requiresUserApproval(
          "network_side_effect",
          "This curl command can send a non-read-only HTTP request, so it still requires explicit user approval.",
        );
      }
      continue;
    }

    if (commandArgument.startsWith("--request=")) {
      const requestMethod = commandArgument.slice("--request=".length);
      if (!isReadOnlyHttpMethod(requestMethod)) {
        return requiresUserApproval(
          "network_side_effect",
          "This curl command can send a non-read-only HTTP request, so it still requires explicit user approval.",
        );
      }
      continue;
    }

    if (
      commandArgument === "-d" ||
      commandArgument.startsWith("-d") ||
      commandArgument === "--data" ||
      commandArgument.startsWith("--data=") ||
      commandArgument === "--data-binary" ||
      commandArgument.startsWith("--data-binary=") ||
      commandArgument === "--data-raw" ||
      commandArgument.startsWith("--data-raw=") ||
      commandArgument === "-F" ||
      commandArgument.startsWith("-F") ||
      commandArgument === "--form" ||
      commandArgument.startsWith("--form=") ||
      commandArgument === "--json" ||
      commandArgument.startsWith("--json=") ||
      commandArgument === "-T" ||
      commandArgument.startsWith("-T") ||
      commandArgument === "--upload-file" ||
      commandArgument.startsWith("--upload-file=")
    ) {
      return requiresUserApproval(
        "network_side_effect",
        "This curl command sends request data or uploads content, so it still requires explicit user approval.",
      );
    }

    if (
      commandArgument === "-o" ||
      commandArgument.startsWith("-o") ||
      commandArgument === "-O" ||
      commandArgument === "--output" ||
      commandArgument.startsWith("--output=") ||
      commandArgument === "--remote-name"
    ) {
      return requiresUserApproval(
        "filesystem_change",
        "This curl command can write downloaded output to local files, so it still requires explicit user approval.",
      );
    }
  }

  return { approvalPolicy: "auto_run", isReadOnly: true };
}

function classifyWgetCommand(commandArguments: string[]): BashToolApprovalDecision {
  let usesSpiderMode = false;
  let writesOnlyToStdout = false;

  for (let commandArgumentIndex = 0; commandArgumentIndex < commandArguments.length; commandArgumentIndex += 1) {
    const commandArgument = commandArguments[commandArgumentIndex]!;

    if (commandArgument === "--spider") {
      usesSpiderMode = true;
      continue;
    }

    if (commandArgument === "-O" || commandArgument === "--output-document") {
      const outputTarget = commandArguments[commandArgumentIndex + 1];
      if (outputTarget === "-") {
        writesOnlyToStdout = true;
        commandArgumentIndex += 1;
        continue;
      }
      return requiresUserApproval(
        "filesystem_change",
        "This wget command can write downloaded output to local files, so it still requires explicit user approval.",
      );
    }

    if (commandArgument.startsWith("--output-document=")) {
      if (commandArgument.slice("--output-document=".length) === "-") {
        writesOnlyToStdout = true;
        continue;
      }
      return requiresUserApproval(
        "filesystem_change",
        "This wget command can write downloaded output to local files, so it still requires explicit user approval.",
      );
    }

    if (
      commandArgument === "--post-data" ||
      commandArgument.startsWith("--post-data=") ||
      commandArgument === "--body-data" ||
      commandArgument.startsWith("--body-data=") ||
      commandArgument === "--method" ||
      commandArgument.startsWith("--method=")
    ) {
      return requiresUserApproval(
        "network_side_effect",
        "This wget command can send a non-read-only HTTP request, so it still requires explicit user approval.",
      );
    }
  }

  if (usesSpiderMode || writesOnlyToStdout) {
    return { approvalPolicy: "auto_run", isReadOnly: true };
  }

  return requiresUserApproval(
    "filesystem_change",
    "This wget command can write downloaded output to local files, so it still requires explicit user approval.",
  );
}

function classifyGitHubCliCommand(commandArguments: string[]): BashToolApprovalDecision {
  if (commandArguments.length === 0) {
    return { approvalPolicy: "auto_run", isReadOnly: true };
  }

  const githubSubcommand = commandArguments[0]!;
  const githubSubcommandArguments = commandArguments.slice(1);

  if (githubSubcommand === "api") {
    return classifyGitHubApiCommand(githubSubcommandArguments);
  }

  if (githubSubcommand === "auth") {
    return classifySafeNestedSubcommand(githubSubcommandArguments, new Set(["status"]), "github_mutation");
  }

  if (githubSubcommand === "pr") {
    return classifySafeNestedSubcommand(githubSubcommandArguments, SAFE_GITHUB_PR_SUBCOMMAND_NAMES, "github_mutation");
  }

  if (githubSubcommand === "issue") {
    return classifySafeNestedSubcommand(githubSubcommandArguments, SAFE_GITHUB_ISSUE_SUBCOMMAND_NAMES, "github_mutation");
  }

  if (githubSubcommand === "repo") {
    return classifySafeNestedSubcommand(githubSubcommandArguments, SAFE_GITHUB_REPO_SUBCOMMAND_NAMES, "github_mutation");
  }

  if (githubSubcommand === "run") {
    return classifySafeNestedSubcommand(githubSubcommandArguments, SAFE_GITHUB_RUN_SUBCOMMAND_NAMES, "github_mutation");
  }

  if (githubSubcommand === "release") {
    return classifySafeNestedSubcommand(githubSubcommandArguments, SAFE_GITHUB_RELEASE_SUBCOMMAND_NAMES, "github_mutation");
  }

  if (githubSubcommand === "search") {
    return { approvalPolicy: "auto_run", isReadOnly: true };
  }

  return requiresUserApproval(
    "github_mutation",
    "This GitHub CLI command can change remote state or is not classified as read-only, so it still requires explicit user approval.",
  );
}

function classifyGitHubApiCommand(commandArguments: string[]): BashToolApprovalDecision {
  for (let commandArgumentIndex = 0; commandArgumentIndex < commandArguments.length; commandArgumentIndex += 1) {
    const commandArgument = commandArguments[commandArgumentIndex]!;

    if (commandArgument === "-X" || commandArgument === "--method") {
      const requestMethod = commandArguments[commandArgumentIndex + 1];
      if (!requestMethod || !isReadOnlyHttpMethod(requestMethod)) {
        return requiresUserApproval(
          "github_mutation",
          "This gh api command can send a non-read-only request, so it still requires explicit user approval.",
        );
      }
      commandArgumentIndex += 1;
      continue;
    }

    if (commandArgument.startsWith("--method=")) {
      const requestMethod = commandArgument.slice("--method=".length);
      if (!isReadOnlyHttpMethod(requestMethod)) {
        return requiresUserApproval(
          "github_mutation",
          "This gh api command can send a non-read-only request, so it still requires explicit user approval.",
        );
      }
      continue;
    }

    if (commandArgument.startsWith("-X") && commandArgument !== "-X") {
      const requestMethod = commandArgument.slice(2);
      if (!isReadOnlyHttpMethod(requestMethod)) {
        return requiresUserApproval(
          "github_mutation",
          "This gh api command can send a non-read-only request, so it still requires explicit user approval.",
        );
      }
      continue;
    }

    if (commandArgument === "-f" || commandArgument === "-F" || commandArgument === "--raw-field" || commandArgument === "--field") {
      return requiresUserApproval(
        "github_mutation",
        "This gh api command sends request fields, so it still requires explicit user approval.",
      );
    }

    if (
      commandArgument.startsWith("--raw-field=") ||
      commandArgument.startsWith("--field=") ||
      commandArgument === "--input" ||
      commandArgument.startsWith("--input=")
    ) {
      return requiresUserApproval(
        "github_mutation",
        "This gh api command sends request input, so it still requires explicit user approval.",
      );
    }
  }

  return { approvalPolicy: "auto_run", isReadOnly: true };
}

function classifySafeNestedSubcommand(
  commandArguments: string[],
  safeNestedSubcommandNames: Set<string>,
  riskKind: BashCommandRiskKind,
): BashToolApprovalDecision {
  if (commandArguments.length === 0) {
    return requiresUserApproval(
      riskKind,
      "This GitHub CLI command is not classified as read-only, so it still requires explicit user approval.",
    );
  }

  const nestedSubcommand = commandArguments[0]!;
  if (safeNestedSubcommandNames.has(nestedSubcommand)) {
    return { approvalPolicy: "auto_run", isReadOnly: true };
  }

  return requiresUserApproval(
    riskKind,
    "This GitHub CLI command can change remote state or is not classified as read-only, so it still requires explicit user approval.",
  );
}

function tokenizeShellCommand(commandSegment: string): string[] {
  const matchedTokens = commandSegment.match(/"[^"]*"|'[^']*'|\S+/g);
  if (!matchedTokens) {
    return [];
  }

  return matchedTokens.map(stripOuterQuotes);
}

function stripOuterQuotes(commandToken: string): string {
  if (commandToken.length >= 2) {
    const firstCharacter = commandToken[0];
    const lastCharacter = commandToken.at(-1);
    if ((firstCharacter === '"' && lastCharacter === '"') || (firstCharacter === "'" && lastCharacter === "'")) {
      return commandToken.slice(1, -1);
    }
  }

  return commandToken;
}

function findCommandTokenIndex(commandTokens: string[]): number {
  let commandTokenIndex = 0;
  while (commandTokenIndex < commandTokens.length && isEnvironmentVariableAssignment(commandTokens[commandTokenIndex]!)) {
    commandTokenIndex += 1;
  }
  return commandTokenIndex;
}

function isEnvironmentVariableAssignment(commandToken: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(commandToken);
}

function normalizeCommandName(commandToken: string): string {
  const lastSlashIndex = commandToken.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return commandToken;
  }
  return commandToken.slice(lastSlashIndex + 1);
}

function isReadOnlyHttpMethod(requestMethod: string): boolean {
  const normalizedMethod = requestMethod.trim().toUpperCase();
  return normalizedMethod === "GET" || normalizedMethod === "HEAD" || normalizedMethod === "OPTIONS";
}

function requiresUserApproval(
  matchedRiskKind: BashCommandRiskKind,
  riskExplanation: string,
): Extract<BashToolApprovalDecision, { approvalPolicy: "requires_user_approval" }> {
  return {
    approvalPolicy: "requires_user_approval",
    matchedRiskKind,
    riskExplanation,
  };
}
