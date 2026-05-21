import { expect, test } from "bun:test";
import { createClickableControlMouseDownHandler } from "../../../src/components/primitives/clickableControl.ts";

test("createClickableControlMouseDownHandler consumes mouse down before activating", () => {
  const calls: string[] = [];
  const handleMouseDown = createClickableControlMouseDownHandler(() => {
    calls.push("activate");
  });

  handleMouseDown({
    preventDefault: () => calls.push("preventDefault"),
    stopPropagation: () => calls.push("stopPropagation"),
  });

  expect(calls).toEqual(["preventDefault", "stopPropagation", "activate"]);
});
