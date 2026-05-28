import { createRequire } from "node:module";
import { Language, Parser } from "web-tree-sitter";

export type TreeSitterTypeScriptLanguageKind = "typescript" | "tsx";
export type TreeSitterCodebaseLanguageKind = TreeSitterTypeScriptLanguageKind | "python";

const requireFromTreeSitterLanguageRegistry = createRequire(import.meta.url);

let treeSitterRuntimeInitializationPromise: Promise<void> | undefined;

export class TreeSitterLanguageRegistry {
  readonly #typeScriptLanguage: Language;
  readonly #tsxLanguage: Language;
  readonly #pythonLanguage: Language;

  private constructor(input: { typeScriptLanguage: Language; tsxLanguage: Language; pythonLanguage: Language }) {
    this.#typeScriptLanguage = input.typeScriptLanguage;
    this.#tsxLanguage = input.tsxLanguage;
    this.#pythonLanguage = input.pythonLanguage;
  }

  static async create(): Promise<TreeSitterLanguageRegistry> {
    await initializeTreeSitterRuntime();
    const [typeScriptLanguage, tsxLanguage, pythonLanguage] = await Promise.all([
      Language.load(resolvePackageFilePath("tree-sitter-typescript/tree-sitter-typescript.wasm")),
      Language.load(resolvePackageFilePath("tree-sitter-typescript/tree-sitter-tsx.wasm")),
      Language.load(resolvePackageFilePath("tree-sitter-python/tree-sitter-python.wasm")),
    ]);

    return new TreeSitterLanguageRegistry({ typeScriptLanguage, tsxLanguage, pythonLanguage });
  }

  getLanguage(languageKind: TreeSitterCodebaseLanguageKind): Language {
    switch (languageKind) {
      case "tsx":
        return this.#tsxLanguage;
      case "python":
        return this.#pythonLanguage;
      case "typescript":
        return this.#typeScriptLanguage;
    }
  }
}

export function resolveCodebaseLanguageKindForFilePath(filePath: string): TreeSitterCodebaseLanguageKind | undefined {
  const typeScriptLanguageKind = resolveTypeScriptLanguageKindForFilePath(filePath);
  if (typeScriptLanguageKind) {
    return typeScriptLanguageKind;
  }
  if (filePath.endsWith(".py") || filePath.endsWith(".pyi") || filePath.endsWith(".pyw")) {
    return "python";
  }
  return undefined;
}

export function resolveTypeScriptLanguageKindForFilePath(filePath: string): TreeSitterTypeScriptLanguageKind | undefined {
  if (filePath.endsWith(".tsx")) {
    return "tsx";
  }
  if (filePath.endsWith(".ts") || filePath.endsWith(".mts") || filePath.endsWith(".cts")) {
    return "typescript";
  }
  return undefined;
}

function initializeTreeSitterRuntime(): Promise<void> {
  treeSitterRuntimeInitializationPromise ??= Parser.init({
    locateFile: () => resolvePackageFilePath("web-tree-sitter/web-tree-sitter.wasm"),
  });

  return treeSitterRuntimeInitializationPromise;
}

function resolvePackageFilePath(packageFilePath: string): string {
  return requireFromTreeSitterLanguageRegistry.resolve(packageFilePath);
}
