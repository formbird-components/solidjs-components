// Preview gallery: the procurement app's elements (and the shared ones it uses) against the in-memory
// host, with the fixtures. Run: pnpm dev.
import { createFormElement, installMockHost } from '@solidjs-components/testing';
import * as fixtures from '../../../packages/fixtures/src/index';
import '../../../../solidjs-components-shared/components/line-items/src/main';
import '../../../../solidjs-components-shared/components/photo-capture/src/main';
import '../../../components/budget-check/src/main';
import '../../../components/quote-compare/src/main';
import './preview.css';

const host = installMockHost({ documents: fixtures.documents, forms: fixtures.forms, currentAccountId: fixtures.CURRENT_ACCOUNT_ID, latencyMs: 150 });
(globalThis as Record<string, unknown>).previewHost = host;

const FORM_FOR: Record<string, { documentId: string; systemHeader?: unknown }> = {
  lines: fixtures.draft,
  budget: fixtures.draft,
  budgetOver: fixtures.itRequest,
  quotes: fixtures.draft,
  docs: fixtures.draft,
  budgets: fixtures.dashboard,
  budgetsNone: fixtures.dashboard,
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
  log.textContent = [...changes, ...events].join('\n');
});
document.getElementById('dark')!.addEventListener('change', (event) => document.body.classList.toggle('dark-theme', (event.target as HTMLInputElement).checked));
