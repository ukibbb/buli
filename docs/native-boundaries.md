# Native Boundary Readiness

Buli keeps domain orchestration in TypeScript and moves only narrow, measurable hot paths behind typed boundaries. Native implementations should be optional and replaceable; the TypeScript implementation remains the reference and fallback.

## Provider IPC

The provider boundary is ready for external implementations.

- Protocol version: `buli.provider.v1`
- Schema artifact: `packages/contracts/schemas/provider-protocol-v1.schema.json`
- Golden frames: `packages/contracts/test/fixtures/provider-protocol-v1-golden-frames.json`
- Compatibility fixture: `packages/contracts/test/fixtures/contract-compatibility-v1.json`
- Engine client: `packages/engine/src/providerProtocolClient.ts`
- OpenAI TypeScript host: `packages/openai/src/provider/providerProtocolHost.ts`
- CLI subprocess transport: `apps/cli/src/providerProtocol/providerProtocolSubprocessTransport.ts`

Provider hosts communicate over newline-delimited JSON frames on stdin/stdout. Stderr is for diagnostics only and must never contain protocol frames.

Host-to-provider frames:

- `host_list_models`
- `host_start_turn`
- `host_submit_tool_result`
- `host_cancel_turn`

Provider-to-host frames:

- `provider_request_acknowledged`
- `provider_available_models`
- `provider_event`
- `provider_error`
- `provider_turn_closed`

Run the TypeScript OpenAI provider host through the CLI with:

```sh
BULI_PROVIDER_IPC=1 buli
```

Run an external provider host with:

```sh
BULI_PROVIDER_HOST_COMMAND='["/path/to/provider-host"]' buli
```

`BULI_PROVIDER_HOST_COMMAND` is a JSON array of argv strings. When it is set,
the CLI uses provider IPC directly and does not require OpenAI auth. The same
provider host must support `host_list_models`, because model selection is now
part of the process boundary instead of being hard-wired to OpenAI.

External providers should implement the same JSONL protocol and validate against the schema artifact. They should preserve ordered `sequenceNumber` values per `turnId`, acknowledge every host request, and send structured `provider_error` frames instead of process-level crashes whenever possible.

## Durable Contract Artifacts

Language-neutral JSON Schema artifacts live in `packages/contracts/schemas`:

- `provider-protocol-v1.schema.json`
- `assistant-response-event-v1.schema.json`
- `provider-stream-event-v1.schema.json`
- `conversation-session-entry-v1.schema.json`
- `conversation-session-model-selection-v1.schema.json`
- `tool-call-request-v1.schema.json`
- `tool-call-detail-v1.schema.json`
- `workspace-patch-v1.schema.json`

Regenerate them with:

```sh
bun --filter @buli/contracts schema:contracts
```

Tests assert that committed artifacts match the TypeScript/Zod source schemas.

## Session Persistence Contract

The SQLite session schema is published as:

- `apps/cli/schemas/conversation-session-sqlite-v1.sql`

The runtime migration and schema validation in
`apps/cli/src/conversationSession/sqlite/sqliteConversationSessionDatabase.ts`
use the same schema object definitions that generate this artifact. A rewrite
can therefore reproduce the database layout without reading Bun-specific code.

## Native Adapter Convention

Use opt-in environment flags for native implementations and keep TypeScript fallback paths enabled by default.

- Provider subprocess: `BULI_PROVIDER_IPC=1`
- External provider subprocess: `BULI_PROVIDER_HOST_COMMAND='["/path/to/provider-host"]'`
- Future diff engine: `BULI_NATIVE_DIFF_ENGINE=1`
- Future workspace scanner: `BULI_NATIVE_WORKSPACE_SCANNER=1`
- Future export highlighter: `BULI_NATIVE_EXPORT_HIGHLIGHTER=1`

Native adapters should follow this shape:

1. A small typed request/response contract lives in TypeScript.
2. The current TypeScript implementation remains the reference implementation.
3. Golden tests prove native and TypeScript outputs match.
4. Runtime selection is explicit through an env flag or injected dependency.
5. Missing or failing native binaries should not corrupt state; prefer clear failure or fallback depending on the boundary.

## Current Candidate Boundaries

### Diff Engine

Reference implementation: `packages/engine/src/tools/fileMutationDiff.ts`

The diff boundary is pure and suitable for a future Rust implementation. It accepts `displayPath`, optional `beforeText`, and `afterText`, then returns unified diff text plus added/removed line counts.

### Workspace Scanner

Reference implementation: `packages/engine/src/tools/workspaceFileSearch.ts`

This boundary should stay focused on filesystem listing and bounded read windows. Regex grep should continue to use `rg` unless profiling proves the fallback path matters.

### TUI Markdown Parser

Reference implementation: `packages/tui/src/components/primitives/assistantMarkdownRenderSectionBuilder.ts`

The useful future boundary is an incremental parser. A native rewrite that reparses and copies the whole markdown document on every token is not expected to help.

### Export Syntax Highlighter

Reference implementation: `apps/cli/src/conversationSession/export/syntaxHighlight.ts`

This boundary should stay independent of conversation/session types. It accepts code text plus language/file hints and returns a highlighted HTML fragment.
