# OpenAI Conversation Logic

This document describes how `@buli/openai` builds Requests API turns, how it
continues after a tool call, and how to debug the request chain locally.

## Request Shape

The OpenAI provider sends `POST /responses` requests with:

- `instructions`: the system prompt for the current buli session
- `input`: reconstructed conversation items
- `tools`: the local `bash` function definition
- `parallel_tool_calls: false`
- `stream: true`
- `store: false`

For GPT-5 and Codex-style models, buli also requests
`include: ["reasoning.encrypted_content"]` so reasoning items can be carried
forward safely when the model pauses for a tool result.

## History Reconstruction

`packages/openai/src/provider/request.ts` is the source of truth for OpenAI
conversation reconstruction.

The provider uses two related representations:

1. `openAiConversationInputItems`
2. `providerTurnReplay.inputItems`

`openAiConversationInputItems` is the full request payload sent to the next
`/responses` call. It may contain:

- plain `user` messages
- plain `assistant` messages
- `reasoning` replay items
- `function_call` replay items
- `function_call_output` replay items

`providerTurnReplay.inputItems` is the subset persisted onto the final
assistant message for future turns. It intentionally stores only the OpenAI
items that are not already represented elsewhere in buli history:

- `reasoning`
- `function_call`
- `function_call_output`

Assistant text is persisted separately as `assistantMessageText`, so it is not
duplicated inside the stored replay payload.

## Tool Continuation

The OpenAI turn loop lives in `packages/openai/src/provider/turnSession.ts`.

When a streamed step ends with `tool_call_requested`, buli does not feed raw
`response.output` items back into the next request.

Instead it:

1. parses the step output from `parseOpenAiStream(...)`
2. reconstructs typed replay items with
   `createOpenAiResponseReplayItems(...)`
3. appends those sanitized items to the in-flight request history
4. waits for the local tool result
5. appends a fresh `function_call_output`
6. issues the next `/responses` request

This avoids depending on output-only fields returned by OpenAI and keeps the
continuation payload aligned with the manual replay style used by tools like
OpenCode and Pi Agent.

## Why This Fix Exists

The earlier implementation appended raw `response.output` items from the tool
requesting step directly into the next request body.

That was fragile because Responses output items can contain output-only fields
or shapes that are valid in the streamed response but not stable as replay
input. When that happens, the backend may fail to match the submitted
`function_call_output.call_id` to a preceding replayed `function_call`, which
produces errors like:

`No tool call found for function call output with call_id ...`

The reconstructed replay path removes that mismatch.

## Debug Logging

Set this environment variable before running buli:

```bash
export BULI_OPENAI_DEBUG_LOG=1
```

When enabled, the provider will:

- `console.log(...)` each debug entry
- append the same entry to `logs.md` in the current working directory

The current debug entries include:

- each outgoing OpenAI `/responses` request body
- each tool-call terminal state returned by the stream parser
- each appended tool result payload
- each failed OpenAI HTTP response body and request id

This is implemented in `packages/openai/src/provider/debugLog.ts`.
