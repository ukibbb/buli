# OpenTUI Deep Dive for Buli

This document explains what OpenTUI is, how it turns code into terminal output, what it can do well, where its limits come from, how patchable it is, and how it compares to Ink for Buli.

## Scope

- The local reference checkout is `tui/opentui/`.
- `tui/opentui/packages/core`
- `tui/opentui/packages/react`
- `tui/opentui/packages/solid`
- This document uses both the local repo and the public docs site at `https://opentui.com/docs`.

## Important Context

OpenTUI is not just a React renderer.

It is a layered stack:

1. a native terminal engine written in Zig
2. a TypeScript core API over that native engine
3. optional framework bindings for React and Solid

The repo says this directly in:

- `tui/opentui/README.md`
- `tui/opentui/packages/core/README.md`

This is the biggest architectural difference from Ink.

## What OpenTUI Actually Is

OpenTUI is closer to a terminal application platform than a small rendering library.

It includes:

- a terminal renderer
- terminal capability detection
- screen-mode ownership
- keyboard parsing
- mouse handling
- hit testing
- selection and clipboard support
- a console overlay
- a renderable tree model
- Yoga-based layout
- built-in higher-level widgets

From the repo shape alone, you can see this is broader than Ink:

- `packages/core/src/renderer.ts`
- `packages/core/src/Renderable.ts`
- `packages/core/src/renderables/*`
- `packages/core/src/console.ts`
- `packages/core/src/lib/*`
- `packages/core/src/zig/*`

## Why This Matters for Buli

For a full-screen alternate-screen assistant app, OpenTUI is naturally aligned with the product shape.

It already has direct concepts for:

- alternate-screen apps
- scrollable regions
- split-footer terminal ownership
- text input and textarea widgets
- code and diff viewers
- mouse interaction
- selection
- console/debug overlays

That means a lot of the infrastructure Buli would need is already part of the stack, rather than something to build on top of a smaller renderer.

## The Three Authoring Models

OpenTUI can be used in three different ways.

### 1. Imperative Core API

You create `Renderable` instances directly, pass a `RenderContext`, and compose them with `add()`.

This is the most direct API and the one closest to the engine.

Important files:

- `tui/opentui/packages/core/src/Renderable.ts`
- `tui/opentui/packages/core/src/renderables/*`

### 2. Declarative Constructs API

OpenTUI also has a declarative construct layer in `packages/core`, built on VNodes and factory functions.

Important files:

- `tui/opentui/packages/core/src/renderables/composition/constructs.ts`
- `tui/opentui/packages/core/src/renderables/composition/vnode.ts`

Important idea:

- constructs build lightweight VNodes
- those VNodes are instantiated into real renderables only when mounted
- pending method calls and delegated APIs can be queued and replayed later

This is described well in the public docs page:

- `https://opentui.com/docs/core-concepts/renderables-vs-constructs`

### 3. Framework Bindings

There are framework bindings for React and Solid.

Important files:

- `tui/opentui/packages/react/src/reconciler/*`
- `tui/opentui/packages/react/src/components/*`
- `tui/opentui/packages/solid/*`

In those bindings, JSX intrinsic elements map to core renderables.

That means React and Solid are authoring layers on top of the same core engine, not separate renderers with separate concepts.

## Core Mental Model

The shortest useful mental model is:

```text
React / Solid / constructs / imperative renderables
-> Renderable tree
-> Yoga layout
-> render commands
-> OptimizedBuffer
-> Zig native renderer
-> ANSI output to terminal
```

This is the key difference from Ink.

Ink is mostly a React renderer that serializes a frame in JavaScript.

OpenTUI is:

- a TS object model
- over a native frame engine
- with framework bindings on top

## End-to-End Pipeline

This is the full answer to "how does React code turn into terminal output in OpenTUI?"

### 1. Renderer Creation

The runtime starts with `createCliRenderer()` in:

- `tui/opentui/packages/core/src/renderer.ts`

What it does:

- reads terminal width and height from `stdout`
- resolves screen mode
- loads the native Zig library through FFI
- calls Zig `createRenderer(...)`
- configures threading and Kitty keyboard flags
- creates a `CliRenderer`
- runs terminal setup unless in testing mode

So the very first thing OpenTUI does is create a native renderer instance and bind a JS runtime object around it.

### 2. `CliRenderer` Owns the Session

The main runtime class is `CliRenderer` in:

- `tui/opentui/packages/core/src/renderer.ts`

It owns:

- stdin and stdout
- the root render tree
- the render loop
- terminal modes
- mouse handling
- selection
- the console overlay
- resize handling
- focus tracking
- clipboard support
- native render buffers

This is more than a renderer. It is the terminal session runtime.

### 3. Code Builds a `Renderable` Tree

Regardless of whether you use imperative core APIs, constructs, React, or Solid, OpenTUI ends up with a tree of `Renderable` objects.

Core file:

- `tui/opentui/packages/core/src/Renderable.ts`

Each renderable:

- has a Yoga node
- can have children
- can receive input
- can be focusable
- can be selectable
- can be buffered
- can draw itself into a buffer

### 4. React JSX Maps to Core Renderables

In the React binding, `createRoot(renderer).render(<App />)` lives in:

- `tui/opentui/packages/react/src/reconciler/renderer.ts`

The actual host mapping lives in:

- `tui/opentui/packages/react/src/reconciler/host-config.ts`
- `tui/opentui/packages/react/src/components/index.ts`

How it works:

- JSX intrinsic tags like `box`, `text`, `scrollbox`, `input`, and `textarea` are looked up in a component catalogue
- `createInstance()` constructs the corresponding core renderable class
- `appendChild()` and `insertBefore()` call the core tree mutation methods directly
- `commitUpdate()` updates instance properties and requests a render
- `resetAfterCommit()` calls `containerInfo.requestRender()`

So React is not rendering directly to the terminal.

It is creating and updating the same core renderables the imperative API would create.

### 5. Text Is Its Own Mini-Tree

Text in OpenTUI is more sophisticated than plain strings.

Important files:

- `tui/opentui/packages/core/src/renderables/Text.ts`
- `tui/opentui/packages/core/src/renderables/TextNode.ts`
- `tui/opentui/packages/react/src/components/text.ts`

How it works:

- text modifiers like `span`, `b`, `i`, `u`, `a`, and `br` become `TextNodeRenderable` instances
- those nodes carry inherited style information like fg, bg, attributes, and links
- on lifecycle pass, the text node tree is flattened into styled chunks
- those chunks are pushed into a native `TextBuffer`

So text rendering is not just a single string write. It is a structured text pipeline.

### 6. Layout Is Yoga-Backed

Each renderable owns a Yoga node.

Important files:

- `tui/opentui/packages/core/src/Renderable.ts`
- `tui/opentui/packages/core/src/lib/yoga.options.ts`

Style-like props are mapped into Yoga:

- width and height
- min and max dimensions
- flex grow and shrink
- flex direction and wrap
- justify and align
- position
- overflow
- margin and padding

The root node is `RootRenderable`, which calculates the full layout tree.

### 7. `RootRenderable` Runs the Frame Pipeline

The actual frame pipeline lives in:

- `tui/opentui/packages/core/src/Renderable.ts`

`RootRenderable.render()` does three main things:

1. run lifecycle passes
2. calculate Yoga layout if dirty
3. traverse the tree, collect render commands, and execute them into the frame buffer

The source comment explicitly says this is a 3-pass rendering process.

That is one of the most important files in the repo.

### 8. Renderables Draw into `OptimizedBuffer`

The draw target is `OptimizedBuffer`.

Important files:

- `tui/opentui/packages/core/src/buffer.ts`
- `tui/opentui/packages/core/src/zig/buffer.zig`

This is an intermediate framebuffer, not stdout itself.

Renderables call methods like:

- `drawText(...)`
- `fillRect(...)`
- `drawFrameBuffer(...)`
- `drawBox(...)`
- `drawTextBuffer(...)`

The JS class is a wrapper over a native Zig buffer pointer.

### 9. Zig FFI Bridges TS and Native

The TypeScript FFI layer lives in:

- `tui/opentui/packages/core/src/zig.ts`

It does three essential things:

1. loads the platform-specific native library via Bun FFI
2. declares the native symbol table
3. wraps native pointers and structs into TS-friendly methods

This is the hard boundary where JS objects and strings become raw native data.

### 10. Zig Owns Final Frame Output

The native export layer is:

- `tui/opentui/packages/core/src/zig/lib.zig`

The actual native renderer is:

- `tui/opentui/packages/core/src/zig/renderer.zig`

This is where OpenTUI becomes a real native terminal engine.

What the Zig renderer owns:

- current and next render buffers
- terminal state
- hit grid buffers
- cursor state
- output buffers
- optional render thread

Its core job is:

- diff `nextRenderBuffer` against `currentRenderBuffer`
- emit ANSI only for changed cells
- write the final output efficiently
- update cursor state
- clear and swap buffers for the next frame

This is fundamentally richer than a JS-only frame serializer.

### 11. Terminal Capabilities and Modes Are Explicit

Terminal handling is not implicit. It has its own native model in:

- `tui/opentui/packages/core/src/zig/terminal.zig`

Capabilities tracked include:

- Kitty keyboard
- Kitty graphics
- RGB color
- Unicode width mode
- SGR pixel support
- color scheme updates
- explicit width support
- focus tracking
- bracketed paste
- hyperlinks
- OSC52

This is one of OpenTUI's strongest differentiators.

## Styling and Layout Model

OpenTUI styling is prop-based, not CSS-based.

### Layout Styling

Layout is driven through Yoga-backed properties on `Renderable`.

Key file:

- `tui/opentui/packages/core/src/Renderable.ts`

Main supported families:

- width and height
- min and max size
- flex grow and shrink
- flex direction and wrapping
- align and justify
- margin and padding
- relative and absolute positioning
- overflow clipping
- z-index ordering
- opacity
- translation offsets

This is a layout API, not a stylesheet system.

### Box Styling

`BoxRenderable` adds a richer surface model than Ink's `Box`.

Key file:

- `tui/opentui/packages/core/src/renderables/Box.ts`

It supports:

- background color
- border presence per side
- border style
- custom border characters
- titles and bottom titles
- focused border color
- gap, row gap, and column gap
- focusability

Important detail:

- Yoga borders are set so the box's layout knows about its border thickness
- actual border painting happens in the draw step through `buffer.drawBox(...)`

### Text Styling

Text styling is chunk-based.

Key files:

- `tui/opentui/packages/core/src/renderables/Text.ts`
- `tui/opentui/packages/core/src/renderables/TextNode.ts`
- `tui/opentui/packages/core/src/renderables/TextBufferRenderable.ts`

Text styling supports:

- foreground color
- background color
- text attributes like bold, dim, italic, underline, blink, inverse, hidden, strikethrough
- links
- wrap mode
- truncation
- tab indicator configuration
- selection colors

This is structurally richer than Ink's transform-based text styling because it flows through a text buffer and chunk model.

### Buffering, Clipping, and Opacity

Every renderable can also participate in:

- buffering into its own framebuffer
- scissor clipping
- opacity stacks
- z-index ordering

Important file:

- `tui/opentui/packages/core/src/Renderable.ts`

This is closer to a retained-mode scene graph than to a plain tree of layout boxes.

## Input and Interaction Model

OpenTUI has a much broader interaction model than Ink.

### Keyboard Input

Important files:

- `tui/opentui/packages/core/src/lib/stdin-parser.ts`
- `tui/opentui/packages/core/src/lib/parse.keypress.ts`
- `tui/opentui/packages/core/src/lib/parse.keypress-kitty.ts`
- `tui/opentui/packages/core/src/lib/KeyHandler.ts`
- `tui/opentui/packages/core/src/renderer.ts`

The input pipeline handles:

- parsed keypresses
- Kitty keyboard protocol
- paste events
- terminal capability responses
- resize and focus-related sequences

Unlike Ink, OpenTUI models key, mouse, paste, and terminal responses as separate categories at the parser level.

### Mouse Support

Important files:

- `tui/opentui/packages/core/src/lib/parse.mouse.ts`
- `tui/opentui/packages/core/src/renderer.ts`

OpenTUI has first-class mouse handling.

Supported event types include:

- down
- up
- move
- drag
- drag-end
- drop
- over
- out
- scroll

The runtime also has:

- hit testing
- mouse capture during drag
- hover recheck after hit-grid changes
- optional mouse movement tracking
- auto-focus on click

This is a major difference from Ink.

### Focus

Focusable renderables are part of the core model.

Important file:

- `tui/opentui/packages/core/src/Renderable.ts`

Focus changes:

- attach key and paste handlers to the focused renderable
- propagate focus state upward
- influence rendering through focused states like focused borders

### Selection

Selection is also a renderer-level concern.

Important files:

- `tui/opentui/packages/core/src/lib/selection.ts`
- `tui/opentui/packages/core/src/renderer.ts`
- `tui/opentui/packages/core/src/renderables/TextBufferRenderable.ts`

This enables:

- text selection via mouse dragging
- local selection conversion in text buffers
- selected text extraction
- selection-aware widgets

Ink has no comparable first-class selection system.

### Clipboard

Clipboard support exists through OSC52.

Important files:

- `tui/opentui/packages/core/src/lib/clipboard.ts`
- `tui/opentui/packages/core/src/renderer.ts`

This matters for editor-like or review-heavy tools.

## Screen Modes and Terminal Ownership

OpenTUI explicitly models how much terminal space the app owns.

Key file:

- `tui/opentui/packages/core/src/renderer.ts`

Supported modes:

- `alternate-screen`
- `main-screen`
- `split-footer`

### `alternate-screen`

This is the default and the most app-like mode.

It behaves like `vim` or `htop`:

- separate screen buffer
- restored terminal on exit
- full-screen feel

### `main-screen`

This renders on the main screen without switching buffers.

This is useful for:

- testing
- benchmarking
- tools that want to remain visible in main terminal history

### `split-footer`

This is one of OpenTUI's most distinctive features.

It pins the TUI into a reserved footer while normal output continues above it.

This is very useful for:

- long-running tools with live status panes
- agent tools that still emit command output above the app
- mixed logging and app layouts

OpenTUI can also capture stdout and replay it above the footer.

That is a much richer terminal ownership model than Ink exposes.

## Console Overlay

OpenTUI has a built-in console overlay.

Important file:

- `tui/opentui/packages/core/src/console.ts`

This is not just console interception.

It is a UI surface that can:

- capture `console.*`
- show and hide itself
- be resized
- handle mouse events
- expose cached logs
- support copy and save actions

This is particularly relevant for development, debugging, and advanced full-screen apps.

## Built-in Components

One of OpenTUI's biggest advantages over Ink is the built-in component surface.

The core renderable export list is in:

- `tui/opentui/packages/core/src/renderables/index.ts`

### Core Building Blocks

- `BoxRenderable`
- `TextRenderable`
- `FrameBufferRenderable`

### Scrolling and Navigation

- `ScrollBoxRenderable`
- `ScrollBarRenderable`
- `Slider`

### Input Widgets

- `InputRenderable`
- `TextareaRenderable`
- `SelectRenderable`
- `TabSelectRenderable`

### Code and Review UI

- `CodeRenderable`
- `DiffRenderable`
- `LineNumberRenderable`
- `MarkdownRenderable`

### Presentation Extras

- `ASCIIFontRenderable`
- `TextTable`

This means OpenTUI is much closer to an actual terminal UI toolkit than Ink.

## What OpenTUI Can Achieve

OpenTUI is well suited for:

- full-screen assistant/chat apps
- terminal editors
- diff and code review tools
- dashboards
- scrollable multi-pane layouts
- forms
- menus and tabbed interfaces
- logs with sticky scrolling
- agent tools with debug or console overlays

For Buli specifically, OpenTUI could plausibly support:

- a full-screen transcript viewport
- sticky bottom chat scrolling
- a multiline prompt/composer
- code block and diff rendering inline
- mouse-based selection and copy
- split-footer development or debug modes
- richer focus and navigation patterns

## Limitations and Tradeoffs

OpenTUI is powerful, but it is a heavier stack than Ink.

### 1. Bun-First Runtime

The current core package is Bun-first.

Important files:

- `tui/opentui/packages/core/package.json`
- `tui/opentui/AGENTS.md`

The JS side uses Bun-specific FFI. That is a real adoption constraint.

### 2. Zig Build Dependency

You need Zig to build native code.

Important files:

- `tui/opentui/README.md`
- `tui/opentui/packages/core/docs/development.md`
- `tui/opentui/packages/core/src/zig/build.zig`

This is a much heavier toolchain story than Ink.

### 3. Native Platform Packaging

The package depends on platform-specific native artifacts.

Important file:

- `tui/opentui/packages/core/package.json`

That is manageable, but it increases operational complexity.

### 4. Styling Is Not CSS

OpenTUI is still a prop-based terminal UI system.

It does not give you:

- CSS cascade
- browser layout richness
- pixel-level freedom

It gives you a strong retained-mode terminal scene graph.

### 5. Terminal Capability Variance Still Exists

OpenTUI handles terminal capability detection better than many libraries, but it cannot remove terminal variance.

Important files:

- `tui/opentui/packages/core/src/zig/terminal.zig`
- `tui/opentui/packages/core/docs/development.md`
- `https://opentui.com/docs/reference/env-vars`

Different terminals still vary in:

- width handling
- OSC support
- graphics support
- focus tracking
- Kitty keyboard support
- color depth

### 6. More Surface Area Means More Ownership

Because OpenTUI includes more infrastructure, adopting it means you own more moving parts:

- native renderer
- terminal protocol behavior
- console overlay behavior
- more complex widget behavior
- more complex debugging surface

This is not necessarily bad, but it is a real tradeoff.

### 7. Some Architecture Is Still Evolving

There are comments in the core tree noting future moves such as pushing more layout knowledge into native code to reduce current Yoga-tree update costs.

Important file:

- `tui/opentui/packages/core/src/Renderable.ts`

That suggests the architecture is strong, but still actively evolving.

## Treating OpenTUI as Owned Infrastructure

Yes, OpenTUI is patchable enough to be treated as owned infrastructure.

In some ways, it is even better suited for that than Ink because the seams are clearer and the platform ambitions are broader.

### Best Patch Points

#### Runtime and Terminal Ownership

Key file:

- `tui/opentui/packages/core/src/renderer.ts`

Patch here when you want to change:

- screen mode policy
- resize behavior
- render scheduling
- stdout capture strategy
- mouse or focus policy
- destroy and suspend lifecycle

#### Core Scene Graph

Key file:

- `tui/opentui/packages/core/src/Renderable.ts`

Patch here when you want to change:

- layout integration
- z-index behavior
- clipping
- buffering rules
- opacity behavior
- tree mutation semantics

#### Built-in Widgets

Key directory:

- `tui/opentui/packages/core/src/renderables/`

Patch here when you want to change:

- scroll behavior
- text input behavior
- selection widgets
- code and diff presentation
- box or text behavior

#### Native Frame Engine

Key files:

- `tui/opentui/packages/core/src/zig.ts`
- `tui/opentui/packages/core/src/zig/lib.zig`
- `tui/opentui/packages/core/src/zig/renderer.zig`
- `tui/opentui/packages/core/src/zig/terminal.zig`

Patch here when you want to change:

- terminal diff behavior
- output writing
- cursor handling
- capability detection
- native buffering
- performance characteristics

#### Framework Bindings

Key directories:

- `tui/opentui/packages/react/src/`
- `tui/opentui/packages/solid/src/`

Patch here when you want to change:

- JSX intrinsic element mapping
- property mapping
- custom hooks
- framework-specific ergonomics

#### Plugin and Slot Systems

Key directory:

- `tui/opentui/packages/core/src/plugins/`

Patch here when you want:

- plugin-driven extension points
- host/runtime slot systems
- framework-aware plugin integration

## Reading Order for Deep Understanding

This is the reading order I would use to understand OpenTUI properly.

### Pass 1: Public Model

Read:

1. `tui/opentui/README.md`
2. `tui/opentui/packages/core/README.md`
3. `https://opentui.com/docs/getting-started`
4. `https://opentui.com/docs/core-concepts/renderer`
5. `https://opentui.com/docs/core-concepts/renderables-vs-constructs`

This gives you the conceptual model first.

### Pass 2: Core Runtime Spine

Read:

1. `tui/opentui/packages/core/src/index.ts`
2. `tui/opentui/packages/core/src/renderer.ts`
3. `tui/opentui/packages/core/src/Renderable.ts`
4. `tui/opentui/packages/core/src/buffer.ts`
5. `tui/opentui/packages/core/src/zig.ts`

This is the main runtime architecture.

### Pass 3: Native Engine

Read:

1. `tui/opentui/packages/core/src/zig/lib.zig`
2. `tui/opentui/packages/core/src/zig/renderer.zig`
3. `tui/opentui/packages/core/src/zig/terminal.zig`
4. `tui/opentui/packages/core/src/zig/buffer.zig`

This is where terminal output becomes real.

### Pass 4: Core Widgets

Read:

1. `tui/opentui/packages/core/src/renderables/Box.ts`
2. `tui/opentui/packages/core/src/renderables/Text.ts`
3. `tui/opentui/packages/core/src/renderables/TextNode.ts`
4. `tui/opentui/packages/core/src/renderables/TextBufferRenderable.ts`
5. `tui/opentui/packages/core/src/renderables/ScrollBox.ts`
6. `tui/opentui/packages/core/src/renderables/Input.ts`
7. `tui/opentui/packages/core/src/renderables/Textarea.ts`
8. `tui/opentui/packages/core/src/renderables/Select.ts`
9. `tui/opentui/packages/core/src/renderables/TabSelect.ts`
10. `tui/opentui/packages/core/src/renderables/Code.ts`
11. `tui/opentui/packages/core/src/renderables/Diff.ts`

### Pass 5: Authoring Layers

Read:

1. `tui/opentui/packages/core/src/renderables/composition/constructs.ts`
2. `tui/opentui/packages/core/src/renderables/composition/vnode.ts`
3. `tui/opentui/packages/react/src/reconciler/renderer.ts`
4. `tui/opentui/packages/react/src/reconciler/host-config.ts`
5. `tui/opentui/packages/react/src/components/index.ts`
6. `tui/opentui/packages/react/src/components/text.ts`

### Pass 6: Validation and Edges

Read tests and utilities around:

- mouse
- selection
- screen modes
- console overlay
- input parsing
- runtime plugins

## OpenTUI vs Ink for Buli

This is the most practical comparison for the current product direction.

| Topic | Ink | OpenTUI |
| --- | --- | --- |
| Core architecture | Custom React renderer in JS | Native Zig engine with TS bindings and framework layers |
| Primary abstraction | React host tree | `Renderable` scene graph |
| Authoring styles | Mostly React | Imperative core, constructs, React, Solid |
| Built-in widgets | Minimal primitives | Rich core widget set |
| Mouse support | Minimal in core | First-class |
| Selection | No comparable core system | First-class |
| Screen modes | Mostly normal interactive and alternate-screen behavior | Alternate-screen, main-screen, split-footer |
| Console/debug surface | Console patching | Built-in console overlay |
| Input richness | Strong keyboard hooks | Strong keyboard plus mouse, paste, selection, terminal responses |
| Extensibility | Good | Very good |
| Tooling burden | Lower | Higher |
| Runtime burden | Lower | Higher |
| Best fit | Simpler CLI/TUI renderer | Terminal application platform |

### What Ink Still Has Going for It

- simpler mental model
- simpler dependency stack
- easier adoption if you already live in React and want a smaller surface area
- lighter maintenance burden

### What OpenTUI Gives Buli That Ink Does Not

- first-class scrollboxes
- first-class input and textarea widgets
- code and diff renderables
- mouse and selection support
- split-footer mode
- built-in console overlay
- more explicit terminal capability management
- a more app-platform-like architecture

### What OpenTUI Costs Buli

- Bun-first runtime on the JS side
- Zig/native toolchain ownership
- more moving parts to debug
- more platform-specific concerns

## Recommendation for Buli

Given the stated direction:

- full-screen alternate-screen app by default
- willingness to own the stack
- interest in beautiful terminal UI
- likely need for better scrolling, input, and richer UI widgets

OpenTUI looks like a stronger long-term fit than Ink for Buli.

That does not mean Ink is weak.

It means OpenTUI is solving a problem that is closer to Buli's desired shape.

### Why OpenTUI Looks Stronger for Buli

1. Buli wants to behave like a real full-screen terminal application.
2. Buli will likely want a better transcript viewport than a basic append-only text region.
3. Buli will likely want a richer composer than a simple prompt line.
4. Buli may benefit from code blocks, diffs, selection, mouse support, and debugging surfaces.
5. OpenTUI already has strong answers for those concerns in core.

### Why You Might Still Choose Ink

1. You value a smaller dependency and maintenance surface.
2. You want to stay closer to ordinary React-only workflows.
3. You want to defer native-stack ownership.
4. You do not need OpenTUI's richer widget and runtime surface yet.

## Practical Adoption Strategy for Buli

If Buli were to adopt OpenTUI, the sensible path would be:

1. build a small proof-of-concept full-screen shell
2. implement transcript viewport, composer, and status/footer
3. validate resize behavior, keyboard feel, and render stability
4. test the app in the terminals you care about most
5. only then decide whether to migrate the main TUI stack fully

The biggest thing to validate early is not raw rendering.

It is product feel:

- scrolling
- input editing
- focus behavior
- selection
- redraw smoothness
- terminal compatibility

## Final Verdict

OpenTUI is not just another terminal UI library.

It is a deeper, broader terminal application stack with:

- a native renderer
- a retained-mode UI model
- richer built-in widgets
- richer terminal ownership modes
- richer interaction support

For Buli's stated direction, it looks like a very compelling candidate for the main TUI foundation.

Ink is the simpler path.

OpenTUI is the more powerful path.

Because Buli wants to be a full-screen app and is willing to own infrastructure, OpenTUI currently looks like the stronger long-term bet.
