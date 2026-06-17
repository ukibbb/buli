# Test-driven change

Use this skill when adding or changing behavior that can be verified directly.

## Workflow

1. State the behavior contract in one sentence before editing implementation code.
2. Add the smallest meaningful failing test at the boundary that owns the behavior.
3. Prefer real integration tests for persistence, ownership, transaction, and runtime flows.
4. Implement only the code needed to satisfy the behavior and keep the public contract typed.
5. Run the targeted test first, then the smallest relevant typecheck/test suite.
