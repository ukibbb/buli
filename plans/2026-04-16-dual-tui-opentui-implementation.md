# Dual TUI (Ink + OpenTUI) With Typed Assistant Parts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the markdown parser from ink-tui into `@buli/engine` and attach typed `AssistantContentPart[]` to completed assistant messages; extract the palette into `@buli/assistant-design-tokens`; build `@buli/opentui-tui` as a second renderer with the full existing component inventory; add `--ui ink|opentui` to the CLI.

**Architecture:** Parse-at-completion. The engine parses the accumulated assistant text once at provider `completed`, attaches `assistantContentParts` to the completed `TranscriptMessage`, and both TUIs read those parts directly without re-parsing. Each TUI owns its own reducer and component tree; the only shared code across TUIs is the `@buli/contracts` types, `@buli/assistant-design-tokens` palette, and `@buli/assistant-transcript-fixtures` test scenarios.

**Tech Stack:** TypeScript 5.9, Bun workspaces, Zod 3.x, React 19.2, Ink 7 (existing), `@opentui/react` (workspace path `tui/opentui/packages/react`), `ink-testing-library` (for ink tests), `@opentui/react/test-utils` (for opentui tests).

**Reference:** Design spec at `plans/2026-04-16-dual-tui-opentui-design.md`. Read that first — this plan implements it step by step.

---

## Pre-flight

### Task 1: Verify baseline

**Files:**
- Read only. No file changes.

- [ ] **Step 1: Confirm branch and working tree**

```bash
git branch --show-current
```
Expected: `feature/opentui-tui-and-typed-assistant-parts`

```bash
git status --short
```
Expected: no tracked-file modifications (uncommitted `README.md` change may or may not be present; it is not part of this plan).

- [ ] **Step 2: Confirm workspace-wide baseline green**

```bash
bun install
bun run typecheck
bun run test
```
Expected: all packages typecheck pass, all tests pass. If any failure, STOP and fix before proceeding — this plan's later steps assume a green baseline.

- [ ] **Step 3: Note the baseline commit**

```bash
git log --oneline -1
```
Record the SHA. If anything in this plan breaks the baseline unexpectedly, that is the rollback point.

No commit this task.

---

## Phase A — Contracts additions (additive, zero runtime impact)

At the end of Phase A, `@buli/contracts` exports `AssistantContentPart`, `InlineSpan`, and an extended `TranscriptMessage` with optional `assistantContentParts`. No existing code reads the new field yet. All existing tests still pass.

### Task 2: Add `InlineSpan` schema to contracts

**Files:**
- Create: `packages/contracts/src/inlineSpan.ts`
- Test: `packages/contracts/test/inlineSpan.test.ts`

- [ ] **Step 1: Write the failing test**

Field names here are deliberately identical to the existing `InlineMarkdownSpan` shape in `packages/ink-tui/src/components/primitives/InlineMarkdownText.tsx` lines 10–16. Do **not** invent new names — the whole point of Phase A is additive wrapping.

```ts
// packages/contracts/test/inlineSpan.test.ts
import { describe, expect, test } from "bun:test";
import { InlineSpanSchema } from "../src/inlineSpan.ts";

describe("InlineSpanSchema", () => {
  test("parses_inline_plain_span_with_literal_text", () => {
    const parsed = InlineSpanSchema.parse({ spanKind: "plain", spanText: "hello world" });
    expect(parsed).toEqual({ spanKind: "plain", spanText: "hello world" });
  });

  test("parses_inline_bold_span_with_literal_text", () => {
    const parsed = InlineSpanSchema.parse({ spanKind: "bold", spanText: "strong" });
    expect(parsed).toEqual({ spanKind: "bold", spanText: "strong" });
  });

  test("parses_inline_italic_span_with_literal_text", () => {
    const parsed = InlineSpanSchema.parse({ spanKind: "italic", spanText: "emph" });
    expect(parsed).toEqual({ spanKind: "italic", spanText: "emph" });
  });

  test("parses_inline_strike_span_with_literal_text", () => {
    const parsed = InlineSpanSchema.parse({ spanKind: "strike", spanText: "gone" });
    expect(parsed).toEqual({ spanKind: "strike", spanText: "gone" });
  });

  test("parses_inline_code_span_with_literal_text", () => {
    const parsed = InlineSpanSchema.parse({ spanKind: "code", spanText: "identifier" });
    expect(parsed).toEqual({ spanKind: "code", spanText: "identifier" });
  });

  test("parses_inline_link_span_with_href_url_and_span_text", () => {
    const parsed = InlineSpanSchema.parse({
      spanKind: "link",
      spanText: "click here",
      hrefUrl: "https://example.com",
    });
    expect(parsed).toEqual({
      spanKind: "link",
      spanText: "click here",
      hrefUrl: "https://example.com",
    });
  });

  test("rejects_unknown_inline_span_kind", () => {
    expect(() => InlineSpanSchema.parse({ spanKind: "rainbow", spanText: "x" })).toThrow();
  });

  test("rejects_link_span_without_href_url", () => {
    expect(() =>
      InlineSpanSchema.parse({ spanKind: "link", spanText: "click" }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun --filter @buli/contracts test inlineSpan.test.ts
```
Expected: FAIL. Cannot find module `../src/inlineSpan.ts`.

- [ ] **Step 3: Implement `inlineSpan.ts`**

```ts
// packages/contracts/src/inlineSpan.ts
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

export const InlineSpanSchema = z.discriminatedUnion("spanKind", [
  InlinePlainSpanSchema,
  InlineBoldSpanSchema,
  InlineItalicSpanSchema,
  InlineStrikeSpanSchema,
  InlineCodeSpanSchema,
  InlineLinkSpanSchema,
]);

export type InlinePlainSpan = z.infer<typeof InlinePlainSpanSchema>;
export type InlineBoldSpan = z.infer<typeof InlineBoldSpanSchema>;
export type InlineItalicSpan = z.infer<typeof InlineItalicSpanSchema>;
export type InlineStrikeSpan = z.infer<typeof InlineStrikeSpanSchema>;
export type InlineCodeSpan = z.infer<typeof InlineCodeSpanSchema>;
export type InlineLinkSpan = z.infer<typeof InlineLinkSpanSchema>;
export type InlineSpan = z.infer<typeof InlineSpanSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun --filter @buli/contracts test inlineSpan.test.ts
```
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/inlineSpan.ts packages/contracts/test/inlineSpan.test.ts
git commit -m "feat(contracts): add InlineSpan discriminated union for assistant prose"
```

---

### Task 3: Add `AssistantContentPart` schema to contracts

**Files:**
- Create: `packages/contracts/src/assistantContentPart.ts`
- Test: `packages/contracts/test/assistantContentPart.test.ts`

- [ ] **Step 1: Write the failing test**

Field shapes match the existing ink-tui types exactly:
- `AssistantMarkdownBlock` in `packages/ink-tui/src/richText/parseAssistantResponseMarkdown.ts` lines 13–21 (the block union).
- `ChecklistItem` in `packages/ink-tui/src/components/primitives/Checklist.tsx` lines 11–14 (`{ itemTitle, itemStatus }`).
- `CalloutSeverity` in `packages/ink-tui/src/components/primitives/Callout.tsx` line 10 (`"info" | "success" | "warning" | "error"` — full word `warning`).

```ts
// packages/contracts/test/assistantContentPart.test.ts
import { describe, expect, test } from "bun:test";
import { AssistantContentPartSchema } from "../src/assistantContentPart.ts";

describe("AssistantContentPartSchema", () => {
  test("parses_paragraph_part_with_inline_spans", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "paragraph",
      inlineSpans: [{ spanKind: "plain", spanText: "hello" }],
    });
    expect(parsed.kind).toBe("paragraph");
  });

  test("parses_heading_part_at_level_1", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "heading",
      headingLevel: 1,
      inlineSpans: [{ spanKind: "plain", spanText: "Title" }],
    });
    expect(parsed).toMatchObject({ kind: "heading", headingLevel: 1 });
  });

  test("parses_heading_part_at_level_2", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "heading",
      headingLevel: 2,
      inlineSpans: [{ spanKind: "plain", spanText: "Subtitle" }],
    });
    expect(parsed.kind === "heading" && parsed.headingLevel).toBe(2);
  });

  test("parses_heading_part_at_level_3", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "heading",
      headingLevel: 3,
      inlineSpans: [{ spanKind: "plain", spanText: "Section" }],
    });
    expect(parsed.kind === "heading" && parsed.headingLevel).toBe(3);
  });

  test("rejects_heading_part_at_level_4", () => {
    expect(() =>
      AssistantContentPartSchema.parse({
        kind: "heading",
        headingLevel: 4,
        inlineSpans: [],
      }),
    ).toThrow();
  });

  test("parses_bulleted_list_part_with_multiple_items", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "bulleted_list",
      itemSpanArrays: [
        [{ spanKind: "plain", spanText: "first item" }],
        [{ spanKind: "plain", spanText: "second item" }],
      ],
    });
    expect(parsed.kind === "bulleted_list" && parsed.itemSpanArrays.length).toBe(2);
  });

  test("parses_numbered_list_part_with_items", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "numbered_list",
      itemSpanArrays: [[{ spanKind: "plain", spanText: "step one" }]],
    });
    expect(parsed.kind).toBe("numbered_list");
  });

  test("parses_checklist_part_with_mixed_item_statuses", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "checklist",
      items: [
        { itemTitle: "todo", itemStatus: "pending" },
        { itemTitle: "in progress", itemStatus: "in_progress" },
        { itemTitle: "done", itemStatus: "completed" },
      ],
    });
    expect(parsed.kind === "checklist" && parsed.items.length).toBe(3);
  });

  test("rejects_checklist_item_with_unknown_status", () => {
    expect(() =>
      AssistantContentPartSchema.parse({
        kind: "checklist",
        items: [{ itemTitle: "x", itemStatus: "frozen" }],
      }),
    ).toThrow();
  });

  test("parses_fenced_code_block_with_language_label", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "fenced_code_block",
      languageLabel: "typescript",
      codeLines: ["const x = 1;", "console.log(x);"],
    });
    expect(parsed.kind === "fenced_code_block" && parsed.languageLabel).toBe("typescript");
  });

  test("parses_fenced_code_block_without_language_label", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "fenced_code_block",
      codeLines: ["raw text"],
    });
    expect(parsed.kind).toBe("fenced_code_block");
  });

  test("parses_callout_part_with_info_severity", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "callout",
      severity: "info",
      inlineSpans: [{ spanKind: "plain", spanText: "note" }],
    });
    expect(parsed.kind === "callout" && parsed.severity).toBe("info");
  });

  test("parses_callout_part_with_all_severity_values_including_warning", () => {
    for (const severity of ["info", "success", "warning", "error"] as const) {
      const parsed = AssistantContentPartSchema.parse({
        kind: "callout",
        severity,
        inlineSpans: [{ spanKind: "plain", spanText: "x" }],
      });
      expect(parsed.kind === "callout" && parsed.severity).toBe(severity);
    }
  });

  test("rejects_callout_severity_warn_without_trailing_ing", () => {
    expect(() =>
      AssistantContentPartSchema.parse({
        kind: "callout",
        severity: "warn",
        inlineSpans: [{ spanKind: "plain", spanText: "x" }],
      }),
    ).toThrow();
  });

  test("parses_callout_part_with_optional_title_text", () => {
    const parsed = AssistantContentPartSchema.parse({
      kind: "callout",
      severity: "warning",
      titleText: "Heads up",
      inlineSpans: [{ spanKind: "plain", spanText: "watch out" }],
    });
    expect(parsed.kind === "callout" && parsed.titleText).toBe("Heads up");
  });

  test("parses_horizontal_rule_part_with_no_fields", () => {
    const parsed = AssistantContentPartSchema.parse({ kind: "horizontal_rule" });
    expect(parsed.kind).toBe("horizontal_rule");
  });

  test("rejects_unknown_content_part_kind", () => {
    expect(() => AssistantContentPartSchema.parse({ kind: "widget" })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun --filter @buli/contracts test assistantContentPart.test.ts
```
Expected: FAIL. Cannot find module `../src/assistantContentPart.ts`.

- [ ] **Step 3: Implement `assistantContentPart.ts`**

`ChecklistItemSchema` uses `itemTitle` + `itemStatus` to match the existing ink-tui primitive prop surface. `CalloutSeveritySchema` uses the full word `"warning"`. Both of these align 1:1 with what ink-tui already expects.

```ts
// packages/contracts/src/assistantContentPart.ts
import { z } from "zod";
import { InlineSpanSchema } from "./inlineSpan.ts";
import { ToolCallTodoItemStatusSchema } from "./toolCallDetail.ts";

// Callout severity matches the existing ink-tui CalloutSeverity type.
// "warning" is the full word — not "warn" — because the existing parser
// maps GitHub admonition tags WARNING/WARN/CAUTION to this enum value.
export const CalloutSeveritySchema = z.enum(["info", "success", "warning", "error"]);
export type CalloutSeverity = z.infer<typeof CalloutSeveritySchema>;

// Checklist item shape matches packages/ink-tui/src/components/primitives/Checklist.tsx
// so the ink-tui Checklist component's props surface is unchanged after the
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
    headingLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun --filter @buli/contracts test assistantContentPart.test.ts
```
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/assistantContentPart.ts packages/contracts/test/assistantContentPart.test.ts
git commit -m "feat(contracts): add AssistantContentPart discriminated union"
```

---

### Task 4: Extend `TranscriptMessageSchema` with optional `assistantContentParts`

**Files:**
- Modify: `packages/contracts/src/messages.ts`
- Test: `packages/contracts/test/messages.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/contracts/test/messages.test.ts
import { describe, expect, test } from "bun:test";
import { TranscriptMessageSchema } from "../src/messages.ts";

describe("TranscriptMessageSchema", () => {
  test("parses_user_message_without_assistant_content_parts", () => {
    const parsed = TranscriptMessageSchema.parse({
      id: "m-1",
      role: "user",
      text: "hello",
    });
    expect(parsed.assistantContentParts).toBeUndefined();
  });

  test("parses_assistant_message_with_assistant_content_parts", () => {
    const parsed = TranscriptMessageSchema.parse({
      id: "m-2",
      role: "assistant",
      text: "Hello world",
      assistantContentParts: [
        { kind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "Hello world" }] },
      ],
    });
    expect(parsed.assistantContentParts?.length).toBe(1);
  });

  test("parses_assistant_message_without_assistant_content_parts_for_legacy_compat", () => {
    const parsed = TranscriptMessageSchema.parse({
      id: "m-3",
      role: "assistant",
      text: "plain",
    });
    expect(parsed.assistantContentParts).toBeUndefined();
  });

  test("rejects_message_with_unknown_field", () => {
    expect(() =>
      TranscriptMessageSchema.parse({
        id: "m-4",
        role: "user",
        text: "x",
        extraField: true,
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun --filter @buli/contracts test messages.test.ts
```
Expected: FAIL. The current schema has no `assistantContentParts` field, so the second test's object would currently be rejected by `.strict()`.

- [ ] **Step 3: Modify `messages.ts`**

```ts
// packages/contracts/src/messages.ts
import { z } from "zod";
import { AssistantContentPartSchema } from "./assistantContentPart.ts";

export const MessageRoleSchema = z.enum(["user", "assistant"]);

export const TranscriptMessageSchema = z
  .object({
    id: z.string().min(1),
    role: MessageRoleSchema,
    text: z.string(),
    assistantContentParts: z.array(AssistantContentPartSchema).optional(),
  })
  .strict();

export type MessageRole = z.infer<typeof MessageRoleSchema>;
export type TranscriptMessage = z.infer<typeof TranscriptMessageSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun --filter @buli/contracts test messages.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Verify the existing contracts tests still pass**

```bash
bun --filter @buli/contracts test
```
Expected: all tests pass (existing `contracts.test.ts` is unaffected because the new field is optional).

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/messages.ts packages/contracts/test/messages.test.ts
git commit -m "feat(contracts): extend TranscriptMessage with optional assistantContentParts"
```

---

### Task 5: Export new schemas from contracts `index.ts`

**Files:**
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Add exports to the end of `packages/contracts/src/index.ts`**

Add these export blocks after the existing `ToolCallDetail` exports:

```ts
export {
  AssistantContentPartSchema,
  BulletedListContentPartSchema,
  CalloutContentPartSchema,
  CalloutSeveritySchema,
  ChecklistContentPartSchema,
  ChecklistItemSchema,
  FencedCodeBlockContentPartSchema,
  HeadingContentPartSchema,
  HorizontalRuleContentPartSchema,
  NumberedListContentPartSchema,
  ParagraphContentPartSchema,
} from "./assistantContentPart.ts";
export type {
  AssistantContentPart,
  BulletedListContentPart,
  CalloutContentPart,
  CalloutSeverity,
  ChecklistContentPart,
  ChecklistItem,
  FencedCodeBlockContentPart,
  HeadingContentPart,
  HorizontalRuleContentPart,
  NumberedListContentPart,
  ParagraphContentPart,
} from "./assistantContentPart.ts";
export {
  InlineBoldSpanSchema,
  InlineCodeSpanSchema,
  InlineItalicSpanSchema,
  InlineLinkSpanSchema,
  InlineSpanSchema,
  InlineStrikeSpanSchema,
  InlineTextSpanSchema,
} from "./inlineSpan.ts";
export type {
  InlineBoldSpan,
  InlineCodeSpan,
  InlineItalicSpan,
  InlineLinkSpan,
  InlineSpan,
  InlineStrikeSpan,
  InlineTextSpan,
} from "./inlineSpan.ts";
```

- [ ] **Step 2: Run typecheck**

```bash
bun --filter @buli/contracts typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): export AssistantContentPart and InlineSpan from package root"
```

---

## Phase B — Extract design tokens

At the end of Phase B, `@buli/assistant-design-tokens` exists and exports the palette. `@buli/ink-tui` imports from it; the local `chatScreenTheme.ts` is deleted. Baseline tests remain green.

### Task 6: Create `@buli/assistant-design-tokens` package

**Files:**
- Create: `packages/assistant-design-tokens/package.json`
- Create: `packages/assistant-design-tokens/tsconfig.json`
- Create: `packages/assistant-design-tokens/src/index.ts`
- Create: `packages/assistant-design-tokens/src/chatScreenTheme.ts`
- Create: `packages/assistant-design-tokens/test/chatScreenTheme.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@buli/assistant-design-tokens",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24"
  },
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

Write `packages/assistant-design-tokens/tsconfig.json` with exactly this content — identical to `packages/contracts/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Write the failing test**

```ts
// packages/assistant-design-tokens/test/chatScreenTheme.test.ts
import { describe, expect, test } from "bun:test";
import { chatScreenTheme } from "../src/index.ts";

describe("chatScreenTheme", () => {
  test("exports_every_token_required_by_existing_ink_tui_palette", () => {
    const requiredTokenKeys = [
      "bg",
      "surfaceOne",
      "surfaceTwo",
      "surfaceThree",
      "border",
      "borderSubtle",
      "textPrimary",
      "textSecondary",
      "textMuted",
      "textDim",
      "accentGreen",
      "accentAmber",
      "accentCyan",
      "accentRed",
      "accentPrimary",
      "accentPrimaryMuted",
      "accentPurple",
      "diffAdditionBg",
      "diffRemovalBg",
      "calloutInfoBg",
      "calloutSuccessBg",
      "calloutWarningBg",
      "calloutErrorBg",
    ] as const;
    for (const tokenKey of requiredTokenKeys) {
      expect(chatScreenTheme[tokenKey]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
bun --filter @buli/assistant-design-tokens test
```
Expected: FAIL. Cannot find module `../src/index.ts`.

- [ ] **Step 5: Implement `src/chatScreenTheme.ts`**

Copy the content verbatim from `packages/ink-tui/src/chatScreenTheme.ts`:

```ts
// packages/assistant-design-tokens/src/chatScreenTheme.ts
// Palette sourced 1:1 from novibe.space/designs/my-design.pen.
// See ink-limitations.md for the full mapping table and the rationale behind
// tokens whose pen-file equivalents do not translate to a terminal cell grid
// (sub-row stripes, font-size hierarchy, corner radius on fills).
//
// diffAdditionBg / diffRemovalBg substitute for the design's low-alpha
// red/green row tints (`#EF444418`, `#10B98118`). Chalk truecolor does not
// accept an alpha channel, so we use solid near-bg shades that preserve the
// semantic (line added / line removed) without washing out the foreground text.
export const chatScreenTheme = {
  bg: "#0A0A0F",
  surfaceOne: "#111118",
  surfaceTwo: "#16161F",
  surfaceThree: "#1C1C28",
  border: "#2A2A3A",
  borderSubtle: "#1E1E2E",
  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  textDim: "#475569",
  accentGreen: "#10B981",
  accentAmber: "#F59E0B",
  accentCyan: "#22D3EE",
  accentRed: "#EF4444",
  accentPrimary: "#6366F1",
  accentPrimaryMuted: "#818CF8",
  accentPurple: "#A855F7",
  diffAdditionBg: "#0C1C15",
  diffRemovalBg: "#1C0D0F",
  calloutInfoBg: "#0C1520",
  calloutSuccessBg: "#0C1C15",
  calloutWarningBg: "#1D1505",
  calloutErrorBg: "#1C0D0F",
} as const;

export type ChatScreenTheme = typeof chatScreenTheme;
```

- [ ] **Step 6: Implement `src/index.ts`**

```ts
// packages/assistant-design-tokens/src/index.ts
export { chatScreenTheme } from "./chatScreenTheme.ts";
export type { ChatScreenTheme } from "./chatScreenTheme.ts";
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
bun install
bun --filter @buli/assistant-design-tokens test
```
Expected: PASS, 1 test.

- [ ] **Step 8: Run typecheck**

```bash
bun --filter @buli/assistant-design-tokens typecheck
```
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/assistant-design-tokens/
git commit -m "feat(design-tokens): add @buli/assistant-design-tokens with palette extracted from ink-tui"
```

---

### Task 7: Switch ink-tui over to `@buli/assistant-design-tokens` and delete local theme file

**Files:**
- Modify: `packages/ink-tui/package.json` (add dependency)
- Modify: every file that imports from `../chatScreenTheme.ts` or similar relative paths — switch to `@buli/assistant-design-tokens`
- Delete: `packages/ink-tui/src/chatScreenTheme.ts`

- [ ] **Step 1: Inventory — 38 files import `chatScreenTheme`, plus the source file**

Confirm by running:
```bash
grep -rln "chatScreenTheme" packages/ink-tui/src
```

Expected output (39 files total — 38 importers + the source file itself; order may vary):

```
packages/ink-tui/src/ChatScreen.tsx
packages/ink-tui/src/chatScreenTheme.ts
packages/ink-tui/src/components/ContextWindowMeter.tsx
packages/ink-tui/src/components/InputPanel.tsx
packages/ink-tui/src/components/ModelAndReasoningSelectionPane.tsx
packages/ink-tui/src/components/ReasoningCollapsedChip.tsx
packages/ink-tui/src/components/ReasoningStreamBlock.tsx
packages/ink-tui/src/components/ShortcutsModal.tsx
packages/ink-tui/src/components/SnakeAnimationIndicator.tsx
packages/ink-tui/src/components/TopBar.tsx
packages/ink-tui/src/components/TurnFooter.tsx
packages/ink-tui/src/components/UserPromptBlock.tsx
packages/ink-tui/src/components/behavior/ErrorBannerBlock.tsx
packages/ink-tui/src/components/behavior/IncompleteResponseNoticeBlock.tsx
packages/ink-tui/src/components/behavior/PlanProposalBlock.tsx
packages/ink-tui/src/components/behavior/RateLimitNoticeBlock.tsx
packages/ink-tui/src/components/behavior/ToolApprovalRequestBlock.tsx
packages/ink-tui/src/components/primitives/BulletedList.tsx
packages/ink-tui/src/components/primitives/Callout.tsx
packages/ink-tui/src/components/primitives/Checklist.tsx
packages/ink-tui/src/components/primitives/DataTable.tsx
packages/ink-tui/src/components/primitives/DiffBlock.tsx
packages/ink-tui/src/components/primitives/FencedCodeBlock.tsx
packages/ink-tui/src/components/primitives/FileReference.tsx
packages/ink-tui/src/components/primitives/InlineMarkdownText.tsx
packages/ink-tui/src/components/primitives/KeyValueList.tsx
packages/ink-tui/src/components/primitives/NestedList.tsx
packages/ink-tui/src/components/primitives/NumberedList.tsx
packages/ink-tui/src/components/primitives/ShellBlock.tsx
packages/ink-tui/src/components/primitives/StreamingCursor.tsx
packages/ink-tui/src/components/primitives/SurfaceCard.tsx
packages/ink-tui/src/components/toolCalls/BashToolCallCard.tsx
packages/ink-tui/src/components/toolCalls/EditToolCallCard.tsx
packages/ink-tui/src/components/toolCalls/GrepToolCallCard.tsx
packages/ink-tui/src/components/toolCalls/ReadToolCallCard.tsx
packages/ink-tui/src/components/toolCalls/TaskToolCallCard.tsx
packages/ink-tui/src/components/toolCalls/ToolCallCardHeaderSlots.tsx
packages/ink-tui/src/components/toolCalls/TodoWriteToolCallCard.tsx
packages/ink-tui/src/richText/renderAssistantResponseTree.tsx
```

If the actual output diverges (e.g. a new file added since this plan was written, or a file removed), treat the live grep output as authoritative and apply Step 3 to that list.

- [ ] **Step 2: Add workspace dependency to ink-tui**

Edit `packages/ink-tui/package.json`. Add `"@buli/assistant-design-tokens": "workspace:*"` to the `dependencies` block, keeping existing entries. After editing, re-run `bun install`:

```bash
bun install
```

- [ ] **Step 3: Update every import listed in Step 1**

For each file from Step 1, replace imports like:
```ts
import { chatScreenTheme } from "../chatScreenTheme.ts";
// or
import { chatScreenTheme } from "./chatScreenTheme.ts";
```

With:
```ts
import { chatScreenTheme } from "@buli/assistant-design-tokens";
```

Keep relative depth consistent per file. Do this for every file the grep returned, including `chatScreenTheme.ts` itself's consumers.

- [ ] **Step 4: Delete the now-unused local theme file**

```bash
rm packages/ink-tui/src/chatScreenTheme.ts
```

- [ ] **Step 5: Run typecheck and tests on ink-tui**

```bash
bun --filter @buli/ink-tui typecheck
bun --filter @buli/ink-tui test
```
Expected: both PASS. If typecheck fails with "Cannot find module 'chatScreenTheme.ts'", Step 3 missed an importer — find it and fix.

- [ ] **Step 6: Commit**

```bash
git add packages/ink-tui/
git commit -m "refactor(ink-tui): import chatScreenTheme from @buli/assistant-design-tokens"
```

---

## Phase C — Engine-side parser relocation

At the end of Phase C, the markdown parser lives in `@buli/engine`, the runtime attaches `assistantContentParts` to the completed message, and its test coverage is relocated. ink-tui still uses its local parse call during this phase — the seam flip happens in Phase D.

### Task 8: Relocate the parser to `@buli/engine`

**Files:**
- Create: `packages/engine/src/assistantContentPartParser.ts`
- Create: `packages/engine/test/assistantContentPartParser.test.ts` (relocated from ink-tui)

- [ ] **Step 1: Read the current parser carefully**

```bash
wc -l packages/ink-tui/src/richText/parseAssistantResponseMarkdown.ts
cat packages/ink-tui/src/richText/parseAssistantResponseMarkdown.ts
```
Note the full text. The parser file will be copied over with two renames:

| Old | New |
| --- | --- |
| `parseAssistantResponseMarkdown` | `parseAssistantResponseIntoContentParts` |
| Return type `AssistantMarkdownBlock[]` | Return type `readonly AssistantContentPart[]` |
| Imports from `../components/primitives/...` for `InlineMarkdownSpan`, `CalloutSeverity`, `ChecklistItem` | Imports from `@buli/contracts` for `InlineSpan`, `CalloutSeverity`, `ChecklistItem` |
| Block kind `blockKind: "paragraph"` | `kind: "paragraph"` |
| Block kind `blockKind: "heading"` | `kind: "heading"` |
| Block kind `blockKind: "bulleted_list"` | `kind: "bulleted_list"` |
| Block kind `blockKind: "numbered_list"` | `kind: "numbered_list"` |
| Block kind `blockKind: "checklist"` | `kind: "checklist"` |
| Block kind `blockKind: "fenced_code"` | `kind: "fenced_code_block"` |
| Block kind `blockKind: "callout"` | `kind: "callout"` |
| Block kind `blockKind: "horizontal_rule"` | `kind: "horizontal_rule"` |

Every other field inside each block is preserved. `InlineSpan` values (`spanKind: "plain" | "bold" | "italic" | "strike" | "code" | "link"` with `spanText` and link `hrefUrl`) are already identical to the contract's `InlineSpan`. `ChecklistItem` is `{ itemTitle, itemStatus }` on both sides. `CalloutSeverity` is `"info" | "success" | "warning" | "error"` on both sides. So the parser implementation body does not need any field renames — only the block-union tag rename (`blockKind` → `kind`) and the `fenced_code` → `fenced_code_block` kind rename.

- [ ] **Step 2: Relocate the test file first**

```bash
cp packages/ink-tui/test/parseAssistantResponseMarkdown.test.ts packages/engine/test/assistantContentPartParser.test.ts
```

Open the copied file. Replace:
- `parseAssistantResponseMarkdown` → `parseAssistantResponseIntoContentParts`
- Any `blockKind:` values → `kind:` with the name table above
- Any import from `../src/richText/parseAssistantResponseMarkdown.ts` → `../src/assistantContentPartParser.ts`
- Any import of `InlineMarkdownSpan` or `AssistantMarkdownBlock` → corresponding contracts types
- Any assertion on `blockKind` → `kind`

Do NOT change the test bodies' expected token sequences or structural expectations. The parser output shape's only difference is field renames; logic is identical.

- [ ] **Step 3: Run the test to verify it fails**

```bash
bun --filter @buli/engine test assistantContentPartParser.test.ts
```
Expected: FAIL. Cannot find module `../src/assistantContentPartParser.ts`.

- [ ] **Step 4: Implement the parser**

```bash
cp packages/ink-tui/src/richText/parseAssistantResponseMarkdown.ts packages/engine/src/assistantContentPartParser.ts
```

Open `packages/engine/src/assistantContentPartParser.ts`. Apply:

1. Rename the top-level function `parseAssistantResponseMarkdown` → `parseAssistantResponseIntoContentParts`.
2. Change the return-type annotation to `readonly AssistantContentPart[]`.
3. Replace imports:
   - Remove imports from `../components/primitives/...`.
   - Add: `import type { AssistantContentPart, CalloutSeverity, ChecklistItem, InlineSpan } from "@buli/contracts";`
4. Rename every `blockKind` literal-assignment to `kind` per the table above.
5. Rename `fenced_code` → `fenced_code_block` in every place (both in the output object `kind` value and any helper function names such as `tryParseFencedCodeBlock` if it was named after the old kind — in this repo it already uses the clearer name, so no rename needed).
6. Remove the local `AssistantMarkdownBlock` type alias declaration at the top of the file. `parseAssistantResponseIntoContentParts` now returns `readonly AssistantContentPart[]` imported from contracts.
7. Replace internal `InlineMarkdownSpan` type usage with `InlineSpan`. Replace `ChecklistItem` / `CalloutSeverity` import paths (from `../components/primitives/...`) with contracts imports. Both types already have the same shape; only the import path changes.
8. `parseInlineMarkdownSpans` stays exported for the relocated test file to import; the return type becomes `InlineSpan[]`.

- [ ] **Step 5: Run the test to verify it passes**

```bash
bun --filter @buli/engine test assistantContentPartParser.test.ts
```
Expected: PASS, same number of tests as the original ink-tui file had.

- [ ] **Step 6: Run engine typecheck**

```bash
bun --filter @buli/engine typecheck
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/assistantContentPartParser.ts packages/engine/test/assistantContentPartParser.test.ts
git commit -m "feat(engine): relocate assistant markdown parser into engine as parseAssistantResponseIntoContentParts"
```

---

### Task 9: Attach `assistantContentParts` to the completed assistant response event

**Files:**
- Modify: `packages/engine/src/turn.ts`
- Modify: `packages/engine/src/runtime.ts`
- Modify: `packages/engine/test/turn.test.ts`
- Modify: `packages/engine/test/runtime.test.ts`

- [ ] **Step 1: Write failing tests in `turn.test.ts`**

Add this test case to `packages/engine/test/turn.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { AssistantContentPart } from "@buli/contracts";
import { createCompletedAssistantResponseEvent } from "../src/turn.ts";

describe("createCompletedAssistantResponseEvent", () => {
  test("attaches_assistant_content_parts_to_completed_message", () => {
    const parts: readonly AssistantContentPart[] = [
      { kind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "Hello world" }] },
    ];
    const event = createCompletedAssistantResponseEvent({
      assistantText: "Hello world",
      assistantContentParts: parts,
      usage: { input: 10, output: 5, reasoning: 0 },
    });
    expect(event.type).toBe("assistant_response_completed");
    expect(event.message.assistantContentParts).toEqual(parts);
  });
});
```

(Keep the existing `turn.test.ts` tests intact; add this one beneath them.)

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun --filter @buli/engine test turn.test.ts
```
Expected: FAIL. `createCompletedAssistantResponseEvent` does not accept `assistantContentParts` today.

- [ ] **Step 3: Modify `turn.ts`**

Open `packages/engine/src/turn.ts`. Read the existing `createAssistantTranscriptMessage` and `createCompletedAssistantResponseEvent` functions. Update them to thread `assistantContentParts`:

```ts
import { randomUUID } from "node:crypto";
import {
  AssistantResponseCompletedEventSchema,
  TranscriptMessageSchema,
  type AssistantContentPart,
  type AssistantResponseCompletedEvent,
  type TokenUsage,
  type TranscriptMessage,
} from "@buli/contracts";

export function createAssistantTranscriptMessage(input: {
  assistantText: string;
  assistantContentParts: readonly AssistantContentPart[];
  messageId?: string;
}): TranscriptMessage {
  return TranscriptMessageSchema.parse({
    id: input.messageId ?? randomUUID(),
    role: "assistant",
    text: input.assistantText,
    assistantContentParts: input.assistantContentParts,
  });
}

export function createCompletedAssistantResponseEvent(input: {
  assistantText: string;
  assistantContentParts: readonly AssistantContentPart[];
  usage: TokenUsage;
  messageId?: string;
}): AssistantResponseCompletedEvent {
  const message = createAssistantTranscriptMessage({
    assistantText: input.assistantText,
    assistantContentParts: input.assistantContentParts,
    ...(input.messageId ? { messageId: input.messageId } : {}),
  });
  return AssistantResponseCompletedEventSchema.parse({
    type: "assistant_response_completed",
    message,
    usage: input.usage,
  });
}
```

(If the existing signature differs — e.g. uses positional args — match the existing style but add the new `assistantContentParts` input. The key behavioral change is threading the field into the Zod-validated message.)

- [ ] **Step 4: Write failing test in `runtime.test.ts`**

Add to `packages/engine/test/runtime.test.ts`:

```ts
test("attaches_assistant_content_parts_to_completed_response_event", async () => {
  const stubbedProviderEvents = [
    { type: "text_chunk", text: "Hello " },
    { type: "text_chunk", text: "world" },
    { type: "completed", usage: { input: 1, output: 2, reasoning: 0 } },
  ];
  const stubbedProvider = {
    async *streamAssistantResponse() {
      for (const providerEvent of stubbedProviderEvents) {
        yield providerEvent;
      }
    },
  } as const;
  const runtime = new AssistantResponseRuntime(stubbedProvider as never);
  const emittedEvents = [];
  for await (const responseEvent of runtime.streamAssistantResponse({
    selectedModelId: "gpt-5.4",
    conversationTranscript: [],
  } as never)) {
    emittedEvents.push(responseEvent);
  }
  const completedEvent = emittedEvents.find((event) => event.type === "assistant_response_completed");
  expect(completedEvent).toBeDefined();
  expect(completedEvent?.message.assistantContentParts).toEqual([
    { kind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "Hello world" }] },
  ]);
});
```

Place this test alongside existing runtime tests. Import `AssistantResponseRuntime` at the top of the file if not already imported.

- [ ] **Step 5: Run the test to verify it fails**

```bash
bun --filter @buli/engine test runtime.test.ts
```
Expected: FAIL. The runtime does not yet call the parser.

- [ ] **Step 6: Modify `runtime.ts`**

Open `packages/engine/src/runtime.ts`. Add the parser import at the top:

```ts
import { parseAssistantResponseIntoContentParts } from "./assistantContentPartParser.ts";
```

Locate the `"completed"` arm:

```ts
// Remaining arm: providerStreamEvent.type === "completed".
yield createCompletedAssistantResponseEvent({
  assistantText: streamedAssistantText,
  usage: providerStreamEvent.usage,
});
return;
```

Replace with:

```ts
// Remaining arm: providerStreamEvent.type === "completed".
yield createCompletedAssistantResponseEvent({
  assistantText: streamedAssistantText,
  assistantContentParts: parseAssistantResponseIntoContentParts(streamedAssistantText),
  usage: providerStreamEvent.usage,
});
return;
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
bun --filter @buli/engine test
bun --filter @buli/engine typecheck
```
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/turn.ts packages/engine/src/runtime.ts packages/engine/test/turn.test.ts packages/engine/test/runtime.test.ts
git commit -m "feat(engine): attach parsed AssistantContentPart[] to completed response event"
```

---

## Phase D — ink-tui seam flip

At the end of Phase D, ink-tui's renderer reads typed parts directly from the completed message and no longer imports its local parser. The old parser file and its test are removed. `@buli/ink-tui` is consequently smaller and fully aligned with the typed-parts contract.

### Task 10: Make `renderAssistantResponseTree` read `message.assistantContentParts`

**Files:**
- Modify: `packages/ink-tui/src/richText/renderAssistantResponseTree.tsx`
- Modify: `packages/ink-tui/src/components/primitives/InlineMarkdownText.tsx` (rename export alias)
- Modify: `packages/ink-tui/src/components/primitives/Callout.tsx` (import severity type from contracts)
- Modify: `packages/ink-tui/src/components/primitives/Checklist.tsx` (import item type from contracts)
- Modify: every callsite of `RenderAssistantResponseTree` (currently only one in `ConversationTranscriptEntryView.tsx` or equivalent) — pass `message.assistantContentParts ?? []` instead of parsed blocks
- Test: `packages/ink-tui/test/renderAssistantResponseTree.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/ink-tui/test/renderAssistantResponseTree.test.tsx
import { describe, expect, test } from "bun:test";
import type { AssistantContentPart } from "@buli/contracts";
import { render } from "ink-testing-library";
import { RenderAssistantResponseTree } from "../src/richText/renderAssistantResponseTree.tsx";

describe("RenderAssistantResponseTree", () => {
  test("renders_paragraph_content_part_with_inline_text", () => {
    const parts: readonly AssistantContentPart[] = [
      { kind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "hello" }] },
    ];
    const { lastFrame } = render(<RenderAssistantResponseTree assistantContentParts={parts} />);
    expect(lastFrame()).toContain("hello");
  });

  test("renders_heading_level_1_with_prefix_and_bold_text", () => {
    const parts: readonly AssistantContentPart[] = [
      { kind: "heading", headingLevel: 1, inlineSpans: [{ spanKind: "plain", spanText: "Title" }] },
    ];
    const { lastFrame } = render(<RenderAssistantResponseTree assistantContentParts={parts} />);
    expect(lastFrame()).toContain("# Title");
  });

  test("renders_fenced_code_block_with_each_code_line", () => {
    const parts: readonly AssistantContentPart[] = [
      { kind: "fenced_code_block", languageLabel: "ts", codeLines: ["const x = 1;", "console.log(x);"] },
    ];
    const { lastFrame } = render(<RenderAssistantResponseTree assistantContentParts={parts} />);
    expect(lastFrame()).toContain("const x = 1;");
    expect(lastFrame()).toContain("console.log(x);");
  });

  test("renders_empty_content_parts_as_empty_output", () => {
    const { lastFrame } = render(<RenderAssistantResponseTree assistantContentParts={[]} />);
    expect(lastFrame()).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun --filter @buli/ink-tui test renderAssistantResponseTree.test.tsx
```
Expected: FAIL. The component's prop name is currently `assistantMarkdownBlocks`, not `assistantContentParts`, and the block-kind field is `blockKind`, not `kind`.

- [ ] **Step 3: Modify `renderAssistantResponseTree.tsx`**

Rewrite the file so it reads `AssistantContentPart[]` from `@buli/contracts`. Keep every rendering behavior (heading prefix, list bullets, fenced code, callout dispatch, horizontal rule). Signature changes:

```tsx
// packages/ink-tui/src/richText/renderAssistantResponseTree.tsx
import { Box, Text } from "ink";
import type { ReactNode } from "react";
import type { AssistantContentPart, InlineSpan } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { BulletedList } from "../components/primitives/BulletedList.tsx";
import { Callout } from "../components/primitives/Callout.tsx";
import { Checklist } from "../components/primitives/Checklist.tsx";
import { FencedCodeBlock } from "../components/primitives/FencedCodeBlock.tsx";
import { InlineMarkdownText } from "../components/primitives/InlineMarkdownText.tsx";
import { NumberedList } from "../components/primitives/NumberedList.tsx";

export type RenderAssistantResponseTreeProps = {
  assistantContentParts: readonly AssistantContentPart[];
};

export function RenderAssistantResponseTree(props: RenderAssistantResponseTreeProps): ReactNode {
  return (
    <Box flexDirection="column" width="100%">
      {props.assistantContentParts.map((assistantContentPart, index) => (
        <Box
          flexDirection="column"
          key={`assistant-part-${index}`}
          marginTop={index === 0 ? 0 : 1}
          width="100%"
        >
          <AssistantContentPartView assistantContentPart={assistantContentPart} />
        </Box>
      ))}
    </Box>
  );
}

function AssistantContentPartView(props: { assistantContentPart: AssistantContentPart }): ReactNode {
  const { assistantContentPart } = props;
  if (assistantContentPart.kind === "paragraph") {
    return <InlineMarkdownText spans={assistantContentPart.inlineSpans} />;
  }
  if (assistantContentPart.kind === "heading") {
    return (
      <HeadingView
        headingLevel={assistantContentPart.headingLevel}
        inlineSpans={assistantContentPart.inlineSpans}
      />
    );
  }
  if (assistantContentPart.kind === "bulleted_list") {
    return (
      <BulletedList
        itemContents={assistantContentPart.itemSpanArrays.map((itemSpans) => (
          <InlineMarkdownText spans={itemSpans} />
        ))}
      />
    );
  }
  if (assistantContentPart.kind === "numbered_list") {
    return (
      <NumberedList
        itemContents={assistantContentPart.itemSpanArrays.map((itemSpans) => (
          <InlineMarkdownText spans={itemSpans} />
        ))}
      />
    );
  }
  if (assistantContentPart.kind === "checklist") {
    return <Checklist items={assistantContentPart.items} />;
  }
  if (assistantContentPart.kind === "fenced_code_block") {
    return (
      <FencedCodeBlock
        {...(assistantContentPart.languageLabel
          ? { languageLabel: assistantContentPart.languageLabel }
          : {})}
        codeLines={assistantContentPart.codeLines.map((codeLineText) => ({ lineText: codeLineText }))}
      />
    );
  }
  if (assistantContentPart.kind === "callout") {
    return (
      <Callout
        severity={assistantContentPart.severity}
        {...(assistantContentPart.titleText ? { titleText: assistantContentPart.titleText } : {})}
        bodyContent={<InlineMarkdownText spans={assistantContentPart.inlineSpans} />}
      />
    );
  }
  // Remaining arm: horizontal_rule.
  return (
    <Box width="100%">
      <Text color={chatScreenTheme.textDim}>{"─".repeat(40)}</Text>
    </Box>
  );
}

function HeadingView(props: { headingLevel: 1 | 2 | 3; inlineSpans: InlineSpan[] }): ReactNode {
  const headingColor =
    props.headingLevel === 1
      ? chatScreenTheme.textPrimary
      : props.headingLevel === 2
        ? chatScreenTheme.textPrimary
        : chatScreenTheme.textSecondary;
  const headingPrefix =
    props.headingLevel === 1 ? "# " : props.headingLevel === 2 ? "## " : "### ";
  return (
    <Box width="100%">
      <Text bold color={headingColor}>
        {headingPrefix}
      </Text>
      <InlineMarkdownText spans={props.inlineSpans} />
    </Box>
  );
}
```

- [ ] **Step 4: Switch `InlineMarkdownText` to accept `InlineSpan` from contracts**

Open `packages/ink-tui/src/components/primitives/InlineMarkdownText.tsx`. Replace the local `InlineMarkdownSpan` type with an alias / import from `@buli/contracts`:

Find this declaration (or equivalent):
```ts
export type InlineMarkdownSpan = /* local definition */;
```

Replace with:
```ts
import type { InlineSpan } from "@buli/contracts";

export type InlineMarkdownSpan = InlineSpan; // kept as alias so no other callsite breaks
```

If the component prop `spans` was typed as the local shape, it now accepts `InlineSpan[]` without change. If the component unpacks `span.spanText`, `span.spanKind`, `span.linkText`, `span.linkTarget`, etc., those field names already match the contracts schema because we chose them to match in Task 2.

- [ ] **Step 5: Switch `Callout` severity and `Checklist` items to contracts types**

Open `packages/ink-tui/src/components/primitives/Callout.tsx`. Replace:
```ts
export type CalloutSeverity = "info" | "success" | "warn" | "error";
```

With:
```ts
import type { CalloutSeverity } from "@buli/contracts";
export type { CalloutSeverity };
```

Open `packages/ink-tui/src/components/primitives/Checklist.tsx`. Replace:
```ts
export type ChecklistItem = { /* local */ };
```

With:
```ts
import type { ChecklistItem } from "@buli/contracts";
export type { ChecklistItem };
```

The existing component already uses `{ itemTitle, itemStatus }` — identical to the contracts `ChecklistItem`, so no JSX change is needed.

- [ ] **Step 6: Update the consumer that renders assistant messages**

The single callsite today is `packages/ink-tui/src/richText/renderAssistantResponseTree.tsx` itself via the consumer component that renders assistant transcript entries. Run this grep once to confirm — it should return exactly one hit under `packages/ink-tui/src`:

```bash
grep -rn "RenderAssistantResponseTree\|parseAssistantResponseMarkdown" packages/ink-tui/src
```

The consumer is `ConversationTranscriptPane.tsx` (which renders each assistant message by calling `RenderAssistantResponseTree`). Open it and update:

```tsx
// old:
<RenderAssistantResponseTree
  assistantMarkdownBlocks={parseAssistantResponseMarkdown(transcriptMessage.text)}
/>
```

to:

```tsx
// new:
<RenderAssistantResponseTree
  assistantContentParts={transcriptMessage.assistantContentParts ?? parseAssistantResponseMarkdown(transcriptMessage.text)}
/>
```

Keep the parse fallback during this task — it preserves streaming behavior while the completed message may not yet carry parts (while text is still accumulating). The parse call will be removed in Task 11.

- [ ] **Step 7: Run tests and typecheck**

```bash
bun --filter @buli/ink-tui test
bun --filter @buli/ink-tui typecheck
```
Expected: both PASS. Existing integration tests should not need changes because the fallback preserves prior behavior.

- [ ] **Step 8: Commit**

```bash
git add packages/ink-tui/
git commit -m "refactor(ink-tui): consume assistantContentParts from transcript message in renderAssistantResponseTree"
```

---

### Task 11: Delete the local parser; render during streaming from `assistantContentParts`

This task removes the streaming-time fallback by updating ink-tui's reducer to populate `assistantContentParts` on the growing message entry during `assistant_response_text_chunk` events.

**Files:**
- Modify: `packages/ink-tui/src/chatScreenState.ts` — text-chunk reducer calls the engine parser on the growing text and attaches parts
- Modify: `packages/ink-tui/src/components/ConversationTranscriptEntryView.tsx` (or current consumer) — remove the fallback parse
- Delete: `packages/ink-tui/src/richText/parseAssistantResponseMarkdown.ts`
- Delete: `packages/ink-tui/test/parseAssistantResponseMarkdown.test.ts` (already relocated in Task 8)

- [ ] **Step 1: Add the engine parser to ink-tui dependencies**

Open `packages/ink-tui/package.json`. Confirm `"@buli/engine": "workspace:*"` is present (it already is). No edits.

- [ ] **Step 2: Update the streaming text-chunk reducer**

Open `packages/ink-tui/src/chatScreenState.ts`. Locate the arm handling `"assistant_response_text_chunk"`. Currently it accumulates `message.text` into the streaming entry. Update it to also populate `message.assistantContentParts` by calling the engine parser on the new text.

Find the import block at the top, add:
```ts
import { parseAssistantResponseIntoContentParts } from "@buli/engine";
```

Locate the text-chunk branch. For the message-entry update, replace:
```ts
// old — something like:
return {
  ...state,
  conversationTranscript: state.conversationTranscript.map((entry) =>
    entry.kind === "message" && entry.message.id === state.streamingAssistantMessageId
      ? { ...entry, message: { ...entry.message, text: entry.message.text + event.text } }
      : entry,
  ),
};
```

With:
```ts
return {
  ...state,
  conversationTranscript: state.conversationTranscript.map((entry) => {
    if (entry.kind !== "message") return entry;
    if (entry.message.id !== state.streamingAssistantMessageId) return entry;
    const updatedText = entry.message.text + event.text;
    return {
      ...entry,
      message: {
        ...entry.message,
        text: updatedText,
        assistantContentParts: parseAssistantResponseIntoContentParts(updatedText),
      },
    };
  }),
};
```

If the current reducer handles text-chunk differently (builds new streaming entry, etc.), adapt the same principle: every time `message.text` is recomputed during streaming, also recompute `message.assistantContentParts` by calling the parser.

- [ ] **Step 3: Update `@buli/engine` to export the parser**

Open `packages/engine/src/index.ts`. Add export:
```ts
export { parseAssistantResponseIntoContentParts } from "./assistantContentPartParser.ts";
```

- [ ] **Step 4: Remove the fallback parse at the render callsite**

Return to the consumer of `RenderAssistantResponseTree` (the file edited in Task 10 Step 6). Replace the fallback call:

```tsx
<RenderAssistantResponseTree
  assistantContentParts={transcriptMessage.assistantContentParts ?? parseAssistantResponseMarkdown(transcriptMessage.text)}
/>
```

With just:

```tsx
<RenderAssistantResponseTree
  assistantContentParts={transcriptMessage.assistantContentParts ?? []}
/>
```

Remove the `parseAssistantResponseMarkdown` import from that file.

- [ ] **Step 5: Verify no other callers of the old parser remain**

```bash
grep -rn "parseAssistantResponseMarkdown" packages/ink-tui/src
```
Expected: no results. If any, remove/update.

- [ ] **Step 6: Delete the old parser file and its test**

```bash
rm packages/ink-tui/src/richText/parseAssistantResponseMarkdown.ts
rm packages/ink-tui/test/parseAssistantResponseMarkdown.test.ts
```

- [ ] **Step 7: Run tests and typecheck**

```bash
bun --filter @buli/ink-tui test
bun --filter @buli/ink-tui typecheck
```
Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/ink-tui/ packages/engine/src/index.ts
git commit -m "refactor(ink-tui): source assistantContentParts from engine parser during streaming; delete local parser"
```

---

### Task 12: Rename the ink-tui entry export

**Files:**
- Modify: `packages/ink-tui/src/index.ts`

- [ ] **Step 1: Rename the export**

Open `packages/ink-tui/src/index.ts`. Locate:
```ts
export function renderChatScreenInTerminal(input: { ... }): Instance { ... }
```
Rename to `renderChatScreenInTerminalWithInk`:
```ts
export function renderChatScreenInTerminalWithInk(input: { ... }): Instance { ... }
```

- [ ] **Step 2: Update consumers**

```bash
grep -rn "renderChatScreenInTerminal\b" apps/ packages/
```
Update each callsite (expected: `apps/cli/src/commands/chat.ts`).

- [ ] **Step 3: Typecheck the workspace**

```bash
bun run typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ink-tui/src/index.ts apps/cli/src/commands/chat.ts
git commit -m "refactor(ink-tui): rename export to renderChatScreenInTerminalWithInk"
```

---

## Phase E — Shared fixtures

### Task 13: Create `@buli/assistant-transcript-fixtures`

**Files:**
- Create: `packages/assistant-transcript-fixtures/package.json`
- Create: `packages/assistant-transcript-fixtures/tsconfig.json`
- Create: `packages/assistant-transcript-fixtures/src/index.ts`
- Create: `packages/assistant-transcript-fixtures/src/scenarioShape.ts`
- Create: `packages/assistant-transcript-fixtures/src/scenarios/*.ts` (one file per scenario listed in spec §7)
- Create: `packages/assistant-transcript-fixtures/test/scenarios.test.ts`

- [ ] **Step 1: Create `package.json` and `tsconfig.json`**

```bash
mkdir -p packages/assistant-transcript-fixtures/src/scenarios packages/assistant-transcript-fixtures/test
cp packages/contracts/tsconfig.json packages/assistant-transcript-fixtures/tsconfig.json
```

Write `packages/assistant-transcript-fixtures/package.json`:
```json
{
  "name": "@buli/assistant-transcript-fixtures",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@buli/contracts": "workspace:*"
  },
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

Run `bun install`.

- [ ] **Step 2: Define the scenario shape**

Write `packages/assistant-transcript-fixtures/src/scenarioShape.ts`:
```ts
import type {
  AssistantContentPart,
  AssistantResponseEvent,
  PlanStep,
  ToolCallDetail,
  TokenUsage,
} from "@buli/contracts";

export type ExpectedConversationTranscriptEntryShape =
  | { kind: "message"; role: "user" | "assistant"; text: string; assistantContentParts?: readonly AssistantContentPart[] }
  | { kind: "error"; text: string }
  | { kind: "incomplete_response_notice"; incompleteReason: string }
  | { kind: "streaming_reasoning_summary"; reasoningSummaryText: string }
  | { kind: "completed_reasoning_summary"; reasoningSummaryText: string; reasoningDurationMs: number; reasoningTokenCount?: number }
  | { kind: "streaming_tool_call"; toolCallId: string; toolCallDetail: ToolCallDetail }
  | { kind: "completed_tool_call"; toolCallId: string; toolCallDetail: ToolCallDetail; durationMs: number }
  | { kind: "failed_tool_call"; toolCallId: string; toolCallDetail: ToolCallDetail; errorText: string; durationMs: number }
  | { kind: "plan_proposal"; planId: string; planTitle: string; planSteps: readonly PlanStep[] }
  | { kind: "rate_limit_notice"; retryAfterSeconds: number; limitExplanation: string }
  | { kind: "tool_approval_request"; approvalId: string; pendingToolCallId: string; pendingToolCallDetail: ToolCallDetail; riskExplanation: string }
  | { kind: "turn_footer"; turnDurationMs: number; usage?: TokenUsage; modelDisplayName: string };

export type AssistantTranscriptScenario = {
  scenarioName: string;
  responseEventSequence: readonly AssistantResponseEvent[];
  expectedConversationTranscriptEntries: readonly ExpectedConversationTranscriptEntryShape[];
};
```

- [ ] **Step 3: Write one scenario at a time**

For each scenario listed in the spec §7, create one file under `src/scenarios/`. Each file exports one `AssistantTranscriptScenario` constant. The content of each scenario is the authoritative event sequence + expected transcript.

Starter template (`simpleUserPromptAndAssistantParagraphReply.ts`):

```ts
import type { AssistantTranscriptScenario } from "../scenarioShape.ts";

export const simpleUserPromptAndAssistantParagraphReply: AssistantTranscriptScenario = {
  scenarioName: "simpleUserPromptAndAssistantParagraphReply",
  responseEventSequence: [
    { type: "assistant_response_started", model: "gpt-5.4" },
    { type: "assistant_response_text_chunk", text: "Hello world" },
    {
      type: "assistant_response_completed",
      message: {
        id: "m-1",
        role: "assistant",
        text: "Hello world",
        assistantContentParts: [
          { kind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "Hello world" }] },
        ],
      },
      usage: { input: 5, output: 2, reasoning: 0 },
    },
  ],
  expectedConversationTranscriptEntries: [
    {
      kind: "message",
      role: "assistant",
      text: "Hello world",
      assistantContentParts: [
        { kind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "Hello world" }] },
      ],
    },
  ],
};
```

Repeat the shape for each scenario listed in spec §7. Fill each `responseEventSequence` with realistic events that match the scenario name, and each `expectedConversationTranscriptEntries` with the transcript state each TUI's reducer should arrive at.

Scenarios to create (one per file):
1. `simpleUserPromptAndAssistantParagraphReply.ts`
2. `reasoningSummaryStreamingMidFlight.ts`
3. `reasoningSummaryCompletedThenMultiPartReply.ts`
4. `assistantReplyWithHeadingAndBulletedList.ts`
5. `assistantReplyWithFencedCodeBlockAndInlineCode.ts`
6. `assistantReplyWithCalloutSeverityVariants.ts`
7. `assistantReplyWithChecklistProgression.ts`
8. `assistantReplyWithToolCallReadPreview.ts`
9. `assistantReplyWithToolCallGrepMatches.ts`
10. `assistantReplyWithToolCallEditDiff.ts`
11. `assistantReplyWithToolCallBashOutput.ts`
12. `assistantReplyWithToolCallTodoWrite.ts`
13. `assistantReplyWithPlanProposal.ts`
14. `assistantReplyWithToolApprovalRequest.ts`
15. `errorBannerFromProviderStreamFailure.ts`
16. `incompleteResponseNotice.ts`
17. `rateLimitNoticeWithRetryAfter.ts`

- [ ] **Step 4: Export all scenarios from `index.ts`**

```ts
// packages/assistant-transcript-fixtures/src/index.ts
export type { AssistantTranscriptScenario, ExpectedConversationTranscriptEntryShape } from "./scenarioShape.ts";

export { simpleUserPromptAndAssistantParagraphReply } from "./scenarios/simpleUserPromptAndAssistantParagraphReply.ts";
export { reasoningSummaryStreamingMidFlight } from "./scenarios/reasoningSummaryStreamingMidFlight.ts";
// … one line per scenario file
```

- [ ] **Step 5: Write the self-test**

```ts
// packages/assistant-transcript-fixtures/test/scenarios.test.ts
import { describe, expect, test } from "bun:test";
import { AssistantResponseEventSchema } from "@buli/contracts";
import * as scenarios from "../src/index.ts";

const allScenarios = Object.values(scenarios).filter(
  (exported): exported is scenarios.AssistantTranscriptScenario =>
    typeof exported === "object" && exported !== null && "scenarioName" in exported,
);

describe("assistant transcript fixtures", () => {
  test("has_at_least_17_scenarios", () => {
    expect(allScenarios.length).toBeGreaterThanOrEqual(17);
  });

  for (const scenario of allScenarios) {
    test(`scenario_${scenario.scenarioName}_events_validate_against_schema`, () => {
      for (const event of scenario.responseEventSequence) {
        expect(() => AssistantResponseEventSchema.parse(event)).not.toThrow();
      }
    });

    test(`scenario_${scenario.scenarioName}_has_at_least_one_expected_entry`, () => {
      expect(scenario.expectedConversationTranscriptEntries.length).toBeGreaterThan(0);
    });
  }
});
```

- [ ] **Step 6: Run the test**

```bash
bun --filter @buli/assistant-transcript-fixtures test
```
Expected: PASS. If any event in any scenario fails schema validation, fix the scenario to match the contracts.

- [ ] **Step 7: Commit**

```bash
git add packages/assistant-transcript-fixtures/
git commit -m "feat(fixtures): add @buli/assistant-transcript-fixtures with canonical typed-part scenarios"
```

---

### Task 14: Add ink-tui reducer tests driven by fixtures

**Files:**
- Modify: `packages/ink-tui/package.json` — add fixtures as a dev dependency
- Create: `packages/ink-tui/test/fixturesDriven.test.ts`

- [ ] **Step 1: Add dev dependency**

Edit `packages/ink-tui/package.json`. Add `"@buli/assistant-transcript-fixtures": "workspace:*"` to `devDependencies`. Run `bun install`.

- [ ] **Step 2: Write the test**

```ts
// packages/ink-tui/test/fixturesDriven.test.ts
import { describe, expect, test } from "bun:test";
import * as scenarios from "@buli/assistant-transcript-fixtures";
import {
  applyAssistantResponseEventToChatScreenState,
  createInitialChatScreenState,
} from "../src/chatScreenState.ts";

const allScenarios = Object.values(scenarios).filter(
  (exported): exported is scenarios.AssistantTranscriptScenario =>
    typeof exported === "object" && exported !== null && "scenarioName" in exported,
);

describe("ink-tui reducer against shared fixtures", () => {
  for (const scenario of allScenarios) {
    test(`folds_${scenario.scenarioName}_to_expected_transcript_entries`, () => {
      let state = createInitialChatScreenState({ selectedModelId: "gpt-5.4" });
      for (const event of scenario.responseEventSequence) {
        state = applyAssistantResponseEventToChatScreenState(state, event);
      }
      const actualKinds = state.conversationTranscript.map((entry) => entry.kind);
      const expectedKinds = scenario.expectedConversationTranscriptEntries.map((entry) => entry.kind);
      expect(actualKinds).toEqual(expectedKinds);
    });
  }
});
```

- [ ] **Step 3: Run the test**

```bash
bun --filter @buli/ink-tui test fixturesDriven.test.ts
```
Expected: PASS for every scenario. If any scenario produces a different sequence of entry kinds than the fixture claims, either the scenario is wrong or the reducer has a bug — debug and fix the scenario (reducers are authoritative for this slice).

- [ ] **Step 4: Commit**

```bash
git add packages/ink-tui/package.json packages/ink-tui/test/fixturesDriven.test.ts
git commit -m "test(ink-tui): assert reducer output shape against shared fixture scenarios"
```

---

## Phase F — `@buli/opentui-tui` package

This is the largest phase. Each component from ink-tui gets ported to opentui-tui. The strategy is:
- Copy the ink-tui source, swap Ink primitives for `@opentui/react` primitives, port Ink-specific APIs (`useInput`, `useFocus`, `Box`, `Text`) to opentui equivalents.
- Run a snapshot test per component to confirm the output tree renders.
- Integration-test against the same fixtures used for ink-tui.

### Task 15: Scaffold the `@buli/opentui-tui` package

**Files:**
- Create: `packages/opentui-tui/package.json`
- Create: `packages/opentui-tui/tsconfig.json`
- Create: `packages/opentui-tui/src/index.ts` (stub)

- [ ] **Step 1: Verify `@opentui/react` workspace path**

```bash
cat tui/opentui/packages/react/package.json | grep '"name"'
```
Expected: `"name": "@opentui/react"` (or similar). Record the exact name.

```bash
cat tui/opentui/packages/core/package.json | grep '"name"'
```
Record the core package name as well (usually `@opentui/core`), since `@opentui/react` likely peer-depends on it.

- [ ] **Step 2: Create the package files**

```bash
mkdir -p packages/opentui-tui/src packages/opentui-tui/test
cp packages/ink-tui/tsconfig.json packages/opentui-tui/tsconfig.json
```

Write `packages/opentui-tui/package.json`:
```json
{
  "name": "@buli/opentui-tui",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@buli/contracts": "workspace:*",
    "@buli/engine": "workspace:*",
    "@buli/assistant-design-tokens": "workspace:*",
    "@opentui/react": "workspace:*",
    "@opentui/core": "workspace:*",
    "react": "^19.2.0"
  },
  "devDependencies": {
    "@buli/assistant-transcript-fixtures": "workspace:*",
    "@types/react": "^19.2.2"
  },
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

Adjust `@opentui/react` and `@opentui/core` names/version specifiers to match the exact names found in Step 1.

- [ ] **Step 3: Write a placeholder `index.ts`**

```ts
// packages/opentui-tui/src/index.ts
export function renderChatScreenInTerminalWithOpentui(): never {
  throw new Error("renderChatScreenInTerminalWithOpentui not implemented yet");
}
```

- [ ] **Step 4: Run install and typecheck**

```bash
bun install
bun --filter @buli/opentui-tui typecheck
```
Expected: typecheck PASS. If `@opentui/react` cannot be resolved, investigate `tui/opentui/packages/react` — it may need its own `bun install` first or its `package.json` may need a `workspaces` addition to the root.

- [ ] **Step 5: Commit**

```bash
git add packages/opentui-tui/ tui/opentui/ 2>/dev/null || git add packages/opentui-tui/
git commit -m "feat(opentui-tui): scaffold @buli/opentui-tui package with workspace dependencies"
```

---

### Task 16: Port `chatScreenState.ts` to opentui-tui

The reducer is engine-agnostic and contains no Ink APIs. A literal copy suffices; any reducer fixes land in both packages simultaneously.

**Files:**
- Create: `packages/opentui-tui/src/chatScreenState.ts`
- Create: `packages/opentui-tui/test/chatScreenState.test.ts`

- [ ] **Step 1: Copy the reducer**

```bash
cp packages/ink-tui/src/chatScreenState.ts packages/opentui-tui/src/chatScreenState.ts
```

Open the new file. No edits — the reducer uses only types from `@buli/contracts` and has no Ink dependencies. Verify imports are correct (they should be).

- [ ] **Step 2: Copy the reducer test**

```bash
cp packages/ink-tui/test/state.test.ts packages/opentui-tui/test/chatScreenState.test.ts
```

Open the copy. Fix the import path — in the copied file `from "../src/chatScreenState.ts"` should still resolve. Nothing else changes.

- [ ] **Step 3: Run the test**

```bash
bun --filter @buli/opentui-tui test chatScreenState.test.ts
```
Expected: PASS, same tests as ink-tui.

- [ ] **Step 4: Add fixtures-driven reducer test**

```bash
cp packages/ink-tui/test/fixturesDriven.test.ts packages/opentui-tui/test/fixturesDriven.test.ts
```

No edits needed — the file already imports from relative `../src/chatScreenState.ts`.

- [ ] **Step 5: Run the test**

```bash
bun --filter @buli/opentui-tui test fixturesDriven.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/opentui-tui/src/chatScreenState.ts packages/opentui-tui/test/
git commit -m "feat(opentui-tui): port chatScreenState reducer and drive from shared fixtures"
```

---

### Task 17: Port `conversationTranscriptViewportState.ts` to opentui-tui

Pure state math with no Ink dependencies. Literal copy.

**Files:**
- Create: `packages/opentui-tui/src/conversationTranscriptViewportState.ts`
- Create: `packages/opentui-tui/test/conversationTranscriptViewportState.test.ts`

- [ ] **Step 1: Copy**

```bash
cp packages/ink-tui/src/conversationTranscriptViewportState.ts packages/opentui-tui/src/conversationTranscriptViewportState.ts
cp packages/ink-tui/test/conversationTranscriptViewportState.test.ts packages/opentui-tui/test/conversationTranscriptViewportState.test.ts
```

- [ ] **Step 2: Run test**

```bash
bun --filter @buli/opentui-tui test conversationTranscriptViewportState.test.ts
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/opentui-tui/
git commit -m "feat(opentui-tui): port viewport state reducer"
```

---

### Task 18: Learn the `@opentui/react` primitive surface

Before porting visual components, document the primitive mapping. This is a read-only exploration task that writes a mapping file the subsequent tasks consume.

**Files:**
- Create: `packages/opentui-tui/src/opentuiPrimitiveMap.md` (reference doc; not imported)

- [ ] **Step 1: Enumerate opentui primitives**

```bash
grep -rln "export " tui/opentui/packages/react/src/components | head -30
```
Identify the component names available (expected approximate list: `Box`, `Text`, possibly `Input`, plus layout primitives). Note exact names and prop surfaces.

- [ ] **Step 2: Draft the mapping**

Create `packages/opentui-tui/src/opentuiPrimitiveMap.md` with:

```markdown
# Ink → OpenTUI primitive mapping

| Ink import | OpenTUI equivalent | Notes |
| --- | --- | --- |
| `<Box flexDirection="column">` | `<box flexDirection="column">` | (fill exact equivalent name) |
| `<Text color="#…">` | `<text color="#…">` | (fill) |
| `useInput` | `useKeyboard` | event.name, event.ctrl, etc. |
| `useFocus` | … | |
| `Instance` return type | … | |
```

Fill every row with the actual OpenTUI equivalent based on `tui/opentui/packages/react/src`. This doc is the reference each subsequent task consults.

- [ ] **Step 3: Commit**

```bash
git add packages/opentui-tui/src/opentuiPrimitiveMap.md
git commit -m "docs(opentui-tui): add Ink→OpenTUI primitive mapping reference"
```

---

### Task 19: Port primitives — batch 1 of 3 (text-only primitives)

Port the primitives that render mostly inline text and require no advanced layout: `InlineMarkdownText`, `FileReference`, `StreamingCursor`, `Stripe`, `glyphs.ts`.

**Files for each primitive:**
- Create: `packages/opentui-tui/src/components/primitives/<Name>.tsx`

- [ ] **Step 1: Port `InlineMarkdownText.tsx`**

Open `packages/ink-tui/src/components/primitives/InlineMarkdownText.tsx`. For each Ink primitive usage, substitute with the equivalent from the mapping doc. Save result to `packages/opentui-tui/src/components/primitives/InlineMarkdownText.tsx`.

- [ ] **Step 2: Repeat for `FileReference.tsx`, `StreamingCursor.tsx`, `Stripe.tsx`, `SurfaceCard.tsx`, `glyphs.ts`.**

`glyphs.ts` is a pure constants module — literal copy.

- [ ] **Step 3: Write a smoke test per component**

```ts
// packages/opentui-tui/test/components/primitives/InlineMarkdownText.test.tsx
import { describe, expect, test } from "bun:test";
import { render } from "@opentui/react/test-utils";
import { InlineMarkdownText } from "../../../src/components/primitives/InlineMarkdownText.tsx";

describe("InlineMarkdownText", () => {
  test("renders_text_span_literally", () => {
    const { lastFrame } = render(<InlineMarkdownText spans={[{ spanKind: "plain", spanText: "hello" }]} />);
    expect(lastFrame()).toContain("hello");
  });
});
```

Adapt the import paths of the test utility if `@opentui/react/test-utils` uses a different render API. Check `tui/opentui/packages/react/src/test-utils.ts` for the exact function name and signature.

Write one such test for each primitive in this batch.

- [ ] **Step 4: Run tests**

```bash
bun --filter @buli/opentui-tui test components/primitives
```
Expected: PASS for each.

- [ ] **Step 5: Commit**

```bash
git add packages/opentui-tui/src/components/primitives/ packages/opentui-tui/test/components/primitives/
git commit -m "feat(opentui-tui): port text-only primitives (inline markdown, file reference, streaming cursor, stripe, surface card, glyphs)"
```

---

### Task 20: Port primitives — batch 2 of 3 (list + structured primitives)

`BulletedList.tsx`, `NumberedList.tsx`, `NestedList.tsx`, `Checklist.tsx`, `DataTable.tsx`, `KeyValueList.tsx`.

- [ ] **Step 1: Port each file** using the primitive mapping doc.
- [ ] **Step 2: Write one smoke test per component** asserting a sample output contains the expected characters (bullets `•`, checklist `[x] [ ]`, etc.).
- [ ] **Step 3: Run tests**, expected PASS.
- [ ] **Step 4: Commit**

```bash
git add packages/opentui-tui/src/components/primitives/ packages/opentui-tui/test/components/primitives/
git commit -m "feat(opentui-tui): port list primitives (bulleted, numbered, nested, checklist, data table, key-value list)"
```

---

### Task 21: Port primitives — batch 3 of 3 (code + callout primitives)

`FencedCodeBlock.tsx`, `DiffBlock.tsx`, `ShellBlock.tsx`, `Callout.tsx`.

- [ ] **Step 1: Port each file.**
- [ ] **Step 2: Smoke tests** — assert fenced-code renders a language label when provided; diff renders `+` / `-` per line; callout renders severity-keyed border color.
- [ ] **Step 3: Run tests.**
- [ ] **Step 4: Commit**

```bash
git add packages/opentui-tui/src/components/primitives/ packages/opentui-tui/test/components/primitives/
git commit -m "feat(opentui-tui): port code and callout primitives (fenced code, diff, shell, callout)"
```

---

### Task 22: Port the rich-text tree renderer

**Files:**
- Create: `packages/opentui-tui/src/richText/renderAssistantResponseTree.tsx`
- Create: `packages/opentui-tui/test/renderAssistantResponseTree.test.tsx`

- [ ] **Step 1: Copy ink-tui's renderer, adjusting imports**

```bash
cp packages/ink-tui/src/richText/renderAssistantResponseTree.tsx packages/opentui-tui/src/richText/renderAssistantResponseTree.tsx
```

Open the new file. Replace `from "ink"` with the opentui primitive imports. Keep the rest of the logic (dispatching on `kind`) identical.

- [ ] **Step 2: Copy the test**

```bash
cp packages/ink-tui/test/renderAssistantResponseTree.test.tsx packages/opentui-tui/test/renderAssistantResponseTree.test.tsx
```

Replace `from "ink-testing-library"` with the opentui test utility import. Everything else stays.

- [ ] **Step 3: Run tests and typecheck**

```bash
bun --filter @buli/opentui-tui test renderAssistantResponseTree.test.tsx
bun --filter @buli/opentui-tui typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/opentui-tui/
git commit -m "feat(opentui-tui): port rich-text tree renderer against @opentui/react primitives"
```

---

### Task 23: Port per-tool-call cards

**Files:**
- Create: `packages/opentui-tui/src/components/toolCalls/*.tsx` — one per file
- Create: `packages/opentui-tui/test/components/toolCalls/*.test.tsx` — one smoke test per card

- [ ] **Step 1: Port** `ToolCallCardHeaderSlots.tsx`, then each of:
  - `ReadToolCallCard.tsx`
  - `GrepToolCallCard.tsx`
  - `EditToolCallCard.tsx`
  - `BashToolCallCard.tsx`
  - `TodoWriteToolCallCard.tsx`
  - `TaskToolCallCard.tsx`
  - `ToolCallEntryView.tsx`

Use the primitive mapping doc. Keep logic identical; only framework primitives change.

- [ ] **Step 2: Smoke test each card** — assert it renders the tool name and the tool-detail summary.

- [ ] **Step 3: Run tests.**
- [ ] **Step 4: Commit**

```bash
git add packages/opentui-tui/src/components/toolCalls/ packages/opentui-tui/test/components/toolCalls/
git commit -m "feat(opentui-tui): port tool-call card components"
```

---

### Task 24: Port behavior blocks

**Files:**
- Create: `packages/opentui-tui/src/components/behavior/*.tsx` (5 files)
- Create: `packages/opentui-tui/test/components/behavior/*.test.tsx`

- [ ] **Step 1: Port** `ErrorBannerBlock.tsx`, `IncompleteResponseNoticeBlock.tsx`, `PlanProposalBlock.tsx`, `RateLimitNoticeBlock.tsx`, `ToolApprovalRequestBlock.tsx`.

- [ ] **Step 2: Smoke test each.**
- [ ] **Step 3: Run tests.**
- [ ] **Step 4: Commit**

```bash
git add packages/opentui-tui/src/components/behavior/ packages/opentui-tui/test/components/behavior/
git commit -m "feat(opentui-tui): port behavior blocks"
```

---

### Task 25: Port screen chrome

**Files:**
- Create: `packages/opentui-tui/src/components/TopBar.tsx`
- Create: `packages/opentui-tui/src/components/InputPanel.tsx`
- Create: `packages/opentui-tui/src/components/ModelAndReasoningSelectionPane.tsx`
- Create: `packages/opentui-tui/src/components/ShortcutsModal.tsx`
- Create: `packages/opentui-tui/src/components/UserPromptBlock.tsx`
- Create: `packages/opentui-tui/src/components/ReasoningStreamBlock.tsx`
- Create: `packages/opentui-tui/src/components/ReasoningCollapsedChip.tsx`
- Create: `packages/opentui-tui/src/components/TurnFooter.tsx`
- Create: `packages/opentui-tui/src/components/SnakeAnimationIndicator.tsx`
- Create: `packages/opentui-tui/src/components/ContextWindowMeter.tsx`
- Create: `packages/opentui-tui/src/components/ConversationTranscriptPane.tsx`

- [ ] **Step 1: Port each file** using the primitive mapping doc. Keyboard handling differs — anywhere ink-tui uses `useInput`, map to `useKeyboard` from `@opentui/react`.

- [ ] **Step 2: Smoke test each.**
- [ ] **Step 3: Run tests and typecheck.**
- [ ] **Step 4: Commit**

```bash
git add packages/opentui-tui/src/components/ packages/opentui-tui/test/components/
git commit -m "feat(opentui-tui): port screen chrome components"
```

---

### Task 26: Port event relay and top-level `ChatScreen` composition

**Files:**
- Create: `packages/opentui-tui/src/relayAssistantResponseRunnerEvents.ts`
- Create: `packages/opentui-tui/src/ChatScreen.tsx`
- Create: `packages/opentui-tui/test/relayAssistantResponseRunnerEvents.test.ts`
- Create: `packages/opentui-tui/test/ChatScreen.integration.test.tsx`

- [ ] **Step 1: Port the relay file** — literal copy from ink-tui, no Ink-specific code.

- [ ] **Step 2: Port `ChatScreen.tsx`** — replace Ink imports with opentui primitives; keep composition identical.

- [ ] **Step 3: Port tests** — relay test is framework-agnostic; integration test uses opentui test utility.

- [ ] **Step 4: Run tests and typecheck.**

- [ ] **Step 5: Commit**

```bash
git add packages/opentui-tui/
git commit -m "feat(opentui-tui): port ChatScreen composition and event relay"
```

---

### Task 27: Implement `renderChatScreenInTerminalWithOpentui`

**Files:**
- Modify: `packages/opentui-tui/src/index.ts` (replace the placeholder)

- [ ] **Step 1: Replace the placeholder**

The `@opentui/react` render API is `createRoot(renderer)` (from `tui/opentui/packages/react/src/reconciler/renderer.ts:29`), where `renderer` is a `CliRenderer` instance from `@opentui/core`. Unlike Ink's single-call `render()`, the opentui flow is: get a `CliRenderer` → `createRoot(renderer)` → `root.render(element)` → return an object that has a `waitUntilExit()` equivalent (or wrap one).

Write `packages/opentui-tui/src/index.ts`:

```ts
// packages/opentui-tui/src/index.ts
import React from "react";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { type AssistantResponseRunner } from "@buli/engine";
import { ChatScreen, type ChatScreenProps } from "./ChatScreen.tsx";

export { ChatScreen } from "./ChatScreen.tsx";
export type { ChatScreenProps } from "./ChatScreen.tsx";

export type OpentuiChatScreenInstance = {
  waitUntilExit(): Promise<void>;
};

export function renderChatScreenInTerminalWithOpentui(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ChatScreenProps["selectedReasoningEffort"];
  loadAvailableAssistantModels: ChatScreenProps["loadAvailableAssistantModels"];
  assistantResponseRunner: AssistantResponseRunner;
}): OpentuiChatScreenInstance {
  const cliRenderer = createCliRenderer();
  const root = createRoot(cliRenderer);
  root.render(
    React.createElement(ChatScreen, {
      assistantResponseRunner: input.assistantResponseRunner,
      loadAvailableAssistantModels: input.loadAvailableAssistantModels,
      selectedModelId: input.selectedModelId,
      ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
    }),
  );
  return {
    waitUntilExit: () =>
      new Promise<void>((resolve) => {
        cliRenderer.on("exit", () => resolve());
      }),
  };
}
```

Confirm the exact `createCliRenderer` import path by reading `tui/opentui/packages/core/src/index.ts`. If the exported name differs (e.g. `CliRenderer` class constructor), adapt accordingly. Confirm the exit signal — the renderer may emit `"exit"` or expose an explicit `isRunning` / `onClose` hook. If no such event exists, the CLI's `process.on("SIGINT")` path can resolve the promise instead.

- [ ] **Step 2: Typecheck**

```bash
bun --filter @buli/opentui-tui typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/opentui-tui/src/index.ts
git commit -m "feat(opentui-tui): implement renderChatScreenInTerminalWithOpentui entrypoint"
```

---

## Phase G — CLI wiring

### Task 28: Add `--ui` flag parsing to `runCli`

**Files:**
- Modify: `apps/cli/src/main.ts`
- Modify: `apps/cli/test/main.test.ts` (or equivalent)

- [ ] **Step 1: Write failing test**

```ts
// add to apps/cli/test/main.test.ts
test("dispatches_interactive_chat_with_opentui_when_ui_flag_set_to_opentui", async () => {
  let capturedOptions: InteractiveChatStartOptions | undefined;
  const stubbedHandlers = {
    runInteractiveChat: async (options) => {
      capturedOptions = options;
      return "";
    },
    runListAvailableModels: async () => "",
    runLogin: async () => "",
  };
  await runCli(["--ui", "opentui"], stubbedHandlers);
  expect(capturedOptions?.selectedTerminalUserInterface).toBe("opentui");
});

test("dispatches_interactive_chat_with_ink_when_ui_flag_set_to_ink", async () => {
  let capturedOptions: InteractiveChatStartOptions | undefined;
  const stubbedHandlers = {
    runInteractiveChat: async (options) => {
      capturedOptions = options;
      return "";
    },
    runListAvailableModels: async () => "",
    runLogin: async () => "",
  };
  await runCli(["--ui", "ink"], stubbedHandlers);
  expect(capturedOptions?.selectedTerminalUserInterface).toBe("ink");
});

test("returns_usage_when_ui_flag_value_is_invalid", async () => {
  const stubbedHandlers = {
    runInteractiveChat: async () => "",
    runListAvailableModels: async () => "",
    runLogin: async () => "",
  };
  const output = await runCli(["--ui", "bogus"], stubbedHandlers);
  expect(output).toContain("Usage:");
});

test("defaults_to_ink_when_no_ui_flag_provided", async () => {
  let capturedOptions: InteractiveChatStartOptions | undefined;
  const stubbedHandlers = {
    runInteractiveChat: async (options) => {
      capturedOptions = options;
      return "";
    },
    runListAvailableModels: async () => "",
    runLogin: async () => "",
  };
  await runCli([], stubbedHandlers);
  expect(capturedOptions?.selectedTerminalUserInterface).toBeUndefined();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun --filter @buli/cli test main.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Modify `apps/cli/src/main.ts`**

Add the new option field and parser arm. Starting shape:

```ts
export type SelectedTerminalUserInterface = "ink" | "opentui";

export type InteractiveChatStartOptions = {
  selectedModelId?: string;
  selectedReasoningEffort?: ReasoningEffort;
  selectedTerminalUserInterface?: SelectedTerminalUserInterface;
};
```

Update the `USAGE` string:
```ts
const USAGE = "Usage: buli [login|models] [--model <id>] [--reasoning <none|minimal|low|medium|high|xhigh>] [--ui <ink|opentui>]";
```

Add a parser arm inside `parseInteractiveChatStartOptions`:
```ts
if (argument === "--ui") {
  const rawUiValue = args[index + 1];
  if (!rawUiValue || rawUiValue.startsWith("--")) {
    return undefined;
  }
  if (rawUiValue !== "ink" && rawUiValue !== "opentui") {
    return undefined;
  }
  interactiveChatStartOptions.selectedTerminalUserInterface = rawUiValue;
  index += 1;
  continue;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun --filter @buli/cli test main.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/main.ts apps/cli/test/main.test.ts
git commit -m "feat(cli): parse --ui ink|opentui flag into InteractiveChatStartOptions"
```

---

### Task 29: Dispatch the correct renderer in `chat.ts`

**Files:**
- Modify: `apps/cli/src/commands/chat.ts`
- Modify: `apps/cli/package.json` — add `@buli/opentui-tui` dependency

- [ ] **Step 1: Add the dependency**

Edit `apps/cli/package.json`. Add `"@buli/opentui-tui": "workspace:*"` to `dependencies`. Run `bun install`.

- [ ] **Step 2: Modify `commands/chat.ts`**

```ts
import type { ReasoningEffort } from "@buli/contracts";
import { AssistantResponseRuntime } from "@buli/engine";
import { renderChatScreenInTerminalWithInk } from "@buli/ink-tui";
import { renderChatScreenInTerminalWithOpentui } from "@buli/opentui-tui";
import { OpenAiAuthStore, OpenAiProvider } from "@buli/openai";

const DEFAULT_MODEL_ID = "gpt-5.4";

export async function runInteractiveChat(input: {
  selectedModelId?: string;
  selectedReasoningEffort?: ReasoningEffort;
  selectedTerminalUserInterface?: "ink" | "opentui";
  store?: OpenAiAuthStore;
  stdin?: Pick<NodeJS.ReadStream, "isTTY">;
} = {}): Promise<string> {
  const store = input.store ?? new OpenAiAuthStore();
  const auth = await store.loadOpenAi();
  if (!auth) {
    return "OpenAI auth not found. Run `buli login`.";
  }

  const stdin = input.stdin ?? process.stdin;
  if (!stdin.isTTY) {
    return "Interactive chat requires a TTY. Run `buli` in a terminal.";
  }

  const provider = new OpenAiProvider({ store });
  const assistantResponseRunner = new AssistantResponseRuntime(provider);
  const renderArgs = {
    assistantResponseRunner,
    loadAvailableAssistantModels: () => provider.listAvailableAssistantModels(),
    selectedModelId: input.selectedModelId ?? DEFAULT_MODEL_ID,
    ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
  } as const;

  const chatScreen =
    input.selectedTerminalUserInterface === "opentui"
      ? renderChatScreenInTerminalWithOpentui(renderArgs)
      : renderChatScreenInTerminalWithInk(renderArgs);

  await chatScreen.waitUntilExit();
  return "";
}
```

- [ ] **Step 3: Typecheck and test**

```bash
bun --filter @buli/cli typecheck
bun --filter @buli/cli test
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/cli/
git commit -m "feat(cli): dispatch ink or opentui renderer based on --ui flag"
```

---

## Phase H — Workspace-wide verification and smoke tests

### Task 30: Run workspace-wide test + typecheck

**Files:**
- None (verification only).

- [ ] **Step 1: Run the whole workspace**

```bash
bun run typecheck
bun run test
```
Expected: every package PASS. If a failure appears in a package we have not touched (e.g. `@buli/openai`), investigate — it likely indicates an accidental contracts change that broke a consumer, which is a bug in this slice.

- [ ] **Step 2: Commit (no code change; this is a checkpoint)**

No commit needed if no changes.

---

### Task 31: Manual smoke test — ink renderer

**Files:**
- None (manual verification).

- [ ] **Step 1: Build the CLI**

```bash
bun run build:cli
```
Expected: no errors.

- [ ] **Step 2: Launch with `--ui ink`**

```bash
./apps/cli/bin/buli.js --ui ink --model gpt-5.4
```

- [ ] **Step 3: Verify the following**

- Top bar renders.
- Input panel renders with the green border accent.
- Submit a prompt that elicits a multi-part reply (e.g. "write three bullet points about async iterators, include a fenced code example").
- While streaming, the assistant block renders with typed-part primitives (bulleted list, fenced code block) — not raw markdown characters.
- When the response completes, the turn footer appears with duration and token counts.
- Ctrl+L opens the model picker.
- Esc closes modals.

If any of these fail, STOP and debug. Do not proceed.

---

### Task 32: Manual smoke test — opentui renderer

**Files:**
- None (manual verification).

- [ ] **Step 1: Launch with `--ui opentui`**

```bash
./apps/cli/bin/buli.js --ui opentui --model gpt-5.4
```

- [ ] **Step 2: Verify the same behaviors as Task 31**

All transcript entry kinds visible during the same probe conversation (bulleted list, fenced code block, reasoning summary, tool calls if the prompt provokes them). Keyboard shortcuts behave equivalently. Visual output matches `.pen` palette per the design tokens (cyan accents, green input border, amber reasoning block, etc.).

Any functional divergence between the two renderers is a blocker and must be fixed inside this slice before the plan is considered complete (AGENTS.md §13 — do not leave problems as "follow-up" or "out of scope"). Examples of blockers: a transcript entry kind that does not render in one TUI, a keyboard shortcut that fires in one TUI but not the other, the input panel accent color missing. Cosmetic differences caused by framework primitives — e.g. a list bullet glyph rendered slightly differently, italic rendering collapsing to dim on terminals that do not support italic, corner radius rendering with a different Unicode box corner — are acceptable as long as they affect both renderers equivalently on the same terminal; if they affect only one renderer and not the other, treat them as blockers too.

---

### Task 33: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Move the "Planned Next Slice" section into "Current Status"**

Open `README.md`. The section added in commit `58f7155` described this slice as planned. After all tasks above are committed, the slice is implemented. Move the bullet list from "Planned Next Slice" into an appropriate bullet under "Current Status" (reworded to describe what now exists).

Add under "What You Can Do Today":
- `buli --ui opentui` launches the chat UI with the OpenTUI renderer
- both renderers implement the same component library and read the same typed transcript

Remove the "Planned Next Slice" section, which now describes completed work.

- [ ] **Step 2: Update "Project Structure" — move planned packages into "Current packages"**

The three planned packages (`packages/opentui-tui`, `packages/assistant-design-tokens`, `packages/assistant-transcript-fixtures`) now exist. Move them into the current packages list with one-line descriptions.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README now that dual TUI and typed assistant parts are implemented"
```

---

## Self-review checklist (run this yourself after implementation)

Before merging the branch:

- [ ] Every task in this plan has a commit — check with `git log --oneline main..HEAD`.
- [ ] `bun run test` passes.
- [ ] `bun run typecheck` passes.
- [ ] `buli --ui ink` smoke-tested end-to-end.
- [ ] `buli --ui opentui` smoke-tested end-to-end.
- [ ] `ink-limitations.md` still accurately describes visual mappings (update if you changed any).
- [ ] README reflects the new state.

---

**End of plan.**
