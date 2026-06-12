# Draft: opentui upstream issues (NOT published — for review)

Three candidate issues for github.com/sst/opentui, written against `@opentui/core@0.4.0`.
All were found while building buli's markdown rendering on `MarkdownRenderable`.

---

## Issue 1: Markdown task-list checkboxes render as bare `x` under conceal — no glyph or styling hook

### Summary

With `conceal: true`, `MarkdownRenderable` renders GFM task list items as:

```
- x Read the file
-   Update the tests
```

The checkbox token is concealed down to `x` / ` ` with the ordinary `-` list
marker, so checked and unchecked items are nearly indistinguishable. There is no
way to render the conventional `☑` / `☐` glyphs (or any custom glyph) without
re-implementing list rendering entirely: list tokens produce a `BoxRenderable`
whose marker `TextRenderable` and item-content `CodeRenderable` children are
created internally (`createListItemRenderable` / `createListChildRenderable`),
out of reach of the public `renderNode` hook, which only sees top-level tokens.

### Reproduction

```tsx
<markdown
  conceal={true}
  internalBlockMode="top-level"
  content={"- [x] Read the file\n- [ ] Update the tests"}
  syntaxStyle={syntaxStyle}
  width="100%"
/>
```

Observed: `- x Read the file` / `-   Update the tests`
Expected (or opt-in): `☑ Read the file` / `☐ Update the tests`

### Proposal

Either of:

1. Render checkbox tokens as `☑` / `☐` when concealed (matching how editors
   conceal task markers), styled via dedicated scopes (e.g. `markup.list.checked`
   / `markup.list.unchecked`) so themes can color them; or
2. Add `MarkdownOptions.listOptions?: { checkedMarker?: string; uncheckedMarker?: string; marker?: string }`
   so embedders can choose glyphs without forking list rendering.

Workaround we use: a fence-aware text-level pass that substitutes `☑` / `☐`
into the markdown source before it reaches `MarkdownRenderable`. It keeps the
native incremental list update path, but the glyph renders as item *content*
after the `-` marker rather than as the marker itself, and every embedder has
to rediscover this independently.

---

## Issue 2: Non-streaming in-place markdown block updates show stale content until async highlight completes

### Summary

When a `MarkdownRenderable`'s `content` is replaced wholesale while
`streaming: false` (e.g. an app swaps one document for another in the same
renderable), changed blocks that update in place keep drawing the **previous**
content until tree-sitter responds with the new highlight.

Cause: `updateBlockRenderable` → `applyMarkdownCodeRenderable` sets
`drawUnstyledText = initialStyledText !== undefined`, and
`createInitialStyledText` returns `undefined` whenever `_streaming` is false —
so the updated `CodeRenderable` has new `content` but is told not to draw it
unstyled, and the old framebuffer rows persist for one async round-trip. In
streaming mode this is fine (`createInitialStyledText` synchronously lexes
inline tokens), it's specifically the non-streaming update path that regresses.

The same window existed in 0.2.x list/blockquote children (`drawUnstyledText: false`
hardcoded), which 0.4.0 fixed — this is the remaining case.

### Reproduction

```tsx
// 1) render <markdown streaming={false} content="Previous answer" ... />
// 2) update content prop to "Switched answer"
// 3) capture the next frame: it still shows "Previous answer";
//    the new text appears only after the async highlight lands.
```

### Proposal

Compute `initialStyledText` for non-streaming updates as well (the inline lexer
already produces it cheaply for the streaming path), or fall back to
`drawUnstyledText = true` when no initial styled text is available so updated
content is never invisible/stale pending highlight.

### Workaround we use

We scope our hydrated message ids per transcript replacement so React remounts
the markdown renderables instead of updating them in place; fresh mounts go
through the create path, which draws immediately.

---

## Issue 3: `renderNode` content rewrites are silently reverted when a block grows during streaming

### Summary

A `renderNode` that mutates the default renderable's `content` (the documented
"customize default rendering" pattern) gets its rewrite silently reverted as
soon as that block's `token.raw` changes while streaming. The in-place update
path (`updateTopLevelBlocks` → `updateBlockRenderable` →
`applyMarkdownCodeRenderable` / `applyCodeBlockRenderable`) re-applies the raw
token text and element-level `syntaxStyle` directly, then discards the fresh
renderable that `renderNode` just produced
(`destroyUnusedDefaultRenderable(custom.renderable)`) whenever
`custom.canUpdateInPlace` is true.

Concretely: we restyle headings (`## Title` → `◆ Title` with a per-depth
syntax style) by mutating the default renderable in `renderNode`. While a
heading is the trailing block of a streaming message and grows token by token,
the first in-place update replaces our formatted content with the raw
`## Title` text — and since nothing re-renders the block after the stream
moves on, the unformatted text sticks permanently.

### Reproduction

```tsx
// renderNode: token.type === "heading" → defaultRender(), mutate .content, return it
// 1) render <markdown streaming content={"## Gro"} renderNode={...} />
// 2) update content to "## Grow" (same block, raw changed)
// 3) the heading now shows the raw "## Grow" text; the renderNode rewrite is gone
```

### Proposal

Any of:

1. When `_renderNode` is set and the custom result equals the default, apply
   the *custom* result's content/syntaxStyle in `updateBlockRenderable` instead
   of the raw token text (the fresh default was already created and mutated —
   it is currently destroyed unused);
2. Expose an opt-out, e.g. `renderNode` returning
   `{ renderable, updateInPlace: false }`, so embedders can choose recreate
   semantics without constructing a decoy renderable; or
3. Document on `MarkdownOptions.renderNode` that `content` rewrites do not
   survive in-place updates (chunk-level customization via `onChunks` does),
   and that returning a *new* renderable is required for durable rewrites.

### Workaround we use

For rewritten tokens we return a freshly constructed `CodeRenderable` instead
of the mutated default, which forces `canUpdateInPlace = false` and a
re-render through `renderNode` on every change — correct, at the cost of a
rebuild per token while the block is the growing streaming tail.

---

## Note: 0.4.0 fixes we verified (no issue needed)

- List/blockquote child `CodeRenderable`s no longer stay invisible waiting for
  tree-sitter (`drawUnstyledText` / `initialStyledText` handling) — task/nested
  list item text now renders. Thanks!
- Blocks created through a custom `renderNode` that returns the (mutated)
  default renderable now participate in in-place updates
  (`canUpdateInPlace = custom.renderable === custom.defaultResult?.renderable`)
  instead of being destroyed and recreated on every change. (See Issue 3 for
  the content-rewrite interaction.)
