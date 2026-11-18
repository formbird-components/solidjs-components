// Preview gallery: the HR app's elements (and the shared ones it uses) against the in-memory host,
// with the fixtures. Run: pnpm dev.
import { createFormElement, installMockHost } from '@solidjs-components/testing';
import * as fixtures from '../../../packages/fixtures/src/index';
import '../../../../solidjs-components-shared/components/date-range/src/main';
import '../../../../solidjs-components-shared/components/approval-chain/src/main';
import '../../../../solidjs-components-shared/components/resource-schedule/src/main';
import '../../../components/leave-balance/src/main';
import '../../../components/skills-matrix/src/main';
import '../../../components/org-chart/src/main';
import './preview.css';

const host = installMockHost({
  documents: fixtures.documents,
  forms: fixtures.forms,
  currentAccountId: fixtures.CURRENT_ACCOUNT_ID,
  latencyMs: 150,
});
(globalThis as Record<string, unknown>).previewHost = host;

/** Which document each element is on. */
const FORM_FOR: Record<string, { documentId: string; systemHeader?: unknown }> = {
  calendar: fixtures.dashboard,
  dates: fixtures.newLeave,
  balance: fixtures.newLeave,
  unpaidBalance: fixtures.unpaidLeave,
  approval: fixtures.meiLeave,
  decided: fixtures.decidedLeave,
  balances: fixtures.dashboard,
  matrix: fixtures.dashboard,
  org: fixtures.dashboard,
  orgFocus: fixtures.sarahProfile,
};

let key = 0;
for (const [role, form] of Object.entries(FORM_FOR)) {
  const definition = structuredClone(fixtures.definitions[role]);
  const el = createFormElement(definition.componentName, {
    document: { ...host.form(form.documentId), documentId: form.documentId, systemHeader: form.systemHeader },
    template: fixtures.template,
    componentDefinition: definition,
    key: key++,
  });
  el.id = `pv-${role}`;
  document.getElementById(`slot-${role}`)!.appendChild(el);
}

const log = document.getElementById('log')!;
host.subscribe(() => {
  const changes = host.changes.slice(-6).map((c) => `${c.fieldName} ← ${JSON.stringify(c.value).slice(0, 160)}`);
  const events = host.events.slice(-3).map((e) => `${e.type}: ${JSON.stringify(e.detail).slice(0, 160)}`);
  const storage = Object.entries(host.storage).map(([k, v]) => `${k}: ${v.slice(0, 160)}`);
  log.textContent = [...changes, ...events, ...storage].join('\n');
});
document.getElementById('dark')!.addEventListener('change', (event) => document.body.classList.toggle('dark-theme', (event.target as HTMLInputElement).checked));
