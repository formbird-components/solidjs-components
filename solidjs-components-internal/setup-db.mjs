#!/usr/bin/env node
// Sets up the demo database fieldtec-web runs the issue tracker from: the issue, project, board and
// list templates, the rulesets, the component documents (shared's elements, this repo's
// solid-issue-summary and the sc-* ones), the configuration document, and the sample users,
// projects and issues. See "Set up the database" in README.md.
//
// The steps live in solidjs-components-shared (packages/platform/setup.mjs), imported by path
// because nothing is installed yet when this starts.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSetup } from '../solidjs-components-shared/packages/platform/setup.mjs';

await runSetup({
  appRoot: path.dirname(fileURLToPath(import.meta.url)),
  title: 'Issue tracker demo',
  db: 'solidjs-demo',
  config: 'solid-demo',
  port: 3000,
  redisDb: 1,
  buildModule: 'demo/lib/build.mjs',
});
