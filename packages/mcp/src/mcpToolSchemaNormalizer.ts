import type {
  ProviderToolDefinition,
  ProviderToolJsonSchemaTypeName,
  ProviderToolParameterProperty,
} from "@buli/contracts";

export const UUID_JSON_SCHEMA_PATTERN_TEXT =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$";

type JsonRecord = Readonly<Record<string, unknown>>;

type MutableProviderToolParameterProperty = {
  type?: ProviderToolParameterProperty["type"] | undefined;
  description?: string | undefined;
  minimum?: number | undefined;
  maximum?: number | undefined;
  maxItems?: number | undefined;
  maxLength?: number | undefined;
  minItems?: number | undefined;
  enum?: string[] | undefined;
  pattern?: string | undefined;
  items?: ProviderToolParameterProperty | undefined;
  properties?: Record<string, ProviderToolParameterProperty> | undefined;
  required?: string[] | undefined;
  additionalProperties?: false | undefined;
  anyOf?: ProviderToolParameterProperty[] | undefined;
};

const SUPPORTED_JSON_SCHEMA_TYPE_NAMES = [
  "string",
  "integer",
  "number",
  "object",
  "array",
  "boolean",
  "null",
] as const satisfies readonly ProviderToolJsonSchemaTypeName[];

const SUPPORTED_JSON_SCHEMA_TYPE_NAME_SET: ReadonlySet<string> = new Set(SUPPORTED_JSON_SCHEMA_TYPE_NAMES);

export function normalizeMcpToolInputSchema(mcpInputSchema: unknown): ProviderToolDefinition["parameters"] {
  const inputSchema = isJsonRecord(mcpInputSchema) ? mcpInputSchema : {};
  const normalizedProperties = normalizeMcpToolProperties(inputSchema["properties"]);

  return {
    type: "object",
    properties: normalizedProperties,
    required: normalizeRequiredPropertyNames(inputSchema["required"], normalizedProperties),
    additionalProperties: false,
  };
}

export function normalizeMcpToolParameterProperty(mcpParameterSchema: unknown): ProviderToolParameterProperty {
  const parameterSchema = isJsonRecord(mcpParameterSchema) ? mcpParameterSchema : {};
  const normalizedParameter: MutableProviderToolParameterProperty = {};
  const normalizedType = normalizeJsonSchemaType(parameterSchema["type"]);
  if (normalizedType !== undefined) {
    normalizedParameter.type = normalizedType;
  }

  const description = normalizeNonEmptyString(parameterSchema["description"]);
  if (description !== undefined) {
    normalizedParameter.description = description;
  }

  const minimum = normalizeFiniteNumber(parameterSchema["minimum"]);
  if (minimum !== undefined) {
    normalizedParameter.minimum = minimum;
  }

  const maximum = normalizeFiniteNumber(parameterSchema["maximum"]);
  if (maximum !== undefined) {
    normalizedParameter.maximum = maximum;
  }

  const maxItems = normalizeNonNegativeInteger(parameterSchema["maxItems"]);
  if (maxItems !== undefined) {
    normalizedParameter.maxItems = maxItems;
  }

  const maxLength = normalizeNonNegativeInteger(parameterSchema["maxLength"]);
  if (maxLength !== undefined) {
    normalizedParameter.maxLength = maxLength;
  }

  const minItems = normalizeNonNegativeInteger(parameterSchema["minItems"]);
  if (minItems !== undefined) {
    normalizedParameter.minItems = minItems;
  }

  const enumValues = normalizeStringEnumValues(parameterSchema["enum"]);
  if (enumValues !== undefined) {
    normalizedParameter.enum = enumValues;
  }

  const pattern = normalizeNonEmptyString(parameterSchema["pattern"]);
  if (pattern !== undefined) {
    normalizedParameter.pattern = pattern;
  }

  if (shouldConvertUuidFormatToPattern({ parameterSchema, normalizedParameter })) {
    normalizedParameter.pattern = UUID_JSON_SCHEMA_PATTERN_TEXT;
    if (normalizedParameter.type === undefined) {
      normalizedParameter.type = "string";
    }
  }

  if (parameterSchema["items"] !== undefined) {
    normalizedParameter.items = normalizeMcpToolParameterProperty(parameterSchema["items"]);
  }

  const normalizedProperties = normalizeMcpToolProperties(parameterSchema["properties"]);
  if (Object.keys(normalizedProperties).length > 0) {
    normalizedParameter.properties = normalizedProperties;
  }

  const requiredPropertyNames = normalizeRequiredPropertyNames(parameterSchema["required"], normalizedProperties);
  if (requiredPropertyNames.length > 0) {
    normalizedParameter.required = requiredPropertyNames;
  }

  if (shouldForceAdditionalPropertiesFalse(normalizedParameter)) {
    normalizedParameter.additionalProperties = false;
  }

  const anyOf = normalizeAnyOfParameterProperties(parameterSchema["anyOf"]);
  if (anyOf !== undefined) {
    normalizedParameter.anyOf = anyOf;
  }

  return normalizedParameter;
}

function normalizeMcpToolProperties(propertiesSchema: unknown): Record<string, ProviderToolParameterProperty> {
  if (!isJsonRecord(propertiesSchema)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(propertiesSchema)
      .filter(([propertyName]) => propertyName.length > 0)
      .map(([propertyName, propertySchema]) => [propertyName, normalizeMcpToolParameterProperty(propertySchema)]),
  );
}

function normalizeJsonSchemaType(typeValue: unknown): ProviderToolParameterProperty["type"] | undefined {
  if (typeof typeValue === "string") {
    return isSupportedJsonSchemaTypeName(typeValue) ? typeValue : undefined;
  }

  if (!Array.isArray(typeValue)) {
    return undefined;
  }

  const supportedTypeNames = typeValue.filter(isSupportedJsonSchemaTypeName);
  if (supportedTypeNames.length === 0) {
    return undefined;
  }

  return [...new Set(supportedTypeNames)];
}

function normalizeRequiredPropertyNames(
  requiredValue: unknown,
  normalizedProperties: Record<string, ProviderToolParameterProperty>,
): string[] {
  if (!Array.isArray(requiredValue)) {
    return [];
  }

  const normalizedPropertyNames = new Set(Object.keys(normalizedProperties));
  return [...new Set(requiredValue.filter((propertyName): propertyName is string =>
    typeof propertyName === "string" && propertyName.length > 0 && normalizedPropertyNames.has(propertyName)
  ))];
}

function normalizeAnyOfParameterProperties(anyOfValue: unknown): ProviderToolParameterProperty[] | undefined {
  if (!Array.isArray(anyOfValue)) {
    return undefined;
  }

  const normalizedAnyOf = anyOfValue.map(normalizeMcpToolParameterProperty);
  return normalizedAnyOf.length > 0 ? normalizedAnyOf : undefined;
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.length > 0 ? value : undefined;
}

function normalizeFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function normalizeStringEnumValues(enumValue: unknown): string[] | undefined {
  if (!Array.isArray(enumValue) || enumValue.length === 0) {
    return undefined;
  }

  const stringEnumValues = enumValue.filter((value): value is string => typeof value === "string");
  if (stringEnumValues.length !== enumValue.length || stringEnumValues.length === 0) {
    return undefined;
  }

  return [...new Set(stringEnumValues)];
}

function shouldConvertUuidFormatToPattern(input: {
  parameterSchema: JsonRecord;
  normalizedParameter: MutableProviderToolParameterProperty;
}): boolean {
  if (input.parameterSchema["format"] !== "uuid" || input.normalizedParameter.pattern !== undefined) {
    return false;
  }

  return input.normalizedParameter.type === undefined || schemaTypeIncludes(input.normalizedParameter.type, "string");
}

function shouldForceAdditionalPropertiesFalse(parameter: MutableProviderToolParameterProperty): boolean {
  return schemaTypeIncludes(parameter.type, "object") || parameter.properties !== undefined;
}

function schemaTypeIncludes(
  schemaType: ProviderToolParameterProperty["type"] | undefined,
  expectedSchemaType: ProviderToolJsonSchemaTypeName,
): boolean {
  if (schemaType === undefined) {
    return false;
  }

  return Array.isArray(schemaType) ? schemaType.includes(expectedSchemaType) : schemaType === expectedSchemaType;
}

function isSupportedJsonSchemaTypeName(value: unknown): value is ProviderToolJsonSchemaTypeName {
  return typeof value === "string" && SUPPORTED_JSON_SCHEMA_TYPE_NAME_SET.has(value);
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
