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

**Readable Code Principles**

1. Code should explain itself in the order it is read.
2. Names should reveal intent, scope, and timing.
3. Structure should mirror the real flow of the domain.
4. State changes should be explicit and traceable.
5. Different meanings should have different names and shapes.
6. Public surfaces should be understandable without chasing definitions.
7. Comments should explain reasons, constraints, and transitions.
8. A reader should be able to answer: what is happening, why it is happening, what changes, when it changes, and what can happen next.

19. Write code so a new reader can understand it on the first pass without hidden context. Optimize names for clarity, not brevity. Prefer longer names when they let the reader understand the code without chasing definitions across files.

20. Prefer the language of the problem domain over the language of tools, layers, or implementation detail. Avoid vague names unless they are clearly qualified by their role in the domain.

21. Names that are visible outside a small local scope should read like precise statements. A reader should understand what happens, to what, and within what boundary from the name alone.

22. When something changes over time, represent its stages explicitly. The names and structures in the code should reveal what can happen first, next, and last, so the lifecycle is clear before the implementation is read in detail.

23. Do not hide multiple behaviors behind one generic helper. If behavior changes based on mode, phase, or context, split it into separate explicit operations with separate names.

24. Comments should explain why something exists, what constraint it satisfies, or how information changes over time. Do not use comments to repeat code that should have been made clearer through naming and structure.

25. Name variables, fields, and properties so their scope, purpose, and lifecycle are obvious. A reader should be able to tell what part of the system they belong to, what they mean now, and how they are expected to change.

26. Public interfaces, important helpers, and significant local variables should be understandable from the call site. If a reader must inspect multiple definitions just to understand a simple use, the design or naming is too vague.

## Practical Naming Examples

Use these examples as the default naming style for code in this repository. The goal is that a new reader can understand what a thing is, what part of the domain it belongs to, what state it is in, and what an operation does without chasing definitions.

### Prefer domain names over technical names

Prefer:
- `invoiceDraft`
- `publishedArticle`
- `customerMembership`
- `paymentRetrySchedule`
- `warehouseStockReservation`

Avoid:
- `data`
- `payload`
- `manager`
- `processor`
- `handler`
- `service`

### Make lifecycle state explicit

Prefer:
- `pendingOrder`
- `confirmedOrder`
- `failedPaymentAttempt`
- `activeSubscription`
- `expiredSubscription`

Avoid names that hide the stage when the stage affects behavior:
- `order`
- `payment`
- `subscription`

### Name operations by business outcome

Prefer:
- `confirmOrderPayment`
- `markInvoiceAsOverdue`
- `renewActiveSubscription`
- `scheduleCatalogReindex`
- `retryFailedWebhookDelivery`

Avoid:
- `handleOrder`
- `processPayment`
- `updateSubscription`
- `runJob`
- `execute`

### Name boundaries by their real responsibility

Prefer:
- `CustomerAccountRepository`
- `StripePaymentGateway`
- `OrderCancellationPolicy`
- `InvoiceReminderScheduler`
- `CustomerDirectoryEntryMapper`

Avoid broad role names unless they are genuinely precise in context:
- `UserService`
- `PaymentManager`
- `OrderHelper`
- `CommonUtils`

### Collections should say what they contain

Prefer:
- `unpaidInvoices`
- `eligibleDiscountCodes`
- `failedWebhookDeliveries`
- `warehouseRestockRequests`

Avoid:
- `items`
- `list`
- `results`
- `data`

### Boolean names should read like facts

Prefer:
- `isPaymentConfirmed`
- `hasAcceptedTerms`
- `canBeCancelled`
- `shouldRetryDelivery`

Avoid:
- `processed`
- `valid`
- `active`
- `flag`

### Time values should name the event they refer to

Prefer:
- `paymentCapturedAt`
- `subscriptionRenewsOn`
- `passwordResetTokenExpiresAt`
- `orderSubmittedAt`

Avoid:
- `date`
- `time`
- `timestamp`

### IDs should say what they identify

Prefer:
- `invoiceId`
- `customerAccountId`
- `stripeCheckoutSessionId`
- `warehouseLocationId`

Avoid:
- `id`
- `externalId`

### Error names should describe the violated rule or failed action

Prefer:
- `InvoiceAlreadyPaidError`
- `SubscriptionRenewalWindowClosedError`
- `WarehouseStockReservationConflictError`

Avoid:
- `ValidationError`
- `BusinessError`
- `OperationFailedError`

### Test names should read like business rules

Prefer:
- `marks_invoice_as_overdue_when_due_date_passes`
- `rejects_order_cancellation_after_fulfillment_starts`
- `retries_webhook_delivery_when_provider_times_out`

Avoid:
- `should_work`
- `handles_payment`
- `updates_correctly`

### Prefer explicit names at the call site

Avoid vague signatures like:

```text
process(order, data)
```

Prefer names that explain the action and the inputs:

```text
confirmOrderPayment(pendingOrder, paymentConfirmation)
```

### Simple naming templates

For important nouns, prefer:

```text
[domain] + [thing] + [state or role]
```

Examples:
- `invoiceReminderSchedule`
- `customerOnboardingSession`
- `failedPaymentAttempt`
- `warehouseStockReservation`
- `subscriptionRenewalPolicy`

For important operations, prefer:

```text
[verb] + [domain object] + [business outcome]
```

Examples:
- `cancelUnpaidOrder`
- `renewActiveSubscription`
- `publishApprovedArticle`
- `captureAuthorizedPayment`

### Quick smell check

If a name contains one of these words, it is probably too vague unless the surrounding context makes it precise:

- `data`
- `info`
- `value`
- `item`
- `manager`
- `helper`
- `processor`
- `handler`
- `service`
- `util`
- `common`

When a name feels vague, rewrite it by answering four questions:

1. What exact thing is this?
2. What part of the domain does it belong to?
3. What state or lifecycle stage is it in?
4. What business action or boundary does it represent?
