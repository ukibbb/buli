#!/usr/bin/env bash
set -euo pipefail

SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done

SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
TSX_RUNNER="$SCRIPT_DIR/node_modules/.bin/tsx"
TS_CONFIG="$SCRIPT_DIR/tsconfig.json"
CLI_ENTRYPOINT="$SCRIPT_DIR/apps/cli/src/cli.ts"

if [ ! -x "$TSX_RUNNER" ]; then
  printf 'buli dependencies are not installed in %s.\nRun `bun install` in the buli repo and try again.\n' "$SCRIPT_DIR" >&2
  exit 1
fi

# Run the CLI from source so each invocation sees the latest repo code without
# waiting for a rebuild, even when launched from another directory.
exec "$TSX_RUNNER" --tsconfig "$TS_CONFIG" "$CLI_ENTRYPOINT" "$@"
