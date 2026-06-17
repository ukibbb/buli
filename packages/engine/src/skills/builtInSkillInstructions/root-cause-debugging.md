# Root-cause debugging

Use this skill when the task is to diagnose why something is broken or surprising.

## Workflow

1. Reproduce or inspect the exact observed failure before proposing fixes.
2. Trace from symptom to owner: input, state transition, boundary, persistence, rendering, or external effect.
3. Prefer explaining the invariant that was violated over describing only the stack trace.
4. Fix the root cause in the smallest correct slice, not a workaround that masks the symptom.
5. Add or update a behavior test that would fail before the fix and pass after it.
