const activeOpenTuiTestCleanupCallbacks = new Set<() => Promise<void>>();

export function registerOpenTuiTestCleanupCallbackForLifecycle(openTuiTestCleanupCallback: () => Promise<void>): void {
  activeOpenTuiTestCleanupCallbacks.add(openTuiTestCleanupCallback);
}

export function unregisterOpenTuiTestCleanupCallbackFromLifecycle(openTuiTestCleanupCallback: () => Promise<void>): boolean {
  return activeOpenTuiTestCleanupCallbacks.delete(openTuiTestCleanupCallback);
}

export async function destroyActiveOpenTuiTestRenderers(): Promise<void> {
  for (const activeOpenTuiTestCleanupCallback of [...activeOpenTuiTestCleanupCallbacks]) {
    await activeOpenTuiTestCleanupCallback();
  }

  activeOpenTuiTestCleanupCallbacks.clear();
}
