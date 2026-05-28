import { createHash } from "node:crypto";
import { Parser, type Node } from "web-tree-sitter";
import type {
  CodebaseEvidenceSourceRange,
  CodebaseExportDeclaration,
  CodebaseFileKnowledgeRecord,
  CodebaseImportDeclaration,
  CodebaseKnowledgeRecord,
  CodebaseStructureFileRecord,
  CodebaseStructureIndexer,
  CodebaseStructureSymbolRecord,
  CodebaseSymbolDeclarationPreview,
  CodebaseSymbolKind,
  CodebaseSymbolKnowledgeRecord,
} from "../codebaseKnowledgeTypes.ts";
import {
  resolveCodebaseLanguageKindForFilePath,
  TreeSitterLanguageRegistry,
  type TreeSitterCodebaseLanguageKind,
} from "./treeSitterLanguageRegistry.ts";

export class TreeSitterCodebaseStructureIndexer implements CodebaseStructureIndexer {
  readonly #languageRegistry: TreeSitterLanguageRegistry;

  private constructor(input: { languageRegistry: TreeSitterLanguageRegistry }) {
    this.#languageRegistry = input.languageRegistry;
  }

  static async create(): Promise<TreeSitterCodebaseStructureIndexer> {
    return new TreeSitterCodebaseStructureIndexer({ languageRegistry: await TreeSitterLanguageRegistry.create() });
  }

  async indexFile(input: { filePath: string; fileText: string; indexedAtMs?: number | undefined }): Promise<CodebaseStructureFileRecord> {
    const languageKind = resolveCodebaseLanguageKindForFilePath(input.filePath);
    if (!languageKind) {
      throw new Error(`Cannot index unsupported codebase file: ${input.filePath}`);
    }

    const parser = new Parser();
    parser.setLanguage(this.#languageRegistry.getLanguage(languageKind));

    const syntaxTree = parser.parse(input.fileText);
    if (!syntaxTree) {
      parser.delete();
      throw new Error(`Tree-sitter failed to parse ${input.filePath}`);
    }

    try {
      const contentHash = createCodebaseSourceContentHash(input.fileText);
      const importDeclarations = collectImportDeclarations({
        rootNode: syntaxTree.rootNode,
        languageKind,
      });
      const importedModuleSpecifiers = listUniqueSortedStrings(importDeclarations.map((importDeclaration) => importDeclaration.moduleSpecifier));
      const symbols = collectTopLevelSymbols({
        rootNode: syntaxTree.rootNode,
        languageKind,
      });
      const exportDeclarations = collectExportDeclarations({
        rootNode: syntaxTree.rootNode,
        languageKind,
        symbols,
      });
      const exportedSymbolNames = listUniqueStringsInEncounterOrder([
        ...symbols.filter((symbol) => symbol.isExported).map((symbol) => symbol.symbolName),
        ...exportDeclarations.flatMap((exportDeclaration) => exportDeclaration.exportedSymbolNames),
      ]);
      const knowledgeRecords = buildKnowledgeRecordsForIndexedFile({
        filePath: input.filePath,
        fileText: input.fileText,
        languageKind,
        contentHash,
        importedModuleSpecifiers,
        importDeclarations,
        exportedSymbolNames,
        exportDeclarations,
        symbols,
        indexedAtMs: input.indexedAtMs ?? Date.now(),
      });

      return {
        filePath: input.filePath,
        languageId: languageKind,
        contentHash,
        hasSyntaxError: syntaxTree.rootNode.hasError,
        importedModuleSpecifiers,
        importDeclarations,
        exportedSymbolNames,
        exportDeclarations,
        symbols,
        knowledgeRecords,
      };
    } finally {
      syntaxTree.delete();
      parser.delete();
    }
  }
}

export { TreeSitterCodebaseStructureIndexer as TreeSitterTypeScriptCodebaseStructureIndexer };

export async function createTreeSitterCodebaseStructureIndexer(): Promise<TreeSitterCodebaseStructureIndexer> {
  return TreeSitterCodebaseStructureIndexer.create();
}

export async function createTreeSitterTypeScriptCodebaseStructureIndexer(): Promise<TreeSitterCodebaseStructureIndexer> {
  return createTreeSitterCodebaseStructureIndexer();
}

function collectImportDeclarations(input: {
  rootNode: Node;
  languageKind: TreeSitterCodebaseLanguageKind;
}): readonly CodebaseImportDeclaration[] {
  return input.languageKind === "python"
    ? collectPythonImportDeclarations(input.rootNode)
    : collectTypeScriptImportDeclarations(input.rootNode);
}

function collectTypeScriptImportDeclarations(rootNode: Node): readonly CodebaseImportDeclaration[] {
  const importDeclarations: CodebaseImportDeclaration[] = [];

  for (const childNode of rootNode.namedChildren) {
    if (childNode.type !== "import_statement") {
      continue;
    }

    const sourceNode = childNode.childForFieldName("source");
    if (sourceNode) {
      importDeclarations.push({
        moduleSpecifier: stripStringLiteralQuotes(sourceNode.text),
        importedSymbolNames: parseTypeScriptImportedSymbolNames(childNode.text),
        isTypeOnly: isTypeScriptImportDeclarationTypeOnly(childNode.text),
        ...createSourceLineRange(childNode),
      });
    }
  }

  return importDeclarations;
}

function collectPythonImportDeclarations(rootNode: Node): readonly CodebaseImportDeclaration[] {
  const importDeclarations: CodebaseImportDeclaration[] = [];

  for (const childNode of rootNode.namedChildren) {
    if (childNode.type === "import_statement") {
      importDeclarations.push(...parsePythonImportStatementImportDeclarations(childNode));
      continue;
    }

    if (childNode.type === "import_from_statement") {
      const importDeclaration = parsePythonImportFromDeclaration(childNode);
      if (importDeclaration) {
        importDeclarations.push(importDeclaration);
      }
      continue;
    }

    if (childNode.type === "future_import_statement") {
      const importDeclaration = parsePythonImportFromDeclaration(childNode);
      if (importDeclaration) {
        importDeclarations.push(importDeclaration);
      }
    }
  }

  return importDeclarations;
}

function collectExportDeclarations(input: {
  rootNode: Node;
  languageKind: TreeSitterCodebaseLanguageKind;
  symbols: readonly CodebaseStructureSymbolRecord[];
}): readonly CodebaseExportDeclaration[] {
  return input.languageKind === "python"
    ? collectPythonExportDeclarations(input.symbols)
    : collectTypeScriptExportDeclarations(input.rootNode);
}

function collectTypeScriptExportDeclarations(rootNode: Node): readonly CodebaseExportDeclaration[] {
  const exportDeclarations: CodebaseExportDeclaration[] = [];

  for (const childNode of rootNode.namedChildren) {
    if (childNode.type !== "export_statement") {
      continue;
    }

    const sourceNode = childNode.childForFieldName("source");
    const declarationNode = childNode.childForFieldName("declaration");
    const exportedSymbolNames = declarationNode
      ? collectTypeScriptSymbolsFromDeclaration({
          declarationNode,
          rangeNode: childNode,
          isExported: true,
        }).map((symbol) => symbol.symbolName)
      : parseTypeScriptExportedSymbolNames(childNode.text);

    if (exportedSymbolNames.length === 0 && !sourceNode) {
      continue;
    }

    const moduleSpecifier = sourceNode ? stripStringLiteralQuotes(sourceNode.text) : undefined;
    exportDeclarations.push({
      exportedSymbolNames: listUniqueStringsInEncounterOrder(exportedSymbolNames),
      ...(moduleSpecifier ? { moduleSpecifier } : {}),
      ...createSourceLineRange(childNode),
    });
  }

  return exportDeclarations;
}

function collectPythonExportDeclarations(symbols: readonly CodebaseStructureSymbolRecord[]): readonly CodebaseExportDeclaration[] {
  return symbols
    .filter((symbol) => symbol.isExported)
    .map((symbol) => ({
      exportedSymbolNames: [symbol.symbolName],
      startLineNumber: symbol.startLineNumber,
      endLineNumber: symbol.endLineNumber,
    }));
}

function collectTopLevelSymbols(input: {
  rootNode: Node;
  languageKind: TreeSitterCodebaseLanguageKind;
}): readonly CodebaseStructureSymbolRecord[] {
  const symbols: CodebaseStructureSymbolRecord[] = [];

  for (const childNode of input.rootNode.namedChildren) {
    symbols.push(...collectSymbolsFromTopLevelNode({ topLevelNode: childNode, languageKind: input.languageKind }));
  }

  return symbols.sort((leftSymbol, rightSymbol) => {
    if (leftSymbol.startLineNumber !== rightSymbol.startLineNumber) {
      return leftSymbol.startLineNumber - rightSymbol.startLineNumber;
    }
    return leftSymbol.symbolName.localeCompare(rightSymbol.symbolName);
  });
}

function collectSymbolsFromTopLevelNode(input: {
  topLevelNode: Node;
  languageKind: TreeSitterCodebaseLanguageKind;
}): readonly CodebaseStructureSymbolRecord[] {
  if (input.languageKind === "python") {
    return collectPythonSymbolsFromDeclaration({ declarationNode: input.topLevelNode, rangeNode: input.topLevelNode });
  }

  if (input.topLevelNode.type === "export_statement") {
    const exportedDeclarationNode = input.topLevelNode.childForFieldName("declaration");
    if (exportedDeclarationNode) {
      return collectTypeScriptSymbolsFromDeclaration({
        declarationNode: exportedDeclarationNode,
        rangeNode: input.topLevelNode,
        isExported: true,
      });
    }
    return [];
  }

  return collectTypeScriptSymbolsFromDeclaration({
    declarationNode: input.topLevelNode,
    rangeNode: input.topLevelNode,
    isExported: false,
  });
}

function collectTypeScriptSymbolsFromDeclaration(input: {
  declarationNode: Node;
  rangeNode: Node;
  isExported: boolean;
}): readonly CodebaseStructureSymbolRecord[] {
  const directSymbolKind = classifyDirectDeclarationSymbolKind(input.declarationNode.type);
  if (directSymbolKind) {
    const symbolName = readDeclarationName(input.declarationNode);
    if (!symbolName) {
      return [];
    }

    return [createStructureSymbolRecord({
      symbolName,
      symbolKind: directSymbolKind,
      rangeNode: input.rangeNode,
      previewNode: input.rangeNode,
      isExported: input.isExported,
    })];
  }

  if (input.declarationNode.type === "lexical_declaration" || input.declarationNode.type === "variable_declaration") {
    return input.declarationNode.namedChildren
      .filter((childNode) => childNode.type === "variable_declarator")
      .flatMap((variableDeclaratorNode) => {
        const symbolName = readDeclarationName(variableDeclaratorNode);
        if (!symbolName) {
          return [];
        }

        return [createStructureSymbolRecord({
          symbolName,
          symbolKind: classifyVariableDeclaratorSymbolKind(variableDeclaratorNode),
          rangeNode: input.rangeNode,
          previewNode: input.rangeNode,
          isExported: input.isExported,
        })];
      });
  }

  return [];
}

function collectPythonSymbolsFromDeclaration(input: {
  declarationNode: Node;
  rangeNode: Node;
}): readonly CodebaseStructureSymbolRecord[] {
  if (input.declarationNode.type === "decorated_definition") {
    const decoratedDefinitionNode = input.declarationNode.childForFieldName("definition");
    return decoratedDefinitionNode
      ? collectPythonSymbolsFromDeclaration({ declarationNode: decoratedDefinitionNode, rangeNode: input.declarationNode })
      : [];
  }

  const directSymbolKind = classifyPythonDirectDeclarationSymbolKind(input.declarationNode.type);
  if (directSymbolKind) {
    const symbolName = readDeclarationName(input.declarationNode);
    if (!symbolName) {
      return [];
    }

    return [createStructureSymbolRecord({
      symbolName,
      symbolKind: directSymbolKind,
      rangeNode: input.rangeNode,
      previewNode: input.declarationNode,
      isExported: isPythonSymbolPublic(symbolName),
    })];
  }

  if (input.declarationNode.type === "type_alias_statement") {
    const symbolName = readPythonTypeAliasName(input.declarationNode);
    if (!symbolName) {
      return [];
    }

    return [createStructureSymbolRecord({
      symbolName,
      symbolKind: "type",
      rangeNode: input.rangeNode,
      previewNode: input.declarationNode,
      isExported: isPythonSymbolPublic(symbolName),
    })];
  }

  if (input.declarationNode.type === "expression_statement") {
    return collectPythonAssignmentSymbols(input.declarationNode, input.rangeNode);
  }

  return [];
}

function classifyDirectDeclarationSymbolKind(nodeType: string): CodebaseSymbolKind | undefined {
  switch (nodeType) {
    case "function_declaration":
    case "function_signature":
    case "generator_function_declaration":
      return "function";
    case "class_declaration":
    case "abstract_class_declaration":
      return "class";
    case "interface_declaration":
      return "interface";
    case "type_alias_declaration":
      return "type";
    case "enum_declaration":
      return "enum";
    default:
      return undefined;
  }
}

function classifyPythonDirectDeclarationSymbolKind(nodeType: string): CodebaseSymbolKind | undefined {
  switch (nodeType) {
    case "function_definition":
      return "function";
    case "class_definition":
      return "class";
    default:
      return undefined;
  }
}

function classifyVariableDeclaratorSymbolKind(variableDeclaratorNode: Node): CodebaseSymbolKind {
  const valueNode = variableDeclaratorNode.childForFieldName("value");
  return valueNode?.type === "arrow_function" || valueNode?.type === "function" || valueNode?.type === "function_expression"
    ? "function"
    : "variable";
}

function readDeclarationName(declarationNode: Node): string | undefined {
  return readNodeText(declarationNode.childForFieldName("name"));
}

function readPythonTypeAliasName(typeAliasStatementNode: Node): string | undefined {
  return readDeclarationName(typeAliasStatementNode) ??
    readIdentifierText(typeAliasStatementNode.childForFieldName("left")) ??
    readIdentifierText(typeAliasStatementNode.namedChildren.find((childNode) => childNode.type === "identifier"));
}

function collectPythonAssignmentSymbols(
  expressionStatementNode: Node,
  rangeNode: Node,
): readonly CodebaseStructureSymbolRecord[] {
  const assignmentNode = expressionStatementNode.namedChildren.find((childNode) => childNode.type === "assignment");
  const assignedIdentifierName = readIdentifierText(assignmentNode?.childForFieldName("left"));
  if (!assignedIdentifierName) {
    return [];
  }

  return [createStructureSymbolRecord({
    symbolName: assignedIdentifierName,
    symbolKind: "variable",
    rangeNode,
    previewNode: expressionStatementNode,
    isExported: isPythonSymbolPublic(assignedIdentifierName),
  })];
}

function readIdentifierText(node: Node | null | undefined): string | undefined {
  if (!node || node.type !== "identifier") {
    return undefined;
  }
  return readNodeText(node);
}

function readNodeText(node: Node | null | undefined): string | undefined {
  const nodeText = node?.text.trim();
  return nodeText ? nodeText : undefined;
}

function createStructureSymbolRecord(input: {
  symbolName: string;
  symbolKind: CodebaseSymbolKind;
  rangeNode: Node;
  previewNode: Node;
  isExported: boolean;
}): CodebaseStructureSymbolRecord {
  const declarationPreview = createSymbolDeclarationPreview(input.previewNode);
  return {
    symbolName: input.symbolName,
    symbolKind: input.symbolKind,
    startLineNumber: input.rangeNode.startPosition.row + 1,
    endLineNumber: input.rangeNode.endPosition.row + 1,
    isExported: input.isExported,
    ...(declarationPreview ? { declarationPreview } : {}),
  };
}

function buildKnowledgeRecordsForIndexedFile(input: {
  filePath: string;
  fileText: string;
  languageKind: TreeSitterCodebaseLanguageKind;
  contentHash: string;
  importedModuleSpecifiers: readonly string[];
  importDeclarations: readonly CodebaseImportDeclaration[];
  exportedSymbolNames: readonly string[];
  exportDeclarations: readonly CodebaseExportDeclaration[];
  symbols: readonly CodebaseStructureSymbolRecord[];
  indexedAtMs: number;
}): readonly CodebaseKnowledgeRecord[] {
  const fileEvidenceRange: CodebaseEvidenceSourceRange = {
    filePath: input.filePath,
    startLineNumber: 1,
    endLineNumber: countSourceLines(input.fileText),
    contentHash: input.contentHash,
  };

  const fileRecord: CodebaseFileKnowledgeRecord = {
    recordId: `file:${input.filePath}`,
    recordKind: "file",
    title: input.filePath,
    summary: buildFileSummary(input),
    tags: [
      input.languageKind,
      ...input.symbols.map((symbol) => symbol.symbolName),
      ...input.importedModuleSpecifiers,
    ],
    evidenceRanges: [fileEvidenceRange],
    updatedAtMs: input.indexedAtMs,
    filePath: input.filePath,
    languageId: input.languageKind,
    importedModuleSpecifiers: input.importedModuleSpecifiers,
    importDeclarations: input.importDeclarations,
    exportedSymbolNames: input.exportedSymbolNames,
    exportDeclarations: input.exportDeclarations,
    symbolNames: input.symbols.map((symbol) => symbol.symbolName),
  };

  return [fileRecord, ...input.symbols.map((symbol) => buildSymbolKnowledgeRecord({ ...input, symbol }))];
}

function buildSymbolKnowledgeRecord(input: {
  filePath: string;
  languageKind: TreeSitterCodebaseLanguageKind;
  contentHash: string;
  symbol: CodebaseStructureSymbolRecord;
  indexedAtMs: number;
}): CodebaseSymbolKnowledgeRecord {
  const evidenceRange: CodebaseEvidenceSourceRange = {
    filePath: input.filePath,
    startLineNumber: input.symbol.startLineNumber,
    endLineNumber: input.symbol.endLineNumber,
    contentHash: input.contentHash,
  };

  return {
    recordId: `symbol:${input.filePath}:${input.symbol.symbolName}:${input.symbol.startLineNumber}:${input.symbol.endLineNumber}`,
    recordKind: "symbol",
    title: `${input.symbol.symbolName} (${input.symbol.symbolKind})`,
    summary: buildSymbolSummary({
      filePath: input.filePath,
      languageKind: input.languageKind,
      symbol: input.symbol,
    }),
    tags: [
      input.languageKind,
      input.symbol.symbolName,
      input.symbol.symbolKind,
      describeSymbolVisibilityTag({ languageKind: input.languageKind, isExported: input.symbol.isExported }),
    ],
    evidenceRanges: [evidenceRange],
    updatedAtMs: input.indexedAtMs,
    filePath: input.filePath,
    symbolName: input.symbol.symbolName,
    symbolKind: input.symbol.symbolKind,
    startLineNumber: input.symbol.startLineNumber,
    endLineNumber: input.symbol.endLineNumber,
    isExported: input.symbol.isExported,
    ...(input.symbol.declarationPreview ? { declarationPreview: input.symbol.declarationPreview } : {}),
  };
}

function buildFileSummary(input: {
  filePath: string;
  languageKind: TreeSitterCodebaseLanguageKind;
  importedModuleSpecifiers: readonly string[];
  symbols: readonly CodebaseStructureSymbolRecord[];
}): string {
  const importedModuleSummary = input.importedModuleSpecifiers.length === 0
    ? "imports no modules"
    : `imports ${input.importedModuleSpecifiers.join(", ")}`;
  const symbolSummary = input.symbols.length === 0
    ? "defines no top-level symbols"
    : `defines ${input.symbols.map((symbol) => `${describeSymbolVisibilityInFileSummary({
      languageKind: input.languageKind,
      isExported: symbol.isExported,
    })}${symbol.symbolKind} ${symbol.symbolName}`).join(", ")}`;

  return `${input.languageKind} file ${input.filePath} ${importedModuleSummary} and ${symbolSummary}.`;
}

function buildSymbolSummary(input: {
  filePath: string;
  languageKind: TreeSitterCodebaseLanguageKind;
  symbol: CodebaseStructureSymbolRecord;
}): string {
  return `Defines ${describeSymbolVisibilityInSymbolSummary({
    languageKind: input.languageKind,
    isExported: input.symbol.isExported,
  })}${input.symbol.symbolKind} ${input.symbol.symbolName} in ${input.filePath} lines ${input.symbol.startLineNumber}-${input.symbol.endLineNumber}.`;
}

function describeSymbolVisibilityInFileSummary(input: {
  languageKind: TreeSitterCodebaseLanguageKind;
  isExported: boolean;
}): string {
  if (input.languageKind === "python") {
    return input.isExported ? "public " : "private ";
  }
  return input.isExported ? "exported " : "";
}

function describeSymbolVisibilityInSymbolSummary(input: {
  languageKind: TreeSitterCodebaseLanguageKind;
  isExported: boolean;
}): string {
  if (input.languageKind === "python") {
    return input.isExported ? "public " : "private ";
  }
  return input.isExported ? "exported " : "local ";
}

function describeSymbolVisibilityTag(input: {
  languageKind: TreeSitterCodebaseLanguageKind;
  isExported: boolean;
}): string {
  if (input.languageKind === "python") {
    return input.isExported ? "public" : "private";
  }
  return input.isExported ? "exported" : "local";
}

const MAX_DECLARATION_PREVIEW_TEXT_LENGTH = 240;

function parseTypeScriptImportedSymbolNames(importStatementText: string): readonly string[] {
  const importClause = readTypeScriptImportClause(importStatementText);
  if (!importClause) {
    return [];
  }

  const importedSymbolNames = new Set<string>();
  const namespaceImportMatch = /\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)/.exec(importClause);
  if (namespaceImportMatch?.[1]) {
    importedSymbolNames.add(namespaceImportMatch[1]);
  }

  const namedImportMatch = /\{([\s\S]*)\}/.exec(importClause);
  if (namedImportMatch?.[1]) {
    for (const importedSymbolName of parseTypeScriptNamedBindingSymbolNames(namedImportMatch[1])) {
      importedSymbolNames.add(importedSymbolName);
    }
  }

  const defaultImportClause = importClause
    .replace(/\{[\s\S]*\}/g, "")
    .replace(/\*\s+as\s+[A-Za-z_$][A-Za-z0-9_$]*/g, "")
    .split(",")
    .map((importClausePart) => importClausePart.trim().replace(/^type\s+/, ""))
    .filter((importClausePart) => importClausePart.length > 0);
  for (const importClausePart of defaultImportClause) {
    addIdentifierName(importedSymbolNames, importClausePart);
  }

  return [...importedSymbolNames];
}

function readTypeScriptImportClause(importStatementText: string): string | undefined {
  const importBody = importStatementText.replace(/^\s*import\s+/, "").trim();
  if (importBody.startsWith("\"") || importBody.startsWith("'")) {
    return undefined;
  }

  const fromMatch = /\s+from\s+["']/.exec(importBody);
  if (!fromMatch) {
    return undefined;
  }

  return importBody.slice(0, fromMatch.index).trim().replace(/^type\s+/, "");
}

function isTypeScriptImportDeclarationTypeOnly(importStatementText: string): boolean {
  return /^\s*import\s+type\b/.test(importStatementText);
}

function parseTypeScriptExportedSymbolNames(exportStatementText: string): readonly string[] {
  const namedExportMatch = /\{([\s\S]*)\}/.exec(exportStatementText);
  return namedExportMatch?.[1] ? parseTypeScriptNamedBindingSymbolNames(namedExportMatch[1]) : [];
}

function parseTypeScriptNamedBindingSymbolNames(namedBindingsText: string): readonly string[] {
  const symbolNames = new Set<string>();
  for (const bindingText of namedBindingsText.split(",")) {
    const cleanedBindingText = bindingText.trim().replace(/^type\s+/, "");
    if (!cleanedBindingText) {
      continue;
    }
    const [importedOrExportedName, localOrPublicName] = cleanedBindingText.split(/\s+as\s+/i).map((bindingPart) => bindingPart.trim());
    if (importedOrExportedName) {
      addIdentifierName(symbolNames, importedOrExportedName);
    }
    if (localOrPublicName) {
      addIdentifierName(symbolNames, localOrPublicName);
    }
  }
  return [...symbolNames];
}

function parsePythonImportStatementImportDeclarations(importStatementNode: Node): readonly CodebaseImportDeclaration[] {
  const importedModuleTexts = importStatementNode.text.replace(/^import\s+/, "").split(",");
  return importedModuleTexts.flatMap((importedModuleText) => {
    const importedModule = parsePythonImportedNameAndAlias(importedModuleText);
    if (!importedModule) {
      return [];
    }

    return [{
      moduleSpecifier: importedModule.importedName,
      importedSymbolNames: listUniqueStringsInEncounterOrder([
        importedModule.importedName,
        ...(importedModule.aliasName ? [importedModule.aliasName] : []),
      ]),
      isTypeOnly: false,
      ...createSourceLineRange(importStatementNode),
    }];
  });
}

function parsePythonImportFromDeclaration(importFromNode: Node): CodebaseImportDeclaration | undefined {
  const importFromMatch = /^from\s+(.+?)\s+import\s+([\s\S]+)$/.exec(importFromNode.text.trim());
  const moduleSpecifier = importFromMatch?.[1]?.trim();
  const importedSymbolsText = importFromMatch?.[2]?.trim();
  if (!moduleSpecifier || !importedSymbolsText) {
    return undefined;
  }

  return {
    moduleSpecifier,
    importedSymbolNames: parsePythonImportedSymbolNames(importedSymbolsText),
    isTypeOnly: false,
    ...createSourceLineRange(importFromNode),
  };
}

function parsePythonImportedSymbolNames(importedSymbolsText: string): readonly string[] {
  const normalizedImportedSymbolsText = importedSymbolsText.replace(/^\(/, "").replace(/\)$/, "");
  const importedSymbolNames = new Set<string>();
  for (const importedSymbolText of normalizedImportedSymbolsText.split(",")) {
    const importedSymbol = parsePythonImportedNameAndAlias(importedSymbolText);
    if (!importedSymbol) {
      continue;
    }
    importedSymbolNames.add(importedSymbol.importedName);
    if (importedSymbol.aliasName) {
      importedSymbolNames.add(importedSymbol.aliasName);
    }
  }
  return [...importedSymbolNames];
}

function parsePythonImportedNameAndAlias(importedNameText: string): { importedName: string; aliasName?: string | undefined } | undefined {
  const [importedName, aliasName] = importedNameText.split(/\s+as\s+/).map((namePart) => namePart.trim());
  if (!importedName) {
    return undefined;
  }
  return {
    importedName,
    ...(aliasName ? { aliasName } : {}),
  };
}

function createSymbolDeclarationPreview(previewNode: Node): CodebaseSymbolDeclarationPreview | undefined {
  const declarationPreviewText = truncateDeclarationPreviewText(formatDeclarationPreviewText(previewNode.text));
  return declarationPreviewText ? { declarationPreviewText } : undefined;
}

function formatDeclarationPreviewText(declarationText: string): string {
  const firstDeclarationLine = declarationText
    .split(/\r\n|\r|\n/)
    .map((declarationLine) => declarationLine.trim())
    .find((declarationLine) => declarationLine.length > 0 && !declarationLine.startsWith("@"));
  if (!firstDeclarationLine) {
    return "";
  }

  const equalsIndex = firstDeclarationLine.indexOf(" = ");
  if (equalsIndex >= 0) {
    return `${firstDeclarationLine.slice(0, equalsIndex).trim()} = …`;
  }

  const openingBraceIndex = firstDeclarationLine.indexOf("{");
  if (openingBraceIndex >= 0) {
    return `${firstDeclarationLine.slice(0, openingBraceIndex).trim()} { … }`;
  }

  return firstDeclarationLine;
}

function truncateDeclarationPreviewText(declarationPreviewText: string): string {
  if (declarationPreviewText.length <= MAX_DECLARATION_PREVIEW_TEXT_LENGTH) {
    return declarationPreviewText;
  }
  return `${declarationPreviewText.slice(0, MAX_DECLARATION_PREVIEW_TEXT_LENGTH - 1).trimEnd()}…`;
}

function createSourceLineRange(node: Node): { startLineNumber: number; endLineNumber: number } {
  return {
    startLineNumber: node.startPosition.row + 1,
    endLineNumber: node.endPosition.row + 1,
  };
}

function addIdentifierName(identifierNames: Set<string>, candidateIdentifierName: string): void {
  const identifierName = candidateIdentifierName.trim();
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(identifierName)) {
    identifierNames.add(identifierName);
  }
}

function listUniqueSortedStrings(values: readonly string[]): readonly string[] {
  return [...listUniqueStringsInEncounterOrder(values)].sort((leftValue, rightValue) => leftValue.localeCompare(rightValue));
}

function listUniqueStringsInEncounterOrder(values: readonly string[]): readonly string[] {
  const uniqueValues = new Set<string>();
  for (const value of values) {
    if (value.length > 0) {
      uniqueValues.add(value);
    }
  }
  return [...uniqueValues];
}

function isPythonSymbolPublic(symbolName: string): boolean {
  return !symbolName.startsWith("_");
}

function stripStringLiteralQuotes(text: string): string {
  return text.replace(/^['\"]/, "").replace(/['\"]$/, "");
}

function countSourceLines(fileText: string): number {
  return fileText.length === 0 ? 1 : fileText.split(/\r\n|\r|\n/).length;
}

export function createCodebaseSourceContentHash(fileText: string): string {
  return createHash("sha256").update(fileText).digest("hex");
}
