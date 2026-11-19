#!/usr/bin/env node
// Sets up the demo database fieldtec-web runs the procurement app from: the purchase request, quote,
// supplier, cost centre and catalogue templates, the pages (purchasing overview, my requests, my
// approvals, orders, budgets, the registers) and the lookups; the rulesets; the component documents
// (shared's elements, this repo's and the sc-* ones); and the people, cost centres, suppliers,
// catalogue, requests and quotes. See "Set up the database" in README.md.
//
// The steps live in solidjs-components-shared (packages/platform/setup.mjs), imported by path
// because nothing is installed yet when this starts.

import { runSetup } from '../solidjs-components-shared/packages/platform/setup.mjs';
import { app } from './demo/app.mjs';

await runSetup(app);
