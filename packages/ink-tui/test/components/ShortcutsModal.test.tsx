import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { ShortcutsModal } from "../../src/components/ShortcutsModal.tsx";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

// renderToString does not feed keystrokes to the component, so onCloseRequested
// is guaranteed not to fire during these presentational snapshots. A noop is
// therefore safe and keeps each test focused on rendered text.
const onCloseRequestedNoop = () => {};

test("ShortcutsModal renders the help · shortcuts title and esc close hint", () => {
  const output = renderWithoutAnsi(<ShortcutsModal onCloseRequested={onCloseRequestedNoop} />);
  expect(output).toContain("help · shortcuts");
  expect(output).toContain("[ esc ] close");
});

test("ShortcutsModal renders the keyboard section with its shortcut rows", () => {
  const output = renderWithoutAnsi(<ShortcutsModal onCloseRequested={onCloseRequestedNoop} />);
  expect(output).toContain("// keyboard");
  expect(output).toContain("[ enter ]");
  expect(output).toContain("send non-empty draft");
  expect(output).toContain("open model picker when idle");
  expect(output).toContain("scroll transcript by row");
  expect(output).toContain("scroll transcript by page");
  expect(output).toContain("jump oldest · newest");
});

test("ShortcutsModal renders the help section with only current-build help rows", () => {
  const output = renderWithoutAnsi(<ShortcutsModal onCloseRequested={onCloseRequestedNoop} />);
  expect(output).toContain("// help");
  expect(output).toContain("open help from an empty draft");
  expect(output).toContain("close this modal or picker");
  expect(output).not.toContain("slash commands");
  expect(output).not.toContain("save note to project memory");
  expect(output).not.toContain("attach image");
});

test("ShortcutsModal footer shows the modal close hint", () => {
  const output = renderWithoutAnsi(<ShortcutsModal onCloseRequested={onCloseRequestedNoop} />);
  expect(output).toContain("buli · tui · v0.1");
  expect(output).toContain("close with ? or esc");
});
