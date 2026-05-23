import { createTestRenderer, type TestRendererOptions } from "@opentui/core/testing";
import { createRoot } from "@opentui/react";
import { act, type ReactNode } from "react";
import {
  registerOpenTuiTestCleanupCallbackForLifecycle,
  unregisterOpenTuiTestCleanupCallbackFromLifecycle,
} from "./testRenderRegistry.ts";

type OpenTuiTestSetup = Awaited<ReturnType<typeof createTestRenderer>>;
type OpenTuiRenderedTestSetup = OpenTuiTestSetup & {
  cleanup: () => Promise<void>;
};
type ReactGlobalWithActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

function enableReactActEnvironmentForOpenTuiTest(): void {
  (globalThis as ReactGlobalWithActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
}

export async function testRender(
  node: ReactNode,
  testRendererOptions: TestRendererOptions = {},
): Promise<OpenTuiRenderedTestSetup> {
  enableReactActEnvironmentForOpenTuiTest();
  const renderedTestSetup = await createTestRenderer({
    consoleMode: "disabled",
    ...testRendererOptions,
  });
  const renderedRoot = createRoot(renderedTestSetup.renderer);
  const renderSingleOpenTuiFrame = renderedTestSetup.renderOnce;
  let hasRenderedTestSetupBeenCleanedUp = false;

  try {
    enableReactActEnvironmentForOpenTuiTest();
    await act(async () => {
      renderedRoot.render(node);
    });

    renderedTestSetup.renderOnce = async () => {
      enableReactActEnvironmentForOpenTuiTest();
      await act(async () => {
        await renderSingleOpenTuiFrame();
      });
    };

    const cleanupRenderedTestSetup = async () => {
      if (hasRenderedTestSetupBeenCleanedUp) {
        return;
      }

      hasRenderedTestSetupBeenCleanedUp = true;
      unregisterOpenTuiTestCleanupCallbackFromLifecycle(cleanupRenderedTestSetup);

      try {
        enableReactActEnvironmentForOpenTuiTest();
        await act(async () => {
          renderedRoot.unmount();
        });
      } finally {
        renderedTestSetup.renderer.destroy();
      }
    };

    registerOpenTuiTestCleanupCallbackForLifecycle(cleanupRenderedTestSetup);
    return Object.assign(renderedTestSetup, { cleanup: cleanupRenderedTestSetup });
  } catch (error) {
    renderedTestSetup.renderer.destroy();
    throw error;
  }
}
