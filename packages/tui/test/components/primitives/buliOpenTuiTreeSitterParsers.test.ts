import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { buliOpenTuiTreeSitterParserConfigs } from "../../../src/components/primitives/buliOpenTuiTreeSitterParsers.ts";
import { resolveOpenTuiCodeFiletype } from "../../../src/components/primitives/FencedCodeBlock.tsx";

describe("buliOpenTuiTreeSitterParserConfigs", () => {
  test("registers_common_non_bundled_code_fence_parsers", () => {
    expect(buliOpenTuiTreeSitterParserConfigs.map((parserConfig) => parserConfig.filetype)).toEqual([
      "c",
      "cpp",
      "csharp",
      "python",
      "bash",
      "json",
      "yaml",
      "css",
      "html",
      "java",
      "kotlin",
      "go",
      "rust",
      "ruby",
      "php",
      "lua",
      "toml",
      "hcl",
      "nix",
      "xml",
      "swift",
      "make",
      "elixir",
      "diff",
    ]);
  });

  test("every_parser_points_at_an_existing_vendored_highlight_query_file", () => {
    for (const parserConfig of buliOpenTuiTreeSitterParserConfigs) {
      for (const highlightQueryPath of parserConfig.queries.highlights) {
        expect(existsSync(highlightQueryPath)).toBe(true);
      }
    }
  });

  test("covers_python_fence_labels_and_source_paths", () => {
    const pythonParserConfig = buliOpenTuiTreeSitterParserConfigs.find(
      (parserConfig) => parserConfig.filetype === "python",
    );

    expect(pythonParserConfig?.aliases).toContain("py");
    expect(pythonParserConfig?.wasm).toContain("tree-sitter-python");
    expect(pythonParserConfig?.queries.highlights[0]).toContain("treeSitterHighlightQueries/python.highlights.scm");
    expect(resolveOpenTuiCodeFiletype(undefined, "py")).toBe("python");
    expect(resolveOpenTuiCodeFiletype(undefined, "python")).toBe("python");
    expect(resolveOpenTuiCodeFiletype("apps/api/tests/unit/auth/test_oauth_login_use_cases.py:67-83", undefined)).toBe(
      "python",
    );
  });

  test("uses_aliases_for_shell_and_diff_fence_labels", () => {
    const bashParserConfig = buliOpenTuiTreeSitterParserConfigs.find((parserConfig) => parserConfig.filetype === "bash");
    const hclParserConfig = buliOpenTuiTreeSitterParserConfigs.find((parserConfig) => parserConfig.filetype === "hcl");
    const makeParserConfig = buliOpenTuiTreeSitterParserConfigs.find((parserConfig) => parserConfig.filetype === "make");
    const diffParserConfig = buliOpenTuiTreeSitterParserConfigs.find((parserConfig) => parserConfig.filetype === "diff");

    expect(bashParserConfig?.aliases).toEqual(["sh", "shell", "shellscript", "zsh"]);
    expect(hclParserConfig?.aliases).toEqual(["tf", "terraform", "terraform-vars"]);
    expect(makeParserConfig?.aliases).toEqual(["makefile"]);
    expect(diffParserConfig?.aliases).toEqual(["patch", "udiff"]);
  });

  test("covers_additional_opencode_parser_filetypes", () => {
    expect(resolveOpenTuiCodeFiletype(undefined, "cpp")).toBe("cpp");
    expect(resolveOpenTuiCodeFiletype("src/Program.cs", undefined)).toBe("csharp");
    expect(resolveOpenTuiCodeFiletype("src/Main.kt", undefined)).toBe("kotlin");
    expect(resolveOpenTuiCodeFiletype(undefined, "ruby")).toBe("ruby");
    expect(resolveOpenTuiCodeFiletype("Makefile", undefined)).toBe("make");
    expect(resolveOpenTuiCodeFiletype(undefined, "elixir")).toBe("elixir");
  });
});
