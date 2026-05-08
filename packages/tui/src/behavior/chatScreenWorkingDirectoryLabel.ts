export function formatChatScreenWorkingDirectoryPath(input: {
  homeDirectoryPath: string;
  workingDirectoryPath: string;
}): string {
  return input.workingDirectoryPath.startsWith(input.homeDirectoryPath)
    ? `~${input.workingDirectoryPath.slice(input.homeDirectoryPath.length)}`
    : input.workingDirectoryPath;
}
