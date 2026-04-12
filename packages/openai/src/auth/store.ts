import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { AuthInfoSchema, AuthStoreSchema, type AuthInfo, type AuthStore } from "@buli/contracts";

export function defaultAuthFilePath(): string {
  return join(homedir(), ".buli", "auth.json");
}

export class OpenAiAuthStore {
  readonly filePath: string;

  constructor(input: { filePath?: string } = {}) {
    this.filePath = input.filePath ?? defaultAuthFilePath();
  }

  async load(): Promise<AuthStore> {
    try {
      const text = await readFile(this.filePath, "utf8");
      return AuthStoreSchema.parse(JSON.parse(text));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return AuthStoreSchema.parse({});
      }

      throw error;
    }
  }

  async loadOpenAi(): Promise<AuthInfo | undefined> {
    const store = await this.load();
    return store.openai;
  }

  async saveOpenAi(auth: AuthInfo): Promise<void> {
    const next = AuthStoreSchema.parse({
      ...(await this.load()),
      openai: AuthInfoSchema.parse(auth),
    });

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next, null, 2) + "\n", "utf8");
  }
}
