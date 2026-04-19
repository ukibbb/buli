import { z } from "zod";
import { InlineSpanSchema } from "./inlineSpan.ts";
import { ToolCallTodoItemStatusSchema } from "./toolCallDetail.ts";

// Callout severity matches the existing TUI callout severity type.
// "warning" is the full word — not "warn" — because the existing parser
// maps GitHub admonition tags WARNING/WARN/CAUTION to this enum value.
export const CalloutSeveritySchema = z.enum(["info", "success", "warning", "error"]);
export type CalloutSeverity = z.infer<typeof CalloutSeveritySchema>;

// Checklist item shape matches packages/tui/src/components/primitives/Checklist.tsx
// so the TUI Checklist component's props surface is unchanged after the
// type relocates into contracts. itemStatus reuses ToolCallTodoItemStatus.
export const ChecklistItemSchema = z
  .object({
    itemTitle: z.string(),
    itemStatus: ToolCallTodoItemStatusSchema,
  })
  .strict();
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const ParagraphContentPartSchema = z
  .object({
    kind: z.literal("paragraph"),
    inlineSpans: z.array(InlineSpanSchema),
  })
  .strict();

export const HeadingContentPartSchema = z
  .object({
    kind: z.literal("heading"),
    headingLevel: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
    inlineSpans: z.array(InlineSpanSchema),
  })
  .strict();

export const BulletedListContentPartSchema = z
  .object({
    kind: z.literal("bulleted_list"),
    itemSpanArrays: z.array(z.array(InlineSpanSchema)),
  })
  .strict();

export const NumberedListContentPartSchema = z
  .object({
    kind: z.literal("numbered_list"),
    itemSpanArrays: z.array(z.array(InlineSpanSchema)),
  })
  .strict();

export const ChecklistContentPartSchema = z
  .object({
    kind: z.literal("checklist"),
    items: z.array(ChecklistItemSchema),
  })
  .strict();

export const FencedCodeBlockContentPartSchema = z
  .object({
    kind: z.literal("fenced_code_block"),
    languageLabel: z.string().min(1).optional(),
    codeLines: z.array(z.string()),
  })
  .strict();

export const CalloutContentPartSchema = z
  .object({
    kind: z.literal("callout"),
    severity: CalloutSeveritySchema,
    titleText: z.string().min(1).optional(),
    inlineSpans: z.array(InlineSpanSchema),
  })
  .strict();

export const HorizontalRuleContentPartSchema = z
  .object({ kind: z.literal("horizontal_rule") })
  .strict();

export const AssistantContentPartSchema = z.discriminatedUnion("kind", [
  ParagraphContentPartSchema,
  HeadingContentPartSchema,
  BulletedListContentPartSchema,
  NumberedListContentPartSchema,
  ChecklistContentPartSchema,
  FencedCodeBlockContentPartSchema,
  CalloutContentPartSchema,
  HorizontalRuleContentPartSchema,
]);

export type ParagraphContentPart = z.infer<typeof ParagraphContentPartSchema>;
export type HeadingContentPart = z.infer<typeof HeadingContentPartSchema>;
export type BulletedListContentPart = z.infer<typeof BulletedListContentPartSchema>;
export type NumberedListContentPart = z.infer<typeof NumberedListContentPartSchema>;
export type ChecklistContentPart = z.infer<typeof ChecklistContentPartSchema>;
export type FencedCodeBlockContentPart = z.infer<typeof FencedCodeBlockContentPartSchema>;
export type CalloutContentPart = z.infer<typeof CalloutContentPartSchema>;
export type HorizontalRuleContentPart = z.infer<typeof HorizontalRuleContentPartSchema>;
export type AssistantContentPart = z.infer<typeof AssistantContentPartSchema>;
