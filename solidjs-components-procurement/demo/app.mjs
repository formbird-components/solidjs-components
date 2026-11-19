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
  title: 'Procurement demo',
  db: 'solidjs-procurement-demo',
  config: 'solid-procurement',
  port: 3005,
  redisDb: 6,
  buildModule: 'demo/lib/build.mjs',
  basePath: 'procurement',
  portal: {
    name: 'Procurement',
    company: 'Ironbark Engineering',
    tagline: 'Purchase requests, quotes compared, budgets per cost centre, approvals by amount and invoice matching.',
    accent: '#a855f7',
  },
};
