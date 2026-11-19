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
  title: 'Fleet demo',
  db: 'solidjs-fleet-demo',
  config: 'solid-fleet',
  port: 3001,
  redisDb: 2,
  buildModule: 'demo/lib/build.mjs',
  basePath: 'fleet',
  portal: {
    name: 'Fleet',
    company: 'Harbourline Services',
    tagline: 'Bookings on a calendar, assets and their lifecycle, the workshop, Daily Driver checks, fuel and maps.',
    accent: '#0ea5e9',
  },
};
