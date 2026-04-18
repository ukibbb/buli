// Loaded before any test module by bun via bunfig.toml's [test].preload.
// Setting FORCE_COLOR here ensures chalk emits 24-bit ANSI in the non-TTY
// test environment so design-token color regression tests can match against
// the expected escape sequences. ESM hoisting means setting this at the top
// of an individual test file would fire after `import 'ink'`, by which point
// chalk has already locked its color level.
process.env.FORCE_COLOR = "3";
