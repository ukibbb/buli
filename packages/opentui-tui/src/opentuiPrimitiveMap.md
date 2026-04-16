# Ink → OpenTUI Primitive Map

Reference for Tasks 19-26. All names verified against
`node_modules/@opentui/react/src/` and `node_modules/@opentui/core/` `.d.ts` files.

---

## 1. Element mapping

OpenTUI JSX tags are **lowercase**. Import path for the renderer:
`@opentui/react` (re-exports everything).

| Ink (PascalCase) | OpenTUI (lowercase) | Notes |
|---|---|---|
| `<Box>` | `<box>` | Same layout props; see Section 2 for renames. |
| `<Text>` | `<text>` | Text styling uses `fg`/`bg`/`attributes`; see Section 2. |
| `<Text>` wrapping inline `<Text>` spans | `<text>` containing `<span>` / `<b>` / `<i>` / `<u>` / `<em>` / `<strong>` | Inline runs nest inside a `<text>` parent. |
| `<Newline />` | `<br />` | `<br>` is `LineBreakRenderable`; accepts only `id` prop. |
| No Ink equivalent | `<scrollbox>` | Native scrollable container. |
| No Ink equivalent | `<markdown>` | Native markdown renderer. |
| No Ink equivalent | `<code>` | Native code block with syntax highlighting. |
| No Ink equivalent | `<input>` | Single-line controlled input with `onInput`/`onChange`/`onSubmit`. |
| No Ink equivalent | `<select>` | List picker with `onChange`/`onSelect`. |
| No Ink equivalent | `<textarea>` | Multi-line editor. |

---

## 2. Prop translation table

### Layout props (`<box>` and any element extending `RenderableOptions`)

All layout props below pass through unchanged — OpenTUI accepts the same names.

| Ink prop | OpenTUI prop | Notes |
|---|---|---|
| `flexDirection` | `flexDirection` | Same. |
| `flexGrow` | `flexGrow` | Same. |
| `flexShrink` | `flexShrink` | Same. |
| `alignItems` | `alignItems` | Same. |
| `justifyContent` | `justifyContent` | Same. |
| `gap` | `gap` | Same. Also `rowGap` / `columnGap` available in OpenTUI. |
| `width` | `width` | Same. Accepts `number`, `"auto"`, `"${n}%"`. |
| `height` | `height` | Same. |
| `padding` | `padding` | Same. |
| `paddingX` | `paddingX` | Same. |
| `paddingY` | `paddingY` | Same. |
| `marginTop` | `marginTop` | Same. |
| `marginBottom` | `marginBottom` | Same. |
| `marginRight` | `marginRight` | Same (Ink uses `marginRight`; confirmed in `Renderable.d.ts`). |

### Border props (`<box>`)

Ink's per-side boolean props map to a single `border` array in OpenTUI.

| Ink prop | OpenTUI equivalent | Notes |
|---|---|---|
| `borderStyle="single"` | `borderStyle="single"` | Same value. |
| `borderStyle="double"` | `borderStyle="double"` | Same value. |
| `borderStyle="round"` | `borderStyle="rounded"` | Value renamed: `"round"` → `"rounded"`. |
| `borderStyle="bold"` | `borderStyle="heavy"` | Value renamed: `"bold"` → `"heavy"`. |
| `borderColor` | `borderColor` | Same. Accepts hex string or `RGBA`. |
| `borderLeft={true}` | `border={["left"]}` | OpenTUI uses `border: boolean \| BorderSides[]`. |
| `borderRight={true}` | `border={["right"]}` | Same pattern. |
| `borderTop={true}` | `border={["top"]}` | Same pattern. |
| `borderBottom={true}` | `border={["bottom"]}` | Same pattern. |
| `borderStyle` + no `border*` | `border={true}` | Enable all four sides. |

### Text / colour props (`<text>`, `<span>`, `<b>`, `<i>`, `<u>`)

| Ink prop | OpenTUI prop | Notes |
|---|---|---|
| `color` | `fg` | Renamed. Accepts hex string or `RGBA`. |
| `backgroundColor` (on `<Text>`) | `bg` | Renamed. |
| `backgroundColor` (on `<Box>`) | `backgroundColor` | Unchanged on `<box>`. |
| `bold` | `attributes={TextAttributes.BOLD}` | Import `TextAttributes` from `@opentui/core`. Use `<b>` tag as shorthand. |
| `italic` | `attributes={TextAttributes.ITALIC}` | Use `<i>` / `<em>` tag as shorthand. |
| `underline` | `attributes={TextAttributes.UNDERLINE}` | Use `<u>` tag as shorthand. |
| `strikethrough` | `attributes={TextAttributes.STRIKETHROUGH}` | No shorthand tag; set `attributes` manually. |
| `dimColor` | `attributes={TextAttributes.DIM}` | No shorthand tag; set `attributes` manually. |

Combining attributes: bitwise OR — `attributes={TextAttributes.BOLD | TextAttributes.ITALIC}`.

---

## 3. Keyboard input

Ink: `useInput((input: string, key: Key) => void)` — `key` has booleans `escape`,
`return`, `ctrl`, `upArrow`, `downArrow`, `backspace`, `tab`, etc.

OpenTUI: `useKeyboard((e: KeyEvent) => void)` from `@opentui/react`.
`KeyEvent` has a `name: string` field and boolean `ctrl`, `meta`, `shift`.

### Before (Ink)

```tsx
import { useInput } from "ink";

useInput((input, key) => {
  if (key.escape) { /* ... */ }
  if (key.return) { /* ... */ }
  if (key.upArrow) { /* ... */ }
  if (key.downArrow) { /* ... */ }
  if (key.backspace) { /* ... */ }
  if (key.tab) { /* ... */ }
  if (key.ctrl && input === "l") { /* Ctrl+L */ }
  if (!key.ctrl && !key.meta && input.length > 0) { /* printable */ }
});
```

### After (OpenTUI)

```tsx
import { useKeyboard } from "@opentui/react";
import type { KeyEvent } from "@opentui/core";

useKeyboard((e: KeyEvent) => {
  if (e.name === "escape") { /* ... */ }
  if (e.name === "return") { /* ... */ }
  if (e.name === "up") { /* ... */ }
  if (e.name === "down") { /* ... */ }
  if (e.name === "backspace") { /* ... */ }
  if (e.name === "tab") { /* ... */ }
  if (e.ctrl && e.name === "l") { /* Ctrl+L */ }
  if (!e.ctrl && !e.meta && e.name.length === 1) { /* printable */ }
});
```

Key name strings (from `@opentui/core/lib/parse.keypress.d.ts`): `"escape"`,
`"return"`, `"up"`, `"down"`, `"left"`, `"right"`, `"backspace"`, `"tab"`,
`"space"`, `"delete"`, single-character strings for printable input.

By default `useKeyboard` receives only press + repeat events. Pass
`{ release: true }` as the second argument to also receive release events
(`e.eventType === "release"`).

`useInput` has no `isActive` option in the port — use conditional logic inside
the handler or mount/unmount the component that calls `useKeyboard`.

---

## 4. Rendering and waiting for exit

### Ink

```ts
import { render, type Instance } from "ink";

const instance: Instance = render(<App />, { alternateScreen: true });
await instance.waitUntilExit();
instance.unmount();
```

### OpenTUI

There is no `waitUntilExit`. Build the exit promise manually from the
`CliRenderEvents.DESTROY` event emitted by `CliRenderer`.

```ts
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

const renderer = await createCliRenderer({ exitOnCtrlC: true });
const root = createRoot(renderer);
root.render(<App />);

// Build the exit promise from the DESTROY event.
const waitUntilExit = (): Promise<void> =>
  new Promise((resolve) => renderer.once("destroy", resolve));

await waitUntilExit();
root.unmount();
renderer.destroy();
```

`createRoot` returns `{ render(node): void; unmount(): void }`.

`createCliRenderer` config accepts `exitOnCtrlC`, `exitSignals`,
`targetFps`, `width` / `height` (for testing), etc.

---

## 5. Testing

### Ink (`ink-testing-library`)

```ts
import { render } from "ink-testing-library";
const { lastFrame } = render(<App />);
expect(lastFrame()).toContain("hello");
```

### OpenTUI (`@opentui/react` test-utils)

```ts
import { testRender } from "@opentui/react/test-utils";

const { captureCharFrame, captureSpans, renderOnce, mockInput, resize } =
  await testRender(<App />, { width: 80, height: 24 });

await renderOnce();
const frame: string = captureCharFrame(); // nearest equivalent to lastFrame()
```

`testRender` is **async** — it returns a `Promise`. There is no synchronous
`lastFrame()`; call `captureCharFrame()` after `await renderOnce()`.

`captureSpans()` returns a `CapturedFrame` with per-cell colour data —
richer than Ink's string-only `lastFrame()`.

`mockInput` (from `@opentui/core/testing`) lets tests inject key events;
`mockMouse` injects mouse events. Import path: `@opentui/react/test-utils`
(maps to `node_modules/@opentui/react/src/test-utils.d.ts`).

---

## 6. Known limits

| Area | Ink behaviour | OpenTUI behaviour | Workaround |
|---|---|---|---|
| `<Newline />` | Explicit newline element. | Use `<br />` (maps to `LineBreakRenderable`, accepts only `id` prop). | Drop-in replacement. |
| `borderStyle="round"` | Accepted. | Must use `"rounded"`. | Rename value at call site. |
| `borderStyle="bold"` | Accepted. | Must use `"heavy"`. | Rename value at call site. |
| Per-side border booleans | `borderLeft`, `borderRight`, `borderTop`, `borderBottom`. | Single `border={["left", "top"]}` array. | Replace per-side booleans with array. |
| `useApp().exit()` | Programmatic exit. | No direct equivalent. Call `renderer.destroy()` (accessible via `useRenderer()` hook). | `const renderer = useRenderer(); renderer.destroy();` |
| `useFocus` / `useStdin` / `useStdout` | Ink-specific hooks. | No equivalents. | `useFocus` → pass `focused` prop to `<box>`/`<scrollbox>`. Stdin/stdout → access via `renderer.stdin` / `renderer.stdout` from `useRenderer()`. |
| `useWindowSize()` | Returns `{ columns, rows }`. | `useTerminalDimensions()` returns `{ width, height }`. | Rename fields; hook is in `@opentui/react`. |
| `useAnimation({ interval })` | Returns `{ frame: number }`. | `useTimeline()` from `@opentui/react`. | Returns a `Timeline` object; drive animation manually or use `renderer.on("resize", ...)` cadence. |
| Inline `<Text>` nesting | `<Text><Text color="x">...</Text></Text>` | Nest `<span>` / `<b>` / `<i>` / `<u>` inside `<text>`. Direct `<text>` inside `<text>` is not the idiomatic pattern. | Use `<span fg="x">` for inline colour runs. |
| `waitUntilExit()` | Method on `Instance`. | Not provided. | Listen for `renderer.once("destroy", ...)` as shown in Section 4. |
