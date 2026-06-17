# Learn Codebase

Use this skill when Lukasz wants to learn, study, resume, or continue learning a source project or codebase from real source code across sessions. Also use it when Lukasz explicitly asks to improve this learning workflow's instructions.

This skill is especially useful for requests like:

- "I want to learn this codebase."
- "Start learning Buli from source."
- "Continue my learning progress for this project."
- "Resume learning this repo."
- "Improve the learn-codebase skill."
- "Make the learning codebase skill better."
- "This skill failed to trigger; improve it."
- "Deep dive into this feature from source."

## Core idea

Learning from source should move from broad mental model to precise source evidence:

```text
project overview
  -> source map
  -> learning roadmap
  -> feature deep dive
  -> progress update
  -> next questions
```

A skill file is not memory by itself. Long-term progress must live in project learning documents that the agent reads at the start of later sessions and updates after approved documentation work.

## Learning write-up rule

The purpose of this skill is to turn source learning into durable written notes, not only chat explanations.

When a learning session produces new understanding, prepare or update the relevant learning documents so the knowledge can be resumed later. The default expectation is: if the session taught something useful and writing is approved by the current mode/request, write it up.

Prefer these targets:

- `learning/<project-slug>/sessions/YYYY-MM-DD-<topic>.md` for session notes
- `learning/<project-slug>/features/<feature-slug>.md` for feature deep dives
- `learning/<project-slug>/source-map.md` for architecture and source-map discoveries
- `learning/<project-slug>/glossary.md` for important terms
- `learning/<project-slug>/open-questions.md` for unresolved questions
- `learning/<project-slug>/progress.md` for resumability and the next step

Each write-up should capture:

- what was learned
- the baby-simple mental model
- source files and line ranges inspected
- important flows, diagrams, or examples
- source-explained snippets for non-trivial inspected code, with path labels and teaching comments immediately before important source lines
- open questions
- recommended next learning step

Respect the current workflow mode:

- In Understand or Plan mode, explain, draft, or propose the write-up, but do not edit files.
- In Implementation mode, after approval, create or update the learning docs.

## Default learning workspace

Unless the user chooses another location, store learning documents under:

```text
learning/<project-slug>/
```

Recommended structure:

```text
learning/<project-slug>/
  README.md
  progress.md
  learning-roadmap.md
  source-map.md
  glossary.md
  open-questions.md
  features/
    <feature-slug>.md
  sessions/
    YYYY-MM-DD-<topic>.md
```

Use the user's preferred folder if they specify one. If the target project or documentation root is unclear, ask a short clarifying question before starting.

## Session start rules

At the start of a learning session:

1. Identify the target project, repository path, and requested topic.
2. Identify the learning docs root, defaulting to `learning/<project-slug>/`.
3. If learning docs already exist, read the relevant files first:
   - `progress.md`
   - `learning-roadmap.md`
   - `source-map.md`
   - `open-questions.md`
   - any relevant `features/<feature-slug>.md`
4. Summarize what is already known, what is in progress, and what is still open.
5. Propose the next smallest useful learning step.
6. Ask only when the target project, docs root, or next topic is genuinely unclear.

## Evidence rules

All important explanations must be source-evidenced.

Before explaining architecture or behavior, inspect relevant evidence such as:

- source files
- tests
- documentation
- configs
- package manifests
- entry points
- call sites
- runtime output when available and useful

Working rules:

- Cite concrete file paths and line ranges for important claims.
- Separate verified facts from assumptions.
- Do not invent architecture, intent, or behavior that is not supported by evidence.
- If evidence is incomplete, say exactly what was not inspected and how that limits confidence.
- Prefer small, targeted reads after broad discovery.
- For feature deep dives, inspect both the implementation and the tests or examples when they exist.

## Learning-first explanation style

Explain like this:

1. Baby-simple mental model first.
2. Then boxes/arrows showing the flow.
3. Then execution order: what runs first, what waits, what branches, what mutates, what persists, and who receives control next.
4. Then source-evidenced details.
5. Then tradeoffs, edge cases, and unknowns.
6. Then a short recap and next learning step.

Prefer plain language. Explain jargon the first time it matters. Keep technical accuracy, but make the path easy to follow.

For non-trivial source, use source-explained snippets after the mental model and execution order. When Lukasz asks to understand a focused source range, function, class, or flow, default to the dense annotated-source style he prefers: explain the inspected code directly in the code block with short teaching comments immediately before the source lines they explain.

Use this default source-explained code style:

- Copy exact inspected source into a fenced code block with a path label such as `path="<file:start-end>"`.
- Explain each behavior-changing line or small connected group of lines, not only the most surprising lines.
- Put short teaching comments immediately before the source lines they explain, like annotated source.
- Use labels when helpful: `explain`, `plain pseudocode`, `project model`, `library mechanics`, `language mechanics`, `loop story`, and `not verified`.
- Explain what state/value exists before the line runs, what happens now, what value/state exists afterward, and what changes in RAM, disk, cache, database, browser, terminal, cloud storage, network, or another external boundary.
- Explain what waits, can fail, branches, mutates, persists, returns, raises, repeats, skips work, or passes control to another collaborator.
- For loops, include a `LOOP STORY`: the value that controls the loop, the condition that keeps it alive, what one pass does, the progress step that moves the loop toward stopping, and every exit path such as condition false, `break`, `return`, or `raise`.
- Include tiny concrete examples when a condition, transformation, lifecycle step, loop pass, or state transition is not obvious.
- Keep this style generic: do not anchor it to a specific file, language, framework, or example project.
- Scale down only when Lukasz explicitly asks for a short answer or the question is genuinely trivial; otherwise, for focused snippets, prefer complete behavior-by-behavior explanation over a sparse summary.

## Workflow 1: Orientation and overview

Use this when the user starts a new project or asks for the big picture.

Goal: create a beginner-friendly project overview grounded in source evidence.

Inspect:

- repository root
- README and docs
- package/build config
- main entry points
- top-level folders
- tests or examples that show real usage

Answer:

- What problem does this project solve?
- Who uses it?
- What are the main parts?
- Where does execution start?
- What should a beginner learn first?
- What is still unknown after the first pass?

Documentation output target:

```text
learning/<project-slug>/README.md
```

## Workflow 2: Architecture and source map

Use this after orientation or when the user asks how the system is organized.

Goal: turn the repository into an understandable map.

Create a source map that explains:

- top-level folders and packages
- important runtime entry points
- main data/control flows
- key domain concepts
- important boundaries between modules
- tests/examples that demonstrate major flows

Prefer simple diagrams:

```text
user action / API / CLI
  -> entry point
  -> coordinator
  -> core domain logic
  -> adapter or output
```

Documentation output target:

```text
learning/<project-slug>/source-map.md
```

## Workflow 3: Learning roadmap

Use this after an overview/source map or when the user wants a study plan.

Goal: create an ordered path from beginner understanding to advanced features.

Roadmap sections:

- prerequisites
- beginner topics
- intermediate topics
- advanced topics
- suggested feature deep dives
- open questions to resolve later

Each roadmap item should include:

- why this topic matters
- source areas to inspect
- expected learning outcome

Documentation output target:

```text
learning/<project-slug>/learning-roadmap.md
```

## Workflow 4: Feature deep dive

Use this when the user asks to understand one feature deeply.

Goal: explain one feature from trigger to outcome using source evidence.

A feature deep dive should answer:

- What user action, API call, CLI command, or internal event triggers this feature?
- Which files are involved?
- What is the execution path?
- What data moves through the system?
- What state changes?
- What branches, edge cases, or failure modes exist?
- What tests, examples, or docs prove the behavior?
- What tradeoffs did the implementation choose?
- What remains uncertain?

Recommended investigation order:

1. Find the public surface or trigger.
2. Follow call sites into core implementation.
3. Inspect the domain/data model used by the feature.
4. Inspect tests, examples, and docs.
5. Explain the flow with evidence.
6. Update feature docs and progress after approval.

Documentation output target:

```text
learning/<project-slug>/features/<feature-slug>.md
```

## Workflow 5: Session write-up and progress update

Use this at the end of a learning or documentation session, or when the user asks to continue later.

Goal: make the next session easy to resume from written learning notes.

Create or update learning docs only when writing docs is approved by the current mode/request.

When the session produced new understanding, write it into the relevant session or topic docs before or alongside the progress update.

Session or topic write-ups should capture:

- what was learned
- the baby-simple mental model
- source files and line ranges inspected
- important flows, diagrams, or examples
- source-explained snippets for non-trivial inspected code, with path labels and teaching comments immediately before important source lines
- open questions
- recommended next learning step

Progress should capture:

- completed topics
- current topic
- source files inspected
- docs created or changed
- open questions
- recommended next step
- date/session label when useful

Learning write-up targets:

```text
learning/<project-slug>/sessions/YYYY-MM-DD-<topic>.md
learning/<project-slug>/features/<feature-slug>.md
learning/<project-slug>/source-map.md
learning/<project-slug>/glossary.md
learning/<project-slug>/open-questions.md
```

Progress output target:

```text
learning/<project-slug>/progress.md
```

## Workflow 6: Recap and next questions

End learning sessions with a concise recap:

- what we learned
- what source evidence supported it
- what is still unclear
- what to study next

If useful, give the user 2-4 possible next topics and explain what each option teaches.

## Workflow 7: Improve this learning skill when explicitly asked

Use this workflow only when Lukasz explicitly asks to improve, tune, fix, or adjust this learning skill or its instructions.

Do not treat normal learning sessions as permission to edit the skill. Self-improvement means: when Lukasz asks, inspect the current skill, use his feedback as evidence, propose the smallest safe instruction change, and apply it only in the appropriate mode.

When improving this skill:

1. Read the `learn-codebase` built-in instruction file at `packages/engine/src/skills/builtInSkillInstructions/learn-codebase.md` before judging what should change.
2. Identify the specific issue Lukasz is reporting or the improvement he wants.
3. Classify the likely improvement type:
   - trigger wording or examples
   - session-start behavior
   - source-map, roadmap, or deep-dive workflow gap
   - progress or resume workflow gap
   - documentation template gap
   - mode-safety or approval-boundary gap
   - explanation style or learning-depth preference
4. Check whether the change belongs in this learning skill. Avoid making this skill capture unrelated skill-maintenance, coding, debugging, or architecture-review requests.
5. In Understand mode, explain the current behavior and the likely improvement, but do not edit files.
6. In Plan mode, compare the smallest text-only skill update with any larger alternative, name the exact file and section to change, and include verification commands.
7. In Implementation mode, after approval or an explicit execute request, update only the agreed skill instructions and verify the new trigger wording, workflow text, and markdown/frontmatter shape.

Prefer the smallest clear instruction update. Do not add a changelog or broad skill-maintenance system unless Lukasz asks for that product shape.

## Mode safety rules

- In read-only or Understand-style sessions, inspect and explain, but do not write files.
- In Plan mode, propose exact documentation files and update steps, but do not write files.
- In Implementation mode, write or update documentation only when the user approved the plan or explicitly asked to create/update docs.
- Skill-instruction updates follow the same mode boundary and should normally stay limited to the `learn-codebase` instruction file at `packages/engine/src/skills/builtInSkillInstructions/learn-codebase.md` unless Lukasz explicitly asks for broader skill infrastructure changes.
- Never overwrite existing learning docs without first reading them and preserving useful progress.

## Documentation templates

Use these templates when creating or updating project learning docs.

### Overview template

```md
# <Project Name> Learning Overview

## What this project does

Baby-simple explanation first.

## Why it exists

Problem, users, and context.

## Main parts

| Area | Path | Responsibility |
| --- | --- | --- |
| <area> | `<path>` | <what it owns> |

## First mental model

```text
<input / user action>
  -> <entry point>
  -> <core logic>
  -> <output>
```

## Good first files to read

- `<path:start-end>` — why this file matters

## Verified facts

- <claim> — evidence: `<path:start-end>`

## Assumptions or incomplete areas

- <what is not verified yet>

## Suggested next topics

1. <topic>
2. <topic>
```

### Source map template

```md
# <Project Name> Source Map

## Top-level structure

| Path | Responsibility | Notes |
| --- | --- | --- |
| `<path>` | <responsibility> | <notes> |

## Main execution flows

### <Flow name>

```text
<trigger>
  -> <file/function>
  -> <file/function>
  -> <outcome>
```

Evidence:

- `<path:start-end>` — <what this proves>

## Important boundaries

- <boundary> — <why it matters>

## Unknowns

- <question>
```

### Learning roadmap template

```md
# <Project Name> Learning Roadmap

## Current learning goal

<what Lukasz wants to understand>

## Beginner path

1. <topic>
   - Why it matters: <reason>
   - Source areas: `<path>`, `<path>`
   - Outcome: <what should be understood>

## Intermediate path

1. <topic>

## Advanced path

1. <topic>

## Recommended feature deep dives

- <feature> — <what it teaches>

## Open questions to resolve

- <question>
```

### Feature deep dive template

```md
# Feature Deep Dive: <Feature Name>

## One-sentence summary

<what the feature does>

## Baby-simple model

```text
<trigger>
  -> <main step>
  -> <main step>
  -> <result>
```

## Trigger / public surface

- <what starts the feature>
- Evidence: `<path:start-end>`

## Execution path

1. <step>
   - Source: `<path:start-end>`
   - What happens: <plain explanation>
   - Source-explained snippet: <copy the important inspected lines with short teaching comments immediately before the lines they explain, when useful>

## Data and state

| Concept | Where defined | How it changes |
| --- | --- | --- |
| <concept> | `<path:start-end>` | <change> |

## Branches and edge cases

- <case> — evidence: `<path:start-end>`

## Tests and examples

- `<path:start-end>` — <behavior proved>

## Design tradeoffs

- <tradeoff and consequence>

## Verified facts

- <claim> — evidence: `<path:start-end>`

## Open questions

- <question>

## Next related topics

- <topic>
```

### Progress template

```md
# Learning Progress: <Project Name>

## Current focus

<topic currently being studied>

## Completed topics

- <date/session> — <topic> — docs: `<path>`

## In progress

- <topic>

## Source inspected

- `<path:start-end>` — <why inspected>

## Open questions

- <question>

## Recommended next step

<one practical next learning task>
```

### Open questions template

```md
# Open Questions: <Project Name>

| Status | Question | Why it matters | Source areas to inspect | Answer / notes |
| --- | --- | --- | --- | --- |
| open | <question> | <reason> | `<path>` | <notes> |
```

### Glossary template

```md
# Glossary: <Project Name>

| Term | Baby-simple meaning | Source evidence | Notes |
| --- | --- | --- | --- |
| <term> | <meaning> | `<path:start-end>` | <notes> |
```
