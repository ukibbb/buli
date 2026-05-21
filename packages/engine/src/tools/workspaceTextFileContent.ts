export function splitWorkspaceTextFileIntoLines(fileText: string): string[] {
  const lines = fileText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

export function isLikelyBinaryFileSample(fileSampleBytes: Uint8Array): boolean {
  if (fileSampleBytes.length === 0) {
    return false;
  }

  let nonPrintableByteCount = 0;
  for (const byte of fileSampleBytes) {
    if (byte === 0) {
      return true;
    }
    if (byte < 9 || (byte > 13 && byte < 32)) {
      nonPrintableByteCount += 1;
    }
  }

  return nonPrintableByteCount / fileSampleBytes.length > 0.3;
}
