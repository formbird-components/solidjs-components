// Preview gallery: the safety app's elements (and the shared ones it uses) against the in-memory
// host, with the fixtures. Run: pnpm dev.
import { createFormElement, installMockHost } from '@solidjs-components/testing';
import * as fixtures from '../../../packages/fixtures/src/index';
import '../../../../solidjs-components-shared/components/stat-tiles/src/main';
import '../../../components/risk-matrix/src/main';
import '../../../components/root-cause/src/main';
import '../../../components/corrective-actions/src/main';
import './preview.css';

const host = installMockHost({
  documents: fixtures.documents,
  forms: fixtures.forms,
  currentAccountId: fixtures.CURRENT_ACCOUNT_ID,
  latencyMs: 150,
});
(globalThis as Record<string, unknown>).previewHost = host;

let key = 0;
function element(role: string, form: { documentId: string }) {
  const definition = structuredClone(fixtures.definitions[role]);
  const el = createFormElement(definition.componentName, {
    document: { ...host.form(form.documentId), documentId: form.documentId, systemHeader: (form as Record<string, unknown>).systemHeader },
    template: fixtures.template,
    componentDefinition: definition,
    key: key++,
  });
  el.id = `pv-${role}`;
  return el;
}
const mount = (slot: string, el: HTMLElement) => document.getElementById(`slot-${slot}`)!.appendChild(el);

mount('tiles', element('tiles', fixtures.dashboard));
mount('matrix', element('matrix', fixtures.incident));
mount('residual', element('residual', fixtures.pedestrianHazard));
mount('heatmap', element('heatmap', fixtures.dashboard));
mount('rootCause', element('rootCause', fixtures.incident));
mount('rootCauseNew', element('rootCauseNew', fixtures.newIncident));
mount('actions', element('actions', fixtures.incident));
mount('actionsNew', element('actionsNew', fixtures.newIncident));
mount('hazardActions', element('hazardActions', fixtures.pedestrianHazard));

const log = document.getElementById('log')!;
host.subscribe(() => {
  const changes = host.changes.slice(-6).map((c) => `${c.fieldName} ← ${JSON.stringify(c.value).slice(0, 140)}`);
  const events = host.events.slice(-3).map((e) => `${e.type}: ${JSON.stringify(e.detail).slice(0, 140)}`);
  log.textContent = [...changes, ...events].join('\n');
});
document.getElementById('dark')!.addEventListener('change', (event) => document.body.classList.toggle('dark-theme', (event.target as HTMLInputElement).checked));
