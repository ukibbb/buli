# Future TUI Improvements

- `useFocus` / `useBlur`: useful only if we want a visible terminal inactive state.
- `useSelectionHandler`: useful only if we want copy/selection UX changes.
- `createScrollbackSurface` / `writeToScrollback`: requires switching toward `split-footer`/scrollback UX, not a small cleanup.
- `@opentui/keymap`: would add a new dependency; current reducer is still simpler.
- Paste metadata handling: ignore or log non-text/binary paste via `PasteEvent.metadata.kind` / `mimeType`; small robustness and security improvement.
- Focus diagnostics: consider OpenTUI's focused-renderable state/events to debug global keyboard routing versus textarea-owned editing.
- Explicit renderer shutdown behavior: set `clearOnShutdown` intentionally, even if we keep the default, so terminal cleanup behavior is documented.
- Terminal-aware theme adaptation: investigate `waitForThemeMode()` and palette APIs if we want good light-terminal support instead of assuming dark tokens.
- `useKeyboard(..., { release: true })`: useful only if we add press/release interactions or held-key state.
- `TimeToFirstDraw` / renderer stats: useful for dev diagnostics, not product UX.
- `useRenderer`: avoid unless needed for renderer-only APIs like focus diagnostics, palette, title, clipboard, or shutdown behavior.
