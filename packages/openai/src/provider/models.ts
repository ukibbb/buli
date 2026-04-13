import { AvailableAssistantModelSchema, ReasoningEffortSchema, type AvailableAssistantModel } from "@buli/contracts";
import { z } from "zod";

const OpenAiModelReasoningLevelSchema = z
  .object({
    effort: ReasoningEffortSchema,
  })
  .passthrough();

const OpenAiModelMetadataSchema = z
  .object({
    slug: z.string().min(1),
    display_name: z.string().min(1).optional(),
    default_reasoning_level: ReasoningEffortSchema.optional(),
    supported_reasoning_levels: z.array(OpenAiModelReasoningLevelSchema).default([]),
    supported_in_api: z.boolean().optional(),
    visibility: z.enum(["list", "hide", "none"]).default("list"),
  })
  .passthrough();

const OpenAiModelsResponseSchema = z
  .object({
    models: z.array(OpenAiModelMetadataSchema),
  })
  .passthrough();

export function deriveOpenAiModelListEndpoint(endpoint: string): string {
  const url = new URL(endpoint);

  if (url.pathname.endsWith("/responses")) {
    url.pathname = `${url.pathname.slice(0, -"/responses".length)}/models`;
    return url.toString();
  }

  url.pathname = `${url.pathname.replace(/\/$/, "")}/models`;
  return url.toString();
}

export function parseAvailableAssistantModelsFromOpenAiResponse(input: unknown): AvailableAssistantModel[] {
  const payload = OpenAiModelsResponseSchema.parse(input);

  return payload.models
    .filter((model) => model.visibility === "list" && model.supported_in_api !== false)
    .map((model) =>
      AvailableAssistantModelSchema.parse({
        id: model.slug,
        displayName: model.display_name ?? model.slug,
        defaultReasoningEffort: model.default_reasoning_level,
        supportedReasoningEfforts: model.supported_reasoning_levels.map((level) => level.effort),
      }),
    );
}
