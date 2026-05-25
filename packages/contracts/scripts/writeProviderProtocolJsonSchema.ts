import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createProviderProtocolJsonSchema } from "../src/providerProtocol.ts";

export const providerProtocolJsonSchemaArtifactUrl = new URL(
  "../schemas/provider-protocol-v1.schema.json",
  import.meta.url,
);

export function serializeProviderProtocolJsonSchema(): string {
  return `${JSON.stringify(createProviderProtocolJsonSchema(), null, 2)}\n`;
}

export async function writeProviderProtocolJsonSchemaArtifact(): Promise<void> {
  await mkdir(dirname(providerProtocolJsonSchemaArtifactUrl.pathname), { recursive: true });
  await writeFile(providerProtocolJsonSchemaArtifactUrl, serializeProviderProtocolJsonSchema(), "utf8");
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  await writeProviderProtocolJsonSchemaArtifact();
}
