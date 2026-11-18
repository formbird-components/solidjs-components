// Unit tests for logic that needs no DOM, in whichever repo `solid-components test` runs in (it passes
// --root). Elements are covered in a real browser by each repo's test/browser.mjs.
import { defineConfig } from 'vitest/config';
import { sharedRoot } from './repo.mjs';
import { sharedAliases, SOLID_GLOBALS } from './vite-config.mjs';

export default defineConfig({
  resolve: { alias: sharedAliases(), dedupe: Object.keys(SOLID_GLOBALS) },
  // App repos' tests import the kit from solidjs-components-shared, outside their own root.
  server: { fs: { allow: [process.cwd(), sharedRoot] } },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'components/*/test/**/*.test.ts', 'demo/test/**/*.test.ts'],
    environment: 'node',
  },
});
