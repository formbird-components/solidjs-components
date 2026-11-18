#!/usr/bin/env node
// Sets up the demo database fieldtec-web runs the HR app from: the leave request, certificate,
// onboarding and expiry check templates, the pages (people overview, My HR, My team, the leave
// calendar, the skills matrix, the org chart, the registers) and the lookups; the rulesets; the
// component documents (shared's elements, this repo's and the sc-* ones); and the people, teams,
// leave, certificates and onboarding. See "Set up the database" in README.md.
//
// The steps live in solidjs-components-shared (packages/platform/setup.mjs), imported by path
// because nothing is installed yet when this starts.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSetup } from '../solidjs-components-shared/packages/platform/setup.mjs';

await runSetup({
  appRoot: path.dirname(fileURLToPath(import.meta.url)),
  title: 'HR demo',
  db: 'solidjs-hr-demo',
  config: 'solid-hr',
  port: 3004,
  redisDb: 5,
  buildModule: 'demo/lib/build.mjs',
});
