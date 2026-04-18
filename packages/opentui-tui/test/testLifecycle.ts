import { afterEach } from "bun:test";
import { destroyActiveOpenTuiTestRenderers } from "./testRenderRegistry.ts";

afterEach(async () => {
  await destroyActiveOpenTuiTestRenderers();
});
