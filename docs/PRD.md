# PRD: Personal Learning-First Engineering Partner

## Problem Statement

Existing coding agents are built for broad audiences and often optimize for producing code quickly. That is not the primary workflow I want. I want a personal, terminal-first, local-first engineering partner that helps me understand how systems work, why a change or design fits, what other options exist, and what tradeoffs matter.

The product problem is not just "build another coding agent." It is to build a learning-first engineering tool that helps me thrive in AI-era software work by making implementation details, architecture, prompts, tools, context, testing, and tradeoffs understandable while I work. Code changes should be the agreed result of that learning and design process, not the default product goal.

## Solution

Build a local-first, terminal-only learning-first engineering partner for single-user personal use. The MVP should provide a fullscreen TUI, ChatGPT subscription login through browser OAuth, a minimal built-in toolset for inspection and approved application, and local sessions stored in a simple inspectable format.

The architecture should use typed seams and stable local file formats rather than process RPC in the MVP. Core behavior should live outside the TUI framework so the terminal frontend can be replaced later without rewriting the engine. The partner should support local TypeScript extensions that can add tools, commands, prompts, provider behavior, and UI hooks. The codebase should be built with TDD, integration-first testing, and very limited mocking.

## User Stories

1. As a solo developer, I want to start the agent in any project directory and immediately interact with it in a fullscreen terminal UI, so that it feels like a native daily coding tool.
2. As the only intended user, I want the agent to optimize for my workflow instead of generic team workflows, so that I do not have to work around unwanted product decisions.
3. As the owner of the agent, I want the built-in tool set to stay minimal, so that the model only has access to capabilities I explicitly value.
4. As the owner of the product, I want the default built-in tools to support project inspection and approved code application, so that understanding and implementation can happen in one local workflow without unnecessary extras.
5. As a user, I want the agent to use my ChatGPT subscription through browser OAuth, so that I can use the product without managing API keys for MVP.
6. As a user, I want provider-specific auth behavior to stay isolated from the generic runtime, so that future provider changes do not contaminate the whole core.
7. As a user, I want the agent to run entirely on my machine, so that my workflow stays local-first and simple.
8. As a user, I want the agent to store sessions locally, so that I can inspect, back up, and control my history myself.
9. As a user, I want session history to support branching, so that I can continue from an earlier point without losing other exploratory paths.
10. As a user, I want session history to be stored in a human-inspectable format, so that debugging and manual recovery remain practical.
11. As a user, I want the TUI to show messages, streaming output, tool calls, tool results, and session navigation clearly, so that I can understand what the partner is doing in real time.
12. As a user, I want code changes to come after explanation, options, tradeoff analysis, and agreement, so that working with AI builds my judgment instead of replacing it.
13. As a future maintainer of my own tool, I want approvals and stricter safety modes to remain part of the design, so that the system can evolve without redesigning the core.
14. As a user, I want local extensions to add tools, commands, prompts, and UI behavior, so that I can customize the agent without forking the core.
15. As a user, I want extensions to be easy to load from disk, so that experimentation stays fast and low-friction.
16. As a maintainer, I want core modules to have explicit typed contracts, so that implementations can be replaced without hidden coupling.
17. As a maintainer, I want the TUI to be replaceable independently from the engine, so that I can swap terminal technologies later if a better foundation appears.
18. As a maintainer, I want stable contracts and file formats now, so that I can later move to process RPC without throwing away the MVP.
19. As a maintainer, I want most business logic outside the terminal framework, so that behavior can be tested directly without terminal-heavy harnesses.
20. As a maintainer, I want nearly all important behavior covered by tests, so that refactors remain safe.
21. As a maintainer, I want tests to use real behavior through public interfaces whenever possible, so that they survive internal refactors.
22. As a maintainer, I want mocks to exist only at true system boundaries, so that the test suite reflects real behavior instead of invented behavior.
23. As a maintainer, I want persistence-heavy behavior validated with real integration tests, so that session, auth, and tool execution bugs are caught where they actually happen.
24. As a maintainer, I want the architecture to favor deep modules with small interfaces, so that complexity stays hidden behind stable APIs.
25. As a maintainer, I want the product to remain package-distributable first and binary-distributable later if needed, so that packaging choices do not overcomplicate the MVP.
26. As a user, I want the agent to remain simple enough that I can understand and evolve it myself, so that it does not become another opaque platform.
27. As a user, I want to learn from OpenCode, pi, Codex, and similar agents without copying their excess surface area, so that I keep the best ideas and skip the rest.
28. As a future maintainer, I want to preserve the option of replacing a major subsystem with another implementation or stack later, so that the project remains adaptable without being overengineered on day one.

## Implementation Decisions

- The product is terminal-only in the MVP.
- The runtime is local-first and single-user.
- The MVP uses a fullscreen TUI rather than a simple REPL.
- The primary behavior is learning-first: explain how things work, why choices matter, what options exist, and what each option trades off.
- Code mutation is an apply step after agreement, not the default response to a software question.
- The MVP tool surface is `read`, `edit`, `write`, and `bash`.
- The MVP favors a thin product surface and a deep internal core.
- The TUI framework must not own core agent behavior.
- The core architecture uses typed seams and stable file formats, not process RPC, in the MVP.
- True cross-stack replaceability from day one is required primarily at the TUI boundary.
- Future migration to process RPC should be enabled by clean contracts, serializable events, and a UI-agnostic engine.
- Provider-specific behavior must remain isolated from the generic runtime rather than being hardcoded across the system.
- ChatGPT subscription support should use browser OAuth with normalized credential storage and token refresh behavior.
- Local session persistence should use a branching tree model backed by append-friendly local storage.
- The preferred session shape is an inspectable event-oriented format with stable identifiers and parent relationships.
- Extensibility should follow a pi-style local extension model first.
- Extensions should be able to register tools, commands, prompts, provider hooks, and UI hooks.
- Packaging and marketplace-style extension distribution are not required for MVP.
- The architecture should prefer concrete modules inside bounded contexts and only introduce interfaces at real seams.
- Stable contracts should exist for user turns, streaming assistant output, tool execution, session events, auth state, and provider responses.
- The engine should own orchestration, tool execution, provider calls, auth, and persistence.
- The TUI should consume state and events and render them, not own business logic.
- The stack decision for the final TUI foundation should follow a short spike rather than assumption.
- The current best default is TypeScript for the core because it best fits local extensions, reference implementations, and fast iteration.
- The final TUI choice should be decided after comparing `Ink`, `OpenTUI`, and `Bubble Tea` with the same small vertical slice.

## Testing Decisions

- Good tests verify observable behavior through public interfaces and do not depend on internal structure.
- The development workflow should follow TDD with vertical slices: one behavior, one failing test, one minimal implementation, then refactor.
- Most important modules should be covered by tests.
- Persistence-heavy, ownership-sensitive, and transaction-like flows should use real integration tests rather than mock-heavy unit tests.
- The agent runtime should be tested through real turn execution and event emission.
- The tool runtime should be tested against real temporary workspaces and real subprocess behavior where practical.
- Session persistence and branching should be tested with real on-disk files.
- Auth and provider behavior should be tested with local test servers and real serialization paths.
- Extension loading should be tested by loading real extension modules from disk.
- TUI behavior should be tested mostly through state models, presenters, render snapshots, and a small number of end-to-end terminal smoke tests.
- Mocks should be limited to true boundaries such as remote HTTP endpoints, browser-open callbacks, time, and randomness.
- Internal collaborators should not be mocked by default.
- A good test in this project should read like a specification of behavior and continue passing through internal refactors.
- Prior art for this testing style exists in the bundled reference examples: pi's session and extension model, OpenCode's provider/auth separation, and Codex's TUI-state and terminal-behavior emphasis.

## Out of Scope

- Multi-user collaboration
- Cloud-hosted runtime
- Web or desktop clients
- Broad provider support beyond the initial ChatGPT subscription path
- MCP and LSP support in the MVP
- Subagents and plan mode in the MVP
- Rich permission policy systems in the MVP
- Fully autonomous coding-first workflows as the default product posture
- Marketplace-style package discovery
- Remote execution infrastructure
- Production process-RPC architecture in the MVP
- Enterprise auth, team controls, or hosted dashboards
- Telemetry and growth analytics
- Full packaging across all operating systems before the core product is proven

## Further Notes

- The architecture should copy the philosophy of pi more than the platform breadth of OpenCode or Crush.
- The TUI should learn from Codex and other mature terminal tools about scrollback, fullscreen behavior, and transcript usability.
- Replaceability should be real where it matters, but abstract interfaces should not be added purely for theoretical substitution.
- The right MVP is the smallest one that preserves the future path to deeper customization.

## Migration To Process RPC

The MVP should remain in-process, but it should be designed so that the `TUI <-> engine` seam can later be promoted into a process boundary.

A later migration would require:

- freezing serializable request, response, event, and error contracts
- promoting direct method calls across the seam into protocol messages
- choosing a local transport such as `stdio` or Unix sockets
- supporting request-response, server-pushed events, streaming output, cancellation, and liveness detection
- adding protocol versioning
- making the engine process the owner of auth, provider calls, persistence, and tool execution
- ensuring the TUI consumes only typed state and events
- adding cross-process integration tests for startup, shutdown, reconnection, streaming, cancellation, and resume
- deciding which process owns credentials and permission policy

The MVP should make that future migration easier by following these rules:

- boundary types must be plain serializable data
- no TUI-library objects may appear in core contracts
- no closures or framework callbacks may cross module seams
- engine events must be explicit domain events rather than implicit callbacks
- error models must be structured and typed
- session and config formats must be stable and documented
