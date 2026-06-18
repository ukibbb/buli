export type OpenAiHostedWebSearchMode = "disabled" | "live";
export type OpenAiHostedWebSearchContentType = "text" | "image";
export type OpenAiHostedWebSearchContextSize = "low" | "medium" | "high";

export type OpenAiHostedWebSearchUserLocation = Readonly<{
  type: "approximate";
  country?: string | undefined;
  region?: string | undefined;
  city?: string | undefined;
  timezone?: string | undefined;
}>;

export type OpenAiHostedWebSearchFilters = Readonly<{
  allowedDomains?: readonly string[] | undefined;
  blockedDomains?: readonly string[] | undefined;
}>;

export type OpenAiHostedWebSearchConfiguration = Readonly<{
  mode: OpenAiHostedWebSearchMode;
  searchContentTypes?: readonly OpenAiHostedWebSearchContentType[] | undefined;
  includeSources?: boolean | undefined;
  includeResults?: boolean | undefined;
  searchContextSize?: OpenAiHostedWebSearchContextSize | undefined;
  userLocation?: OpenAiHostedWebSearchUserLocation | undefined;
  filters?: OpenAiHostedWebSearchFilters | undefined;
  returnTokenBudget?: number | undefined;
}>;

type OpenAiHostedWebSearchToolFilters = Readonly<{
  allowed_domains?: readonly string[] | undefined;
  blocked_domains?: readonly string[] | undefined;
}>;

export type OpenAiHostedWebSearchToolDefinition = Readonly<{
  type: "web_search";
  external_web_access: boolean;
  search_content_types?: readonly OpenAiHostedWebSearchContentType[] | undefined;
  search_context_size?: OpenAiHostedWebSearchContextSize | undefined;
  user_location?: OpenAiHostedWebSearchUserLocation | undefined;
  filters?: OpenAiHostedWebSearchToolFilters | undefined;
  return_token_budget?: number | undefined;
}>;

export const DEFAULT_OPENAI_HOSTED_WEB_SEARCH_CONFIGURATION: OpenAiHostedWebSearchConfiguration = {
  mode: "live",
  searchContentTypes: ["text", "image"],
  includeSources: true,
  includeResults: true,
  searchContextSize: "high",
};

export function createOpenAiHostedWebSearchToolDefinition(
  configuration: OpenAiHostedWebSearchConfiguration | undefined,
): OpenAiHostedWebSearchToolDefinition | undefined {
  if (!configuration || configuration.mode === "disabled") {
    return undefined;
  }

  return {
    type: "web_search",
    external_web_access: true,
    ...(configuration.searchContentTypes && configuration.searchContentTypes.length > 0
      ? { search_content_types: [...configuration.searchContentTypes] }
      : {}),
    search_context_size: configuration.searchContextSize ?? "high",
    ...(configuration.userLocation ? { user_location: configuration.userLocation } : {}),
    ...(configuration.filters ? { filters: createOpenAiHostedWebSearchToolFilters(configuration.filters) } : {}),
    ...(configuration.returnTokenBudget !== undefined ? { return_token_budget: configuration.returnTokenBudget } : {}),
  };
}

function createOpenAiHostedWebSearchToolFilters(
  filters: OpenAiHostedWebSearchFilters,
): OpenAiHostedWebSearchToolFilters {
  return {
    ...(filters.allowedDomains && filters.allowedDomains.length > 0 ? { allowed_domains: [...filters.allowedDomains] } : {}),
    ...(filters.blockedDomains && filters.blockedDomains.length > 0 ? { blocked_domains: [...filters.blockedDomains] } : {}),
  };
}
