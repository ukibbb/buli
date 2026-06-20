import { expect, test } from "bun:test";
import { ProviderToolParametersSchema } from "@buli/contracts";
import {
  normalizeMcpToolInputSchema,
  UUID_JSON_SCHEMA_PATTERN_TEXT,
} from "../src/mcpToolSchemaNormalizer.ts";

test("normalizes MCP input schema into Buli's strict provider parameter subset", () => {
  const normalizedParameters = normalizeMcpToolInputSchema({
    type: "object",
    title: "Ignored title",
    properties: {
      note_id: {
        type: "string",
        format: "uuid",
        title: "Ignored property title",
        description: "NoVibe note id.",
        default: "ignored-default",
      },
      include_neighbors: {
        type: "boolean",
        default: false,
      },
      importance: {
        type: "integer",
        minimum: 1,
        maximum: 5,
      },
    },
    required: ["note_id", "unknown_property"],
    additionalProperties: true,
  });

  expect(ProviderToolParametersSchema.parse(normalizedParameters)).toEqual(normalizedParameters);
  expect(normalizedParameters).toEqual({
    type: "object",
    properties: {
      note_id: {
        type: "string",
        description: "NoVibe note id.",
        pattern: UUID_JSON_SCHEMA_PATTERN_TEXT,
      },
      include_neighbors: {
        type: "boolean",
      },
      importance: {
        type: "integer",
        minimum: 1,
        maximum: 5,
      },
    },
    required: ["note_id"],
    additionalProperties: false,
  });
});

test("normalizes nested object, array, and anyOf schemas recursively", () => {
  const normalizedParameters = normalizeMcpToolInputSchema({
    properties: {
      nodes: {
        type: "array",
        minItems: 1,
        maxItems: 25,
        items: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            label: { type: "string", maxLength: 120 },
          },
          required: ["id"],
        },
      },
      cursor: {
        anyOf: [
          { type: "string", format: "uuid" },
          { type: "null", default: null },
        ],
      },
    },
    required: ["nodes"],
  });

  expect(ProviderToolParametersSchema.parse(normalizedParameters)).toEqual(normalizedParameters);
  expect(normalizedParameters.properties["nodes"]).toEqual({
    type: "array",
    minItems: 1,
    maxItems: 25,
    items: {
      type: "object",
      properties: {
        id: { type: "string", pattern: UUID_JSON_SCHEMA_PATTERN_TEXT },
        label: { type: "string", maxLength: 120 },
      },
      required: ["id"],
      additionalProperties: false,
    },
  });
  expect(normalizedParameters.properties["cursor"]).toEqual({
    anyOf: [
      { type: "string", pattern: UUID_JSON_SCHEMA_PATTERN_TEXT },
      { type: "null" },
    ],
  });
});

test("drops unsupported values instead of leaking unsupported JSON Schema fields", () => {
  const normalizedParameters = normalizeMcpToolInputSchema({
    properties: {
      rating: {
        type: ["number", "unsupported", "null"],
        enum: [1, 2, 3],
        exclusiveMinimum: 0,
      },
      status: {
        type: "string",
        enum: ["pending", "accepted", "rejected"],
      },
      ignored: {
        type: "unsupported",
      },
    },
    required: ["rating", "status", "ignored"],
  });

  expect(ProviderToolParametersSchema.parse(normalizedParameters)).toEqual(normalizedParameters);
  expect(normalizedParameters).toEqual({
    type: "object",
    properties: {
      rating: { type: ["number", "null"] },
      status: { type: "string", enum: ["pending", "accepted", "rejected"] },
      ignored: {},
    },
    required: ["rating", "status", "ignored"],
    additionalProperties: false,
  });
});

test("treats missing or malformed input schemas as an empty object parameter schema", () => {
  expect(normalizeMcpToolInputSchema(undefined)).toEqual({
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  });
  expect(normalizeMcpToolInputSchema("not-json-schema")).toEqual({
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  });
});
