# Buli Learning And Apply Phase Model

This document defines the runtime phase model for `buli`'s learning-first,
agreement-before-apply workflow.

The key idea is simple:

- prompt wording should encourage learning-first behavior
- runtime phases should enforce when code application and other mutation are and
  are not allowed

This is the right fit for `buli` because Lukasz wants a software engineering
partner that helps him understand how things work, why decisions matter, what
options exist, and which tradeoffs are worth accepting before code changes begin.

Related docs:

- `docs/buli-agent-behavior-blueprint.md`
- `docs/agent-behavior-architecture.md`

## Why A Phase Model

Prompt-only steering is not enough for `buli`'s learning and agreement gate.

Examples from `examples/` show three relevant patterns:

- `opencode` uses a real runtime split between `plan` and `build`, with
  separate permissions and an explicit `plan_exit` approval step
- `goose` uses real runtime modes and a dedicated planning workflow in the CLI,
  but behavior can still differ by surface when the workflow is not enforced
- `pi-mono` keeps core behavior minimal and demonstrates that plan mode can be
  added later as a runtime extension

The lesson for `buli` is:

- use the prompt to teach attitude, communication style, and learning-first
  behavior
- use runtime phases to decide whether mutation is allowed yet

## Core Product Rule

`buli` must not move from learning and discussion into applying code without
user alignment.

That rule applies:

- even for simple tasks
- even when the likely code change is obvious
- even when the assistant thinks it already knows what should be done

The difference between simple and non-trivial work is not whether alignment is
required.

The difference is how much structure is required before code application begins.

- simple task: concise alignment is enough
- non-trivial task: a detailed file-by-file apply plan is required

## Terms

### Alignment

The assistant restates the intended outcome and receives confirmation that its
understanding is correct.

### Non-trivial work

Any task where one or more of the following is true:

- multiple files are likely to change
- there are meaningful architectural or product tradeoffs
- the scope is uncertain
- the request involves migrations, refactors, contracts, persistence, security,
  or test strategy
- the assistant has unresolved doubts that could change the apply path

### Apply-oriented action

Any action that mutates project state or external state.

Examples:

- editing files
- writing new files
- deleting files
- mutating config
- running non-read-only shell commands
- making commits

### Read-only exploration

Actions whose purpose is to understand the codebase without changing it.

Examples:

- reading files
- searching files
- listing directories
- read-only shell inspection such as `pwd`, `git status`, `git diff`, or `ls`

## Phase Overview

| Phase | Purpose | Allowed actions | Forbidden actions | Exit condition |
| --- | --- | --- | --- | --- |
| `learning_discussion` | understand the problem, explain how the system works, surface tradeoffs, align on the intended outcome | read-only exploration, questions, explanation, alternatives, risks, solution discussion | all apply-oriented actions | user confirms intended outcome |
| `agreed_apply_plan` | turn an aligned outcome into a concrete apply plan | read-only exploration, plan refinement, plan proposal, verification planning | apply-oriented actions other than future plan-file handling if explicitly introduced | user approves the proposed plan |
| `apply` | execute the agreed outcome | apply-oriented actions allowed by runtime policy, verification, tests | acting outside the agreed outcome without returning to `learning_discussion` | apply is complete or blocked |
| `verification` | optional later phase for explicit closeout checks | tests, builds, audits, comparison against plan | unrelated new apply work | success, regression found, or return to `learning_discussion` |

## Transition Rules

### Rule 1: Every New Task Starts In `learning_discussion`

There is no direct path from a fresh user prompt into mutation.

### Rule 2: `learning_discussion` Requires Explicit Alignment

The assistant must first clarify what should be understood, decided, or achieved.

For a simple task, this may be brief.

Example shape:

- my understanding is that you want to understand or achieve X
- the simplest path is Y, but option Z trades more complexity for more flexibility
- if that is right, I can apply the agreed change

### Rule 3: Non-Trivial Work Must Pass Through `agreed_apply_plan`

The assistant must not apply non-trivial work directly after learning discussion.

The output of `agreed_apply_plan` must include:

- the recommended approach
- key tradeoffs already resolved
- exact files expected to change
- intended code changes per file
- verification steps
- explicit remaining risks, if any

### Rule 4: `apply` Starts Only After Approval

The user must explicitly approve the plan or the aligned apply direction.

### Rule 5: Material Scope Changes Return To `learning_discussion`

If applying the change reveals that the agreed approach is no longer correct,
`buli` should stop mutating and return to learning discussion instead of silently
continuing on a different plan.

## Recommended Runtime Policy By Phase

## `learning_discussion`

Runtime intent:

- no mutation allowed
- focus on understanding, under-the-hood explanation, alternatives, tradeoffs,
  and alignment

Preferred allowed actions:

- read tool
- grep or search tools
- directory listing tools
- read-only shell inspection
- question or clarification tools

Forbidden actions:

- edit or write tools
- destructive bash
- any tool that changes project state

## `agreed_apply_plan`

Runtime intent:

- still no general mutation allowed
- convert the aligned direction into a concrete apply plan

Preferred allowed actions:

- everything from `learning_discussion`
- plan proposal or plan update actions
- optional future plan-file writing if `buli` chooses to persist plans to disk

Forbidden actions:

- code edits outside the plan artifact, if one exists
- destructive shell commands

## `apply`

Runtime intent:

- execute the approved outcome efficiently and honestly while preserving the
  learning trail

Allowed actions:

- edit and write tools
- approved shell execution
- tests and builds

Still forbidden:

- mutation that materially departs from the agreed outcome without returning to
  learning discussion

## Decision Rules For Simple Versus Non-Trivial Tasks

### Simple Task Path

`learning_discussion` -> alignment -> `apply`

The agreement can be short, but it still must happen.

### Non-Trivial Task Path

`learning_discussion` -> alignment -> `agreed_apply_plan` -> plan approval -> `apply`

The assistant must not compress these steps into one opaque response.

## Draft Synthetic Reminders

These are draft runtime reminders, not the whole architecture.

Their job is to reinforce the current phase after runtime has already decided it.

### Discussion Phase Reminder Draft

```text
<system-reminder>
Learning discussion phase is active.

The user wants help understanding how the system works, what options exist, and which tradeoffs matter before code is applied.

Rules:
- You must not make edits, write files, or run apply-oriented tools yet.
- Focus on understanding the problem, explaining internals, clarifying uncertainties, proposing approaches, and explaining tradeoffs.
- Point out risks, weak assumptions, and second-order effects clearly.
- Explain complex technical topics simply and clearly first.
- Even if the task looks simple, first confirm what the user wants to understand, decide, or achieve.

You may move toward apply only after the user clearly agrees on the intended outcome.
</system-reminder>
```

### Agreed Apply Plan Phase Reminder Draft

```text
<system-reminder>
Agreed apply plan phase is active.

The intended outcome has been aligned, but code application is not approved yet.

Rules:
- You must not start apply-oriented work yet.
- Produce a concrete, honest apply plan for the agreed outcome.
- For non-trivial work, make the plan file-by-file.
- Include intended code changes, verification steps, and the key risks or assumptions that still matter.
- If important uncertainty remains, resolve it before asking to apply.

Your turn should end with either:
- a focused clarification question, or
- a concrete apply plan that is ready for approval.
</system-reminder>
```

### Apply Phase Reminder Draft

```text
<system-reminder>
Apply phase is active.

The user has agreed on the intended outcome and approved applying the change.

Rules:
- Execute the agreed plan faithfully.
- Keep explaining important why and how details while applying.
- Prefer the smallest correct change.
- Verify important results before claiming success.
- If you discover a material mismatch between the agreed plan and reality, stop mutating and return to learning discussion instead of silently changing direction.
</system-reminder>
```

## Why These Reminders Are Not Enough By Themselves

These reminders help the model stay oriented, but they do not enforce the
workflow on their own.

Real enforcement still belongs in runtime:

- tool gating by phase
- explicit approval transitions
- persisted phase state
- UI affordances for plan approval and phase switching

## Recommended Direction For Buli

For `buli`, the best near-term architecture is:

1. keep the prompt learning-first
2. add a real runtime `learning_discussion` -> `agreed_apply_plan` -> `apply` model
3. use phase reminders to keep the model aligned with runtime state

That gives Lukasz the workflow he actually wants:

- understand first
- compare options and tradeoffs
- align first
- plan honestly
- apply only after agreement
