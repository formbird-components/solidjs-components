import template from '../fixtures/solid-issue.template.json';
import listTemplateJson from '../fixtures/solid-issue-list.template.json';

const HOUR = 3_600_000;
/** An ISO date some hours before now, so relative times read naturally in the preview. */
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

/** SDMS application id used by the account filters in the sample template. */
export const SDMS_APP_ID = 'db625088-19bf-4eb6-9783-5f0f11c5aede';
export const PROJECT_ID = 'project-sdms';
export const ISSUE_ID = 'issue-sdms-482';
export const CURRENT_ACCOUNT_ID = 'account-alex';

type Doc = Record<string, unknown> & { documentId: string };

const lookup = (kind: string, names: string[], extra: (name: string, index: number) => Record<string, unknown> = () => ({})): Doc[] =>
  names.map((name, index) => ({
    documentId: `${kind}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}`,
    systemHeader: { systemType: 'document', summaryName: name, templateId: `template-${kind}` },
    appTags: ['sdms', kind],
    nameId: name,
    indexNum: (index + 1) * 10,
    isGlobalDefaultBool: true,
    inactiveBool: false,
    projectRel: [],
    ...extra(name, index),
  }));

const STATUS_COLORS: Record<string, string> = {
  New: '#7c7f8f',
  Acknowledged: '#a35bd1',
  Assigned: '#0b8fb3',
  'In Progress': '#3e63dd',
  'In Review': '#8e4ec6',
  Testing: '#d97706',
  Resolved: '#2f9e5b',
  Closed: '',
  "Won't Fix": 'not-a-colour',
};

export const statuses = lookup('status', Object.keys(STATUS_COLORS), (name) => ({
  color: STATUS_COLORS[name],
  disableItemBool: name === 'Closed',
}));

export const types = lookup('type', ['Bug', 'New Feature', 'Change Request', 'Task', 'Story', 'Epic', 'Support']);
export const priorities = lookup('priority', ['Immediate', 'Urgent', 'High', 'Normal', 'Low']);
export const severities = lookup('severity', ['Block', 'Crash', 'Major', 'Minor', 'Tweak', 'Text', 'Trivial']);
export const resolutions = lookup('resolution', [
  'Fixed',
  'Unable to reproduce',
  'Duplicate',
  'No change required',
  'Not fixable',
  "Won't fix",
]);
export const tags = lookup('tag', [
  'frontend',
  'backend',
  'regression',
  'customer-reported',
  'performance',
  'security',
  'offline',
  'keycloak',
  'solidjs',
  'ux',
]);
/** An inactive status, to prove `must_not inactiveBool` filters work. */
export const inactiveStatus: Doc = { ...lookup('status', ['Retired'])[0], inactiveBool: true };

const PEOPLE: [string, string][] = [
  ['account-alex', 'Alex Morgan'],
  ['account-priya', 'Priya Natarajan'],
  ['account-sam', 'Sam Okafor'],
  ['account-mei', 'Mei Chen'],
  ['account-lucas', 'Lucas Ferreira'],
  ['account-hana', 'Hana Kobayashi'],
  ['account-tom', 'Tom Becker'],
  ['account-aisha', 'Aisha Rahman'],
  ['account-noah', 'Noah Williams'],
];

export const accounts: Doc[] = [
  ...PEOPLE.map(([documentId, name]) => ({
    documentId,
    systemHeader: { systemType: 'account', summaryName: name },
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
    appRel: [{ documentId: SDMS_APP_ID, name: 'SDMS' }],
    sdmsProjectRel: [{ documentId: PROJECT_ID, name: 'SDMS' }],
    inactiveBool: false,
  })),
  {
    documentId: 'account-diego',
    systemHeader: { systemType: 'account', summaryName: 'Diego Alvarez' },
    email: 'diego.alvarez@example.com',
    appRel: [{ documentId: SDMS_APP_ID, name: 'SDMS' }],
    sdmsProjectRel: [{ documentId: PROJECT_ID, name: 'SDMS' }],
    inactiveBool: true,
  },
  {
    documentId: 'account-external',
    systemHeader: { systemType: 'account', summaryName: 'Erin External' },
    email: 'erin@partner.example.com',
    appRel: [{ documentId: 'another-app', name: 'Other' }],
    inactiveBool: false,
  },
];

export const project: Doc = {
  documentId: PROJECT_ID,
  systemHeader: { systemType: 'document', summaryName: 'SDMS' },
  appTags: ['sdms', 'project'],
  projectKey: 'SDMS',
};

const related = (doc: Doc | undefined, extra: Record<string, unknown> = {}) =>
  doc ? { documentId: doc.documentId, name: (doc.systemHeader as { summaryName: string }).summaryName, ...extra } : undefined;
const byName = (docs: Doc[], name: string) => docs.find((d) => (d.systemHeader as { summaryName: string }).summaryName === name);
const lookupFields = (doc: Doc | undefined, withIndex = false) => ({
  projectRel: [],
  isGlobalDefaultBool: true,
  ...(withIndex ? { indexNum: doc?.indexNum } : {}),
});

const author = (account: Doc) => ({ documentId: account.documentId, name: (account.systemHeader as { summaryName: string }).summaryName });

/**
 * The issue's comment thread, stored the way sc-note-comment stores it: a note with a reply and a
 * vote, one by the signed-in user (editable), and one with pasted HTML that must stay text.
 */
export const notes = [
  {
    dataId: 'note-priya',
    detail:
      'Reproduced on **Chrome 131** with network throttling. The second render comes from the status query.\n\n1. Open the Team Intrays Board\n2. Switch projects',
    createdBy: author(accounts[1]),
    createdDate: hoursAgo(50),
    votes: [{ dataId: 'vote-mei', vote: 1, createdBy: author(accounts[3]), createdDate: hoursAgo(49) }],
    thumbsUp: 1,
    thumbsDown: 0,
    comments: [{ dataId: 'reply-mei', detail: 'Same on Edge.', createdBy: author(accounts[3]), createdDate: hoursAgo(30) }],
  },
  {
    dataId: 'note-alex',
    detail: 'A shared status cache should fix it, see `statusAppearance` in the kit. Notes: https://example.com/statuses',
    createdBy: author(accounts[0]),
    createdDate: hoursAgo(20),
  },
  {
    dataId: 'note-sam',
    detail: 'From the customer: <img src=x onerror="window.__xss=1"> and [their link](javascript:window.__xss=2)',
    createdBy: author(accounts[2]),
    createdDate: hoursAgo(3),
  },
];

/** The issue shown in the preview and used by tests. Values are stored the way SDMS stores them. */
export const issue: Doc = {
  documentId: ISSUE_ID,
  systemHeader: { systemType: 'document', summaryName: 'SDMS-482', templateId: template.documentId },
  appTags: ['sdms', 'item'],
  itemRef: '482',
  summary: 'Status lozenge flickers when switching projects in the Team Intrays Board',
  projectRel: [related(project)],
  statusRel: [
    related(byName(statuses, 'In Progress'), { ...lookupFields(undefined), disableItemBool: false, indexNum: 40 }),
  ],
  typeRel: [related(byName(types, 'Bug'), lookupFields(undefined))],
  priorityRel: [related(byName(priorities, 'High'), lookupFields(byName(priorities, 'High'), true))],
  severityRel: [related(byName(severities, 'Major'), lookupFields(byName(severities, 'Major'), true))],
  assigneeRel: [related(accounts[1], { email: accounts[1].email })],
  reporterRel: [related(accounts[0], { email: accounts[0].email })],
  tagsRel: [related(byName(tags, 'frontend'), lookupFields(undefined)), related(byName(tags, 'regression'), lookupFields(undefined))],
  monitoringRel: [related(accounts[3], { email: accounts[3].email })],
  resolutionRel: [],
  notesCommentsArr: notes,
  createdDate: hoursAgo(24 * 45),
  updatedDate: hoursAgo(0.5),
};

const SUMMARIES = [
  'Keycloak login loops when the session cookie expires',
  'Offline sync drops photos larger than 10 MB',
  'Datatable export ignores column filters',
  'Add dark theme to the template editor',
  'Ruleset editor loses unsaved changes on navigation',
  'Map layer toggles reset after reload',
  'Search ignores accented characters',
  'Slow board load for projects with 2k+ items',
  'Upgrade the Elasticsearch client to 8.x',
  'Attachment thumbnails missing in print view',
  'Notification emails sent twice for status changes',
  'Date picker starts weeks on Sunday for the AU locale',
  'Document history shows raw JSON for related fields',
  'Allow reordering checklist items',
  'CSV import fails on quoted line breaks',
  'Team Intrays Board swimlanes collapse on refresh',
  'Password reset link expires too quickly',
  'Add keyboard shortcuts to the issue view',
  'Mobile form scroll jumps when the keyboard opens',
  'Audit log misses entries for bulk updates',
  'Support C++ code blocks in comments',
  'Improve contrast of disabled buttons',
  'Saved filters are not shared with the team',
  'Spinner never stops when the server returns 502',
];

/**
 * More SDMS items for lists: statuses, types, priorities, assignees (every fifth unassigned),
 * labels and dates all vary. Numbers 460–484, skipping the main issue's 482.
 */
export const moreIssues: Doc[] = SUMMARIES.map((summary, i) => {
  const n = 460 + i + (460 + i >= 482 ? 1 : 0);
  const status = statuses[i % statuses.length];
  const type = types[(i * 3) % types.length];
  const priority = priorities[(i * 2) % priorities.length];
  const assignee = i % 5 === 4 ? undefined : accounts[i % PEOPLE.length];
  const reporter = accounts[(i + 3) % PEOPLE.length];
  const labels = [tags[i % tags.length], ...(i % 3 === 0 ? [tags[(i + 4) % tags.length]] : [])];
  return {
    documentId: `issue-sdms-${n}`,
    systemHeader: { systemType: 'document', summaryName: `SDMS-${n}`, templateId: template.documentId },
    appTags: ['sdms', 'item'],
    itemRef: String(n),
    summary,
    projectRel: [related(project)],
    statusRel: [related(status, { ...lookupFields(undefined), disableItemBool: status.disableItemBool, indexNum: status.indexNum })],
    typeRel: [related(type, lookupFields(undefined))],
    priorityRel: [related(priority, lookupFields(priority, true))],
    assigneeRel: assignee ? [related(assignee, { email: assignee.email })] : [],
    reporterRel: [related(reporter, { email: reporter.email })],
    tagsRel: labels.map((tag) => related(tag, lookupFields(undefined))),
    createdDate: hoursAgo(24 * (40 - i)),
    updatedDate: hoursAgo(i * 7 + 2),
  };
});

/** A brand-new issue: no key yet, empty fields. */
export const newIssue: Doc = {
  documentId: 'issue-new',
  systemHeader: { systemType: 'document', templateId: template.documentId },
  projectRel: [related(project)],
};

/** Every searchable document. */
export const documents: Doc[] = [
  project,
  ...statuses,
  inactiveStatus,
  ...types,
  ...priorities,
  ...severities,
  ...resolutions,
  ...tags,
  ...accounts,
  issue,
  ...moreIssues,
];

export type ComponentDef = Record<string, unknown> & { componentName: string; name: string };

/** The sample template (single source: formbird/templates/solid-issue.template.json). */
export const issueTemplate = template as unknown as { documentId: string; components: ComponentDef[] } & Record<string, unknown>;

/** The sample list page template (formbird/templates/solid-issue-list.template.json). */
export const listTemplate = listTemplateJson as unknown as { documentId: string; components: ComponentDef[] } & Record<string, unknown>;

/** A document of the list template: the page the tables sit on. */
export const listPage: Doc = {
  documentId: 'page-issue-lists',
  systemHeader: { systemType: 'document', summaryName: 'Issue lists', templateId: listTemplate.documentId },
};

/**
 * A template's definition for a field.
 * @param name - Field name
 * @param from - Template to read (default: the issue template)
 * @returns A copy of its component definition
 * @throws {Error} When the template has no such field
 */
export function definitionFor(name: string, from: { components: ComponentDef[] } = issueTemplate): ComponentDef {
  const def = from.components.find((c) => c.name === name);
  if (!def) throw new Error(`Sample template has no field "${name}"`);
  return structuredClone(def);
}

// ------------------------------------------------------------------ photos and image pins
// An incident with photos and a body map, the way a WHS app stores them, for <solid-photo-capture>
// and <solid-image-pins>. Files live with fieldtec-web, so the photos are references (`fileNo`);
// `sampleFiles` has a picture for each one, for the preview.

export const INCIDENT_ID = 'incident-slip-aisle-4';

/** An SVG as a data URL. */
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Stand-in photos for the preview: simple scenes, no text. */
export const sampleFiles: Record<string, string> = {
  'file-aisle-4': svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1200"><defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dde3"/><stop offset="1" stop-color="#aab1bb"/></linearGradient><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8d949c"/><stop offset="1" stop-color="#5f666e"/></linearGradient></defs><rect width="1600" height="1200" fill="url(#w)"/><polygon points="0,1200 640,560 960,560 1600,1200" fill="url(#f)"/><polygon points="0,0 560,420 560,640 0,1150" fill="#2f5d8a"/><polygon points="1600,0 1040,420 1040,640 1600,1150" fill="#2f5d8a"/><g stroke="#f2a33a" stroke-width="18"><line x1="0" y1="300" x2="560" y2="470"/><line x1="0" y1="640" x2="560" y2="560"/><line x1="1600" y1="300" x2="1040" y2="470"/><line x1="1600" y1="640" x2="1040" y2="560"/></g><ellipse cx="820" cy="930" rx="260" ry="70" fill="#9fc3e2" opacity=".8"/><ellipse cx="760" cy="915" rx="120" ry="26" fill="#d8ecfb" opacity=".7"/></svg>`,
  ),
  'file-wet-floor': svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1600"><rect width="1200" height="1600" fill="#c9ced6"/><rect y="1050" width="1200" height="550" fill="#7d858f"/><polygon points="600,330 860,1290 340,1290" fill="#f5c400" stroke="#3a3a3a" stroke-width="16" stroke-linejoin="round"/><polygon points="600,520 700,880 500,880" fill="none" stroke="#1d1d1d" stroke-width="22" stroke-linejoin="round"/><circle cx="600" cy="800" r="14" fill="#1d1d1d"/><ellipse cx="600" cy="1340" rx="380" ry="50" fill="#5d6570"/></svg>`,
  ),
  'file-pallet': svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1200"><rect width="1600" height="1200" fill="#9aa1a9"/><g fill="#b98a55" stroke="#7a5630" stroke-width="10"><rect x="260" y="520" width="1080" height="90" rx="8"/><rect x="260" y="660" width="1080" height="90" rx="8"/><rect x="260" y="800" width="460" height="90" rx="8" transform="rotate(-7 490 845)"/><rect x="860" y="800" width="480" height="90" rx="8"/></g><g fill="#a2774a"><rect x="300" y="880" width="110" height="120"/><rect x="745" y="880" width="110" height="120"/><rect x="1190" y="880" width="110" height="120"/></g></svg>`,
  ),
  'file-ref-photo': svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1200"><rect width="1600" height="1200" fill="#8fb3d9"/><rect y="760" width="1600" height="440" fill="#6b8e4e"/><circle cx="1240" cy="260" r="110" fill="#ffe08a"/><polygon points="200,760 520,380 840,760" fill="#55606b"/><polygon points="640,760 1000,300 1360,760" fill="#47515b"/></svg>`,
  ),
};

/** A floor plan for pins on a custom image (`image`). */
export const floorPlanImage = svgUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520"><rect width="800" height="520" fill="#fbfbfd"/><g fill="none" stroke="#3b3f4a" stroke-width="8" stroke-linejoin="round"><rect x="20" y="20" width="760" height="480"/><path d="M480 20v200M480 280v220M480 300h300M20 330h180M260 330h220"/></g><g fill="#c9ced8"><rect x="60" y="60" width="380" height="24"/><rect x="60" y="140" width="380" height="24"/><rect x="60" y="220" width="380" height="24"/></g><g font-family="system-ui, sans-serif" font-size="22" fill="#6b7080"><text x="60" y="300">Warehouse</text><text x="520" y="60">Office</text><text x="520" y="340">Amenities</text><text x="60" y="480">Loading dock</text></g></svg>`,
);

/** Template with the photo and pin fields (definitions as a WHS template writes them). */
export const incidentTemplate = {
  documentId: 'template-solid-incident',
  systemHeader: { systemType: 'template', summaryName: 'Incident (photos and body map)' },
  components: [
    { componentName: 'solid-photo-capture', name: 'photosArr', label: 'Photos', fullWidth: true },
    { componentName: 'solid-image-pins', name: 'injuryPinsArr', label: 'Where were they hurt?', fullWidth: true },
    {
      componentName: 'solid-image-pins',
      name: 'defectPinsArr',
      label: 'Defects on the floor plan',
      fullWidth: true,
      image: floorPlanImage,
      kinds: [
        { name: 'Crack', color: '#e5484d' },
        { name: 'Leak', color: '#3e8ff7' },
        { name: 'Trip hazard', color: '#e5a000' },
      ],
    },
  ],
} as unknown as { documentId: string; components: ComponentDef[] } & Record<string, unknown>;

const photo = (fileNo: string, fileName: string, extra: Record<string, unknown>) => ({ fileNo, fileName, fileType: 'jpg', basePath: '20261103', ...extra });

/** An incident: three photos (one without a caption) and two pins on the body map. */
export const incident: Doc = {
  documentId: INCIDENT_ID,
  systemHeader: { systemType: 'document', summaryName: 'INC-12: Slip in aisle 4', templateId: incidentTemplate.documentId },
  appTags: ['whs', 'incident'],
  photosArr: [
    photo('file-aisle-4', 'aisle-4.jpg', { caption: 'Aisle 4 after the spill', takenDate: hoursAgo(26), takenByRel: [author(accounts[1])], width: 1600, height: 1200 }),
    photo('file-wet-floor', 'IMG_2041.jpg', { caption: 'Wet floor sign put out', takenDate: hoursAgo(25.5), takenByRel: [author(accounts[1])], width: 1200, height: 1600 }),
    photo('file-pallet', 'pallet.jpg', { takenDate: hoursAgo(24), takenByRel: [author(accounts[2])], width: 1600, height: 1200 }),
  ],
  injuryPinsArr: [
    { id: 'pin-wrist', x: 0.8, y: 0.5305, view: 'front', region: 'Left wrist', kind: 'Sprain or strain', note: 'Put a hand out when falling' },
    { id: 'pin-knee', x: 0.403, y: 0.7086, view: 'front', region: 'Right knee', kind: 'Bruise' },
  ],
  defectPinsArr: [{ id: 'pin-leak', x: 0.31, y: 0.36, view: 'image', region: 'Aisle 4', kind: 'Leak', note: 'Roof leak over the racking' }],
};

/** The file reference template fieldtec-web creates documents of for each upload (see the platform). */
export const fileReferenceTemplate = {
  documentId: '2d5d90f0-9da9-11e7-b329-9f0a52692ed3',
  systemHeader: { systemType: 'template', summaryName: 'Document Reference' },
  components: [{ componentName: 'solid-photo-capture', name: 'fileDetails', label: 'File', fullWidth: true, mode: 'view' }],
} as unknown as { documentId: string; components: ComponentDef[] } & Record<string, unknown>;

/** File reference documents, as fieldtec-web's server writes them: a photo and a PDF. */
export const photoReference: Doc = {
  documentId: 'fileref-photo',
  systemHeader: { systemType: 'fileReference', summaryName: 'site-overview.jpg', templateId: fileReferenceTemplate.documentId },
  relatedDocument: [{ documentId: INCIDENT_ID, name: 'INC-12: Slip in aisle 4' }],
  fileDetails: [{ fileNo: 'file-ref-photo', fileName: 'site-overview.jpg', fileType: 'jpg', basePath: '20261101', ext: 'jpg', mimeDetailsObj: { contentType: 'image/jpeg' } }],
};
export const pdfReference: Doc = {
  documentId: 'fileref-pdf',
  systemHeader: { systemType: 'fileReference', summaryName: 'SWMS-forklift.pdf', templateId: fileReferenceTemplate.documentId },
  relatedDocument: [{ documentId: INCIDENT_ID, name: 'INC-12: Slip in aisle 4' }],
  fileDetails: [{ fileNo: 'file-ref-pdf', fileName: 'SWMS-forklift.pdf', fileType: 'pdf', basePath: '20261101', ext: 'pdf', mimeDetailsObj: { contentType: 'application/pdf' } }],
};
