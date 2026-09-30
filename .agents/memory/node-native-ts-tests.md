---
name: Node-native TypeScript tests
description: How this workspace runs small TypeScript tests without adding a test framework.
---

Use Node 24's built-in `--experimental-strip-types --test` for dependency-free TypeScript policy tests. Keep `.ts` suffixes in test imports for Node resolution, and exclude `*.test.ts` from the application TypeScript check so the compiler can keep its normal import rules.

**Why:** Node's native test runner and the workspace TypeScript compiler resolve TypeScript imports differently.

**How to apply:** For small pure logic tests, keep the test beside the module and add a package-level `test` script using the Node test runner; use the regular workspace typecheck for application sources.