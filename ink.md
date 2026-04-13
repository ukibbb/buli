# Ink Deep Dive for Buli

This document explains how Ink works, what it is good at, where its limits come from, how it maps React code to terminal output, and how Buli should think about using or owning it.

Assumption: when earlier notes said "rad code", that meant React code.

## Scope

- The local reference checkout is `tui/ink/`.
- Buli's current app-facing TUI package is `packages/ink-tui/`.
- The current CLI entrypoint for chat is `apps/cli/src/commands/chat.ts`.

## Important Caveat

- The local reference checkout and the runtime dependency are aligned today.
- `tui/ink/package.json:3` says the local checkout is `7.0.0`.
- `packages/ink-tui/package.json:14` says Buli currently depends on npm `ink` `^7.0.0`.
- That means `tui/ink/` is now a good reference for both architecture and the runtime features Buli can actually use, including `alternateScreen`, `useWindowSize`, and `useBoxMetrics`.

This is healthier than the earlier mismatch, but there is still a source-of-truth question long term because `tui/ink/` is an ignored checkout, not the tracked dependency source.

## Buli Today

The current render path is:

1. `apps/cli/src/commands/chat.ts:25-33` creates an `AssistantResponseRuntime` and calls `renderChatScreenInTerminal(...)`.
2. `packages/ink-tui/src/index.ts:38-58` calls Ink's `render(...)` with Buli's `ChatScreen`.
3. `packages/ink-tui/src/ChatScreen.tsx` renders a fullscreen shell made of:
4. `packages/ink-tui/src/components/ConversationTranscriptPane.tsx:8-32`
5. `packages/ink-tui/src/components/PromptDraftPane.tsx`
6. `packages/ink-tui/src/components/ChatSessionStatusBar.tsx`

The current shell is still early, but it now has a real fullscreen frame:

- top application bar
- main conversation body panel
- prompt input dock
- compact footer status strip
- bordered message blocks for user, assistant, and error entries
- fullscreen alternate-screen mode by default
- There is no in-app scroll model yet.
- There is no owned design system yet.

So the current product layer is not yet testing the real limits of Ink.

## What Ink Actually Is

Ink is a custom React renderer for terminals.

It is not:

- a browser DOM renderer
- a native terminal widget toolkit
- a full component library
- a CSS engine

It is closer to this:

```text
React tree
-> Ink reconciler
-> Ink host nodes + Yoga layout tree
-> renderer walks the laid out tree
-> output buffer builds a character-cell frame
-> frame is diffed and written to stdout with ANSI escapes
```

The public primitives are small on purpose. The core mental model is:

- `Box` is layout.
- `Text` is styled text.
- a few special components and hooks handle logs, transforms, input, focus, cursor, animation, sizing, and app lifecycle.

Ink is more a rendering kernel than a full TUI framework.

## The Core Mental Model

Ink renders terminal UI in four distinct stages.

### 1. React Stage

Your components return JSX like:

```tsx
<Box flexDirection="column">
  <Text color="green">Hello</Text>
</Box>
```

At this stage, everything is still ordinary React code.

### 2. Host Tree Stage

Ink's custom reconciler turns that JSX into internal host nodes like:

- `ink-root`
- `ink-box`
- `ink-text`
- `ink-virtual-text`
- `#text`

These nodes live in Ink's own tiny DOM model in `tui/ink/src/dom.ts`.

### 3. Layout Stage

Ink maps style props to Yoga in `tui/ink/src/styles.ts`.

Yoga computes:

- width
- height
- left
- top
- flex sizing
- wrapping layout
- padding and margin layout

This is where the app becomes actual terminal geometry.

### 4. Rasterization Stage

Ink walks the laid-out tree and paints:

- text
- borders
- backgrounds
- padding offsets
- clipping

into a virtual character-cell buffer. That buffer is then turned into one frame string and written to the terminal.

## End-to-End Pipeline: React Code to Terminal Output

This is the core answer to "how does React code become rendered terminal components?"

### 1. Public `render()` Entry

Key file: `tui/ink/src/render.ts`

What happens:

- `render(node, options)` is the public runtime entry.
- It normalizes options like `stdout`, `stdin`, `interactive`, `alternateScreen`, `maxFps`, `incrementalRendering`, and screen reader behavior.
- Ink keeps one renderer instance per output stream, so it reuses or creates an `Ink` instance tied to `stdout`.

Why it matters:

- Ink is not a stateless `renderToString()` helper in live mode.
- It owns terminal session lifecycle.
- It has opinions about one live app per output stream.

### 2. `Ink` Runtime Object Owns the Terminal Session

Key file: `tui/ink/src/ink.tsx`

The `Ink` class is the long-lived runtime for a live app.

It is responsible for:

- creating the root node
- creating the React container
- tracking terminal streams
- managing alternate screen
- tracking resize events
- deciding whether the app is interactive
- throttling renders
- choosing how each frame is written

Important methods to read:

- `constructor(...)`
- `render(...)`
- `calculateLayout(...)`
- `onRender(...)`
- `renderInteractiveFrame(...)`
- `unmount(...)`

### 3. React Reconciler Turns JSX into Ink Host Nodes

Key file: `tui/ink/src/reconciler.ts`

This is the most important file in the whole codebase if you want to understand Ink deeply.

This file defines React host operations like:

- `createInstance(...)`
- `createTextInstance(...)`
- `appendChild(...)`
- `insertBefore(...)`
- `commitUpdate(...)`
- `commitTextUpdate(...)`
- `removeChild(...)`
- `resetAfterCommit(...)`

What this means in practice:

- React sees Ink as a renderer with its own host config.
- When React reconciles `<Box>` or `<Text>`, Ink creates corresponding internal nodes.
- On updates, Ink mutates those nodes and their Yoga styles instead of mutating browser DOM.

### 4. Ink Builds a Tiny Internal DOM Backed by Yoga

Key file: `tui/ink/src/dom.ts`

Ink's internal node model has:

- `childNodes`
- `parentNode`
- `attributes`
- `style`
- optional transform and accessibility metadata
- an attached Yoga node for layout-bearing elements

Important functions:

- `createNode(...)`
- `createTextNode(...)`
- `appendChildNode(...)`
- `insertBeforeNode(...)`
- `removeChildNode(...)`
- `measureTextNode(...)`

Important design detail:

- `ink-text` nodes use Yoga measure functions so text can participate in layout.
- `ink-virtual-text` exists to support nested text composition without creating another real layout box.

### 5. Ink Maps Style Props to Yoga

Key file: `tui/ink/src/styles.ts`

Ink takes React props like:

- `flexDirection`
- `justifyContent`
- `alignItems`
- `width`
- `height`
- `padding`
- `margin`
- `gap`
- `position`
- `overflow`

and maps them into Yoga layout operations.

This is the real answer to "how does a `Box` get dimensions and position?"

Not by CSS. By explicit prop-to-Yoga mapping.

### 6. After Each React Commit, Ink Computes Layout

Critical hook: `resetAfterCommit(...)` in `tui/ink/src/reconciler.ts`

This function is the bridge between React commit and terminal render.

At a high level, it does this:

1. compute layout
2. emit layout listeners
3. render static content immediately if needed
4. otherwise trigger normal render

This matters because React itself is not writing to the terminal. Ink waits until the commit is done, then computes geometry, then serializes the whole frame.

### 7. `Ink.calculateLayout()` Runs Yoga

Key file: `tui/ink/src/ink.tsx`

Ink sets the root width from the terminal's current column count, then asks Yoga to compute the layout tree.

That gives every visible node a computed box:

- left
- top
- width
- height

At this point the app has real terminal coordinates.

### 8. Text Gets Flattened, Measured, Wrapped, and Styled

Key files:

- `tui/ink/src/squash-text-nodes.ts`
- `tui/ink/src/measure-text.ts`
- `tui/ink/src/wrap-text.ts`
- `tui/ink/src/components/Text.tsx`

Important behavior:

- nested text children are flattened into one renderable text payload
- text measurement is width-aware
- wrapping and truncation are explicit behaviors
- text styles are applied as string transforms using Chalk and Ink's color helpers

This is very different from browser text layout.

Ink is not drawing glyphs. It is building styled strings that must fit in terminal cells.

### 9. The Renderer Walks the Tree and Paints It

Key files:

- `tui/ink/src/renderer.ts`
- `tui/ink/src/render-node-to-output.ts`

`renderer(...)` creates a new output buffer and asks Ink to render the laid-out tree into it.

`renderNodeToOutput(...)` recursively walks nodes and handles:

- writing text at the right coordinates
- background filling
- border painting
- overflow clipping
- transform application
- recursion into children

The renderer also supports a separate screen-reader output path.

### 10. `Output` Is the Virtual Terminal Frame

Key file: `tui/ink/src/output.ts`

This file is where Ink becomes a real terminal renderer rather than a layout library.

`Output` stores positioned write operations, handles clipping and overlap, tokenizes ANSI styling, and produces the final frame string.

The important conceptual point is:

- Ink does not stream one React node at a time to stdout.
- Ink composes the entire visible frame first.
- Then it writes the final frame.

### 11. `log-update` Diffs Frames and Writes to Stdout

Key file: `tui/ink/src/log-update.ts`

Ink has two main redraw strategies:

- standard: redraw the output block
- incremental: only rewrite changed lines

This file manages:

- hiding and showing the cursor
- cursor movement
- erasing previous frames
- minimal line updates when incremental mode is enabled

This is the last step before bytes hit the terminal.

### 12. Final Live Runtime Modes

Key file: `tui/ink/src/ink.tsx`

Ink supports several write behaviors:

- interactive mode
- non-interactive mode
- debug mode
- screen-reader mode
- alternate-screen mode

These modes change how output is written, not how layout is computed.

## Important Special Cases in the Pipeline

### `Static`

Key files:

- `tui/ink/src/components/Static.tsx`
- `tui/ink/src/reconciler.ts`
- `tui/ink/src/renderer.ts`

`<Static>` is append-only output that permanently appears above the live frame.

This is useful for:

- logs
- completed tasks
- historical status lines

Important limitation:

- it only renders newly added items
- previously rendered items are not re-rendered when changed

So `<Static>` is a log channel, not a general-purpose dynamic list.

### `Transform`

Key files:

- `tui/ink/src/components/Transform.tsx`
- `tui/ink/readme.md:1584-1656`

`<Transform>` gives you already-rendered text lines and lets you transform them.

This is how gradient, big-text, and similar libraries work.

Critical rule:

- the transform should not change output dimensions

If it changes the visual width or height, Yoga's layout and the terminal's final rendering will disagree.

## Styling Model

Ink styling is split into two different systems.

### Layout Styling

Key file: `tui/ink/src/styles.ts`

This is Yoga-backed styling. It controls geometry.

Main supported families:

- flex direction and wrapping
- justify and align properties
- width and height
- min and max size constraints
- aspect ratio
- margin and padding
- row and column gaps
- position with `top`, `right`, `bottom`, `left`
- display
- overflow and clipping
- border thickness for layout accounting

This is closest to a limited flexbox model, not full CSS.

### Text Styling

Key files:

- `tui/ink/src/components/Text.tsx`
- `tui/ink/src/colorize.ts`

Text styling is ANSI-backed and string-based.

Main supported families:

- `color`
- `backgroundColor`
- `dimColor`
- `bold`
- `italic`
- `underline`
- `strikethrough`
- `inverse`
- wrapping and truncation mode

Supported color formats include:

- named colors
- hex colors
- `rgb(...)`
- `ansi256(...)`

### Borders and Backgrounds

Key files:

- `tui/ink/src/render-border.ts`
- `tui/ink/src/render-background.ts`

Borders and backgrounds are not layout features in the final rendering phase. They are painted manually after layout is computed.

This is a major conceptual difference from the browser.

Implications:

- border visuals come from terminal characters, often via `cli-boxes`
- background fills are just strings of spaces with background color applied
- beautiful UI in Ink is about composition, spacing, borders, contrast, and motion inside a character grid

### What Styling Is Not

Ink styling is not:

- CSS selectors
- cascading stylesheets
- pixel-based design
- arbitrary typography
- browser z-index layering

It is a controlled set of layout and text props plus manual terminal painting.

## Interactivity Model

Ink is strong for keyboard-driven apps.

### Keyboard Input

Key files:

- `tui/ink/src/hooks/use-input.ts`
- `tui/ink/src/input-parser.ts`
- `tui/ink/src/parse-keypress.ts`
- `tui/ink/src/components/App.tsx`

`useInput(...)` gives you:

- normal typed characters
- arrows
- return
- escape
- tab
- home and end
- page up and page down
- backspace and delete
- ctrl, shift, meta
- extra kitty protocol fields like `super`, `hyper`, `capsLock`, `numLock`, and `eventType`

Ink enables raw mode while input hooks are active and routes input through parsed events.

Important detail:

- input-triggered state updates are pushed through React discrete updates so they get high priority.

### Paste Handling

Key files:

- `tui/ink/src/hooks/use-paste.ts`
- `tui/ink/src/components/App.tsx`

Ink supports bracketed paste mode and can route pasted text separately from normal key events.

### Focus Management

Key files:

- `tui/ink/src/hooks/use-focus.ts`
- `tui/ink/src/hooks/use-focus-manager.ts`

Ink supports focusable components and tab-based focus navigation.

This is useful for:

- text input widgets
- menus
- panes
- modal controls

### Cursor Control

Key file: `tui/ink/src/hooks/use-cursor.ts`

Ink lets components set a cursor position relative to the rendered frame.

This is important for:

- real text input experiences
- IME support
- richer prompt editors

### Animation

Key file: `tui/ink/src/hooks/use-animation.ts`

Ink supports animation via a shared scheduler.

That makes it suitable for:

- spinners
- pulsing status indicators
- animated transitions within modest terminal constraints

### Measurement and Resize Awareness

Key files:

- `tui/ink/src/measure-element.ts`
- `tui/ink/src/hooks/use-box-metrics.ts`

Ink gives you layout measurements after render, which is critical for adaptive terminal UI.

This matters more in a terminal than in a browser because width changes are frequent and the entire app may need to reflow on terminal resize.

## Alternate Screen and Full-Screen Apps

Key files:

- `tui/ink/readme.md:2669-2687`
- `tui/ink/src/ink.tsx`

Ink supports alternate-screen mode, which is how apps like `vim`, `less`, and `htop` work.

What alternate screen means:

- the app renders on a separate screen buffer
- the shell's previous content is restored when the app exits
- scrollback is not available while the app is running in alternate screen
- teardown-time output is intentionally treated as disposable

For Buli, this is the right option when the product should feel like a real terminal app rather than a one-shot inline CLI.

Important product consequence:

- if scrollback is not available, the app needs its own viewport and history behavior

Buli now owns a first transcript viewport layer directly inside `packages/ink-tui`.

That means:

- `Up` and `Down` scroll one row at a time
- `PageUp` and `PageDown` scroll by one visible viewport page
- `Home` jumps to the oldest visible rows
- `End` jumps back to the newest visible rows
- when the viewport is already following the newest rows, streamed assistant text stays pinned to the bottom
- when the user scrolls upward, new streamed text does not yank the viewport back to the bottom

## Screen Reader Support

Key files:

- `tui/ink/readme.md:2954-3062`
- `tui/ink/src/render-node-to-output.ts`
- `tui/ink/src/components/Box.tsx`
- `tui/ink/src/components/Text.tsx`

Ink has basic screen reader support.

Important reality:

- this is not full native accessibility
- this is a secondary text serialization path with a small ARIA-like subset

Ink supports:

- `aria-label`
- `aria-hidden`
- `aria-role`
- `aria-state`
- `useIsScreenReaderEnabled()`

This is useful, but it is not equivalent to browser accessibility.

## `renderToString()` and Testing

Key files:

- `tui/ink/src/render-to-string.ts`
- `packages/ink-tui/test/app.test.tsx`

`renderToString()` is the synchronous, non-terminal mode.

It does not:

- write to stdout
- set up terminal listeners
- behave like a persistent interactive session

It is good for:

- tests
- snapshots
- docs generation
- verifying shell layout without running a live app

Buli already uses this testing style in `packages/ink-tui/test/app.test.tsx:13-53`.

## What Ink Is Good At

Ink is strong for:

- stateful, componentized terminal apps
- full-screen keyboard-driven UIs
- assistant/chat shells
- task runners and dashboards
- progress views
- structured logs with live status regions
- wizard-style flows
- forms and menus
- text-rich interfaces that benefit from React state management

For Buli specifically, Ink is a good fit because Buli is naturally:

- keyboard-first
- text-first
- streaming-first
- panel-friendly
- full-screen-friendly

## What Ink Is Not Great At

Ink is weaker at:

- mouse-heavy interaction
- browser-like styling expectations
- full accessibility parity
- arbitrary layout transforms that change dimensions
- pixel-driven design systems
- apps that depend on a large set of built-in widgets from the core library

These are not accidental weaknesses. Most of them come from the terminal model itself.

## Limitations and Where They Come From

### 1. Terminal Cell Grid

The terminal is a grid of character cells, not a pixel canvas.

This causes limits around:

- typography
- exact iconography
- overlapping visuals
- high-fidelity motion
- fine-grained visual layering

### 2. Terminal Capability Variance

Different terminals vary in:

- color support
- emoji and wide-character rendering
- cursor behavior
- reflow behavior during resize
- support for advanced protocols like kitty keyboard

### 3. Yoga Limits

Ink inherits some layout limits directly from Yoga.

One explicit example in the docs is unsupported percentage `minWidth` and `maxWidth`.

### 4. `Transform` Must Preserve Dimensions

Because layout happens before terminal painting, a transform that changes size breaks the geometry contract.

### 5. `Static` Is Append-Only

`<Static>` is perfect for logs but not for mutable historical rows.

### 6. Alternate Screen Removes Scrollback

This is expected terminal behavior, not an Ink bug.

If Buli uses alternate-screen mode for a session, it must own transcript navigation itself.

### 7. Basic Accessibility Only

Ink's screen-reader support is useful but intentionally narrow.

### 8. One Live Renderer Per `stdout`

Ink expects one live session per output stream.

This is part of its terminal ownership model.

## Can Ink Be Buli's Main Library?

Yes, with an important qualification.

### Yes: as the Main Renderer

Ink is strong enough to be Buli's main terminal rendering engine.

That means it can be the foundation for:

- full-screen shell layout
- transcript rendering
- live streaming updates
- prompt/composer interaction
- keyboard navigation
- alternate-screen app lifecycle

### No: as the Only Abstraction

Ink should not be the only abstraction product code depends on.

Buli still needs its own:

- theme tokens
- layout primitives
- prompt widget
- transcript viewport
- message components
- status surfaces
- focus rules
- app shell patterns

So the correct model is:

- Ink as the rendering kernel
- `packages/ink-tui` as Buli's owned UI framework

## What Beautiful Terminal UI Means Here

"Beautiful" in Ink should not mean "looks like a web app in the terminal".

It should mean:

- strong layout hierarchy
- stable and flicker-free redraws
- clear contrast and semantic color
- careful spacing and rhythm
- polished borders and surfaces
- clean status signaling
- graceful resize behavior
- smooth streaming output
- fast keyboard control
- a confident full-screen app feel

Ink can absolutely support that.

What it will not give is browser-grade visual freedom.

## Buli-Specific Gap Analysis

Today Buli is using only a small fraction of what Ink can do.

### Current State

`packages/ink-tui` currently has:

- a fullscreen shell in `packages/ink-tui/src/ChatScreen.tsx`
- bordered message blocks in `packages/ink-tui/src/components/ConversationTranscriptPane.tsx`
- a dedicated prompt input dock in `packages/ink-tui/src/components/PromptDraftPane.tsx`
- a compact footer status strip in `packages/ink-tui/src/components/ChatSessionStatusBar.tsx`

That means the biggest current constraints are in the Buli app layer, not in Ink itself.

### What Buli Needs Next

If Buli should feel like a fuller alternate-screen terminal application, the next product-level capabilities are:

1. a real full-screen shell
2. a transcript viewport with in-app scrolling
3. a richer composer
4. a visual system with surfaces, borders, spacing, and semantic colors
5. better message rendering for user, assistant, error, and streaming states
6. resize-aware layout behavior
7. explicit keyboard navigation and shortcuts
8. a decision on persistence versus ephemeral sessions

### What Ink Already Covers for Those Needs

Ink already provides the pieces for:

- layout
- redraws
- input
- cursor control
- sizing
- alternate screen
- testing

So the work is mainly composition and product design, not inventing a renderer from scratch.

### Where Buli May Eventually Hit Real Renderer-Level Limits

Possible future pain points are:

- custom scrolling behavior for large transcripts
- richer input editing than a minimal prompt line
- custom redraw optimizations for long streaming outputs
- deeper accessibility needs
- terminal-specific protocol handling

Those are valid reasons to patch or fork Ink later, but they are not blockers to starting.

## Reading Order for Deep Understanding

This is the most efficient reading order if the goal is genuine understanding instead of random file browsing.

### Pass 1: Understand Buli's Current Usage

Read:

1. `apps/cli/src/commands/chat.ts`
2. `packages/ink-tui/src/index.ts`
3. `packages/ink-tui/src/ChatScreen.tsx`
4. `packages/ink-tui/src/components/ConversationTranscriptPane.tsx`
5. `packages/ink-tui/src/components/PromptDraftPane.tsx`
6. `packages/ink-tui/src/components/ChatSessionStatusBar.tsx`
7. `packages/ink-tui/src/chatScreenState.ts`

### Pass 2: Read the Public Ink Model

Read the README sections for:

1. components
2. hooks
3. render options
4. alternate screen
5. `renderToString()`
6. screen reader support

The main file is:

- `tui/ink/readme.md`

### Pass 3: Read the Core Runtime Spine

Read in this order:

1. `tui/ink/src/index.ts`
2. `tui/ink/src/render.ts`
3. `tui/ink/src/ink.tsx`
4. `tui/ink/src/reconciler.ts`
5. `tui/ink/src/dom.ts`
6. `tui/ink/src/styles.ts`

This is the "how React becomes terminal output" layer.

### Pass 4: Read the Rasterizer

Read in this order:

1. `tui/ink/src/renderer.ts`
2. `tui/ink/src/render-node-to-output.ts`
3. `tui/ink/src/output.ts`
4. `tui/ink/src/render-border.ts`
5. `tui/ink/src/render-background.ts`
6. `tui/ink/src/squash-text-nodes.ts`
7. `tui/ink/src/wrap-text.ts`

### Pass 5: Read Interactivity and Utilities

Read:

1. `tui/ink/src/components/App.tsx`
2. `tui/ink/src/hooks/use-input.ts`
3. `tui/ink/src/hooks/use-paste.ts`
4. `tui/ink/src/hooks/use-focus.ts`
5. `tui/ink/src/hooks/use-focus-manager.ts`
6. `tui/ink/src/hooks/use-cursor.ts`
7. `tui/ink/src/hooks/use-animation.ts`
8. `tui/ink/src/measure-element.ts`
9. `tui/ink/src/hooks/use-box-metrics.ts`
10. `tui/ink/src/render-to-string.ts`
11. `tui/ink/src/log-update.ts`

If time is short, the five most important files are:

1. `tui/ink/src/render.ts`
2. `tui/ink/src/ink.tsx`
3. `tui/ink/src/reconciler.ts`
4. `tui/ink/src/render-node-to-output.ts`
5. `tui/ink/src/output.ts`

## Treating Ink as Our Own Code

Yes, Ink is patchable enough to be treated as owned infrastructure.

Its architecture has clean seams.

### Best Patch Points

#### Public API Surface

Key file: `tui/ink/src/index.ts`

Use this when you want to:

- expose new helpers
- hide upstream APIs behind your own exports
- standardize the library surface for internal consumers

#### Runtime and Terminal Lifecycle

Key files:

- `tui/ink/src/render.ts`
- `tui/ink/src/ink.tsx`

Use this when you want to change:

- alternate-screen policy
- interactive detection
- render throttling
- teardown behavior
- console patching behavior
- stream ownership rules

#### React Host Behavior

Key file: `tui/ink/src/reconciler.ts`

Use this when you want to change:

- how host nodes are created
- update behavior during commit
- static behavior
- reset-after-commit behavior
- lifecycle boundaries between React commit and terminal render

#### Layout and Style Mapping

Key file: `tui/ink/src/styles.ts`

Use this when you want to add or change:

- supported style props
- Yoga mappings
- layout semantics
- dimension behavior

#### Output Engine

Key files:

- `tui/ink/src/renderer.ts`
- `tui/ink/src/render-node-to-output.ts`
- `tui/ink/src/output.ts`

Use this when you want to change:

- clipping
- background behavior
- border behavior
- layering
- write ordering
- screen reader serialization
- virtual frame behavior

#### Redraw Strategy

Key file: `tui/ink/src/log-update.ts`

Use this when you want to change:

- full redraw vs incremental redraw rules
- cursor write policy
- flicker characteristics

#### Input Stack

Key files:

- `tui/ink/src/components/App.tsx`
- `tui/ink/src/input-parser.ts`
- `tui/ink/src/parse-keypress.ts`
- `tui/ink/src/hooks/use-input.ts`

Use this when you want to change:

- key parsing
- protocol support
- input routing
- richer keyboard semantics

#### Accessibility

Key files:

- `tui/ink/src/components/Box.tsx`
- `tui/ink/src/components/Text.tsx`
- `tui/ink/src/render-node-to-output.ts`

Use this when you want richer accessible serialization.

## Wrapper vs Fork

This is the key architectural decision.

### What Should Live in `packages/ink-tui`

These are Buli concerns and should stay in the app-facing package:

- app shell layout
- transcript components
- composer widget
- status bars
- panels and dividers
- theme tokens
- message presentation
- navigation rules
- product-specific shortcuts

### What Justifies Touching Ink Itself

These are renderer-level concerns and justify patching or forking Ink:

- alternate-screen lifecycle behavior
- redraw performance problems
- missing layout primitives in the renderer
- richer input protocol support
- accessibility serialization changes
- deep output-engine behavior

## Recommended Fork Strategy for Buli

Because Buli now supports an optional alternate-screen fullscreen mode and the team is willing to own the stack, the clean long-term strategy is:

1. keep `packages/ink-tui` as the Buli UI layer
2. stop relying on an ignored checkout as the canonical place for runtime learning
3. promote Ink into a tracked internal workspace package if and when you want ownership

### What Not to Do

- Do not treat `tui/ink/` as the canonical fork forever.
- `tui/` is ignored in `.gitignore`, so changes there are intentionally disposable.

### Better Structure

If Buli decides to own Ink, create a tracked workspace package such as:

- `packages/ink-core`
- or `packages/ink`

Then:

- make `packages/ink-tui` depend on that tracked package
- keep `tui/ink/` only as an upstream reference checkout, if still needed

### Why This Is Better

- one source of truth
- one runtime to test
- one codebase to patch
- no drift between the code you study and the code you ship

## Recommendation for Buli

Given the stated product direction, this is the recommendation.

### Product Direction

- Buli should use fullscreen alternate-screen mode by default.
- Buli should treat Ink as the renderer, not the whole framework.
- Buli should own the UI layer in `packages/ink-tui`.

### Architectural Direction

Short term:

1. keep building on Ink
2. keep alternate-screen fullscreen behavior as the default interactive mode
3. build Buli's real shell, viewport, composer, and theme layer

Medium term:

1. decide whether to stay on npm Ink or promote a tracked internal Ink package
2. unify the code you study and the code you ship

Long term:

1. patch Ink only for renderer-level problems
2. keep product-level UI in `packages/ink-tui`

## Practical Next Steps for Buli

If implementation starts from here, the most sensible order is:

1. keep alternate-screen mode as the default render behavior for Buli
2. refactor `packages/ink-tui/src/ChatScreen.tsx` into a true full-screen shell
3. add a transcript viewport with explicit scrolling behavior
4. replace the current prompt line with a real input component
5. introduce owned visual primitives and theme tokens
6. decide whether transcript history is ephemeral, persisted, or restorable
7. decide whether to unify on a tracked internal Ink package

## Final Verdict

Ink is strong enough to be Buli's main terminal rendering engine.

Ink is not enough to be Buli's complete product framework by itself.

That is not a weakness. It is the normal division of responsibility.

The right model for Buli is:

- Ink as the rendering kernel
- `packages/ink-tui` as the owned product UI framework
- possibly a tracked internal Ink fork later if renderer-level ownership becomes useful

For a full-screen alternate-screen assistant application, this is a good stack.

The biggest remaining constraints come from the terminal medium itself, not from some fundamental flaw in Ink.
