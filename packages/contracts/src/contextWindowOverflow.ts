import { z } from "zod";

export const CONTEXT_WINDOW_OVERFLOW_FAILURE_KIND = "context_window_overflow";
export const ContextWindowOverflowFailureKindSchema = z.literal(CONTEXT_WINDOW_OVERFLOW_FAILURE_KIND);

export type ContextWindowOverflowFailureKind = z.infer<typeof ContextWindowOverflowFailureKindSchema>;

export class ContextWindowOverflowError extends Error {
  readonly failureKind = CONTEXT_WINDOW_OVERFLOW_FAILURE_KIND;

  constructor(message: string) {
    super(message);
    this.name = "ContextWindowOverflowError";
  }
}

export function isContextWindowOverflowError(error: unknown): error is ContextWindowOverflowError {
  if (error instanceof ContextWindowOverflowError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const candidateFailureKind = (error as { readonly failureKind?: unknown }).failureKind;
  return error.name === "ContextWindowOverflowError" || candidateFailureKind === CONTEXT_WINDOW_OVERFLOW_FAILURE_KIND;
}
