# Codebase orientation

Use this skill when Lukasz asks how a system works, where something lives, or how pieces fit together.

## Workflow

1. Start with broad file and text discovery before reading implementation details.
2. Identify the entry points, contracts, state owners, side-effect boundaries, tests, and user-visible behavior.
3. Follow only the dependency chain that can change the answer; stop and state the boundary when more reading would be low value.
4. Explain the flow in plain language first, then name the important files and symbols.
5. Separate verified facts from assumptions and remaining uncertainty.
