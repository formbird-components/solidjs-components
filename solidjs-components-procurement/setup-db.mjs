#!/usr/bin/env node
// Sets up the demo database fieldtec-web runs the procurement app from: the purchase request, quote,
// supplier, cost centre and catalogue templates, the pages (purchasing overview, my requests, my
// approvals, orders, budgets, the registers) and the lookups; the rulesets; the component documents
// (shared's elements, this repo's and the sc-* ones); and the people, cost centres, suppliers,
// catalogue, requests and quotes. See "Set up the database" in README.md.
//
// The steps live in solidjs-components-shared (packages/platform/setup.mjs), imported by path
// because nothing is installed yet when this starts.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSetup } from '../solidjs-components-shared/packages/platform/setup.mjs';

await runSetup({
  appRoot: path.dirname(fileURLToPath(import.meta.url)),
  title: 'Procurement demo',
  db: 'solidjs-procurement-demo',
  config: 'solid-procurement',
  port: 3005,
  redisDb: 6,
  buildModule: 'demo/lib/build.mjs',
});
