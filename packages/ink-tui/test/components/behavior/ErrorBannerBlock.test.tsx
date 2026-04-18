import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import { ErrorBannerBlock } from "../../../src/components/behavior/ErrorBannerBlock.tsx";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

test("ErrorBannerBlock shows error text", () => {
  const output = renderWithoutAnsi(<ErrorBannerBlock errorText="auth failed" />);
  expect(output).toContain("Error");
  expect(output).toContain("auth failed");
});

test("ErrorBannerBlock shows a custom title and hint on separate lines", () => {
  const output = renderWithoutAnsi(
    <ErrorBannerBlock
      titleText="Could not load models"
      errorText="missing client_version"
      errorHintText="Press Esc to close."
    />,
  );

  expect(output).toContain("Could not load models");
  expect(output).toContain("missing client_version");
  expect(output).toContain("Press Esc to close.");
});
