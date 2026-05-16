import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
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
    const authDirectoryPath = dirname(this.filePath);
    const temporaryFilePath = join(
      authDirectoryPath,
      `.${basename(this.filePath)}.${process.pid}.${randomUUID()}.tmp`,
    );

    await mkdir(authDirectoryPath, { recursive: true, mode: 0o700 });
    await chmod(authDirectoryPath, 0o700);
    try {
      await writeFile(temporaryFilePath, JSON.stringify(next, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
      await chmod(temporaryFilePath, 0o600);
      await rename(temporaryFilePath, this.filePath);
      await chmod(this.filePath, 0o600);
    } finally {
      await rm(temporaryFilePath, { force: true });
    }
  }
}
