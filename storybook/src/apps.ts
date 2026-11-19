// The data each story runs on: an app's fixtures (the same ones its preview and browser test use)
// installed as the in-memory fieldtec-web host. A story installs its app's host each time it
// renders, so stories never see another app's documents or changes.
import { fixtures, installMockHost, type MockHost } from '@solidjs-components/testing';
import * as fleet from '../../solidjs-components-fleet/packages/fixtures/src/index';
import * as hr from '../../solidjs-components-hr/packages/fixtures/src/index';
import * as procurement from '../../solidjs-components-procurement/packages/fixtures/src/index';
import * as whs from '../../solidjs-components-whs/packages/fixtures/src/index';
import { serveSampleFiles } from './files';

export type Doc = Record<string, unknown> & { documentId: string; systemHeader?: Record<string, unknown> };
export type ComponentDef = Record<string, unknown> & { componentName: string; name: string };
export type AppKey = 'shared' | 'fleet' | 'whs' | 'hr' | 'procurement';

/** How long the host takes to answer, so loading states show briefly as they would. */
const LATENCY_MS = 120;

const incidentCopy = (documentId: string, values: Record<string, unknown> = {}): Doc => ({ ...structuredClone(fixtures.incident), documentId, ...values });

/** Extra forms the shared stories open: copies of the incident for the photo and pin variants. */
export const sharedForms = {
  incidentFiles: incidentCopy('incident-files', { photosArr: [] }),
  incidentReadOnly: incidentCopy('incident-readonly'),
};

const install: Record<AppKey, () => MockHost> = {
  shared: () =>
    installMockHost({
      documents: fixtures.documents,
      forms: [
        fixtures.issue,
        fixtures.newIssue,
        fixtures.listPage,
        fixtures.incident,
        sharedForms.incidentFiles,
        sharedForms.incidentReadOnly,
        fixtures.photoReference,
        fixtures.pdfReference,
      ],
      currentAccountId: fixtures.CURRENT_ACCOUNT_ID,
      latencyMs: LATENCY_MS,
    }),
  fleet: () => installMockHost({ documents: fleet.documents, forms: fleet.forms, currentAccountId: fleet.CURRENT_ACCOUNT_ID, latencyMs: LATENCY_MS }),
  whs: () => installMockHost({ documents: whs.documents, forms: whs.forms, currentAccountId: whs.CURRENT_ACCOUNT_ID, latencyMs: LATENCY_MS }),
  hr: () => installMockHost({ documents: hr.documents, forms: hr.forms, currentAccountId: hr.CURRENT_ACCOUNT_ID, latencyMs: LATENCY_MS }),
  procurement: () =>
    installMockHost({ documents: procurement.documents, forms: procurement.forms, currentAccountId: procurement.CURRENT_ACCOUNT_ID, latencyMs: LATENCY_MS }),
};

/**
 * Installs an app's in-memory host on the page (window.FormbirdServiceInjector).
 * @param app - Whose fixtures
 * @returns The host, for reading what the element changed
 */
export function installApp(app: AppKey): MockHost {
  const host = install[app]();
  serveSampleFiles();
  (globalThis as Record<string, unknown>).storyHost = host;
  return host;
}

export { fixtures, fleet, hr, procurement, whs };
