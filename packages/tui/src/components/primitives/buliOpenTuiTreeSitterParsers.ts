import { fileURLToPath } from "node:url";
import type { FiletypeParserOptions } from "@opentui/core";

// OpenTUI only bundles a small parser set. Register the common extra parsers here.
//
// Highlight queries are vendored under ./treeSitterHighlightQueries because their
// upstream URLs track moving branches (nvim-treesitter master) that can change or
// break at any time, and a network fetch on first highlight adds cold-start latency.
// Grammar wasm binaries stay remote on purpose: the URLs are pinned, immutable
// release artifacts that OpenTUI downloads once and caches on disk, and committing
// ~10MB of binaries to git is worse than that one-time download.
// See ./treeSitterHighlightQueries/README.md for query provenance and refresh steps.
function bundledHighlightQueryPath(highlightQueryFileName: string): string {
  return fileURLToPath(new URL(`./treeSitterHighlightQueries/${highlightQueryFileName}`, import.meta.url));
}

export const buliOpenTuiTreeSitterParserConfigs: FiletypeParserOptions[] = [
  {
    filetype: "c",
    wasm: "https://github.com/tree-sitter/tree-sitter-c/releases/download/v0.24.1/tree-sitter-c.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("c.highlights.scm")],
    },
  },
  {
    filetype: "cpp",
    wasm: "https://github.com/tree-sitter/tree-sitter-cpp/releases/download/v0.23.4/tree-sitter-cpp.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("cpp.highlights.scm")],
    },
  },
  {
    filetype: "csharp",
    wasm: "https://github.com/tree-sitter/tree-sitter-c-sharp/releases/download/v0.23.1/tree-sitter-c_sharp.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("csharp.highlights.scm")],
    },
  },
  {
    filetype: "python",
    aliases: ["py"],
    wasm: "https://github.com/tree-sitter/tree-sitter-python/releases/download/v0.23.6/tree-sitter-python.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("python.highlights.scm")],
    },
  },
  {
    filetype: "bash",
    aliases: ["sh", "shell", "shellscript", "zsh"],
    wasm: "https://github.com/tree-sitter/tree-sitter-bash/releases/download/v0.25.0/tree-sitter-bash.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("bash.highlights.scm")],
    },
  },
  {
    filetype: "json",
    wasm: "https://github.com/tree-sitter/tree-sitter-json/releases/download/v0.24.8/tree-sitter-json.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("json.highlights.scm")],
    },
  },
  {
    filetype: "yaml",
    aliases: ["yml"],
    wasm: "https://github.com/tree-sitter-grammars/tree-sitter-yaml/releases/download/v0.7.2/tree-sitter-yaml.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("yaml.highlights.scm")],
    },
  },
  {
    filetype: "css",
    wasm: "https://github.com/tree-sitter/tree-sitter-css/releases/download/v0.25.0/tree-sitter-css.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("css.highlights.scm")],
    },
  },
  {
    filetype: "html",
    wasm: "https://github.com/tree-sitter/tree-sitter-html/releases/download/v0.23.2/tree-sitter-html.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("html.highlights.scm")],
    },
  },
  {
    filetype: "java",
    wasm: "https://github.com/tree-sitter/tree-sitter-java/releases/download/v0.23.5/tree-sitter-java.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("java.highlights.scm")],
    },
  },
  {
    filetype: "kotlin",
    wasm: "https://github.com/fwcd/tree-sitter-kotlin/releases/download/0.3.8/tree-sitter-kotlin.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("kotlin.highlights.scm")],
    },
  },
  {
    filetype: "go",
    wasm: "https://github.com/tree-sitter/tree-sitter-go/releases/download/v0.25.0/tree-sitter-go.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("go.highlights.scm")],
    },
  },
  {
    filetype: "rust",
    wasm: "https://github.com/tree-sitter/tree-sitter-rust/releases/download/v0.24.0/tree-sitter-rust.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("rust.highlights.scm")],
    },
  },
  {
    filetype: "ruby",
    wasm: "https://github.com/tree-sitter/tree-sitter-ruby/releases/download/v0.23.1/tree-sitter-ruby.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("ruby.highlights.scm")],
    },
  },
  {
    filetype: "php",
    wasm: "https://github.com/tree-sitter/tree-sitter-php/releases/download/v0.24.2/tree-sitter-php.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("php.highlights.scm")],
    },
  },
  {
    filetype: "lua",
    wasm: "https://github.com/tree-sitter-grammars/tree-sitter-lua/releases/download/v0.5.0/tree-sitter-lua.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("lua.highlights.scm")],
    },
  },
  {
    filetype: "toml",
    wasm: "https://github.com/tree-sitter-grammars/tree-sitter-toml/releases/download/v0.7.0/tree-sitter-toml.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("toml.highlights.scm")],
    },
  },
  {
    filetype: "hcl",
    aliases: ["tf", "terraform", "terraform-vars"],
    wasm: "https://github.com/tree-sitter-grammars/tree-sitter-hcl/releases/download/v1.2.0/tree-sitter-hcl.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("hcl.highlights.scm")],
    },
  },
  {
    filetype: "nix",
    wasm: "https://github.com/ast-grep/ast-grep.github.io/raw/40b84530640aa83a0d34a20a2b0623d7b8e5ea97/website/public/parsers/tree-sitter-nix.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("nix.highlights.scm")],
    },
  },
  {
    filetype: "xml",
    wasm: "https://github.com/tree-sitter-grammars/tree-sitter-xml/releases/download/v0.7.0/tree-sitter-xml.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("xml.highlights.scm")],
    },
  },
  {
    filetype: "swift",
    wasm: "https://github.com/alex-pinkus/tree-sitter-swift/releases/download/0.7.1/tree-sitter-swift.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("swift.highlights.scm")],
    },
  },
  {
    filetype: "make",
    aliases: ["makefile"],
    wasm: "https://github.com/tree-sitter-grammars/tree-sitter-make/releases/download/v1.1.1/tree-sitter-make.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("make.highlights.scm")],
    },
  },
  {
    filetype: "elixir",
    wasm: "https://github.com/elixir-lang/tree-sitter-elixir/releases/download/v0.3.5/tree-sitter-elixir.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("elixir.highlights.scm")],
    },
  },
  {
    filetype: "diff",
    aliases: ["patch", "udiff"],
    wasm: "https://github.com/tree-sitter-grammars/tree-sitter-diff/releases/download/v0.1.0/tree-sitter-diff.wasm",
    queries: {
      highlights: [bundledHighlightQueryPath("diff.highlights.scm")],
    },
  },
];
