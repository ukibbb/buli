import { z } from "zod";
import { ToolCallTodoItemStatusSchema } from "./toolCallDetail.ts";

export const CalloutSeveritySchema = z.enum(["info", "success", "warning", "error"]);
export type CalloutSeverity = z.infer<typeof CalloutSeveritySchema>;

export const ChecklistItemSchema = z
  .object({
    itemTitle: z.string(),
    itemStatus: ToolCallTodoItemStatusSchema,
  })
  .strict();
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
