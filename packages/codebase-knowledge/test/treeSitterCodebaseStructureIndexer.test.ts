import { expect, test } from "bun:test";
import {
  createTreeSitterCodebaseStructureIndexer,
  createTreeSitterTypeScriptCodebaseStructureIndexer,
  resolveCodebaseLanguageKindForFilePath,
  resolveTypeScriptLanguageKindForFilePath,
} from "../src/index.ts";

test("resolveTypeScriptLanguageKindForFilePath recognizes TypeScript and TSX paths", () => {
  expect(resolveTypeScriptLanguageKindForFilePath("src/app.ts")).toBe("typescript");
  expect(resolveTypeScriptLanguageKindForFilePath("src/app.d.ts")).toBe("typescript");
  expect(resolveTypeScriptLanguageKindForFilePath("src/component.tsx")).toBe("tsx");
  expect(resolveTypeScriptLanguageKindForFilePath("src/app.js")).toBeUndefined();
});

test("resolveCodebaseLanguageKindForFilePath recognizes supported codebase languages", () => {
  expect(resolveCodebaseLanguageKindForFilePath("src/app.ts")).toBe("typescript");
  expect(resolveCodebaseLanguageKindForFilePath("src/component.tsx")).toBe("tsx");
  expect(resolveCodebaseLanguageKindForFilePath("src/order_processing.py")).toBe("python");
  expect(resolveCodebaseLanguageKindForFilePath("src/order_processing.pyi")).toBe("python");
  expect(resolveCodebaseLanguageKindForFilePath("src/order_processing.pyw")).toBe("python");
  expect(resolveCodebaseLanguageKindForFilePath("src/app.js")).toBeUndefined();
});

test("TreeSitterTypeScriptCodebaseStructureIndexer indexes TypeScript imports and exported symbols", async () => {
  const indexer = await createTreeSitterTypeScriptCodebaseStructureIndexer();
  const indexedFile = await indexer.indexFile({
    filePath: "packages/engine/src/runtimeToolCallExecution.ts",
    indexedAtMs: 123,
    fileText: [
      'import { randomUUID } from "node:crypto";',
      'import type { ProviderConversationTurn } from "./provider.ts";',
      "",
      "export function streamAssistantResponseEventsForRequestedToolCalls() {",
      "  return randomUUID();",
      "}",
      "",
      "type LocalRuntimeState = { readonly id: string };",
      "export interface RuntimeToolBoundary { readonly name: string }",
      "export const createRuntimeToolBoundary = () => ({ name: 'runtime' });",
    ].join("\n"),
  });

  expect(indexedFile.hasSyntaxError).toBe(false);
  expect(indexedFile.importedModuleSpecifiers).toEqual(["./provider.ts", "node:crypto"]);
  expect(indexedFile.importDeclarations).toEqual([
    {
      moduleSpecifier: "node:crypto",
      importedSymbolNames: ["randomUUID"],
      isTypeOnly: false,
      startLineNumber: 1,
      endLineNumber: 1,
    },
    {
      moduleSpecifier: "./provider.ts",
      importedSymbolNames: ["ProviderConversationTurn"],
      isTypeOnly: true,
      startLineNumber: 2,
      endLineNumber: 2,
    },
  ]);
  expect(indexedFile.symbols.map((symbol) => [symbol.symbolName, symbol.symbolKind, symbol.isExported])).toEqual([
    ["streamAssistantResponseEventsForRequestedToolCalls", "function", true],
    ["LocalRuntimeState", "type", false],
    ["RuntimeToolBoundary", "interface", true],
    ["createRuntimeToolBoundary", "function", true],
  ]);
  expect(indexedFile.exportedSymbolNames).toEqual([
    "streamAssistantResponseEventsForRequestedToolCalls",
    "RuntimeToolBoundary",
    "createRuntimeToolBoundary",
  ]);
  expect(indexedFile.exportDeclarations).toEqual([
    {
      exportedSymbolNames: ["streamAssistantResponseEventsForRequestedToolCalls"],
      startLineNumber: 4,
      endLineNumber: 6,
    },
    {
      exportedSymbolNames: ["RuntimeToolBoundary"],
      startLineNumber: 9,
      endLineNumber: 9,
    },
    {
      exportedSymbolNames: ["createRuntimeToolBoundary"],
      startLineNumber: 10,
      endLineNumber: 10,
    },
  ]);
  expect(indexedFile.symbols.find((symbol) => symbol.symbolName === "streamAssistantResponseEventsForRequestedToolCalls")?.declarationPreview)
    .toEqual({ declarationPreviewText: "export function streamAssistantResponseEventsForRequestedToolCalls() { … }" });
  expect(indexedFile.knowledgeRecords.find((record) => record.recordKind === "file")?.summary).toContain(
    "defines exported function streamAssistantResponseEventsForRequestedToolCalls",
  );
  expect(indexedFile.knowledgeRecords.find((record) => record.recordKind === "file")).toMatchObject({
    importDeclarations: indexedFile.importDeclarations,
    exportDeclarations: indexedFile.exportDeclarations,
  });
  expect(indexedFile.knowledgeRecords.find((record) => record.recordId.includes("createRuntimeToolBoundary"))).toMatchObject({
    declarationPreview: { declarationPreviewText: "export const createRuntimeToolBoundary = …" },
    updatedAtMs: 123,
  });
});

test("TreeSitterTypeScriptCodebaseStructureIndexer indexes TSX files with JSX", async () => {
  const indexer = await createTreeSitterTypeScriptCodebaseStructureIndexer();
  const indexedFile = await indexer.indexFile({
    filePath: "packages/tui/src/components/RuntimePanel.tsx",
    fileText: [
      'import type { ReactNode } from "react";',
      "export function RuntimePanel(): ReactNode {",
      "  return <box><text>Runtime</text></box>;",
      "}",
    ].join("\n"),
  });

  expect(indexedFile.languageId).toBe("tsx");
  expect(indexedFile.hasSyntaxError).toBe(false);
  expect(indexedFile.symbols.map((symbol) => symbol.symbolName)).toEqual(["RuntimePanel"]);
});

test("TreeSitterCodebaseStructureIndexer indexes Python imports and public symbols", async () => {
  const indexer = await createTreeSitterCodebaseStructureIndexer();
  const indexedFile = await indexer.indexFile({
    filePath: "src/order_processing.py",
    indexedAtMs: 456,
    fileText: [
      "from __future__ import annotations",
      "import os, pathlib as pathlib_module",
      "from billing.invoices import Invoice",
      "",
      "DEFAULT_RETRY_COUNT = 3",
      "",
      "class OrderProcessor:",
      "    pass",
      "",
      "@decorator",
      "def confirm_order_payment(order_id: str) -> None:",
      "    return None",
      "",
      "def _normalize_order_id(order_id: str) -> str:",
      "    return order_id",
    ].join("\n"),
  });

  expect(indexedFile.languageId).toBe("python");
  expect(indexedFile.hasSyntaxError).toBe(false);
  expect(indexedFile.importedModuleSpecifiers).toEqual(["__future__", "billing.invoices", "os", "pathlib"]);
  expect(indexedFile.importDeclarations).toEqual([
    {
      moduleSpecifier: "__future__",
      importedSymbolNames: ["annotations"],
      isTypeOnly: false,
      startLineNumber: 1,
      endLineNumber: 1,
    },
    {
      moduleSpecifier: "os",
      importedSymbolNames: ["os"],
      isTypeOnly: false,
      startLineNumber: 2,
      endLineNumber: 2,
    },
    {
      moduleSpecifier: "pathlib",
      importedSymbolNames: ["pathlib", "pathlib_module"],
      isTypeOnly: false,
      startLineNumber: 2,
      endLineNumber: 2,
    },
    {
      moduleSpecifier: "billing.invoices",
      importedSymbolNames: ["Invoice"],
      isTypeOnly: false,
      startLineNumber: 3,
      endLineNumber: 3,
    },
  ]);
  expect(indexedFile.symbols.map((symbol) => [symbol.symbolName, symbol.symbolKind, symbol.isExported])).toEqual([
    ["DEFAULT_RETRY_COUNT", "variable", true],
    ["OrderProcessor", "class", true],
    ["confirm_order_payment", "function", true],
    ["_normalize_order_id", "function", false],
  ]);
  expect(indexedFile.exportedSymbolNames).toEqual([
    "DEFAULT_RETRY_COUNT",
    "OrderProcessor",
    "confirm_order_payment",
  ]);
  expect(indexedFile.exportDeclarations).toEqual([
    {
      exportedSymbolNames: ["DEFAULT_RETRY_COUNT"],
      startLineNumber: 5,
      endLineNumber: 5,
    },
    {
      exportedSymbolNames: ["OrderProcessor"],
      startLineNumber: 7,
      endLineNumber: 8,
    },
    {
      exportedSymbolNames: ["confirm_order_payment"],
      startLineNumber: 10,
      endLineNumber: 12,
    },
  ]);
  expect(indexedFile.symbols.find((symbol) => symbol.symbolName === "confirm_order_payment")?.declarationPreview)
    .toEqual({ declarationPreviewText: "def confirm_order_payment(order_id: str) -> None:" });
  expect(indexedFile.knowledgeRecords.find((record) => record.recordKind === "file")?.summary).toContain(
    "python file src/order_processing.py imports __future__, billing.invoices, os, pathlib",
  );
  expect(indexedFile.knowledgeRecords.find((record) => record.recordId.includes("_normalize_order_id"))).toMatchObject({
    tags: ["python", "_normalize_order_id", "function", "private"],
    updatedAtMs: 456,
  });
});
