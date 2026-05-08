import { expect, test } from "bun:test";
import { normalizeOpenTuiKeyEventForChatSession } from "../src/behavior/openTuiKeyboardInputAdapter.ts";

test("normalizeOpenTuiKeyEventForChatSession maps OpenTUI return names", () => {
  expect(
    normalizeOpenTuiKeyEventForChatSession({ name: "RETURN", sequence: "\r", ctrl: false, meta: false }),
  ).toEqual({
    keyName: "return",
    textInput: undefined,
    isCtrlPressed: false,
    isMetaPressed: false,
  });
});

test("normalizeOpenTuiKeyEventForChatSession maps OpenTUI enter alias to return", () => {
  expect(
    normalizeOpenTuiKeyEventForChatSession({ name: "enter", sequence: "\r", ctrl: false, meta: false }),
  ).toEqual({
    keyName: "return",
    textInput: undefined,
    isCtrlPressed: false,
    isMetaPressed: false,
  });
});

test("normalizeOpenTuiKeyEventForChatSession maps transcript navigation keys", () => {
  expect(normalizeOpenTuiKeyEventForChatSession({ name: "pageup", sequence: "\x1B[5~", ctrl: false, meta: false })).toMatchObject({
    keyName: "pageup",
  });
  expect(normalizeOpenTuiKeyEventForChatSession({ name: "pagedown", sequence: "\x1B[6~", ctrl: false, meta: false })).toMatchObject({
    keyName: "pagedown",
  });
  expect(normalizeOpenTuiKeyEventForChatSession({ name: "home", sequence: "\x1B[H", ctrl: false, meta: false })).toMatchObject({
    keyName: "home",
  });
  expect(normalizeOpenTuiKeyEventForChatSession({ name: "end", sequence: "\x1B[F", ctrl: false, meta: false })).toMatchObject({
    keyName: "end",
  });
});

test("normalizeOpenTuiKeyEventForChatSession maps tab by sequence", () => {
  expect(normalizeOpenTuiKeyEventForChatSession({ name: undefined, sequence: "\t", ctrl: false, meta: false })).toEqual({
    keyName: "tab",
    textInput: undefined,
    isCtrlPressed: false,
    isMetaPressed: false,
  });
});

test("normalizeOpenTuiKeyEventForChatSession maps escape by sequence", () => {
  expect(normalizeOpenTuiKeyEventForChatSession({ name: undefined, sequence: "\x1B", ctrl: false, meta: false })).toEqual({
    keyName: "escape",
    textInput: undefined,
    isCtrlPressed: false,
    isMetaPressed: false,
  });
});

test("normalizeOpenTuiKeyEventForChatSession keeps plain character input", () => {
  expect(normalizeOpenTuiKeyEventForChatSession({ name: undefined, sequence: "x", ctrl: false, meta: false })).toEqual({
    keyName: undefined,
    textInput: "x",
    isCtrlPressed: false,
    isMetaPressed: false,
  });
});
