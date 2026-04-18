#!/usr/bin/env bun
import { main } from "../dist/cli.js";

// Call the built entrypoint explicitly. Import side effects are not reliable
// here because the bundled file intentionally stays safe to import in tests.
await main(process.argv.slice(2));
