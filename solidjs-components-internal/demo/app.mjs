// This demo's settings: its database, fieldtec-web config, port and Redis database (used by
// setup-db.mjs and demo/server.mjs), the path it is served under behind the nginx proxy, and how the
// home page describes it (solidjs-components/portal).
//
// Only Node built-ins are imported: setup-db.mjs loads this before anything is installed.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('../../solidjs-components-shared/packages/platform/setup.mjs').AppSetup} */
export const app = {
  appRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  title: 'Issue tracker demo',
  db: 'solidjs-demo',
  config: 'solid-demo',
  port: 3000,
  redisDb: 1,
  buildModule: 'demo/lib/build.mjs',
  basePath: 'issues',
  portal: {
    name: 'Issue tracker',
    company: 'Internal SDMS',
    tagline: 'Projects, a board, issues assigned to you and what changed recently: a Jira-style tracker.',
    accent: '#6366f1',
  },
};
