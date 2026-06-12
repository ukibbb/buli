# Vendored tree-sitter highlight queries

These `.scm` files are snapshots of upstream highlight queries, vendored so that
syntax highlighting does not depend on mutable branch URLs at runtime (the
nvim-treesitter master queries change without notice and have broken parser
compatibility before) and so the first highlighted code block needs no network
fetch.

Grammar wasm binaries are NOT vendored — they stay in
`buliOpenTuiTreeSitterParsers.ts` as pinned, immutable release URLs that OpenTUI
downloads once and caches on disk.

Snapshot taken: 2026-06-12.

## Sources

| File | Upstream |
| --- | --- |
| c.highlights.scm | nvim-treesitter master `queries/c/highlights.scm` |
| cpp.highlights.scm | nvim-treesitter master `queries/cpp/highlights.scm` |
| csharp.highlights.scm | nvim-treesitter master `queries/c_sharp/highlights.scm` |
| python.highlights.scm | tree-sitter/tree-sitter-python master `queries/highlights.scm` |
| bash.highlights.scm | nvim-treesitter master `queries/bash/highlights.scm` |
| json.highlights.scm | nvim-treesitter master `queries/json/highlights.scm` |
| yaml.highlights.scm | nvim-treesitter master `queries/yaml/highlights.scm` |
| css.highlights.scm | nvim-treesitter master `queries/css/highlights.scm` |
| html.highlights.scm | tree-sitter/tree-sitter-html master `queries/highlights.scm` |
| java.highlights.scm | nvim-treesitter master `queries/java/highlights.scm` |
| kotlin.highlights.scm | fwcd/tree-sitter-kotlin 0.3.8 `queries/highlights.scm` |
| go.highlights.scm | nvim-treesitter master `queries/go/highlights.scm` |
| rust.highlights.scm | nvim-treesitter master `queries/rust/highlights.scm` |
| ruby.highlights.scm | nvim-treesitter master `queries/ruby/highlights.scm` |
| php.highlights.scm | tree-sitter/tree-sitter-php master `queries/highlights.scm` |
| lua.highlights.scm | tree-sitter-grammars/tree-sitter-lua v0.5.0 `queries/highlights.scm` |
| toml.highlights.scm | nvim-treesitter master `queries/toml/highlights.scm` |
| hcl.highlights.scm | nvim-treesitter master `queries/hcl/highlights.scm` |
| nix.highlights.scm | nvim-treesitter master `queries/nix/highlights.scm` |
| xml.highlights.scm | nvim-treesitter master `queries/xml/highlights.scm` |
| swift.highlights.scm | alex-pinkus/tree-sitter-swift main `queries/highlights.scm` |
| make.highlights.scm | nvim-treesitter master `queries/make/highlights.scm` |
| elixir.highlights.scm | nvim-treesitter master `queries/elixir/highlights.scm` |
| diff.highlights.scm | tree-sitter-grammars/tree-sitter-diff master `queries/highlights.scm` |

## Refreshing

Re-download a file from its upstream above, then verify the query still loads
against the pinned grammar wasm version in `buliOpenTuiTreeSitterParsers.ts`
(run the TUI markdown tests; a query/grammar mismatch surfaces as missing
highlighting for that language). Update the snapshot date here.
