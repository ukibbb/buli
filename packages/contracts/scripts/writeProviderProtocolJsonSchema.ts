import { fileURLToPath } from "node:url";
import {
  contractJsonSchemasDirectoryUrl,
  serializeBuliContractJsonSchemaArtifactByFileName,
  writeBuliContractJsonSchemaArtifacts,
} from "./writeJsonSchemaArtifacts.ts";

export const providerProtocolJsonSchemaArtifactUrl = new URL(
  "provider-protocol-v1.schema.json",
  contractJsonSchemasDirectoryUrl,
);

export function serializeProviderProtocolJsonSchema(): string {
  return serializeBuliContractJsonSchemaArtifactByFileName("provider-protocol-v1.schema.json");
}

export async function writeProviderProtocolJsonSchemaArtifact(): Promise<void> {
  await writeBuliContractJsonSchemaArtifacts();
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  await writeProviderProtocolJsonSchemaArtifact();
}
