#!/usr/bin/env bash
set -euo pipefail

SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done

SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
CLI_ENTRYPOINT="$SCRIPT_DIR/apps/cli/src/cli.ts"

# Run through bun, not tsx/Node. @opentui/core ships tree-sitter grammar
# files (.scm) as package assets, and Node's ESM loader has no format for
# unknown extensions so tsx fails with ERR_UNKNOWN_FILE_EXTENSION before the
# CLI can boot. Bun treats TypeScript as first-class and resolves arbitrary
# asset paths, so both the ink and opentui renderers load cleanly.
if ! command -v bun >/dev/null 2>&1; then
  printf 'bun is required to run buli from source. Install from https://bun.sh and retry.\n' >&2
  exit 1
fi

exec bun "$CLI_ENTRYPOINT" "$@"
