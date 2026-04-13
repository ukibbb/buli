import type { TokenUsage } from "@buli/contracts";
import { Box, Text } from "ink";
import type { AssistantResponseStatus, AuthenticationState } from "../chatScreenState.ts";
import { chatScreenTheme } from "../chatScreenTheme.ts";

export type ChatSessionStatusBarProps = {
  authenticationState: AuthenticationState;
  assistantResponseStatus: AssistantResponseStatus;
  conversationTranscriptViewportStatusText: string;
  latestTokenUsage: TokenUsage | undefined;
};

function formatAssistantResponseStatus(assistantResponseStatus: AssistantResponseStatus): string {
  if (assistantResponseStatus === "waiting_for_user_input") {
    return "idle";
  }

  if (assistantResponseStatus === "streaming_assistant_response") {
    return "streaming";
  }

  return "error";
}

function formatAuthenticationState(authenticationState: AuthenticationState): string {
  if (authenticationState === "ready") {
    return "ready";
  }

  return "missing";
}

function formatTokenUsage(latestTokenUsage: TokenUsage | undefined): string | undefined {
  if (!latestTokenUsage) {
    return undefined;
  }

  if (latestTokenUsage.reasoning > 0) {
    return `in ${latestTokenUsage.input} out ${latestTokenUsage.output} reason ${latestTokenUsage.reasoning}`;
  }

  return `in ${latestTokenUsage.input} out ${latestTokenUsage.output}`;
}

export function ChatSessionStatusBar(props: ChatSessionStatusBarProps) {
  const statusSummaryText = `status ${formatAssistantResponseStatus(props.assistantResponseStatus)} | auth ${formatAuthenticationState(props.authenticationState)}`;
  const formattedTokenUsage = formatTokenUsage(props.latestTokenUsage);

  return (
    <Box
      backgroundColor={chatScreenTheme.panelBackgroundColor}
      borderColor={chatScreenTheme.borderColor}
      borderStyle={chatScreenTheme.borderStyle}
      flexDirection="column"
      paddingX={1}
    >
      <Text color={chatScreenTheme.mutedTextColor}>{statusSummaryText}</Text>
      <Text color={chatScreenTheme.mutedTextColor}>{props.conversationTranscriptViewportStatusText}</Text>
      {formattedTokenUsage ? <Text color={chatScreenTheme.mutedTextColor}>{formattedTokenUsage}</Text> : null}
    </Box>
  );
}
