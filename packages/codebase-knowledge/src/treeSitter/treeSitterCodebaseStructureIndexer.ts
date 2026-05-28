import { createHash } from "node:crypto";
import { Parser, type Node } from "web-tree-sitter";
import type {
  CodebaseEvidenceSourceRange,
  CodebaseFileKnowledgeRecord,
  CodebaseKnowledgeRecord,
  CodebaseStructureFileRecord,
  CodebaseStructureIndexer,
  CodebaseStructureSymbolRecord,
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
      const contentHash = createContentHash(input.fileText);
      const importedModuleSpecifiers = collectImportedModuleSpecifiers({
        rootNode: syntaxTree.rootNode,
        languageKind,
      });
      const symbols = collectTopLevelSymbols({
        rootNode: syntaxTree.rootNode,
        languageKind,
      });
      const exportedSymbolNames = symbols.filter((symbol) => symbol.isExported).map((symbol) => symbol.symbolName);
      const knowledgeRecords = buildKnowledgeRecordsForIndexedFile({
        filePath: input.filePath,
        fileText: input.fileText,
        languageKind,
        contentHash,
        importedModuleSpecifiers,
        exportedSymbolNames,
        symbols,
        indexedAtMs: input.indexedAtMs ?? Date.now(),
      });

      return {
        filePath: input.filePath,
        languageId: languageKind,
        contentHash,
        hasSyntaxError: syntaxTree.rootNode.hasError,
        importedModuleSpecifiers,
        exportedSymbolNames,
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

function collectImportedModuleSpecifiers(input: {
  rootNode: Node;
  languageKind: TreeSitterCodebaseLanguageKind;
}): readonly string[] {
  return input.languageKind === "python"
    ? collectPythonImportedModuleSpecifiers(input.rootNode)
    : collectTypeScriptImportedModuleSpecifiers(input.rootNode);
}

function collectTypeScriptImportedModuleSpecifiers(rootNode: Node): readonly string[] {
  const importedModuleSpecifierSet = new Set<string>();

  for (const childNode of rootNode.namedChildren) {
    if (childNode.type !== "import_statement") {
      continue;
    }

    const sourceNode = childNode.childForFieldName("source");
    if (sourceNode) {
      importedModuleSpecifierSet.add(stripStringLiteralQuotes(sourceNode.text));
    }
  }

  return [...importedModuleSpecifierSet].sort();
}

function collectPythonImportedModuleSpecifiers(rootNode: Node): readonly string[] {
  const importedModuleSpecifierSet = new Set<string>();

  for (const childNode of rootNode.namedChildren) {
    if (childNode.type === "import_statement") {
      for (const importedModuleSpecifier of parsePythonImportStatementModuleSpecifiers(childNode.text)) {
        importedModuleSpecifierSet.add(importedModuleSpecifier);
      }
      continue;
    }

    if (childNode.type === "import_from_statement") {
      const importedModuleSpecifier = childNode.childForFieldName("module_name")?.text.trim();
      if (importedModuleSpecifier) {
        importedModuleSpecifierSet.add(importedModuleSpecifier);
      }
      continue;
    }

    if (childNode.type === "future_import_statement") {
      importedModuleSpecifierSet.add("__future__");
    }
  }

  return [...importedModuleSpecifierSet].sort();
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
  isExported: boolean;
}): CodebaseStructureSymbolRecord {
  return {
    symbolName: input.symbolName,
    symbolKind: input.symbolKind,
    startLineNumber: input.rangeNode.startPosition.row + 1,
    endLineNumber: input.rangeNode.endPosition.row + 1,
    isExported: input.isExported,
  };
}

function buildKnowledgeRecordsForIndexedFile(input: {
  filePath: string;
  fileText: string;
  languageKind: TreeSitterCodebaseLanguageKind;
  contentHash: string;
  importedModuleSpecifiers: readonly string[];
  exportedSymbolNames: readonly string[];
  symbols: readonly CodebaseStructureSymbolRecord[];
  indexedAtMs: number;
}): readonly CodebaseKnowledgeRecord[] {
  const fileEvidenceRange: CodebaseEvidenceSourceRange = {
    filePath: input.filePath,
    startLineNumber: 1,
    endLineNumber: countSourceLines(input.fileText),
    contentHash: input.contentHash,
    sourceKind: "tree_sitter_structure",
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
    freshness: "fresh",
    updatedAtMs: input.indexedAtMs,
    filePath: input.filePath,
    languageId: input.languageKind,
    importedModuleSpecifiers: input.importedModuleSpecifiers,
    exportedSymbolNames: input.exportedSymbolNames,
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
    sourceKind: "tree_sitter_structure",
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
    freshness: "fresh",
    updatedAtMs: input.indexedAtMs,
    filePath: input.filePath,
    symbolName: input.symbol.symbolName,
    symbolKind: input.symbol.symbolKind,
    startLineNumber: input.symbol.startLineNumber,
    endLineNumber: input.symbol.endLineNumber,
    isExported: input.symbol.isExported,
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

function parsePythonImportStatementModuleSpecifiers(importStatementText: string): readonly string[] {
  return importStatementText
    .replace(/^import\s+/, "")
    .split(",")
    .map((importedModuleText) => importedModuleText.replace(/\s+as\s+.+$/, "").trim())
    .filter((importedModuleText) => importedModuleText.length > 0);
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

function createContentHash(fileText: string): string {
  return createHash("sha256").update(fileText).digest("hex");
}
