import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

export function defaultConversationSessionDatabasePath(input: { workspaceRootPath?: string } = {}): string {
  return join(defaultConversationSessionStorageDirectoryPath(input), "session-store.sqlite");
}

export function defaultConversationSessionStorageDirectoryPath(input: { workspaceRootPath?: string } = {}): string {
  const workspaceRootPath = resolve(input.workspaceRootPath ?? process.cwd());
  return join(
    homedir(),
    ".buli",
    "conversation-sessions",
    `${createWorkspaceSessionFileNamePrefix(workspaceRootPath)}-${createWorkspaceSessionHash(workspaceRootPath)}`,
  );
}

export function createConversationSessionPromptCacheKey(input: { workspaceRootPath?: string } = {}): string {
  return `buli:${createWorkspaceSessionHash(resolve(input.workspaceRootPath ?? process.cwd()))}`;
}

export function createWorkspaceSessionHash(workspaceRootPath: string): string {
  return createHash("sha256").update(resolve(workspaceRootPath)).digest("hex").slice(0, 16);
}

function createWorkspaceSessionFileNamePrefix(workspaceRootPath: string): string {
  const workspaceFolderName = basename(resolve(workspaceRootPath)).trim();
  const safeWorkspaceFolderName = workspaceFolderName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safeWorkspaceFolderName || "workspace";
}
