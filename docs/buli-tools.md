# Buli Tools Comparison

This document compares the tool systems in the ignored `examples/` agent
checkouts and turns them into a practical tool plan for `buli`.

It is written in plain English on purpose. A tool is just a button the model can
press.

Examples:

- `read`: show me this file
- `grep`: search the code for this text
- `edit`: replace this text in this file
- `bash`: run this terminal command
- `task`: ask another agent to investigate
- `memory`: save or recall facts across sessions

The important question for `buli` is not which example has the most tools.

The important question is:

- which small set helps `buli` explain the codebase, compare options, and apply
  agreed changes without creating too much risk or complexity?

## Audit Scope

The source examples audited are:

| Example | Path |
|---|---|
| Codex | `examples/codex` |
| OpenCode | `examples/opencode` |
| KiloCode | `examples/kilocode` |
| Pi Mono | `examples/pi-mono` |
| Crush | `examples/crush` |
| OpenCode Arch | `examples/opencode-arch` |
| Goose | `examples/goose` |
| Hermes Agent | `examples/hermes-agent` |

Confidence level:

| Area | Confidence |
|---|---|
| Built-in registry-level tools | High |
| Exact tool visibility in every runtime config | Medium |
| Plugin/MCP/runtime-provided tools | Medium |

Reason: many examples hide or show tools based on model, client, mode, feature
flag, extension state, MCP server state, plugin state, or local config.

## Current Buli State

`buli` currently has a small real model-visible learning and apply toolbelt: `read`,
`glob`, `grep`, `edit`, `write`, and `bash`.

| Area | Current state |
|---|---|
| Provider tool definition | `bash`, `read`, `glob`, `grep`, `edit`, and `write` in `packages/openai/src/provider/toolDefinitions.ts` |
| Tool request contract | typed request arms for `bash`, `read`, `glob`, `grep`, `edit`, and `write` in `packages/contracts/src/toolCallRequest.ts` |
| Engine runtime | auto-runs read-only tools, approval-gates `edit`/`write`, and keeps bash policy-gated |
| TUI cards | render support for `read`, `grep`, `glob`, `edit`, `write`, `bash`, `todowrite`, and `task` |
| README | describes typed read/search tools plus approved file mutation tools |

Plain meaning:

- Buli now has the minimum local learning/apply loop: inspect, search, explain,
  run shell when appropriate, and apply approved file changes.
- Diffs are attached to mutation tool calls, not encoded as todo items.
- `apply_patch`, subagents, skills, web, LSP, and MCP remain later slices.

## Immediate Recommendation

Before adding more mutation power, the best next product step is to keep the
learning-first agreement gate clear in prompt, docs, and later runtime phases.

The best next mutation tool after that is the multi-file patch tool:

1. `apply_patch`

After that, add full-agent support tools only in separate slices:

1. `webfetch` or `websearch`
2. `skill`
3. `task` or subagents
4. LSP diagnostics
5. MCP/plugin tools

Do not jump straight to Hermes memory, Goose extensions, Codex code mode, or
multi-agent orchestration. Those are useful later, but they are too large before
the local learning/apply loop is boringly reliable.

## Fast Comparison

| Agent | Main tool style | Plain-English summary |
|---|---|---|
| `codex` | shell plus patch plus policy | Strong at controlled shell, patching, permissions, MCP/dynamic tools, and subagents. Not a normal `read`/`grep`/`glob` toolbelt. |
| `opencode` | full TypeScript coding toolbelt | Best TypeScript reference for `read`, `glob`, `grep`, `edit`, `write`, `bash`, `apply_patch`, `task`, `todo`, and `skill`. |
| `kilocode` | productized OpenCode | OpenCode plus IDE/search/recall extras. More powerful, but more product-specific. |
| `pi-mono` | small clean tool architecture | Cleanest simple set: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`. |
| `crush` | full Go coding toolbelt | Good reference for approval UX, read-before-edit, LSP tools, todo, jobs, and MCP gating. |
| `opencode-arch` | older Go OpenCode | Useful historical baseline: `bash`, `view`, `edit`, `patch`, `write`, `glob`, `grep`, `ls`, `agent`. |
| `goose` | extension platform | Small default coding core plus many optional platform extensions. Good for extension/mode thinking, not first Buli slice. |
| `hermes-agent` | full agent platform | Huge tool universe: memory, skills, browser, terminal, files, cron, messaging, delegation. Good later, dangerous to copy first. |

## Capability Matrix

| Capability | Codex | OpenCode | KiloCode | Pi Mono | Crush | OpenCode Arch | Goose | Hermes |
|---|---|---|---|---|---|---|---|---|
| Read local file | no normal text read tool | `read` | `read` | `read` | `view` | `view` | mostly shell plus extensions | `read_file` |
| List/find files | shell, experimental `list_dir` | `read` dirs, `glob` | `read` dirs, `glob` | `find`, `ls` | `glob`, `ls` | `glob`, `ls` | `tree` | `search_files` |
| Search text | shell, not built-in grep | `grep` | `grep` plus extra search | `grep` | `grep` | `grep` | shell or extension tools | `search_files` |
| Edit files | `apply_patch` | `edit`, `write`, `apply_patch` | `edit`, `write`, `apply_patch` | `edit`, `write` | `edit`, `multiedit`, `write` | `edit`, `patch`, `write` | `edit`, `write` | `write_file`, `patch` |
| Shell | strong shell family | `bash` | `bash` | `bash` | `bash` | `bash` | `shell` | `terminal`, `process` |
| Todo/plan | `update_plan` | `todowrite`, `plan_exit` | `todowrite`, `plan_exit` | no core todo | `todos` | no core todo | `todo_write` | `todo` |
| Subagents | yes | `task` | `task`, agent manager | no core | `agent` | `agent` | `delegate`, orchestrator | `delegate_task`, kanban |
| Memory/session recall | not main toolset | skills/session state | recall | no core | no core memory | no core memory | memory/chatrecall | memory/session_search |
| MCP/plugins | strong | plugins | plugins | extensions | MCP | MCP | MCP extensions | MCP/plugins |
| Best first Buli reference | no | yes | maybe later | yes | yes | older yes | no | no |

## Codex

Primary registry:

- `examples/codex/codex-rs/tools/src/tool_registry_plan.rs`

Codex builds a tool registry plan. That means it decides which tool specs the
model can see, then wires those specs to runtime handlers.

### Codex Tool Families

| Tool family | Plain-English meaning |
|---|---|
| `shell`, `shell_command`, `exec_command`, `local_shell`, `write_stdin` | Run terminal commands in different shell/execution modes. |
| `apply_patch` | Edit files using a patch format. |
| `update_plan` | Keep a step-by-step plan updated. |
| `request_user_input` | Ask the user a structured question. |
| `request_permissions` | Ask for permission escalation. |
| `tool_search` | Search available deferred tools, not project files. |
| `list_dir` | Experimental directory listing. |
| `view_image` | Load an image file for the model. |
| MCP tools | Tools coming from external MCP servers. |
| dynamic tools | Tools supplied by a client/runtime at session time. |
| subagent tools | Spawn, message, wait for, close, and list other agents. |
| `exec` / `wait` | Code-mode execution tools. |

### Important Codex Correction

Codex is not the best source for Buli's first `read`, `glob`, and `grep`
implementation.

Why:

- Codex mostly uses shell for file reading and text search.
- Codex has `list_dir`, but it is experimental.
- Codex has `tool_search`, but that searches tool metadata, not project files.
- Codex has `read_mcp_resource`, but that reads MCP resources, not local files.
- Codex has `view_image`, but that is for images, not text files.

### Codex Examples In Plain English

| Situation | What Codex tends to use |
|---|---|
| Show files in a folder | shell command or experimental `list_dir` |
| Search for a string in the repo | shell command like `rg` |
| Change this file | `apply_patch` |
| Need permission | permission/policy flow |
| Too many external MCP tools exist | hide most tools, expose `tool_search` first |
| Need another agent | `spawn_agent`, `send_message`, `wait_agent`, etc. |

### Codex Gates

| Tool or family | Gate |
|---|---|
| shell tools | environment exists and shell type allows it |
| `apply_patch` | environment exists and patch tool type is configured |
| `list_dir` | experimental supported tools contains `list_dir` |
| `request_permissions` | request-permissions tool enabled |
| `js_repl` | JS REPL enabled |
| `tool_search` | search enabled and deferred MCP/dynamic tools exist |
| subagent tools | collaboration tools enabled |
| dynamic tools | supplied by runtime/client |
| MCP tools | configured MCP tools exist |

### Best Codex Lessons For Buli

- Separate tool specs from tool handlers.
- Make permissions visible and enforce them at runtime.
- If there are many tools, do not show all of them to the model.
- Add deferred tool search later for MCP/plugin scale.
- Use Codex later for patch and dynamic tool architecture.

### Do Not Copy First From Codex

- Code mode.
- Multi-agent orchestration.
- Dynamic/MCP deferral.
- Agent job CSV workers.
- Complex shell modes.

## OpenCode

Primary registry:

- `examples/opencode/packages/opencode/src/tool/registry.ts`

OpenCode is the strongest TypeScript reference for a normal coding toolbelt.

### OpenCode Built-Ins

| Tool | Plain-English meaning |
|---|---|
| `invalid` | Internal fallback when tool args are invalid. |
| `question` | Ask the user a question. |
| `bash` | Run shell command. |
| `read` | Read file or directory. |
| `glob` | Find files by pattern. |
| `grep` | Search text in files. |
| `edit` | Replace text in a file. |
| `write` | Write a whole file. |
| `task` | Run a subagent. |
| `webfetch` | Fetch URL content. |
| `todowrite` | Update todo list. |
| `websearch` | Search the web. |
| `skill` | Load skill instructions. |
| `apply_patch` | Apply patch text. |
| `lsp` | Language-server operations. |
| `plan_exit` | Exit plan mode after approval. |

### OpenCode Gates

| Gate | Meaning |
|---|---|
| `question` gate | Only exposed for some clients or env flag. |
| `websearch` gate | Requires OpenCode provider or Exa flag. |
| `apply_patch` gate | Exposed for GPT-style models; hides `edit` and `write`. |
| `lsp` gate | Experimental flag. |
| `plan_exit` gate | Experimental plan mode plus CLI client. |
| plugin tools | Loaded from configured tool directories and plugins. |

### Best OpenCode Lessons For Buli

- Use a central TypeScript registry.
- Treat `read`, `glob`, and `grep` as first-class tools, not shell commands.
- Put model/client/mode/config gates in the registry.
- Keep tool output structured enough for UI and session history.
- Use OpenCode as the main reference for Buli's next coding tools.

## KiloCode

Primary registries:

- `examples/kilocode/packages/opencode/src/tool/registry.ts`
- `examples/kilocode/packages/opencode/src/kilocode/tool/registry.ts`

KiloCode is OpenCode plus product-specific IDE/search/recall tools.

### KiloCode Extra Tools

| Tool | Plain-English meaning |
|---|---|
| `codesearch` | Search external code/docs/API examples. |
| `codebase_search` | Natural-language search over current repo. |
| `semantic_search` | Search local indexed code chunks. |
| `kilo_local_recall` | Search/read old Kilo sessions. |
| `agent_manager` | Start/manage multiple IDE agent sessions. |
| `suggest` | Show user an actionable suggestion. |

### Key KiloCode Differences From OpenCode

| Difference | Meaning |
|---|---|
| `write` remains with `apply_patch` | Kilo hides `edit` but keeps `write` when patch is active. |
| VS Code awareness | `question`, `agent_manager`, and context behavior are IDE-oriented. |
| more search | Adds codebase and semantic search. |
| more recall | Adds local session recall. |
| more product gates | Many tools depend on Kilo-specific config/client state. |

### Best KiloCode Lessons For Buli

- Good reference for productizing an OpenCode-like core.
- Good reference for richer search later.
- Good reference for session recall later.
- Good reference for IDE/editor integration later.

### Do Not Copy First From KiloCode

- Agent Manager.
- Semantic indexing.
- Local recall.
- Suggestion UI.
- Kilo-specific gateway/provider assumptions.

## Pi Mono

Primary registry:

- `examples/pi-mono/packages/coding-agent/src/core/tools/index.ts`

Pi Mono has the cleanest small tool set.

### Pi Mono Tools

| Tool | Plain-English meaning |
|---|---|
| `read` | Read file/image. |
| `bash` | Run command. |
| `edit` | Make targeted text replacements. |
| `write` | Create/overwrite file. |
| `grep` | Search file contents. |
| `find` | Find files by pattern. |
| `ls` | List directory. |

### Pi Mono Tool Groups

| Group | Tools |
|---|---|
| default coding tools | `read`, `bash`, `edit`, `write` |
| read-only tools | `read`, `grep`, `find`, `ls` |
| all tools | all seven |

### Best Pi Mono Lessons For Buli

- Keep the first registry small and understandable.
- Separate tool definitions from active tool selection.
- Have a read-only tool set for plan/explore mode.
- Use `--tools` and `--no-tools` style selection later for safe test modes.

Pi Mono is the best simple architecture reference.

## Crush

Primary registry:

- `examples/crush/internal/agent/coordinator.go`

Crush has a strong practical coding toolbelt with good permission and UX
behavior.

### Crush Built-Ins

| Tool | Plain-English meaning |
|---|---|
| `agent` | Start a task subagent. |
| `bash` | Run shell command. |
| `crush_info` | Show Crush config/status. |
| `crush_logs` | Read Crush logs. |
| `job_output` | Read background command output. |
| `job_kill` | Stop background command. |
| `download` | Download file from URL. |
| `edit` | Replace text in file. |
| `multiedit` | Multiple edits in one file. |
| `fetch` | Fetch URL content. |
| `agentic_fetch` | Use a subagent to fetch/analyze web info. |
| `glob` | Find files by pattern. |
| `grep` | Search file contents. |
| `ls` | List directory. |
| `sourcegraph` | Search public code. |
| `todos` | Maintain task todo list. |
| `view` | Read/view file. |
| `write` | Write file. |
| `lsp_diagnostics` | Show LSP diagnostics. |
| `lsp_references` | Find references. |
| `lsp_restart` | Restart LSP. |
| `list_mcp_resources` | List MCP resources. |
| `read_mcp_resource` | Read MCP resource. |
| `mcp_<server>_<tool>` | Dynamic MCP tool. |

### Crush Gates

| Gate | Meaning |
|---|---|
| `AllowedTools` | Agent only sees tools in its allowlist. |
| default coder agent | Broad tool set. |
| default task agent | Read-only set: `glob`, `grep`, `ls`, `sourcegraph`, `view`. |
| LSP tools | Exposed only when LSP is configured or auto-LSP is on. |
| MCP tools | Controlled by configured MCP servers and per-agent MCP allow rules. |
| permissions | Separate from exposure; permission decides whether execution needs approval. |

### Best Crush Lessons For Buli

- Strong read-before-edit discipline.
- Good approval UX references.
- Good agent allowlist model.
- Good separation of exposure and execution permission.
- Good `view`/`grep`/`glob`/`ls` baseline.
- Good debug tools idea: `crush_info`, `crush_logs`.

## OpenCode Arch

Primary registry:

- `examples/opencode-arch/internal/llm/agent/tools.go`

OpenCode Arch is an older Go implementation. It is useful as a simple
historical baseline.

### OpenCode Arch Coder Tools

| Tool | Plain-English meaning |
|---|---|
| `bash` | Run command. |
| `edit` | Replace text in file. |
| `fetch` | Fetch URL. |
| `glob` | Find files. |
| `grep` | Search text. |
| `ls` | List directory. |
| `sourcegraph` | Search public code. |
| `view` | Read file. |
| `patch` | Apply patch. |
| `write` | Write file. |
| `agent` | Task subagent. |
| `diagnostics` | Optional LSP diagnostics. |
| `<server>_<tool>` | MCP dynamic tools. |

### OpenCode Arch Task Agent Tools

| Tool | Meaning |
|---|---|
| `glob` | find files |
| `grep` | search text |
| `ls` | list directories |
| `sourcegraph` | search public code |
| `view` | read files |

### Best OpenCode Arch Lessons For Buli

- Simple split between coder and read-only task tools.
- Clear historical baseline for coding tools.
- Useful reference for `patch` in Go, but not a modern TypeScript reference.

### Weaknesses

- Older architecture.
- Less dynamic/gated than current OpenCode or Crush.
- MCP naming is less safe because it lacks a clear `mcp_` prefix.

## Goose

Primary files:

- `examples/goose/crates/goose/src/agents/platform_extensions/mod.rs`
- `examples/goose/crates/goose/src/agents/platform_extensions/developer/mod.rs`
- `examples/goose/crates/goose-mcp/src/lib.rs`

Goose is extension-first. Tools come from platform extensions.

### Default-On Platform Extensions

| Extension | Tools |
|---|---|
| `developer` | `write`, `edit`, `shell`, `tree` |
| `todo` | prefixed `todo__todo_write` |
| `extensionmanager` | manage/search extensions, sometimes resource tools |
| `skills` | `load_skill` |

### Default-Off Platform Extensions

| Extension | Tools |
|---|---|
| `analyze` | `analyze` |
| `summon` | `load`, `delegate` |
| `summarize` | `summarize__summarize` |
| `apps` | app list/create/iterate/delete |
| `chatrecall` | `chatrecall__chatrecall` |
| `code_execution` | `execute_typescript`, sometimes `execute_bash`, etc. |
| `orchestrator` | manage other sessions |
| `tom` | no tools; injects context |

### Goose MCP Built-Ins

| Built-in extension | Tools |
|---|---|
| `memory` | `remember_memory`, `retrieve_memories`, `remove_memory_category`, `remove_specific_memory` |
| `computercontroller` | `web_scrape`, `automation_script`, `computer_control`, `xlsx_tool`, `docx_tool`, `pdf_tool`, `cache` |
| `tutorial` | `load_tutorial` |
| `autovisualiser` | chart/diagram rendering tools |

### Best Goose Lessons For Buli

- Good model for extension-based architecture later.
- Good namespacing idea: `{extension}__{tool}`.
- Good distinction between visible tools and execution inspectors.
- Good example of tool annotations feeding permission/approval behavior.

### Do Not Copy First From Goose

- Extension manager.
- Computer control.
- Orchestrator.
- App creation.
- Code execution extension.
- Broad MCP platform.

## Hermes Agent

Primary files:

- `examples/hermes-agent/toolsets.py`
- `examples/hermes-agent/model_tools.py`
- `examples/hermes-agent/tools/registry.py`

Hermes is not just a coding agent. It is a full personal agent platform.

### Hermes Core Tool Families

| Tool family | Tools |
|---|---|
| web | `web_search`, `web_extract` |
| terminal/process | `terminal`, `process` |
| files | `read_file`, `write_file`, `patch`, `search_files` |
| vision/image | `vision_analyze`, `video_analyze`, `image_generate` |
| skills | `skills_list`, `skill_view`, `skill_manage` |
| browser | `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_scroll`, `browser_back`, `browser_press`, `browser_get_images`, `browser_vision`, `browser_console`, `browser_cdp`, `browser_dialog` |
| speech | `text_to_speech` |
| state | `todo`, `memory`, `session_search` |
| user interaction | `clarify` |
| orchestration | `execute_code`, `delegate_task`, `mixture_of_agents` |
| scheduling | `cronjob` |
| messaging | `send_message` |
| home/platform | Home Assistant, Discord, Yuanbao, Feishu |
| multi-agent workflow | kanban tools |
| research/training | RL tools |

### Hermes Architecture Ideas

| Concept | Meaning |
|---|---|
| `registry.register(...)` | Each tool module registers itself. |
| toolsets | Groups like `file`, `web`, `memory`, `browser`, etc. |
| `check_fn` | Tool appears only if requirements are met. |
| dynamic schema cleanup | Tool descriptions are changed to avoid mentioning unavailable tools. |
| plugin tools | Plugins can register tools into same registry. |
| MCP tools | MCP servers become toolsets. |

### Best Hermes Lessons For Buli

- Good long-term registry idea.
- Good memory/skills/session-search architecture later.
- Good toolset concept.
- Good dynamic availability checks.
- Good warning: huge toolsets become risky fast.

### Do Not Copy First From Hermes

- Browser/CDP.
- Messaging.
- Cron.
- Home Assistant.
- Kanban.
- Delegation.
- Execute-code batching.
- Large auto-discovered plugin ecosystem.

## Best Reference Mix For Buli

| Buli need | Best source |
|---|---|
| Simple first registry | Pi Mono |
| Full TypeScript coding toolbelt | OpenCode |
| Richer product/search later | KiloCode |
| Approval UX and read-before-edit | Crush |
| Patch/event architecture later | Codex |
| Extension namespacing later | Goose |
| Memory/skills/session recall later | Hermes |

## Proposed Buli Tool Tiers

| Tier | Tool type | Examples | Risk |
|---|---|---|---|
| Tier 0 | read-only context | `read`, `glob`, `grep`, `ls` | low |
| Tier 1 | local edits | `edit`, `write`, `apply_patch` | medium/high |
| Tier 2 | side effects | `bash`, network fetch, browser, package install, git mutation | medium/high |
| Tier 3 | external actions | messaging, cron, deploy, credentials, third-party integrations | high |

Tier 0 is implemented. Tier 1 is partially implemented through approved
`edit` and `write`; `apply_patch` is still pending.

## Current Core Buli Tool Set

| Tool | What it does | Risk | Should auto-run? |
|---|---|---|---|
| `read` | Show a file or directory. | low | yes |
| `glob` | Find files by filename pattern. | low | yes |
| `grep` | Search text in files. | low | yes |
| `bash` | Run command. | medium/high depending command | already policy-gated |
| `edit` | Replace text in a file. | medium | no, require approval |
| `write` | Create/overwrite file. | high | no, require approval |
| `apply_patch` | Change many files by patch. | high | not implemented yet |

## Why Start With Read-Only Tools

Without `read`, `glob`, and `grep`, the model uses `bash` for basic inspection.

That is bad because:

- shell commands are more dangerous than read-only tools
- shell output is less structured
- the UI cannot render file/search results cleanly
- approval policy has to reason about commands that should not be commands at all
- it teaches the model to use `bash` for everything

Read-only tools make the agent safer and more useful immediately.

## Why Edit And Write Require Care

Editing is harder than reading.

Mutation tools need:

- approval policy
- diff generation
- stale-file safety
- clear UI
- result persistence
- tests for failure cases

`edit` and `write` now use this safer shape: prepare a diff first, ask for
approval, re-check the file before applying, then persist the structured result.

## Why Not Start With Apply Patch

Patch tools are powerful but complex.

They involve:

- multiple files
- add/update/delete/move operations
- combined diff display
- stale file checks
- approval UX
- formatter/diagnostics integration
- persistent structured history

Use Codex/OpenCode as references later, not first.

## Proposed Buli Tool Definition Shape

Plain TypeScript sketch:

```ts
type BuliToolDefinition = {
  name: string;
  family: "read_only" | "mutation" | "execution" | "orchestration";
  description: string;
  schema: unknown;
  riskLevel: "low" | "medium" | "high";
  expose: (context: ToolExposureContext) => boolean;
  execute: (request: ToolCallRequest) => Promise<ToolCallOutcome>;
};
```

Plain English:

- `name`: what the model calls
- `family`: what kind of thing this is
- `description`: what the model sees
- `schema`: allowed arguments
- `riskLevel`: how dangerous it is
- `expose`: whether the model can see it now
- `execute`: what actually happens

## Exposure Gate Vs Execution Gate

Keep two decisions separate.

| Decision | Question | Example |
|---|---|---|
| exposure gate | Should the model see this tool? | Hide `write` in plan mode. |
| execution gate | If the model calls it, should we allow/approve/block it? | Show `bash`, but require approval for risky commands. |

Examples:

- `read` can be visible and auto-run.
- `grep` can be visible and auto-run.
- `edit` can be visible but require approval.
- `bash` can be visible, but risky commands require approval.
- `write` can be hidden or blocked in plan mode.

## Concrete Buli Implementation Order

### Phase 1: Read-only tools

Status: implemented.

1. Add typed request contracts for `read`, `glob`, and `grep`.
2. Add OpenAI tool definitions for those tools.
3. Add engine handlers for those tools.
4. Add conversation history entries for their results.
5. Reuse existing TUI cards for `read` and `grep`.
6. Add a simple card or result shape for `glob`.
7. Let all three auto-run because they do not mutate files.
8. Keep `bash` unchanged.
9. Add tests around provider parsing, runtime handling, and history hydration.

### Phase 2: Edit

Status: implemented for exact single replacement with approval.

1. Add `edit` request contract.
2. Require file path, old string, and new string.
3. Generate diff metadata.
4. Show diff before approval.
5. Apply only after approval.
6. Store structured tool result and diff detail.
7. Add stale-file protection.

### Phase 3: Write

Status: implemented for create/overwrite with approval.

1. Add `write` request contract.
2. Require full target path and content.
3. Generate full-file diff.
4. Require approval.
5. Store structured result.

### Phase 4: Apply Patch

1. Add `apply_patch` only after `edit` and `write` are stable.
2. Use Codex/OpenCode as references.
3. Treat patch as high-risk.
4. Show combined diff before approval.

### Phase 5: Later Tools

Later candidates:

- `todowrite`
- `task`
- `skill`
- memory
- session recall
- web fetch/search
- MCP/plugin tools
- extension namespacing

## Final Recommendation

The best immediate path for `buli` is not Hermes, Goose, Codex code mode, or
KiloCode product extras.

The best immediate path is:

1. Use Pi Mono for simple registry shape.
2. Use OpenCode for real TypeScript implementations of `read`, `glob`, and
   `grep`.
3. Use Crush for approval and read-before-edit behavior when adding mutation.
4. Use Codex later for patch and dynamic/MCP architecture.
5. Use Goose later for extension namespacing.
6. Use Hermes later for memory, skills, and session recall.

This gives `buli` useful understanding and approved-application ability without
turning it into a huge unsafe platform too early.
