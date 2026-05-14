# What Is Missing / Current Backlog

This file lists only unfinished work. Completed baseline features such as JSONL sessions, startup resume, corrupt-tail JSONL recovery, `/sessions`, HTML export, typed read/search tools, typed edit/write tools, bash approval, provider interruption handling, graceful active-turn shutdown, incomplete responses, tool denial/failure handling, duplicate-turn prevention, failed-turn recovery, and interrupted dangling-tool hydration are intentionally omitted.

## 1. Persistence Hardening

The durable session layer exists, but it still needs reliability work around per-session settings and larger session lifecycle operations.

- Persist selected model and reasoning settings per session.
- Add session rename, delete, and search flows.
- Add compaction or summarization for very large sessions.

## 2. Patch And Richer File Tools

The core workspace file surface has typed `read`, `glob`, `grep`, `edit`, and `write` tools. Remaining file-tool work should focus on broader multi-file changes and richer validation.

- `apply_patch` for multi-file add/update/delete/move patches
- optional `multiedit` if exact single-replacement `edit` becomes too restrictive
- formatter or diagnostics integration after approved file mutations

Typed read/search/edit/write tools should remain preferred over free-form shell commands for normal workspace inspection and file mutation.

## 3. Stronger Tool Permission Model

As tool coverage grows, Buli needs a clearer permission model across read, write, network, and destructive operations.

- Require explicit approval for file writes.
- Require explicit approval for network side effects.
- Require explicit approval for destructive operations.
- Consider per-session trusted operations.
- Show clear user-facing explanations before approved side effects.
- Add tests for duplicate approval submissions from mixed keyboard and pointer input.
- Add an approval-submitted UI state so controls do not look active after a decision is sent.

## 4. Session Export, Replay, And Debugging

HTML transcript export exists. Remaining debugging and trust features should expose raw data and replayable traces.

- Export raw JSONL/session data from the UI.
- Export markdown or plain-text transcripts.
- Export raw event logs.
- Replay a session from events.
- Inspect provider events versus Buli-normalized events.
- Attach diagnostic logs to a session.

## 5. Remaining Failure-State Hardening

The main conversation lifecycle is now safer, but several failure paths still need explicit handling.

- Classify expired auth and show a clear `buli login` recovery path.
- Classify unavailable or invalid selected models and guide the user to `/model`.
- Handle hard process termination paths that bypass normal TUI renderer shutdown.
- Test terminal resize during streaming, especially sticky scroll and minimum-height rendering.
- Add end-to-end TUI coverage for incomplete response rendering.

## 6. Packaging And Distribution

The project still needs a clear distribution decision before wider use.

- Source-runner only.
- Built CLI bundle.
- Globally linked private command.
- Published package.
- Another local install mechanism.

This decision affects whether generated `dist` files should be committed or treated as local build output.

## Recommended Next Priorities

### Priority 1: Persistence Reliability

Make session storage boringly reliable before expanding the tool ecosystem.

- Per-session model and reasoning settings.

### Priority 2: Patch And Diagnostics

Add `apply_patch` and post-mutation validation after the approved `edit`/`write` path is stable.

### Priority 3: Failure Recovery UX

Normalize auth, model, app-exit, and terminal-resize failures into clear user-facing states with regression tests.

### Priority 4: Debuggability

Add raw export, event replay, and diagnostic bundles so sessions can be debugged without depending only on rendered transcript output.

### Priority 5: Keep TUI Behavior Thin

Maintain the new boundary where domain behavior and state transitions live in testable packages outside OpenTUI components. Current baseline: slash-command application, slash-command refresh, prompt-context refresh decisions, model context-window metadata, keyboard normalization, scroll clamping, cwd labeling, and derived chat-screen view data are outside `ChatScreen.tsx`.
