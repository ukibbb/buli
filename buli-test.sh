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

# Run through bun so the source runner uses the same runtime as the CLI,
# the ink renderer, and the opentui renderer.
if ! command -v bun >/dev/null 2>&1; then
  printf 'bun is required to run buli from source. Install from https://bun.sh and retry.\n' >&2
  exit 1
fi

exec bun "$CLI_ENTRYPOINT" "$@"
