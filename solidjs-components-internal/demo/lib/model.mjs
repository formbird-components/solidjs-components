// Identifiers shared by every part of the issue tracker seed. Platform ids and document
// scaffolding come from solidjs-components-shared (packages/platform/documents.mjs).

import { CONFIG_ID, idFactory, SYSTEM, TEMPLATE_EDITOR_ID } from '@solidjs-components/platform/documents';

export { CONFIG_ID, SYSTEM, TEMPLATE_EDITOR_ID };
export { header, related } from '@solidjs-components/platform/documents';

/** Stable id for a demo object, so re-seeding keeps links and bookmarks working. */
export const demoId = idFactory('demo');

/** Everyone in the demo signs in with this password. */
export const DEMO_PASSWORD = 'Demo1234!';

/** Issue keys: one global sequence, like SDMS (itemRef "TRK-12"). */
export const KEY_PREFIX = 'TRK';

/** Access key guarding password hashes and permissions; only the admin holds it. */
export const ADMIN_KEY = demoId('key', 'admin');

/** Demo templates. */
export const TEMPLATES = {
  issue: demoId('template', 'Issue'),
  project: demoId('template', 'Project'),
  board: demoId('template', 'Board'),
  home: demoId('template', 'Your work'),
  allIssues: demoId('template', 'All issues'),
  counter: demoId('template', 'Issue counter'),
  status: demoId('template', 'Status'),
  type: demoId('template', 'Issue type'),
  priority: demoId('template', 'Priority'),
  resolution: demoId('template', 'Resolution'),
  tag: demoId('template', 'Label'),
};

export const COUNTER_ID = demoId('counter', 'issues');
export const COUNTER_FIELD = 'issueCounter';
