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
  title: 'HR demo',
  db: 'solidjs-hr-demo',
  config: 'solid-hr',
  port: 3004,
  redisDb: 5,
  buildModule: 'demo/lib/build.mjs',
  basePath: 'hr',
  portal: {
    name: 'HR',
    company: 'Bluegum Community Health',
    tagline: 'Leave with balances and minimum staffing, certificates, onboarding and the org chart.',
    accent: '#10b981',
  },
};
