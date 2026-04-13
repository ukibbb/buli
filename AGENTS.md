# AGENTS.md

1. Always choose the simplest solution that is fully correct.

2. If you are not fully sure which solution is correct, research first. Check the web, then validate again against current industry-standard practice for 2026 before implementing.

3. Don't use `any` as a type. Prefer precise generics and small typed models or lightweight objects over plain object.

4. Favor clear boundaries in code. Single Responsibility and Open/Closed are the most important SOLID principles here. Use dependency injection when it helps preserve those boundaries.

5. When you hit a problem, step back, read all relevant context, and fix the root cause correctly. Do not settle for workarounds as the final solution.

6. If you see an opportunity to improve the codebase, propose it. Prioritize improvements in simplicity, efficiency, security, bug reduction, organization, and readability.

7. Use TDD. Design code so real behavior can be tested directly, and treat mocking as the last unavoidable resort.

8. For transaction-sensitive, ownership-sensitive, and persistence-heavy behavior, prefer real integration tests over fake-heavy unit tests. Introduce only small, typed seams to make real behavior testable, and do not loosen types just to make testing easier.

9. In plan mode, the default is to read everything relevant up front and create a step-by-step execution plan before implementation. Do not ask whether to do this; just do it.

10. If you encounter problems that are not directly caused by your changes, do not ignore them. Apply the same standards: understand them fully and fix the root cause correctly.

11. If migrations need to be changed, update them in place. This is a greenfield project and the migrations have not been run anywhere.

12. When the user says `execute`, `go for it`, or otherwise approves an agreed plan, continue automatically through the remaining planned steps without asking again. Stop only for destructive actions, real product decisions, unresolved security tradeoffs, conflicting instructions, or missing external access or secrets.

13. Do not leave problems inside the current slice as `important note`, `follow-up`, or `out of scope`. Resolve the root cause completely before moving on.

14. Before implementation, read all directly and indirectly affected files up front and build a step-by-step execution plan with exact file paths, folders, and verification commands. Execution should involve zero discovery except for truly unexpected defects.

15. When adding new backend or frontend contracts, use explicit typed models. Do not use plain dictionaries or `object` for domain or API contracts when a small typed model is practical.

16. Inside a bounded context, default to concrete collaborators, concrete query adapters, and direct types. Introduce Protocols/interfaces only for real seams: external systems, cross-context boundaries, expensive side effects, true multi-implementation cases, or transaction boundaries. Do not add abstraction layers that exist only for substitution-on-paper.

17. When making code testable, prefer small typed seams over monkeypatching or broad mock layers. For transaction-sensitive, ownership-sensitive, and persistence-heavy behavior, prove the behavior with real integration tests before adding more fake-heavy unit coverage.

18. Prefer explicit, domain-revealing code over implicit or overloaded structures. When different concepts have different behavior or invariants, model them explicitly in names, types, and contracts instead of hiding them behind generic fields or ambiguous APIs. Keep generic structures only when the domain is truly uniform.
