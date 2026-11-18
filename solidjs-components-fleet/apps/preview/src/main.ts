// Fleet preview shell. Plain DOM on purpose: it only sets element properties, exactly like
// fieldtec-web's ComponentService, so what works here works in the host.
import { createFormElement, installMockHost } from '@solidjs-components/testing';
import '../../../../solidjs-components-shared/packages/test-openlayers/index';
import * as fixtures from '../../../packages/fixtures/src/index';
import '../../../../solidjs-components-shared/components/stat-tiles/src/main';
import '../../../components/booking-calendar/src/main';
import '../../../components/date-range/src/main';
import '../../../../solidjs-components-shared/components/map/src/main';
import '../../../components/asset-summary/src/main';
import '../../../../solidjs-components-shared/components/checklist/src/main';
import '../../../components/meter-reading/src/main';
import '../../../components/line-items/src/main';
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
mount('calendar', element('calendar', fixtures.dashboard));
mount('period', element('period', fixtures.newBooking));
mount('availability', element('availability', fixtures.newBooking));
mount('summary', element('summary', fixtures.assets.v101));
mount('location', element('location', fixtures.assets.v101));
mount('map', element('map', fixtures.dashboard));
mount('meter', element('meter', fixtures.dailyDriver));
mount('checks', element('checks', fixtures.dailyDriver));
mount('lines', element('lines', fixtures.workOrder));

const log = document.getElementById('log')!;
host.subscribe(() => {
  const changes = host.changes.slice(-6).map((c) => `${c.fieldName} ← ${JSON.stringify(c.value).slice(0, 140)}`);
  const events = host.events.slice(-3).map((e) => `${e.type}: ${JSON.stringify(e.detail).slice(0, 140)}`);
  log.textContent = [...changes, ...events].join('\n');
});
document.getElementById('dark')!.addEventListener('change', (event) => document.body.classList.toggle('dark-theme', (event.target as HTMLInputElement).checked));
