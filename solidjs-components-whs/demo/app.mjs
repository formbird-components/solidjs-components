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
  title: 'Safety demo',
  db: 'solidjs-whs-demo',
  config: 'solid-whs',
  port: 3002,
  redisDb: 3,
  buildModule: 'demo/lib/build.mjs',
  basePath: 'safety',
  portal: {
    name: 'Work health and safety',
    company: 'Brightwater Group',
    tagline: 'Incidents and near misses, the hazard register, corrective actions and inspections.',
    accent: '#f97316',
  },
};
