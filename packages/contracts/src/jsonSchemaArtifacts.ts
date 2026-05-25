import { z, type ZodType } from "zod";
import { AssistantResponseEventSchema } from "./events.ts";
import { ProviderStreamEventSchema } from "./provider.ts";
import { ConversationSessionEntrySchema } from "./conversationSessionEntry.ts";
import { ConversationSessionModelSelectionSchema } from "./conversationSessionRecord.ts";
import { ToolCallRequestSchema } from "./toolCallRequest.ts";
import { ToolCallDetailSchema } from "./toolCallDetail.ts";
import { WorkspacePatchSchema } from "./workspacePatch.ts";
import {
  PROVIDER_PROTOCOL_JSON_SCHEMA_ID,
  createProviderProtocolJsonSchema,
  type ProviderProtocolJsonSchema,
} from "./providerProtocol.ts";

export type BuliContractJsonSchema = Readonly<Record<string, unknown> & {
  $id: string;
  title: string;
  description: string;
}>;

export type BuliContractJsonSchemaArtifact = Readonly<{
  artifactFileName: string;
  jsonSchema: BuliContractJsonSchema;
}>;

type BuliContractZodSchemaArtifactDefinition = Readonly<{
  artifactFileName: string;
  jsonSchemaId: string;
  title: string;
  description: string;
  schema: ZodType<unknown>;
}>;

const providerProtocolSchemaArtifact = {
  artifactFileName: "provider-protocol-v1.schema.json",
  jsonSchemaId: PROVIDER_PROTOCOL_JSON_SCHEMA_ID,
  title: "Buli Provider Protocol v1",
  description: "Versioned newline-delimited JSON frame contract for Buli provider IPC.",
} as const;

const contractZodSchemaArtifactDefinitions = [
  {
    artifactFileName: "assistant-response-event-v1.schema.json",
    jsonSchemaId: "https://buli.dev/schemas/assistant-response-event/v1.json",
    title: "Buli Assistant Response Event v1",
    description: "Renderer-facing assistant turn event contract emitted by the Buli engine.",
    schema: AssistantResponseEventSchema,
  },
  {
    artifactFileName: "provider-stream-event-v1.schema.json",
    jsonSchemaId: "https://buli.dev/schemas/provider-stream-event/v1.json",
    title: "Buli Provider Stream Event v1",
    description: "Provider-facing stream event contract consumed by the Buli engine.",
    schema: ProviderStreamEventSchema,
  },
  {
    artifactFileName: "conversation-session-entry-v1.schema.json",
    jsonSchemaId: "https://buli.dev/schemas/conversation-session-entry/v1.json",
    title: "Buli Conversation Session Entry v1",
    description: "Persisted canonical conversation session entry contract.",
    schema: ConversationSessionEntrySchema,
  },
  {
    artifactFileName: "conversation-session-model-selection-v1.schema.json",
    jsonSchemaId: "https://buli.dev/schemas/conversation-session-model-selection/v1.json",
    title: "Buli Conversation Session Model Selection v1",
    description: "Persisted selected model and reasoning-effort contract.",
    schema: ConversationSessionModelSelectionSchema,
  },
  {
    artifactFileName: "tool-call-request-v1.schema.json",
    jsonSchemaId: "https://buli.dev/schemas/tool-call-request/v1.json",
    title: "Buli Tool Call Request v1",
    description: "Provider-requested local tool intent contract.",
    schema: ToolCallRequestSchema,
  },
  {
    artifactFileName: "tool-call-detail-v1.schema.json",
    jsonSchemaId: "https://buli.dev/schemas/tool-call-detail/v1.json",
    title: "Buli Tool Call Detail v1",
    description: "Renderer and persistence contract for local tool execution details.",
    schema: ToolCallDetailSchema,
  },
  {
    artifactFileName: "workspace-patch-v1.schema.json",
    jsonSchemaId: "https://buli.dev/schemas/workspace-patch/v1.json",
    title: "Buli Workspace Patch v1",
    description: "Captured workspace patch summary contract.",
    schema: WorkspacePatchSchema,
  },
] satisfies readonly BuliContractZodSchemaArtifactDefinition[];

export function createBuliContractJsonSchemaArtifacts(): readonly BuliContractJsonSchemaArtifact[] {
  return [
    {
      artifactFileName: providerProtocolSchemaArtifact.artifactFileName,
      jsonSchema: createProviderProtocolJsonSchema(),
    },
    ...contractZodSchemaArtifactDefinitions.map(createBuliContractJsonSchemaArtifact),
  ];
}

export function createBuliContractJsonSchemaArtifactByFileName(
  artifactFileName: string,
): BuliContractJsonSchemaArtifact | undefined {
  return createBuliContractJsonSchemaArtifacts().find(
    (schemaArtifact) => schemaArtifact.artifactFileName === artifactFileName,
  );
}

export function createBuliContractJsonSchemaArtifact(
  schemaArtifactDefinition: BuliContractZodSchemaArtifactDefinition,
): BuliContractJsonSchemaArtifact {
  return {
    artifactFileName: schemaArtifactDefinition.artifactFileName,
    jsonSchema: createBuliContractJsonSchema(schemaArtifactDefinition),
  };
}

function createBuliContractJsonSchema(
  schemaArtifactDefinition: BuliContractZodSchemaArtifactDefinition,
): BuliContractJsonSchema {
  const jsonSchema = z.toJSONSchema(schemaArtifactDefinition.schema, {
    target: "draft-2020-12",
    reused: "ref",
  }) as Record<string, unknown>;

  return {
    ...jsonSchema,
    $id: schemaArtifactDefinition.jsonSchemaId,
    title: schemaArtifactDefinition.title,
    description: schemaArtifactDefinition.description,
  };
}

export function assertProviderProtocolJsonSchemaArtifact(
  jsonSchema: BuliContractJsonSchema,
): jsonSchema is ProviderProtocolJsonSchema {
  return jsonSchema.$id === PROVIDER_PROTOCOL_JSON_SCHEMA_ID;
}
