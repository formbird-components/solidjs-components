#!/usr/bin/env node
// Sets up the demo database fieldtec-web runs the fleet app from: the asset, booking, Daily Driver,
// workshop request, work order, fuel, location, check sheet, service plan and material templates,
// the pages (overview, booking calendar, asset map, workshop dashboard, lists) and the lookups; the
// rulesets; the component documents (shared's elements, this repo's and the sc-* ones); and the
// people, sites, assets, bookings, requests, work orders, checks and fuel receipts.
// See "Set up the database" in README.md.
//
// The steps live in solidjs-components-shared (packages/platform/setup.mjs), imported by path
// because nothing is installed yet when this starts.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSetup } from '../solidjs-components-shared/packages/platform/setup.mjs';

await runSetup({
  appRoot: path.dirname(fileURLToPath(import.meta.url)),
  title: 'Fleet demo',
  db: 'solidjs-fleet-demo',
  config: 'solid-fleet',
  port: 3001,
  redisDb: 2,
  buildModule: 'demo/lib/build.mjs',
});
