import { readFile } from "node:fs/promises";

const BINARY_SAMPLE_BYTE_COUNT = 4_096;

export async function readWorkspaceTextFile(input: {
  absolutePath: string;
  displayPath: string;
}): Promise<string> {
  const fileBytes = await readFile(input.absolutePath);
  if (isBinaryFileSample(fileBytes.subarray(0, BINARY_SAMPLE_BYTE_COUNT))) {
    throw new Error(`Cannot mutate binary file: ${input.displayPath}`);
  }

  return fileBytes.toString("utf8");
}

function isBinaryFileSample(fileSampleBytes: Uint8Array): boolean {
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
