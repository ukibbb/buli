import { afterEach } from "bun:test";
import { EventEmitter } from "node:events";
import { destroyActiveOpenTuiTestRenderers } from "./testRenderRegistry.ts";

type ReactGlobalWithActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

process.env["BULI_DISABLE_TUI_ANIMATION_TIMERS"] = "1";
(globalThis as ReactGlobalWithActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;

// OpenTUI creates one TerminalConsole listener per test renderer even when the
// console overlay is disabled. Component tests intentionally run concurrently,
// so the default Node/Bun listener threshold is too low for the shared cache.
EventEmitter.defaultMaxListeners = Math.max(EventEmitter.defaultMaxListeners, 256);

afterEach(async () => {
  await destroyActiveOpenTuiTestRenderers();
});
