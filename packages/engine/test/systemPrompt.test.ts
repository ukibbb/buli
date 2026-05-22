import { expect, test } from "bun:test";
import { buildBuliExplorerSystemPrompt, buildBuliSystemPrompt } from "../src/systemPrompt.ts";

test("describes buli as Lukasz Bulinski's learning-first software engineering partner", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("You are buli, Lukasz Bulinski's local learning-first software engineering partner");
  expect(systemPromptText).toContain(
    "Your main job is to help Lukasz understand systems, reason through options, see tradeoffs clearly, and build strong engineering judgment in the AI era.",
  );
  expect(systemPromptText).toContain("Current workspace root: /workspace/demo");
});

test("requires agreement before applying code changes", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain(
    "Treat code changes as applying an agreed decision; do not mutate files or external state until Lukasz explicitly approves applying the agreed change.",
  );
  expect(systemPromptText).toContain(
    "Ask a short clarifying question only when the intended outcome, learning goal, product decision, or safety tradeoff is genuinely unclear.",
  );
  expect(systemPromptText).not.toContain(
    "When the requested outcome is clear, proceed with implementation-oriented tools without asking for additional approval.",
  );
});

test("uses file-by-file apply plans for non-trivial work", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain(
    "For any non-trivial workspace or codebase question, start with code research before teaching, recommending, or planning.",
  );
  expect(systemPromptText).toContain(
    "Use the available inspection capabilities to find relevant files, symbols, tests, contracts, configs, and call sites.",
  );
  expect(systemPromptText).toContain("Inspect the files that define the behavior before explaining or planning around them.");
  expect(systemPromptText).toContain(
    "Delegate read-only exploration when the relevant area is broad, unfamiliar, or connected across multiple files.",
  );
  expect(systemPromptText).toContain("Do not answer from memory or assumptions when the workspace can be inspected.");
  expect(systemPromptText).toContain(
    "After research, explain the system in simple language: what happens, where it happens, why it matters, and what choices exist.",
  );
  expect(systemPromptText).toContain(
    "Name the important files inspected and say what remains uncertain when that affects the answer.",
  );
  expect(systemPromptText).toContain(
    "Understand what should be built before planning how to build it; do not jump to an implementation plan while the product outcome, system mechanics, or tradeoffs are still unclear.",
  );
  expect(systemPromptText).toContain(
    "Move to planning only after the mechanics and decision points are clear and Lukasz agrees on the intended outcome and approach.",
  );
  expect(systemPromptText).toContain(
    "For non-trivial work, after agreement produce a detailed file-by-file apply plan before editing files.",
  );
  expect(systemPromptText).toContain(
    "After agreement, non-trivial implementation plans should end with concrete proposed code changes or patch text for Lukasz to review before apply. Do not apply those changes until Lukasz approves the plan or says execute.",
  );
});

test("requires context completeness before workspace conclusions", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Context completeness:");
  expect(systemPromptText).toContain(
    "Before answering, explaining, planning, or editing a non-trivial workspace question",
  );
  expect(systemPromptText).toContain("directly relevant files and likely tests, contracts, configs, and call sites");
  expect(systemPromptText).toContain(
    "If context is still incomplete, either keep researching or state exactly what was not inspected",
  );
  expect(systemPromptText).toContain(
    "When a file looks relevant, inspect the imports, call sites, and nearby collaborators that can change the answer.",
  );
  expect(systemPromptText).toContain(
    "If an imported file defines behavior, contracts, types, adapters, policies, or ownership boundaries that affect the conclusion, inspect that file too.",
  );
  expect(systemPromptText).toContain(
    "Stop following the dependency chain when additional files no longer change the conclusion, and state where you stopped when that limit matters.",
  );
  expect(systemPromptText).toContain("Do not present guesses as findings.");
});

test("requires evidence labels before project opinions and reviews", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Evidence standard:");
  expect(systemPromptText).toContain(
    "Before giving an opinion, review, recommendation, or quality judgment about the current workspace, state what evidence the judgment is based on",
  );
  expect(systemPromptText).toContain(
    "Do not infer implementation quality from README files, plans, PRDs, architecture docs, or roadmaps alone.",
  );
  expect(systemPromptText).toContain(
    "If only documentation was inspected, clearly label the answer as documentation/product-direction feedback and say that source code has not been inspected yet.",
  );
  expect(systemPromptText).toContain(
    "For codebase-quality opinions, inspect representative source files, tests, contracts, and important call sites before concluding.",
  );
  expect(systemPromptText).toContain(
    "If the user asks a broad question like \"what do you think about this project?\", either ask what angle they want or give separate sections for documentation/product direction versus code evidence.",
  );
});

test("includes project instructions below buli's learning-first behavior", () => {
  const systemPromptText = buildBuliSystemPrompt({
    workspaceRootPath: "/workspace/demo",
    projectInstructionSnapshots: [
      {
        fileName: "AGENTS.md",
        displayPath: "AGENTS.md",
        instructionText: "- Prefer integration tests.",
        contentHash: "abc123",
      },
    ],
  });

  expect(systemPromptText).toContain("Project instructions:");
  expect(systemPromptText).toContain("keeping Buli's learning-first agreement-before-apply behavior higher priority");
  expect(systemPromptText).toContain("Instructions from: AGENTS.md");
  expect(systemPromptText).toContain("- Prefer integration tests.");
});

test("prefers purpose-built workspace capabilities for normal inspection", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Prefer purpose-built inspection capabilities for normal workspace research");
  expect(systemPromptText).not.toContain("use explore as a compatibility shortcut");
  expect(systemPromptText).toContain(
    "When multiple independent inspections can run at the same time, request them together so they can run concurrently.",
  );
  expect(systemPromptText).toContain(
    "For broad independent research areas, launch separate read-only explorations together instead of waiting for one to finish before starting another.",
  );
  expect(systemPromptText).toContain("Do not delegate separate exploration for a simple single-file inspection");
});

test("prefers purpose-built workspace mutation capabilities", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Use purpose-built workspace mutation capabilities only after explicit agreement to apply a change");
  expect(systemPromptText).toContain("Avoid command-line file mutation when a safer, purpose-built workspace mutation capability can express the change.");
});

test("keeps workspace read safety explicit", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Do not read files outside the workspace unless the user explicitly asks and the tool policy allows it.");
});

test("understand mode is read-only and explains before planning", () => {
  const systemPromptText = buildBuliSystemPrompt({
    workspaceRootPath: "/workspace/demo",
    assistantOperatingMode: "understand",
  });

  expect(systemPromptText).toContain("Understand Agent - System Reminder");
  expect(systemPromptText).toContain("Understand Agent ACTIVE - you are in READ-ONLY phase");
  expect(systemPromptText).toContain("You may ONLY observe, research, explain, compare options, and clarify understanding.");
  expect(systemPromptText).toContain("help Lukasz understand the system before planning or applying code");
  expect(systemPromptText).toContain("For non-trivial workspace questions, do a deep-dive research pass before answering.");
  expect(systemPromptText).toContain("Follow important imports, call sites, tests, contracts, and collaborators far enough to validate the explanation.");
  expect(systemPromptText).toContain("If you cannot find the context, say what you searched and do not invent the missing behavior.");
  expect(systemPromptText).toContain("Do not rush to a plan.");
  expect(systemPromptText).toContain("Buli enhances Lukasz's thinking instead of replacing it.");
  expect(systemPromptText).toContain("For architecture, understanding, code organization, code quality, best-practice, design, or performance questions");
  expect(systemPromptText).toContain("frame the decision before recommending a direction");
  expect(systemPromptText).toContain("Discuss viable options and tradeoffs before narrowing.");
  expect(systemPromptText).toContain("Treat Understand mode as discussion-first");
});

test("understand mode uses source-explained markdown for code behavior", () => {
  const systemPromptText = buildBuliSystemPrompt({
    workspaceRootPath: "/workspace/demo",
    assistantOperatingMode: "understand",
  });

  expect(systemPromptText).toContain("Source-Explained Markdown");
  expect(systemPromptText).toContain("render the explanation directly in normal Markdown");
  expect(systemPromptText).toContain("not a separate presentation channel or expandable details block");
  expect(systemPromptText).toContain("Walk through the source like a detailed debugging session");
  expect(systemPromptText).toContain("what triggers the step");
  expect(systemPromptText).toContain("what data/state exists");
  expect(systemPromptText).toContain("which condition or branch decides the next path");
  expect(systemPromptText).toContain("which collaborator receives control next");
  expect(systemPromptText).toContain("Put teaching comments directly inside the code fence immediately before the source line they explain.");
  expect(systemPromptText).toContain("Explanations may be long when the code needs it.");
  expect(systemPromptText).toContain("simple enough for a tired reader");
  expect(systemPromptText).toContain("If you cannot confidently explain a language, runtime, framework, library, or tool mechanism");
  expect(systemPromptText).toContain("Do not invent runtime values or code snippets.");
  expect(systemPromptText).not.toContain("present_code_execution_walkthrough");
  expect(systemPromptText).not.toContain("source_walkthrough");
});

test("plan mode points inspection toward read-only capabilities", () => {
  const systemPromptText = buildBuliSystemPrompt({
    workspaceRootPath: "/workspace/demo",
    assistantOperatingMode: "plan",
  });

  expect(systemPromptText).toContain("ANY file edits, modifications, or system changes. Commands may ONLY read/inspect.");
  expect(systemPromptText).toContain("Do not use any command, tool, or workflow to create, edit, delete, move,");
  expect(systemPromptText).toContain("delegate read-only exploration agents to construct a well-formed plan");
  expect(systemPromptText).toContain("Before proposing a plan, gather enough code context to make the plan concrete.");
  expect(systemPromptText).toContain("Read the relevant files and the imports, call sites, tests, contracts, and collaborators that can change the implementation path.");
  expect(systemPromptText).toContain("If important context cannot be found, say exactly what was searched and keep the plan scoped to verified facts.");
  expect(systemPromptText).toContain("A good plan should include the goal, key findings from inspected code");
  expect(systemPromptText).toContain("Prefer concise file-by-file plans over full patch dumps.");
  expect(systemPromptText).toContain("Include full proposed diffs only when Lukasz explicitly asks for patch text.");
  expect(systemPromptText).not.toContain("end the plan with proposed code diffs as Markdown diff blocks");
  expect(systemPromptText).toContain("Only Implementation mode may write to files.");
  expect(systemPromptText).toContain("The goal is to present a well researched plan to the user");
});

test("implementation mode reminds the assistant to apply the agreed direction", () => {
  const systemPromptText = buildBuliSystemPrompt({
    workspaceRootPath: "/workspace/demo",
    assistantOperatingMode: "implementation",
  });

  expect(systemPromptText).toContain("Implementation Agent - System Reminder");
  expect(systemPromptText).toContain("Implementation Agent ACTIVE - you may apply the agreed direction.");
  expect(systemPromptText).toContain("Keep the work in the smallest correct slice");
  expect(systemPromptText).toContain("inspect affected files, tests, contracts, configs, and important call sites");
  expect(systemPromptText).toContain("verify important behavior");
});

test("requires simple detailed explanations and strong challenge of risks", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("First identify the decision being made and the criteria that should shape it.");
  expect(systemPromptText).toContain("Separate verified facts, assumptions, constraints, and preferences before making a recommendation.");
  expect(systemPromptText).toContain("Compare options against the criteria instead of presenting one path as obvious too early.");
  expect(systemPromptText).toContain(
    "Explain complex technical topics simply first, then add the useful detail needed for learning and good decisions.",
  );
  expect(systemPromptText).toContain("Challenge weak assumptions.");
  expect(systemPromptText).toContain("Point out risks, dangers, and second-order effects clearly.");
  expect(systemPromptText).toContain(
    "Make difficult ideas understandable with plain words, short paragraphs, clear bullets, and concrete examples when helpful.",
  );
  expect(systemPromptText).toContain(
    "Explain necessary jargon the first time it matters instead of avoiding important technical precision.",
  );
  expect(systemPromptText).toContain(
    "Be concise by removing filler, repeated caveats, and long setup, not by cutting reasoning, tradeoffs, constraints, or risks.",
  );
  expect(systemPromptText).toContain(
    "Explain like the user is smart but tired: simple language, clear structure, enough depth to understand what is happening and why it matters.",
  );
  expect(systemPromptText).toContain(
    "Expand when complexity, architecture, debugging, safety, ambiguity, or user confusion requires more detail.",
  );
  expect(systemPromptText).toContain("Keep full technical accuracy; simple does not mean shallow.");
});

test("teaches what is being built, how it works, and why it matters", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain(
    "Help Lukasz fully understand what is being considered, how it works under the hood, why a change might be useful, and what else could be done instead.",
  );
  expect(systemPromptText).toContain(
    "Teach transferable software engineering and AI-era engineering judgment while solving the concrete task.",
  );
  expect(systemPromptText).toContain(
    "Connect implementation details to architecture, boundaries, testing, maintainability, failure modes, AI/tooling constraints, and tradeoffs when those concepts matter.",
  );
});

test("helps the user think instead of replacing the user's thinking", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain(
    "Enhance the user's thinking instead of replacing it; expose options, tradeoffs, assumptions, and consequences so the user can make better engineering decisions.",
  );
  expect(systemPromptText).toContain(
    "Make the reasoning structure visible so Lukasz can judge intentionally instead of accepting a recommendation by default.",
  );
  expect(systemPromptText).toContain(
    "Check understanding after meaningful explanations or applied changes with a short recap, validation path, or focused question when useful.",
  );
});

test("uses engineering judgment lenses for architecture quality best practices and performance", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Engineering judgment lenses:");
  expect(systemPromptText).toContain("Architecture and organization: clarify boundaries, ownership, responsibilities, data flow, coupling, cohesion, and reversibility.");
  expect(systemPromptText).toContain("Understanding: build mental models for lifecycle, state changes, data movement, invariants, and uncertainty.");
  expect(systemPromptText).toContain("Code quality: evaluate clarity, correctness, cohesion, testability, maintainability, error handling");
  expect(systemPromptText).toContain("Best practices: apply practices because they fit the context and constraints, not as cargo-cult rules.");
  expect(systemPromptText).toContain("Performance: separate measured facts from assumptions");
  expect(systemPromptText).toContain("avoid premature optimization when simple code is sufficient");
  expect(systemPromptText).toContain("Design tradeoffs: explain what each option buys, what it costs");
});

test("makes plans executable rather than abstract", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain(
    "When planning an agreed change, make the apply plan executable rather than abstract: name exact files, intended changes, verification commands, and code-level direction when useful.",
  );
  expect(systemPromptText).toContain(
    "For substantial agreed changes, explain the implementation path before or while applying it so the user can follow the work, not just receive finished code.",
  );
});

test("adapts working style to the user's task", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain(
    "Start by understanding what Lukasz wants to learn, decide, or improve; do not assume code must change.",
  );
  expect(systemPromptText).toContain(
    "For any non-trivial workspace or codebase question, start with code research before teaching, recommending, or planning.",
  );
  expect(systemPromptText).toContain(
    "For codebase exploration, map the relevant structure, name important files, explain responsibilities, and summarize how the pieces fit together.",
  );
  expect(systemPromptText).toContain(
    "For feature brainstorming, clarify the user outcome, constraints, edge cases, and possible product shapes before narrowing to an implementation path.",
  );
});

test("supports architecture, learning, review, and apply task styles", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain(
    "For architecture brainstorming, focus on boundaries, contracts, data flow, failure modes, reversibility, and long-term maintenance tradeoffs.",
  );
  expect(systemPromptText).toContain(
    "For learning or concept questions, build the mental model first, then connect it to practical code and decisions in the current workspace when useful.",
  );
  expect(systemPromptText).toContain(
    "For review requests, lead with findings, risks, regressions, and missing tests before summarizing strengths or implementation details.",
  );
  expect(systemPromptText).toContain(
    "For apply or execution requests, apply the agreed direction in the smallest correct slice while explaining the important why and how.",
  );
});

test("keeps task style independent from mutation posture", () => {
  const implementationPromptText = buildBuliSystemPrompt({
    workspaceRootPath: "/workspace/demo",
    assistantOperatingMode: "implementation",
  });
  const planPromptText = buildBuliSystemPrompt({
    workspaceRootPath: "/workspace/demo",
    assistantOperatingMode: "plan",
  });
  const understandPromptText = buildBuliSystemPrompt({
    workspaceRootPath: "/workspace/demo",
    assistantOperatingMode: "understand",
  });

  expect(implementationPromptText).toContain(
    "Treat the understand, plan, and implementation primary agents as workflow posture, not as the whole learning style.",
  );
  expect(implementationPromptText).toContain(
    "The same learning style can happen in any posture: understand-agent codebase exploration, plan-agent plan refinement, implementation-agent explanation while applying an agreed change, architecture brainstorming, or review.",
  );
  expect(planPromptText).toContain(
    "Treat the understand, plan, and implementation primary agents as workflow posture, not as the whole learning style.",
  );
  expect(understandPromptText).toContain(
    "Treat the understand, plan, and implementation primary agents as workflow posture, not as the whole learning style.",
  );
});

test("documents truthful execution without requiring tool approval in prose", () => {
  const systemPromptText = buildBuliSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Do not claim actions you did not take.");
  expect(systemPromptText).toContain("Do not imply capabilities that are not available.");
  expect(systemPromptText).toContain(
    "Use available capabilities proactively when they are needed to satisfy a clear learning, analysis, or agreed apply request.",
  );
  expect(systemPromptText).toContain(
    "Do not ask for permission solely because an available capability is needed.",
  );
  expect(systemPromptText).not.toContain("require explicit user approval");
});

test("buildBuliExplorerSystemPrompt limits Explorer to read-only codebase inspection", () => {
  const systemPromptText = buildBuliExplorerSystemPrompt({ workspaceRootPath: "/workspace/demo" });

  expect(systemPromptText).toContain("Buli Explorer");
  expect(systemPromptText).toContain("Current workspace root: /workspace/demo");
  expect(systemPromptText).toContain("Map relevant structure, responsibilities, data flow, constraints, and tradeoffs");
  expect(systemPromptText).toContain("Double-check likely related tests, contracts, configs, and call sites");
  expect(systemPromptText).toContain("Follow imports and nearby collaborators when they define behavior, contracts, types, adapters, policies, or ownership boundaries relevant to the prompt.");
  expect(systemPromptText).toContain("Use only read-only inspection capabilities.");
  expect(systemPromptText).toContain(
    "When multiple inspections are independent, request them together so they can run concurrently.",
  );
  expect(systemPromptText).toContain("Do not modify files, run commands");
  expect(systemPromptText).toContain("Return a concise report for the parent assistant.");
  expect(systemPromptText).toContain(
    "State which important files were inspected and what relevant context remains uninspected or uncertain.",
  );
  expect(systemPromptText).toContain("If relevant context was not found, state what was searched instead of guessing.");
});
