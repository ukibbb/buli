// Smoke generator for the conversation session HTML export. Run with:
//   bun run apps/cli/scripts/generateSmokeExport.ts
// Writes /tmp/buli-export-demos/<timestamp>-smoke-export-demo.html plus a stable
// alias real-export-smoke.html so designers can refresh a screenshot without
// chasing timestamped filenames.
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ConversationSessionEntry } from "@buli/contracts";
import { writeConversationSessionHtmlExport } from "../src/conversationSession/export/conversationSessionHtmlExport.ts";

// Real 1x1 transparent PNG as a data URL — keeps the browser image decoder happy
// so the smoke export never shows the broken-image icon.
const transparentOnePixelPngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const smokeConversationSessionEntries: ConversationSessionEntry[] = [
  {
    entryKind: "user_prompt",
    promptText: "Render the smoke session showing all entry kinds.",
    modelFacingPromptText: "Render the smoke session showing all entry kinds.",
    assistantOperatingMode: "implementation",
    imageAttachments: [
      {
        attachmentId: "image-1",
        mimeType: "image/png",
        dataUrl: transparentOnePixelPngDataUrl,
        fileName: "clipboard.png",
      },
    ],
  },
  {
    entryKind: "assistant_text_segment",
    assistantTextSegmentText: "I'll list the workspace, read a file, then edit it.",
  },
  {
    entryKind: "tool_call",
    toolCallId: "call-bash-1",
    toolCallRequest: {
      toolName: "bash",
      shellCommand: "ls apps/cli/src",
      commandDescription: "List CLI source files",
    },
  },
  {
    entryKind: "completed_tool_result",
    toolCallId: "call-bash-1",
    toolCallDetail: {
      toolName: "bash",
      commandLine: "ls apps/cli/src",
      commandDescription: "List CLI source files",
    },
    toolResultText: "cli.ts\nconversationSessionHtmlExport.ts\nmain.ts",
  },
  {
    entryKind: "tool_call",
    toolCallId: "call-read-1",
    toolCallRequest: {
      toolName: "read",
      readTargetPath: "apps/cli/src/main.ts",
    },
  },
  {
    entryKind: "failed_tool_result",
    toolCallId: "call-read-1",
    toolCallDetail: {
      toolName: "read",
      readFilePath: "apps/cli/src/main.ts",
      readLineCount: 0,
    },
    toolResultText: "",
    failureExplanation: "File not found: apps/cli/src/main.ts (renamed to cli.ts).",
  },
  {
    entryKind: "tool_call",
    toolCallId: "call-edit-1",
    toolCallRequest: {
      toolName: "edit",
      editTargetPath: "apps/cli/src/cli.ts",
      oldString: "const port = 3000;",
      newString: "const port = 4000;",
    },
  },
  {
    entryKind: "denied_tool_result",
    toolCallId: "call-edit-1",
    toolCallDetail: {
      toolName: "edit",
      editedFilePath: "apps/cli/src/cli.ts",
      addedLineCount: 1,
      removedLineCount: 1,
    },
    toolResultText: "",
    denialExplanation: "User declined the edit; proposing alternate diff next.",
  },
  {
    entryKind: "tool_call",
    toolCallId: "call-write-1",
    toolCallRequest: {
      toolName: "write",
      writeTargetPath: "apps/cli/notes/launch.md",
      fileContent: "# Launch\n\nDeployment runbook.\n",
    },
  },
  {
    entryKind: "completed_tool_result",
    toolCallId: "call-write-1",
    toolCallDetail: {
      toolName: "write",
      writtenFilePath: "apps/cli/notes/launch.md",
      addedLineCount: 3,
      removedLineCount: 0,
    },
    toolResultText: "Wrote file: apps/cli/notes/launch.md",
  },
  {
    entryKind: "workspace_patch",
    workspacePatch: {
      workspacePatchId: "patch-1",
      toolCallId: "call-write-1",
      capturedAtMs: 1_700_000_000_000,
      baselineSnapshotHash: "tree-before",
      resultingSnapshotHash: "tree-after",
      changedFileCount: 1,
      addedLineCount: 3,
      removedLineCount: 0,
      changedFiles: [
        {
          filePath: "apps/cli/notes/launch.md",
          changeKind: "added",
          addedLineCount: 3,
          removedLineCount: 0,
          unifiedDiffText: [
            "diff --git a/apps/cli/notes/launch.md b/apps/cli/notes/launch.md",
            "--- /dev/null",
            "+++ b/apps/cli/notes/launch.md",
            "@@ -0,0 +1,3 @@",
            "+# Launch",
            "+",
            "+Deployment runbook.",
            "",
          ].join("\n"),
        },
      ],
    },
  },
  {
    entryKind: "assistant_code_execution_walkthrough_segment",
    titleText: "Port override flow",
    summaryText: "How the new port value flows through the CLI bootstrap.",
    walkthroughKind: "source_walkthrough",
    steps: [
      {
        stepTitle: "Read configuration",
        whatHappensText: "The CLI reads the port from cli.ts at startup.",
        codeExamples: [
          {
            sourceFilePath: "apps/cli/src/cli.ts",
            startLineNumber: 12,
            endLineNumber: 14,
            languageLabel: "typescript",
            codeText: "const port = 4000;\nconst server = createServer({ port });\nserver.listen();",
          },
        ],
      },
      {
        stepTitle: "Bind socket",
        whatHappensText: "The server binds to the configured port.",
        codeExamples: [
          {
            sourceFilePath: "apps/cli/src/cli.ts",
            startLineNumber: 16,
            endLineNumber: 16,
            languageLabel: "typescript",
            codeText: "server.listen();",
          },
        ],
      },
    ],
  },
  {
    entryKind: "conversation_compaction_summary",
    summaryText:
      "Recap: explored apps/cli, attempted a read on main.ts (renamed), proposed an edit (denied), wrote a launch note, then walked through the port override path.",
    compactedEntryCount: 10,
    retainedRecentConversationSessionEntryCount: 2,
  },
  {
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: [
      "# Smoke export ready",
      "",
      "The export now exercises every entry kind:",
      "",
      "- user prompt with attachment",
      "- tool call + completed result",
      "- failed and denied tool results",
      "- workspace patch",
      "- code execution walkthrough",
      "- compaction summary",
      "",
      "```ts",
      "const port = 4000;",
      "```",
    ].join("\n"),
  },
];

const exportDirectoryPath = "/tmp/buli-export-demos";

mkdirSync(exportDirectoryPath, { recursive: true, mode: 0o700 });

const exportResult = writeConversationSessionHtmlExport({
  conversationSessionEntries: smokeConversationSessionEntries,
  workspaceRootPath: "/Users/lukasz/Desktop/Projekty/buli",
  conversationSessionId: "smoke-export-demo",
  exportDirectoryPath,
});

// Stable alias so the smoke screenshot path never changes.
const stableAliasPath = join(exportDirectoryPath, "real-export-smoke.html");
copyFileSync(exportResult.exportFilePath, stableAliasPath);

console.log(`wrote ${exportResult.exportFilePath}`);
console.log(`alias ${stableAliasPath}`);
