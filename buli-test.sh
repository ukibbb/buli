#!/usr/bin/env bash
set -euo pipefail

SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done

SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"

# Run the CLI from source so each invocation sees the latest repo code without
# waiting for a rebuild. This is the primary developer workflow.
node --import tsx "$SCRIPT_DIR/apps/cli/src/cli.ts" ${1+"$@"}
