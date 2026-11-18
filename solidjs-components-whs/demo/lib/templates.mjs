// Component lists of every safety template: the forms (incident, hazard, corrective action,
// inspection, site, inspection checklist), the pages (safety overview, My safety, the registers,
// corrective actions, inspections, the safety map) and the admin lookups; and the menus.

import { CONFIG_ID, SYSTEM, TEMPLATE_EDITOR_ID } from '@solidjs-components/platform/documents';
import {
  ACCOUNTS, accountsOfType, appParts, button, check, comments, date, dropDown, html, inPanel, markdown, ME, number, pageTitle, person, q, query, range,
  referenceField, searchBox, table, term, terms, text, THIS,
} from '@solidjs-components/platform/form-parts';
import { HAZARD_CATEGORIES, PIN_KINDS, STATUSES, TRANSITION_KEYS, TRANSITIONS } from './catalog.mjs';
import { COMPANY, COUNTERS, KEYS, LOOKUPS, SITE_VALUE_FIELDS, STATUS_KINDS, T } from './model.mjs';

const { docs: whsDocs, lookupFilter, tags, lookup, status: statusPicker } = appParts('whs', { transitions: TRANSITIONS });
export { q, lookupFilter };

/** A status picker whose moves into some statuses need an access key (catalog.mjs TRANSITION_KEYS). */
const status = (name, label, kind, extra = {}) =>
  statusPicker(name, label, kind, {
    transitionKeys: Object.fromEntries(Object.entries(TRANSITION_KEYS[kind] ?? {}).map(([to, keys]) => [to, keys.map((k) => KEYS[k])])),
    ...extra,
  });
const reference = (kind, label) => referenceField(`${kind}Ref`, COUNTERS[kind], label);
const site = (extra = {}) => lookup('siteRel', 'Site', 'site', { mandatory: true, relatedFields: SITE_VALUE_FIELDS, ...extra });
const photos = (name, label, extra = {}) => ({ componentName: 'solid-photo-capture', name, label, fullWidth: true, ...extra });
const pointOnMap = (name, label, extra = {}) => ({ componentName: 'solid-map', name, label, mode: 'point', fullWidth: true, height: '260px', ...extra });

const OPEN_INCIDENT = { mustNot: [terms('incidentStatusRel.name', ['Closed', 'Rejected'])] };
const OPEN_HAZARD = { mustNot: [terms('hazardStatusRel.name', ['Closed', 'Rejected'])] };
const OPEN_ACTION = terms('actionStatusRel.name', ['Open', 'In Progress']);
const OVERDUE = range('dueDate', { lt: 'now' });
const SAFETY_PEOPLE = accountsOfType(['Administrator', 'Executive', 'WHS Advisor', 'Site Manager']);

// ------------------------------------------------------------------------------------------------
// Columns and layers reused across pages
// ------------------------------------------------------------------------------------------------

const incidentColumns = ({ wide = false } = {}) => [
  { displayName: 'Incident', field: 'incidentRef', type: 'key', sortField: 'systemHeader.createdDate' },
  { displayName: 'What happened', field: 'title', link: true },
  { displayName: 'Type', field: 'incidentTypeRel', type: 'labels', responsive: { xs: 0 } },
  { displayName: 'Rating', field: 'riskRatingRel', type: 'status', sortField: 'riskScoreNum' },
  { displayName: 'Status', field: 'incidentStatusRel', type: 'status' },
  { displayName: 'Occurred', field: 'occurredDate', type: 'datetime', sort: { direction: 'desc', precedence: 1 }, responsive: { xs: 0 } },
  { displayName: 'Site', field: 'siteRel', type: 'labels', responsive: { xs: 0, sm: 0 } },
  ...(wide
    ? [
        { displayName: 'Class', field: 'injuryClass', responsive: { xs: 0, sm: 0, md: 0 } },
        { displayName: 'Notifiable', field: 'notifiableBool', type: 'boolean', responsive: { xs: 0, sm: 0, md: 0 } },
        { displayName: 'Open actions', field: 'actionsOpenNum', type: 'numeric', responsive: { xs: 0, sm: 0, md: 0 } },
        { displayName: 'Reported by', field: 'reportedByRel', type: 'user', responsive: { xs: 0, sm: 0 } },
      ]
    : []),
];
const hazardColumns = ({ wide = false } = {}) => [
  { displayName: 'Ref', field: 'hazardRef', type: 'key', sortField: 'systemHeader.createdDate' },
  { displayName: 'Hazard', field: 'title', link: true },
  { displayName: 'Category', field: 'hazardCategoryRel', type: 'labels', responsive: { xs: 0, sm: 0 } },
  { displayName: 'Before', field: 'inherentRatingRel', type: 'status', sortField: 'inherentScoreNum', responsive: { xs: 0 } },
  { displayName: 'With controls', field: 'residualRatingRel', type: 'status', sortField: 'residualScoreNum', sort: { direction: 'desc', precedence: 1 } },
  { displayName: 'Status', field: 'hazardStatusRel', type: 'status' },
  { displayName: 'Site', field: 'siteRel', type: 'labels', responsive: { xs: 0, sm: 0 } },
  ...(wide
    ? [
        { displayName: 'Strongest control', field: 'strongestControl', responsive: { xs: 0, sm: 0, md: 0 } },
        { displayName: 'Owner', field: 'ownerRel', type: 'user', responsive: { xs: 0, sm: 0 } },
        { displayName: 'Review', field: 'reviewDate', type: 'due', warnDays: 14, responsive: { xs: 0, sm: 0 } },
      ]
    : []),
];
const actionColumns = ({ withSource = true } = {}) => [
  { displayName: 'Ref', field: 'actionRef', type: 'key', sortField: 'systemHeader.createdDate' },
  { displayName: 'Action', field: 'title', link: true },
  { displayName: 'Control', field: 'controlLevelRel', type: 'labels', responsive: { xs: 0, sm: 0 } },
  ...(withSource ? [{ displayName: 'From', field: 'sourceRel', type: 'labels', responsive: { xs: 0 } }] : []),
  { displayName: 'Owner', field: 'ownerRel', type: 'user', responsive: { xs: 0 } },
  { displayName: 'Due', field: 'dueDate', type: 'due', warnDays: 3, sort: { direction: 'asc', precedence: 1 } },
  { displayName: 'Priority', field: 'riskRatingRel', type: 'status', responsive: { xs: 0, sm: 0 } },
  { displayName: 'Status', field: 'actionStatusRel', type: 'status' },
];
const inspectionColumns = ({ sortDirection = 'asc' } = {}) => [
  { displayName: 'Inspection', field: 'inspectionRef', type: 'key', sortField: 'systemHeader.createdDate' },
  { displayName: 'Site', field: 'siteRel', type: 'labels', link: true },
  { displayName: 'Checklist', field: 'checkSheetRel', type: 'labels', responsive: { xs: 0, sm: 0 } },
  { displayName: 'Scheduled', field: 'scheduledDate', type: 'due', warnDays: 7, sort: { direction: sortDirection, precedence: 1 } },
  { displayName: 'Inspector', field: 'inspectorRel', type: 'user', responsive: { xs: 0 } },
  { displayName: 'Result', field: 'resultText', responsive: { xs: 0 } },
  { displayName: 'Failed', field: 'failedNum', type: 'numeric', responsive: { xs: 0, sm: 0 } },
  { displayName: 'Status', field: 'inspectionStatusRel', type: 'status' },
];

const sitesLayer = () => ({
  name: 'sites',
  label: 'Sites',
  filter: q(query(whsDocs('site'), { mustNot: [term('inactiveBool', true)] })),
  geometryField: 'boundaryGeo',
  style: { kind: 'area', color: '#5b47e0', labelField: 'nameId' },
  popup: {
    titleField: 'nameId',
    fields: [
      { label: 'Site manager', path: 'siteManagerRel.0.name' },
      { label: 'Last incident', path: 'lastIncidentDate', type: 'relative' },
    ],
    actions: [
      { label: 'Report an incident here', icon: 'plus', templateId: T.incident, values: { siteRel: { $record: { code: 'code', siteManagerRel: 'siteManagerRel', supervisorRel: 'supervisorRel', whsAdvisorRel: 'whsAdvisorRel' } } }, primary: true },
      { label: 'Report a hazard here', templateId: T.hazard, values: { siteRel: { $record: { code: 'code', siteManagerRel: 'siteManagerRel', supervisorRel: 'supervisorRel', whsAdvisorRel: 'whsAdvisorRel' } } } },
    ],
  },
});
const incidentsLayer = ({ days = 90, hidden = false } = {}) => ({
  name: 'incidents',
  label: `Incidents, last ${days} days`,
  filter: q(query(whsDocs('incident', range('occurredDate', { gte: `now-${days}d/d` })), { mustNot: [term('incidentStatusRel.name', 'Rejected')] })),
  geometryField: 'locationGeo',
  style: { kind: 'marker', statusField: 'riskRatingRel' },
  popup: {
    titleField: 'systemHeader.summaryName',
    fields: [
      { label: 'Status', path: 'incidentStatusRel', type: 'status' },
      { label: 'Rating', path: 'riskRatingRel', type: 'status' },
      { label: 'Occurred', path: 'occurredDate', type: 'relative' },
      { label: 'Where', path: 'exactLocation' },
    ],
  },
  hidden,
});
const hazardsLayer = ({ hidden = false } = {}) => ({
  name: 'hazards',
  label: 'Open hazards',
  filter: q(query(whsDocs('hazard'), OPEN_HAZARD)),
  geometryField: 'locationGeo',
  style: { kind: 'marker', statusField: 'currentRatingRel' },
  popup: {
    titleField: 'systemHeader.summaryName',
    fields: [
      { label: 'Status', path: 'hazardStatusRel', type: 'status' },
      { label: 'Risk now', path: 'currentRatingRel', type: 'status' },
      { label: 'Category', path: 'hazardCategoryRel.0.name' },
      { label: 'Owner', path: 'ownerRel.0.name' },
    ],
  },
  hidden,
});

const reportButtons = () => [button(`/form/${T.incident}`, '+ Report an incident', true), button(`/form/${T.hazard}`, '+ Report a hazard')];

/**
 * Component lists by template id.
 * @param {{ statuses: Record<string, Record<string, object>>, values: Record<string, Record<string, object>> }} o - lookup values by kind and name
 */
export function templateComponents({ statuses, values }) {
  const correctiveActions = (sourceKind, extra = {}) => ({
    componentName: 'solid-corrective-actions',
    name: `${sourceKind}ActionsList`,
    label: 'Corrective actions',
    fullWidth: true,
    disableSave: true,
    templateId: T.action,
    sourceKind,
    refField: `${sourceKind}Ref`,
    statusValues: statuses.actionStatus,
    controlLevels: Object.values(values.controlLevel),
    people: ACCOUNTS,
    ...extra,
  });

  return {
    // -------------------------------------------------------------------------------- pages
    [T.overview]: [
      pageTitle('overviewTitle', 'Safety overview', `${COMPANY} · every site`, [...reportButtons(), button(`/form/${T.inspections}`, 'Inspections')]),
      {
        componentName: 'solid-stat-tiles', name: 'safetyTiles', label: 'At a glance', fullWidth: true, disableSave: true, refreshSeconds: 120,
        tiles: [
          { label: 'Days since a lost time injury', measure: 'daysSince', dateField: 'occurredDate', filter: q(query(whsDocs('incident', term('lostTimeBool', true)), { mustNot: [term('incidentStatusRel.name', 'Rejected')] })), tone: 'warn', zeroTone: 'bad', goodFrom: 30, icon: 'clock' },
          { label: 'Waiting for triage', filter: q(query(whsDocs('incident', term('incidentStatusRel.name', 'Reported')))), tone: 'warn', zeroTone: 'good', link: T.incidents, hint: 'Reported, not yet reviewed' },
          { label: 'Regulator not yet notified', filter: q(query(whsDocs('incident', term('notifiableBool', true)), { mustNot: [{ exists: { field: 'regulatorNotifiedDate' } }, terms('incidentStatusRel.name', ['Rejected'])] })), tone: 'bad', zeroTone: 'good', link: T.incidents, hint: 'Notifiable incidents' },
          { label: 'Under investigation', filter: q(query(whsDocs('incident', term('incidentStatusRel.name', 'Investigating')))), tone: 'info', link: T.incidents },
          { label: 'Overdue actions', filter: q(query(whsDocs('action', OPEN_ACTION, OVERDUE))), tone: 'bad', zeroTone: 'good', link: T.actions },
          { label: 'High and Extreme hazards', filter: q(query(whsDocs('hazard', terms('currentRating', ['High', 'Extreme'])), OPEN_HAZARD)), tone: 'warn', zeroTone: 'good', link: T.hazards, hint: 'Rated now, with controls in place' },
          { label: 'Inspections overdue', filter: q(query(whsDocs('inspection', term('inspectionStatusRel.name', 'Scheduled'), range('scheduledDate', { lt: 'now/d' })))), tone: 'warn', zeroTone: 'good', link: T.inspections },
        ],
      },
      table('triageDt', 'Needs attention', query(whsDocs('incident', terms('incidentStatusRel.name', ['Reported', 'Under Review']))), incidentColumns(), { rowsPerPage: 6 }),
      { componentName: 'solid-risk-matrix', name: 'hazardHeatmap', label: 'Open hazards, rated with controls in place', mode: 'heatmap', noun: 'hazard', disableSave: true, fullWidth: true, filter: q(query(whsDocs('hazard'), OPEN_HAZARD)), riskField: 'currentRisk' },
      { componentName: 'solid-map', name: 'safetyMap', label: 'Where things happen', fullWidth: true, disableSave: true, height: '420px', layers: [incidentsLayer(), hazardsLayer({ hidden: true }), sitesLayer()] },
      table('overdueActionsDt', 'Overdue corrective actions', query(whsDocs('action', OPEN_ACTION, OVERDUE)), actionColumns(), { rowsPerPage: 6 }),
    ],
    [T.mySafety]: [
      pageTitle('mySafetyTitle', 'My safety', 'Report something, see what happened to your reports, and get your actions done.', reportButtons()),
      table('myActionsDt', 'My actions', query(whsDocs('action', term('ownerRel.documentId', ME), OPEN_ACTION)), actionColumns(), { rowsPerPage: 6 }),
      table('myIncidentsDt', 'Incidents I reported', query(whsDocs('incident', term('reportedByRel.documentId', ME))), incidentColumns(), { rowsPerPage: 6 }),
      table('myHazardsDt', 'Hazards I reported', query(whsDocs('hazard', term('reportedByRel.documentId', ME))), hazardColumns(), { rowsPerPage: 6 }),
      table('myInspectionsDt', 'Inspections assigned to me', query(whsDocs('inspection', term('inspectorRel.documentId', ME), terms('inspectionStatusRel.name', ['Scheduled', 'In Progress']))), inspectionColumns(), { rowsPerPage: 6 }),
    ],
    [T.incidents]: [
      pageTitle('incidentsTitle', 'Incident register', 'Every incident and near miss, newest first.', reportButtons()),
      table('allIncidentsDt', 'Incidents', query(whsDocs('incident')), incidentColumns({ wide: true }), { rowsPerPage: 15, showSearch: true, searchBoxFilter: searchBox('title', 'incidentRef', 'exactLocation'), exportTypes: ['CSV'] }),
    ],
    [T.hazards]: [
      pageTitle('hazardsTitle', 'Hazard register', 'Hazards across every site, by the risk that remains with controls in place.', [button(`/form/${T.hazard}`, '+ Report a hazard', true)]),
      { componentName: 'solid-risk-matrix', name: 'inherentHeatmap', label: 'Before controls', mode: 'heatmap', noun: 'hazard', disableSave: true, filter: q(query(whsDocs('hazard'), OPEN_HAZARD)), riskField: 'inherentRisk' },
      { componentName: 'solid-risk-matrix', name: 'residualHeatmap', label: 'With controls in place', mode: 'heatmap', noun: 'hazard', disableSave: true, filter: q(query(whsDocs('hazard'), OPEN_HAZARD)), riskField: 'currentRisk' },
      table('allHazardsDt', 'Hazards', query(whsDocs('hazard')), hazardColumns({ wide: true }), { rowsPerPage: 15, showSearch: true, searchBoxFilter: searchBox('title', 'hazardRef', 'exactLocation'), exportTypes: ['CSV'] }),
    ],
    [T.actions]: [
      pageTitle('actionsTitle', 'Corrective actions', 'Controls and fixes raised from incidents, hazards and inspections.'),
      table('myOpenActionsDt', 'Mine', query(whsDocs('action', term('ownerRel.documentId', ME), OPEN_ACTION)), actionColumns(), { rowsPerPage: 6 }),
      table('overdueDt', 'Overdue', query(whsDocs('action', OPEN_ACTION, OVERDUE)), actionColumns(), { rowsPerPage: 10 }),
      table('verifyDt', 'Done, waiting for verification', query(whsDocs('action', term('actionStatusRel.name', 'Completed'))), actionColumns(), { rowsPerPage: 10 }),
      table('openActionsDt', 'All open actions', query(whsDocs('action', OPEN_ACTION)), actionColumns(), { rowsPerPage: 15, showSearch: true, searchBoxFilter: searchBox('title', 'actionRef'), exportTypes: ['CSV'] }),
    ],
    [T.inspections]: [
      pageTitle('inspectionsTitle', 'Inspections', 'Workplace inspections by site. A failed check raises a hazard.', [button(`/form/${T.inspection}`, '+ New inspection', true)]),
      table('upcomingDt', 'Scheduled', query(whsDocs('inspection', terms('inspectionStatusRel.name', ['Scheduled', 'In Progress']))), inspectionColumns(), { rowsPerPage: 10 }),
      table('doneDt', 'Completed', query(whsDocs('inspection', term('inspectionStatusRel.name', 'Completed'))), inspectionColumns({ sortDirection: 'desc' }), { rowsPerPage: 10 }),
    ],
    [T.map]: [
      { componentName: 'solid-map', name: 'safetyMapFull', label: 'Safety map', fullWidth: true, disableSave: true, hideLabel: true, height: '72vh', layers: [incidentsLayer({ days: 365 }), hazardsLayer(), sitesLayer()] },
    ],

    // -------------------------------------------------------------------------------- forms
    [T.incident]: [
      tags('incident'),
      reference('incident', 'Incident'),
      status('incidentStatusRel', 'Status', 'incidentStatus'),
      text('title', 'What happened, in a few words', { mandatory: true, fullWidth: true, maxLength: 120 }),
      lookup('incidentTypeRel', 'Type', 'incidentType', { mandatory: true }),
      lookup('dangerousKindRel', 'Kind of dangerous incident', 'dangerousKind', { visible: false }),
      date('occurredDate', 'When it happened', { mandatory: true, time: true }),
      date('reportedDate', 'Reported', { time: true, enabled: false }),
      person('reportedByRel', 'Reported by', { mandatory: true }),
      site(),
      text('exactLocation', 'Where on site'),
      pointOnMap('locationGeo', 'On the map'),
      markdown('description', 'What happened', { mandatory: true }),
      markdown('immediateActions', 'What was done straight away'),
      ...inPanel('peoplePanel', 'People involved', [
        lookup('personTypeRel', 'The person involved is', 'personType'),
        person('injuredPersonRel', 'Person involved'),
        text('injuredName', 'Or their name, if they aren\'t in the system'),
        person('witnessesRel', 'Witnesses', { singleSelection: false }),
      ]),
      ...inPanel('injuryPanel', 'Injury or illness', [
        { componentName: 'solid-image-pins', name: 'injuryPins', label: 'Where on the body', figure: 'body', kinds: PIN_KINDS, fullWidth: true },
        lookup('injuryNatureRel', 'Nature of the injury', 'injuryNature', { singleSelection: false, relatedFields: { indexNum: 'indexNum', seriousBool: 'seriousBool' } }),
        lookup('mechanismRel', 'How it happened', 'mechanism'),
        lookup('treatmentRel', 'Treatment', 'treatment'),
        number('daysLostNum', 'Days lost'),
        date('returnToWorkDate', 'Back at work'),
      ]),
      photos('photosArr', 'Photos'),
      ...inPanel('riskPanel', 'Risk', [
        { componentName: 'solid-risk-matrix', name: 'riskAssessment', label: 'Worst credible outcome if it happened again', fullWidth: true },
        check('notifiableBool', 'Notifiable', { enabled: false }),
        text('notifiableReasonsText', 'Why it is notifiable', { enabled: false, fullWidth: true }),
        date('regulatorNotifiedDate', 'Regulator notified', { time: true }),
        text('regulatorRef', 'Regulator\'s reference'),
        check('sitePreservedBool', 'Site preserved'),
      ]),
      ...inPanel('investigationPanel', 'Investigation', [
        text('investigationLevelText', 'Investigation needed', { enabled: false, fullWidth: true }),
        person('investigatorRel', 'Investigator', { filter: SAFETY_PEOPLE }),
        date('investigationDueDate', 'Investigation due'),
        { componentName: 'solid-root-cause', name: 'rootCauseTree', label: 'Why did it happen?', fullWidth: true, problemField: 'title', minDepth: 3 },
        markdown('investigationSummary', 'Findings'),
      ]),
      ...inPanel('actionsPanel', 'Corrective actions', [correctiveActions('incident', { ratingField: 'riskRating' })]),
      ...inPanel('closePanel', 'Sign-off', [
        person('closedByRel', 'Closed by', { enabled: false }),
        date('closedDate', 'Closed', { enabled: false }),
        markdown('closureNotes', 'Closure notes'),
        text('rejectReason', 'Why it was rejected', { fullWidth: true, visible: false }),
      ]),
      comments(),
    ],
    [T.hazard]: [
      tags('hazard'),
      reference('hazard', 'Hazard'),
      status('hazardStatusRel', 'Status', 'hazardStatus'),
      text('title', 'The hazard, in a few words', { mandatory: true, fullWidth: true, maxLength: 120 }),
      lookup('hazardCategoryRel', 'Category', 'hazardCategory', { mandatory: true }),
      site(),
      text('exactLocation', 'Where on site'),
      pointOnMap('locationGeo', 'On the map'),
      markdown('description', 'What could go wrong, and to whom', { mandatory: true }),
      person('reportedByRel', 'Reported by', { mandatory: true }),
      date('reportedDate', 'Reported', { enabled: false }),
      { componentName: 'solid-lookup-picker', name: 'sourceRel', label: 'Raised by', singleSelection: true, enabled: false, visible: false, iconSet: 'none', filter: q(query(whsDocs('inspection'))) },
      photos('photosArr', 'Photos'),
      ...inPanel('inherentPanel', 'Risk before controls', [{ componentName: 'solid-risk-matrix', name: 'inherentRisk', label: 'Risk with no controls in place', fullWidth: true }]),
      ...inPanel('controlsPanel', 'Controls', [
        correctiveActions('hazard', { label: 'Controls', addLabel: 'Add a control', ratingField: ['inherentRating'] }),
        text('justification', 'Why stronger controls aren\'t reasonably practicable', { fullWidth: true, visible: false }),
      ]),
      ...inPanel('residualPanel', 'Risk with controls in place', [
        { componentName: 'solid-risk-matrix', name: 'residualRisk', label: 'Risk once the controls are in place', fullWidth: true, compareField: 'inherentRisk', compareLabel: 'Before controls' },
      ]),
      ...inPanel('reviewPanel', 'Ownership and review', [
        person('ownerRel', 'Hazard owner', { filter: SAFETY_PEOPLE }),
        date('reviewDate', 'Next review', { enabled: false }),
        date('lastReviewDate', 'Last reviewed', { enabled: false }),
        // Text boxes, not sc-markdown: sc-markdown fails (shadowRoot of null) when it starts hidden.
        text('closeNotes', 'Why it can be closed', { fullWidth: true, visible: false }),
      ]),
      comments(),
    ],
    [T.action]: [
      tags('action'),
      reference('action', 'Action'),
      status('actionStatusRel', 'Status', 'actionStatus'),
      text('title', 'Action', { mandatory: true, fullWidth: true, maxLength: 140 }),
      { componentName: 'solid-lookup-picker', name: 'sourceRel', label: 'Raised from', singleSelection: true, enabled: false, iconSet: 'none', filter: q(query([term('appTags', 'whs'), terms('appTags', ['incident', 'hazard', 'inspection'])])) },
      lookup('controlLevelRel', 'Control level', 'controlLevel', { mandatory: true, relatedFields: { rank: 'rank', indexNum: 'indexNum' } }),
      person('ownerRel', 'Owner', { mandatory: true }),
      date('dueDate', 'Due', { mandatory: true }),
      date('raisedDate', 'Raised', { enabled: false }),
      lookup('riskRatingRel', 'Priority', 'riskRating', { enabled: false, relatedFields: { color: 'color', indexNum: 'indexNum' } }),
      text('extensionReason', 'Why it needs longer than the rating allows', { fullWidth: true, visible: false }),
      markdown('details', 'Details'),
      ...inPanel('completionPanel', 'Completion', [
        markdown('completionNotes', 'What was done'),
        photos('evidenceArr', 'Evidence'),
        date('completedDate', 'Completed', { enabled: false }),
      ]),
      ...inPanel('verificationPanel', 'Verification', [
        person('verifiedByRel', 'Verified by', { enabled: false }),
        date('verifiedDate', 'Verified', { enabled: false }),
        markdown('verificationNotes', 'How it was checked'),
      ]),
      text('cancelReason', 'Why it was cancelled', { fullWidth: true, visible: false }),
      comments(),
    ],
    [T.inspection]: [
      tags('inspection'),
      reference('inspection', 'Inspection'),
      status('inspectionStatusRel', 'Status', 'inspectionStatus'),
      site(),
      lookup('checkSheetRel', 'Checklist', 'checkSheet', { mandatory: true }),
      date('scheduledDate', 'Scheduled for', { mandatory: true }),
      person('inspectorRel', 'Inspector'),
      { componentName: 'solid-checklist', name: 'checkItems', label: 'Checks', fullWidth: true, allowAdd: true, failLabel: 'Hazards found', itemsFrom: { field: 'checkSheetRel', itemsField: 'checkItems' } },
      photos('photosArr', 'Photos'),
      markdown('summary', 'Summary'),
      text('resultText', 'Result', { enabled: false }),
      date('completedDate', 'Completed', { enabled: false }),
      table('raisedHazardsDt', 'Hazards raised by this inspection', query(whsDocs('hazard', term('sourceRel.documentId', THIS))), hazardColumns(), { rowsPerPage: 10 }),
      comments(),
    ],
    [T.site]: [
      tags('site'),
      text('nameId', 'Site', { mandatory: true }),
      text('code', 'Code', { mandatory: true }),
      dropDown('siteType', 'Type', ['Warehouse', 'Manufacturing', 'Construction project', 'Office']),
      person('siteManagerRel', 'Site manager', { filter: SAFETY_PEOPLE }),
      person('supervisorRel', 'Supervisor'),
      person('whsAdvisorRel', 'WHS advisor', { filter: SAFETY_PEOPLE }),
      number('headcountNum', 'People on site'),
      number('hoursPerMonthNum', 'Hours worked a month'),
      number('inspectionWeeksNum', 'Inspect every (weeks)'),
      lookup('checkSheetRel', 'Inspection checklist', 'checkSheet'),
      pointOnMap('addressGeo', 'Address'),
      { componentName: 'solid-map', name: 'boundaryGeo', label: 'Site boundary', mode: 'area', fullWidth: true, height: '320px' },
      number('indexNum', 'Order'),
      check('inactiveBool', 'Inactive'),
      table('siteIncidentsDt', 'Incidents here', query(whsDocs('incident', term('siteRel.documentId', THIS))), incidentColumns(), { rowsPerPage: 8 }),
      table('siteHazardsDt', 'Open hazards here', query(whsDocs('hazard', term('siteRel.documentId', THIS)), OPEN_HAZARD), hazardColumns(), { rowsPerPage: 8 }),
      table('allSitesDt', 'Sites', query(whsDocs('site')), [
        { displayName: 'Site', field: 'nameId', link: true, sort: { direction: 'asc' } },
        { displayName: 'Code', field: 'code' },
        { displayName: 'Type', field: 'siteType' },
        { displayName: 'Manager', field: 'siteManagerRel', type: 'user' },
        { displayName: 'People', field: 'headcountNum', type: 'numeric' },
      ]),
    ],
    [T.checkSheet]: [
      tags('checkSheet'),
      text('nameId', 'Checklist', { mandatory: true }),
      { componentName: 'solid-checklist', name: 'checkItems', label: 'Checks', mode: 'define', fullWidth: true },
      number('indexNum', 'Order'),
      check('inactiveBool', 'Inactive'),
      table('allSheetsDt', 'Inspection checklists', query(whsDocs('checkSheet')), [
        { displayName: 'Checklist', field: 'nameId', link: true, sort: { direction: 'asc' } },
        { displayName: 'Inactive', field: 'inactiveBool', type: 'boolean' },
      ]),
    ],
    [T.counter]: [text('incidentCounter', 'Incident counter'), text('hazardCounter', 'Hazard counter'), text('actionCounter', 'Action counter'), text('inspectionCounter', 'Inspection counter')],
    ...lookupTemplates(),
  };
}

function lookupTemplates() {
  const extra = {
    riskRating: [{ componentName: 'sc-text-box', name: 'color', label: 'Colour (CSS)' }],
    injuryNature: [check('seriousBool', 'Serious injury (makes an incident notifiable)')],
    controlLevel: [number('rank', 'Rank (1 is most effective)'), text('description', 'What it means', { fullWidth: true })],
    hazardCategory: [],
  };
  const out = {};
  for (const [kind, names] of Object.entries(LOOKUPS)) {
    const isStatus = STATUS_KINDS.includes(kind);
    out[T[`lookup_${kind}`]] = [
      tags(kind),
      text('nameId', names.name, { mandatory: true }),
      number('indexNum', 'Order'),
      ...(isStatus
        ? [
            { componentName: 'sc-text-box', name: 'color', label: 'Colour (CSS)' },
            dropDown('statusCategory', 'Category', ['todo', 'inprogress', 'done']),
          ]
        : []),
      ...(extra[kind] ?? []),
      check('inactiveBool', 'Inactive'),
      table('allDocsDt', names.plural, query(whsDocs(kind)), [
        { displayName: 'Name', field: 'nameId', link: true },
        ...(isStatus || kind === 'riskRating' ? [{ displayName: 'Colour', field: 'color', type: 'color' }] : []),
        ...(kind === 'injuryNature' ? [{ displayName: 'Serious', field: 'seriousBool', type: 'boolean' }] : []),
        ...(kind === 'controlLevel' ? [{ displayName: 'Rank', field: 'rank', type: 'numeric' }] : []),
        { displayName: 'Order', field: 'indexNum', type: 'numeric', sort: { direction: 'asc' } },
        { displayName: 'Inactive', field: 'inactiveBool', type: 'boolean' },
      ], { rowsPerPage: 25 }),
    ];
  }
  return out;
}

/** Menus by account type. */
export function menuFor(type, { menuItem, menuGroup }) {
  const form = (id) => `/form/${id}`;
  const lookups = (kinds) => kinds.map((kind) => menuItem(LOOKUPS[kind].plural, form(T[`lookup_${kind}`])));
  const report = [menuItem('Report an incident', form(T.incident)), menuItem('Report a hazard', form(T.hazard))];
  const registers = menuGroup('Registers', [
    menuItem('Incidents', form(T.incidents)),
    menuItem('Hazards', form(T.hazards)),
    menuItem('Corrective actions', form(T.actions)),
    menuItem('Inspections', form(T.inspections)),
    menuItem('Safety map', form(T.map)),
  ]);
  const setup = menuGroup('Set-up', [
    menuItem('Sites', form(T.site)),
    menuItem('Inspection checklists', form(T.checkSheet)),
    ...lookups(['incidentType', 'injuryNature', 'mechanism', 'treatment', 'dangerousKind', 'personType', 'hazardCategory', 'controlLevel', 'causeCategory', 'riskRating']),
    ...lookups(STATUS_KINDS),
  ]);
  const admin = menuGroup('Admin', [
    menuItem('Incident template', `${form(T.incident)}/${TEMPLATE_EDITOR_ID}`),
    menuItem('Hazard template', `${form(T.hazard)}/${TEMPLATE_EDITOR_ID}`),
    menuItem('Rulesets', `/form/${SYSTEM.ruleSet}`),
    menuItem('Configuration', `${form(CONFIG_ID)}/${TEMPLATE_EDITOR_ID}`),
  ]);
  const overview = menuItem('Safety overview', form(T.overview));
  const mine = menuItem('My safety', form(T.mySafety));
  switch (type) {
    case 'Administrator':
      return [overview, mine, menuGroup('Report', report), registers, setup, admin];
    case 'Executive':
    case 'WHS Advisor':
    case 'Site Manager':
      return [overview, mine, menuGroup('Report', report), registers, ...(type === 'WHS Advisor' ? [setup] : [])];
    case 'Supervisor':
      return [mine, overview, ...report, registers];
    default:
      return [mine, ...report, menuItem('Inspections', form(T.inspections)), menuItem('Safety map', form(T.map))];
  }
}

/** Where each account type starts. */
export const HOME_BY_TYPE = {
  Administrator: T.overview,
  Executive: T.overview,
  'WHS Advisor': T.overview,
  'Site Manager': T.overview,
  Supervisor: T.mySafety,
  Worker: T.mySafety,
};

/** Hazard categories as the template lists them (for the seed's catalogue check). */
export const HAZARD_CATEGORY_NAMES = HAZARD_CATEGORIES;
export { STATUSES };
