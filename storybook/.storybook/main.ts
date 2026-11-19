// Storybook of every Solid element in the solidjs-components repos. The elements are compiled from
// source with the same Solid compiler, runtime and aliases as the repos' own builds and previews
// (solidjs-components-shared/packages/tools/vite-config.mjs), and run on the in-memory Formbird host.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/html-vite';
import { mergeConfig } from 'vite';
// @ts-expect-error: plain ESM tooling without type declarations
import { sharedAliases, solidPlugin, SOLID_GLOBALS } from '@solidjs-components/tools/vite-config';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const config: StorybookConfig = {
  framework: { name: '@storybook/html-vite', options: {} },
  stories: ['../stories/**/*.mdx', '../stories/**/*.stories.ts'],
  addons: ['@storybook/addon-docs'],
  core: { disableTelemetry: true },
  viteFinal: (viteConfig) =>
    mergeConfig(viteConfig, {
      plugins: [solidPlugin()],
      resolve: { alias: sharedAliases(), dedupe: Object.keys(SOLID_GLOBALS) },
      // The element sources live in the sibling repos.
      server: { fs: { allow: [ROOT] }, allowedHosts: true },
    }),
};

export default config;
