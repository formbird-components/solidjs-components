#!/usr/bin/env node
// Sets up the demo database fieldtec-web runs the safety app from: the incident, hazard, corrective
// action, inspection, site and check sheet templates, the pages (safety overview, registers, map,
// actions, inspections, "My safety") and the lookups; the rulesets; the component documents
// (shared's elements, this repo's and the sc-* ones); and the people, sites, incidents, hazards,
// actions and inspections. See "Set up the database" in README.md.
//
// The steps live in solidjs-components-shared (packages/platform/setup.mjs), imported by path
// because nothing is installed yet when this starts.

import { runSetup } from '../solidjs-components-shared/packages/platform/setup.mjs';
import { app } from './demo/app.mjs';

await runSetup(app);
