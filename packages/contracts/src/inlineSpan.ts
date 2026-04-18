import { z } from "zod";

// Shape is identical to InlineMarkdownSpan in
// packages/ink-tui/src/components/primitives/InlineMarkdownText.tsx.
// The move is type-location only; field names are preserved so no component
// needs a prop rename.

export const InlinePlainSpanSchema = z
  .object({ spanKind: z.literal("plain"), spanText: z.string() })
  .strict();

export const InlineBoldSpanSchema = z
  .object({ spanKind: z.literal("bold"), spanText: z.string() })
  .strict();

export const InlineItalicSpanSchema = z
  .object({ spanKind: z.literal("italic"), spanText: z.string() })
  .strict();

export const InlineStrikeSpanSchema = z
  .object({ spanKind: z.literal("strike"), spanText: z.string() })
  .strict();

export const InlineCodeSpanSchema = z
  .object({ spanKind: z.literal("code"), spanText: z.string() })
  .strict();

export const InlineLinkSpanSchema = z
  .object({
    spanKind: z.literal("link"),
    spanText: z.string(),
    hrefUrl: z.string().min(1),
  })
  .strict();

export const InlineHighlightSpanSchema = z
  .object({ spanKind: z.literal("highlight"), spanText: z.string() })
  .strict();

export const InlineSubscriptSpanSchema = z
  .object({ spanKind: z.literal("subscript"), spanText: z.string() })
  .strict();

export const InlineSuperscriptSpanSchema = z
  .object({ spanKind: z.literal("superscript"), spanText: z.string() })
  .strict();

export const InlineSpanSchema = z.discriminatedUnion("spanKind", [
  InlinePlainSpanSchema,
  InlineBoldSpanSchema,
  InlineItalicSpanSchema,
  InlineStrikeSpanSchema,
  InlineCodeSpanSchema,
  InlineLinkSpanSchema,
  InlineHighlightSpanSchema,
  InlineSubscriptSpanSchema,
  InlineSuperscriptSpanSchema,
]);

export type InlinePlainSpan = z.infer<typeof InlinePlainSpanSchema>;
export type InlineBoldSpan = z.infer<typeof InlineBoldSpanSchema>;
export type InlineItalicSpan = z.infer<typeof InlineItalicSpanSchema>;
export type InlineStrikeSpan = z.infer<typeof InlineStrikeSpanSchema>;
export type InlineCodeSpan = z.infer<typeof InlineCodeSpanSchema>;
export type InlineLinkSpan = z.infer<typeof InlineLinkSpanSchema>;
export type InlineHighlightSpan = z.infer<typeof InlineHighlightSpanSchema>;
export type InlineSubscriptSpan = z.infer<typeof InlineSubscriptSpanSchema>;
export type InlineSuperscriptSpan = z.infer<typeof InlineSuperscriptSpanSchema>;
export type InlineSpan = z.infer<typeof InlineSpanSchema>;
