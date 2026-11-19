#!/usr/bin/env node
// Sets up the demo database fieldtec-web runs the issue tracker from: the issue, project, board and
// list templates, the rulesets, the component documents (shared's elements, this repo's
// solid-issue-summary and the sc-* ones), the configuration document, and the sample users,
// projects and issues. See "Set up the database" in README.md.
//
// The steps live in solidjs-components-shared (packages/platform/setup.mjs), imported by path
// because nothing is installed yet when this starts.

import { runSetup } from '../solidjs-components-shared/packages/platform/setup.mjs';
import { app } from './demo/app.mjs';

await runSetup(app);
