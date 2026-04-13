import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  OpenAiAuthInfoSchema,
  OpenAiAuthStoreSchema,
  type OpenAiAuthInfo,
  type OpenAiAuthStoreData,
} from "./schema.ts";

export function defaultAuthFilePath(): string {
  return join(homedir(), ".buli", "auth.json");
}

export class OpenAiAuthStore {
  readonly filePath: string;

  constructor(input: { filePath?: string } = {}) {
    this.filePath = input.filePath ?? defaultAuthFilePath();
  }

  async load(): Promise<OpenAiAuthStoreData> {
    try {
      const text = await readFile(this.filePath, "utf8");
      return OpenAiAuthStoreSchema.parse(JSON.parse(text));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return OpenAiAuthStoreSchema.parse({});
      }

      throw error;
    }
  }

  async loadOpenAi(): Promise<OpenAiAuthInfo | undefined> {
    const store = await this.load();
    return store.openai;
  }

  async saveOpenAi(auth: OpenAiAuthInfo): Promise<void> {
    const next = OpenAiAuthStoreSchema.parse({
      ...(await this.load()),
      openai: OpenAiAuthInfoSchema.parse(auth),
    });

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next, null, 2) + "\n", "utf8");
  }
}
