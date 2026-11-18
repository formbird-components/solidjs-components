#!/usr/bin/env node
// Sets up the demo database fieldtec-web runs the safety app from: the incident, hazard, corrective
// action, inspection, site and check sheet templates, the pages (safety overview, registers, map,
// actions, inspections, "My safety") and the lookups; the rulesets; the component documents
// (shared's elements, this repo's and the sc-* ones); and the people, sites, incidents, hazards,
// actions and inspections. See "Set up the database" in README.md.
//
// The steps live in solidjs-components-shared (packages/platform/setup.mjs), imported by path
// because nothing is installed yet when this starts.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSetup } from '../solidjs-components-shared/packages/platform/setup.mjs';

await runSetup({
  appRoot: path.dirname(fileURLToPath(import.meta.url)),
  title: 'Safety demo',
  db: 'solidjs-whs-demo',
  config: 'solid-whs',
  port: 3002,
  redisDb: 3,
  buildModule: 'demo/lib/build.mjs',
});
