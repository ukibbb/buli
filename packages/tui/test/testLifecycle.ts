import { afterEach } from "bun:test";
import { destroyActiveOpenTuiTestRenderers } from "./testRenderRegistry.ts";

type ReactGlobalWithActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

process.env.BULI_DISABLE_TUI_ANIMATION_TIMERS = "1";
(globalThis as ReactGlobalWithActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(async () => {
  await destroyActiveOpenTuiTestRenderers();
});
