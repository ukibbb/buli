import { z } from "zod";

export const ConversationTurnStatusSchema = z.enum([
  "waiting_for_user_input",
  "streaming_assistant_response",
  "waiting_for_tool_approval",
  "assistant_response_failed",
]);

export type ConversationTurnStatus = z.infer<typeof ConversationTurnStatusSchema>;
