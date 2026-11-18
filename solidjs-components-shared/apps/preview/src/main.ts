// Preview shell. Plain DOM on purpose: it only sets element properties, exactly like
// fieldtec-web's ComponentService, so what works here works in the host.
import { createFormElement, fixtures, installMockHost, type ChangeRecord, type HostEvent } from '@solidjs-components/testing';
import '../../../components/record-key/src/main';
import '../../../components/status/src/main';
import '../../../components/lookup-picker/src/main';
import '../../../components/user-picker/src/main';
import '../../../components/table/src/main';
import '../../../components/comments/src/main';
import '../../../components/photo-capture/src/main';
import '../../../components/image-pins/src/main';
import './preview.css';

const READONLY_ID = 'issue-readonly';
const INCIDENT_READONLY_ID = 'incident-readonly';
const host = installMockHost({
  documents: fixtures.documents,
  forms: [
    fixtures.issue,
    fixtures.newIssue,
    { ...fixtures.issue, documentId: READONLY_ID },
    fixtures.listPage,
    fixtures.incident,
    { ...structuredClone(fixtures.incident), documentId: INCIDENT_READONLY_ID },
    fixtures.photoReference,
    fixtures.pdfReference,
  ],
  currentAccountId: fixtures.CURRENT_ACCOUNT_ID,
  latencyMs: 250,
});
(globalThis as Record<string, unknown>).previewHost = host;

// The sample photos' files: fieldtec-web would serve them from api/getFile/<fileNo>.
const files = (globalThis as { FormbirdServiceInjector?: Record<string, unknown> }).FormbirdServiceInjector?.FileProviderService as {
  getFileResources(file: { fileNo: string; fileName?: string }): Promise<{ url?: string; base64strData?: string | null }>;
};
const hostFileResources = files.getFileResources.bind(files);
files.getFileResources = async (file) => (fixtures.sampleFiles[file.fileNo] ? { url: fixtures.sampleFiles[file.fileNo], base64strData: null } : hostFileResources(file));

let key = 0;
function element(field: string, documentId: string, overrides: Record<string, unknown> = {}) {
  const definition = { ...fixtures.definitionFor(field), ...overrides };
  return createFormElement(String(definition.componentName), {
    document: { ...host.form(documentId), documentId },
    template: fixtures.issueTemplate,
    componentDefinition: definition,
    key: key++,
  });
}

const slot = (id: string) => document.getElementById(id)!;
const mount = (id: string, el: HTMLElement) => slot(id).appendChild(el);

// Issue view
mount('slot-key', element('itemRef', fixtures.ISSUE_ID, { label: '', hideLabel: true }));
// The summary is an internal-app element (solidjs-components-internal); here it is plain text.
const title = document.createElement('h1');
title.className = 'pv-title';
title.textContent = String(fixtures.issue.summary ?? '');
mount('slot-summary', title);
for (const field of ['statusRel', 'assigneeRel', 'reporterRel', 'typeRel', 'priorityRel', 'severityRel', 'resolutionRel', 'monitoringRel']) {
  mount(`slot-${field}`, element(field, fixtures.ISSUE_ID, field === 'statusRel' ? { hideLabel: true } : {}));
}
mount('slot-tagsRel', element('tagsRel', fixtures.ISSUE_ID, { hideLabel: true }));
mount('slot-notesCommentsArr', element('notesCommentsArr', fixtures.ISSUE_ID));
slot('save-issue').addEventListener('click', () => host.saveForm(fixtures.ISSUE_ID));

// Photos and pins on an incident, read-only copies, and fieldtec-web's file references
function onTemplate(template: { components: { name: string }[] } & Record<string, unknown>, field: string, documentId: string, overrides: Record<string, unknown> = {}) {
  const definition = { ...fixtures.definitionFor(field, template as never), ...overrides };
  return createFormElement(String(definition.componentName), {
    document: { ...host.form(documentId), documentId },
    template,
    componentDefinition: definition,
    key: key++,
  });
}
mount('slot-photos', onTemplate(fixtures.incidentTemplate, 'photosArr', fixtures.INCIDENT_ID));
mount('slot-pins', onTemplate(fixtures.incidentTemplate, 'injuryPinsArr', fixtures.INCIDENT_ID));
mount('slot-pins', onTemplate(fixtures.incidentTemplate, 'defectPinsArr', fixtures.INCIDENT_ID));
mount('slot-files', onTemplate(fixtures.incidentTemplate, 'photosArr', INCIDENT_READONLY_ID, { mode: 'view', label: 'Photos (mode: view)' }));
mount('slot-files', onTemplate(fixtures.fileReferenceTemplate, 'fileDetails', fixtures.photoReference.documentId, { label: 'File reference: a photo' }));
mount('slot-files', onTemplate(fixtures.fileReferenceTemplate, 'fileDetails', fixtures.pdfReference.documentId, { label: 'File reference: a PDF' }));
mount('slot-readonly-pins', onTemplate(fixtures.incidentTemplate, 'injuryPinsArr', INCIDENT_READONLY_ID, { readOnly: true, label: 'Where were they hurt? (readOnly)' }));
let refusing = false;
slot('refuse-upload').addEventListener('click', (event) => {
  refusing = !refusing;
  host.refuse('upload', refusing ? 'File type not allowed: exe' : null);
  (event.currentTarget as HTMLElement).textContent = refusing ? 'Accept uploads again' : 'Refuse uploads (server says "File type not allowed")';
});

// List page
for (const table of fixtures.listTemplate.components) {
  mount(
    'slot-lists',
    createFormElement(table.componentName, {
      document: { ...host.form(fixtures.listPage.documentId), documentId: fixtures.listPage.documentId },
      template: fixtures.listTemplate,
      componentDefinition: structuredClone(table),
      key: key++,
    }),
  );
}

// New issue and read-only states
const newFields = ['itemRef', 'statusRel', 'assigneeRel', 'typeRel', 'tagsRel'];
for (const field of newFields) mount('slot-new', element(field, fixtures.newIssue.documentId));
for (const field of ['statusRel', 'assigneeRel', 'priorityRel', 'tagsRel']) {
  mount('slot-readonly', element(field, READONLY_ID, { enabled: false }));
}

slot('validate-new').addEventListener('click', () => {
  for (const field of newFields) host.validate(fixtures.newIssue.documentId, field, fixtures.definitionFor(field));
});

// Ruleset simulation
const templateId = fixtures.issueTemplate.documentId;
let disabled = false;
slot('rule-disable').addEventListener('click', () => {
  disabled = !disabled;
  for (const field of ['statusRel', 'assigneeRel', 'typeRel', 'priorityRel', 'severityRel', 'tagsRel']) {
    host.updateDefinition(templateId, field, { enabled: !disabled });
  }
});
slot('rule-filter').addEventListener('click', () => {
  host.updateDefinition(templateId, 'assigneeRel', {
    filter: { query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'account' } }, { term: { documentId: 'account-hana' } }] } } },
  });
});
slot('rule-status').addEventListener('click', () => {
  const testing = fixtures.statuses.find((s) => (s.systemHeader as { summaryName: string }).summaryName === 'Testing')!;
  host.setField(fixtures.ISSUE_ID, 'statusRel', [{ documentId: testing.documentId, name: 'Testing', indexNum: testing.indexNum }]);
});

// Theme toggle: fieldtec-web's ThemeService toggles body.dark-theme
const themeButton = slot('toggle-theme');
themeButton.addEventListener('click', () => {
  const dark = document.body.classList.toggle('dark-theme');
  themeButton.textContent = dark ? 'Light theme' : 'Dark theme';
});

// Host log
const describeValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    const label = (v: unknown) => {
      if (!v || typeof v !== 'object') return String(v);
      const entry = v as { name?: unknown; detail?: unknown; caption?: unknown; fileName?: unknown; region?: unknown; kind?: unknown };
      // Related documents show their name, comments their text, photos their caption or file, pins their region.
      const pin = entry.region ? [entry.region, entry.kind].filter(Boolean).join(' · ') : undefined;
      return String(entry.name ?? (typeof entry.detail === 'string' ? `“${entry.detail.slice(0, 40)}”` : undefined) ?? entry.caption ?? entry.fileName ?? pin ?? '?');
    };
    return value.length ? value.map(label).join(', ') : '[]';
  }
  return JSON.stringify(value);
};
const log = slot('log');
let shownChanges = 0;
let shownEvents = 0;
const addEntry = (html: string) => {
  const item = document.createElement('li');
  item.innerHTML = html;
  log.prepend(item);
};
const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
host.subscribe(() => {
  for (const change of host.changes.slice(shownChanges) as ChangeRecord[]) {
    addEntry(
      `<span class="pv-log__tag pv-log__tag--${change.source}">${change.source === 'component' ? 'write' : 'rule'}</span>` +
        `<code>${escape(change.fieldName)}</code> <span class="pv-log__doc">${escape(change.documentId)}</span><div>${escape(describeValue(change.value))}</div>`,
    );
  }
  shownChanges = host.changes.length;
  for (const event of host.events.slice(shownEvents) as HostEvent[]) {
    addEntry(`<span class="pv-log__tag">${event.type}</span><div>${escape(JSON.stringify(event.detail))}</div>`);
  }
  shownEvents = host.events.length;
});
