import { createTestRenderer, type TestRendererOptions } from "@opentui/core/testing";
import { createRoot } from "@opentui/react";
import { act, type ReactNode } from "react";
import {
  registerOpenTuiTestCleanupCallbackForLifecycle,
  unregisterOpenTuiTestCleanupCallbackFromLifecycle,
} from "./testRenderRegistry.ts";

type OpenTuiTestSetup = Awaited<ReturnType<typeof createTestRenderer>>;
type ReactGlobalWithActEnvironment = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

export async function testRender(
  node: ReactNode,
  testRendererOptions: TestRendererOptions = {},
): Promise<OpenTuiTestSetup> {
  setReactActEnvironment(true);

  const renderedTestSetup = await createTestRenderer({
    consoleMode: "disabled",
    ...testRendererOptions,
  });
  const renderedRoot = createRoot(renderedTestSetup.renderer);
  const renderSingleOpenTuiFrame = renderedTestSetup.renderOnce;
  let hasRenderedTestSetupBeenCleanedUp = false;

  try {
    await act(async () => {
      renderedRoot.render(node);
    });

    renderedTestSetup.renderOnce = async () => {
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
        await act(async () => {
          renderedRoot.unmount();
        });
      } finally {
        renderedTestSetup.renderer.destroy();
        setReactActEnvironment(false);
      }
    };

    registerOpenTuiTestCleanupCallbackForLifecycle(cleanupRenderedTestSetup);
    return renderedTestSetup;
  } catch (error) {
    renderedTestSetup.renderer.destroy();
    setReactActEnvironment(false);
    throw error;
  }
}

function setReactActEnvironment(isReactActEnvironment: boolean): void {
  (globalThis as ReactGlobalWithActEnvironment).IS_REACT_ACT_ENVIRONMENT = isReactActEnvironment;
}
