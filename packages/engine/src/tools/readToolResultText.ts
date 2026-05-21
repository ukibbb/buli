export function buildDirectoryReadToolResultText(input: {
  displayPath: string;
  entryNames: readonly string[];
  visibleEntryNames: readonly string[];
  offsetLineNumber: number;
  wasLineCountTruncated: boolean;
}): string {
  const lastVisibleEntryNumber = input.offsetLineNumber + input.visibleEntryNames.length - 1;
  const visibleEntryText = input.visibleEntryNames.length > 0 ? input.visibleEntryNames.join("\n") : "<empty>";
  const statusLine = input.wasLineCountTruncated
    ? `(Showing entries ${input.offsetLineNumber}-${lastVisibleEntryNumber} of ${input.entryNames.length}. Use offset=${lastVisibleEntryNumber + 1} to continue.)`
    : `(${input.entryNames.length} entries)`;

  return [
    `<path>${input.displayPath}</path>`,
    "<type>directory</type>",
    "<entries>",
    visibleEntryText,
    statusLine,
    "</entries>",
  ].join("\n");
}

export function buildFileReadToolResultText(input: {
  displayPath: string;
  fileLines: readonly string[];
  visibleFileLines: readonly string[];
  offsetLineNumber: number;
  wasLineCountTruncated: boolean;
}): string {
  const lastVisibleLineNumber = input.offsetLineNumber + input.visibleFileLines.length - 1;
  const lineText = input.visibleFileLines
    .map((visibleFileLine, visibleFileLineIndex) => `${input.offsetLineNumber + visibleFileLineIndex}: ${visibleFileLine}`)
    .join("\n");
  const statusLine = input.wasLineCountTruncated
    ? `(Showing lines ${input.offsetLineNumber}-${lastVisibleLineNumber} of ${input.fileLines.length}. Use offset=${lastVisibleLineNumber + 1} to continue.)`
    : `(End of file - total ${input.fileLines.length} lines)`;

  return [
    `<path>${input.displayPath}</path>`,
    "<type>file</type>",
    "<content>",
    lineText,
    statusLine,
    "</content>",
  ].join("\n");
}

export function buildLargeFileReadToolResultText(input: {
  displayPath: string;
  fileByteCount: number;
  visibleFileLines: readonly string[];
  offsetLineNumber: number;
  totalLineCount: number | undefined;
  wasLineCountTruncated: boolean;
}): string {
  const lastVisibleLineNumber = input.offsetLineNumber + input.visibleFileLines.length - 1;
  const lineText = input.visibleFileLines
    .map((visibleFileLine, visibleFileLineIndex) => `${input.offsetLineNumber + visibleFileLineIndex}: ${visibleFileLine}`)
    .join("\n");
  const statusLine = input.wasLineCountTruncated
    ? `(Showing lines ${input.offsetLineNumber}-${lastVisibleLineNumber} of a large ${input.fileByteCount}-byte file. Use offset=${lastVisibleLineNumber + 1} to continue.)`
    : `(End of file - total ${input.totalLineCount ?? lastVisibleLineNumber} lines; ${input.fileByteCount} bytes)`;

  return [
    `<path>${input.displayPath}</path>`,
    "<type>file</type>",
    "<content>",
    lineText,
    statusLine,
    "</content>",
  ].join("\n");
}
