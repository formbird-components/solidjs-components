// Component lists of every HR template: the forms (leave request, certificate, onboarding, expiry
// check, team, position, onboarding checklist, the employee fields on the account), the pages
// (people overview, My HR, My team, the leave calendar and register, the skills matrix, certificates,
// the org chart, onboarding, people) and the admin lookups; and the menus.

import { CONFIG_ID, SYSTEM, TEMPLATE_EDITOR_ID } from '@solidjs-components/platform/documents';
import {
  ACCOUNTS, accountsOfType, appParts, button, check, comments, date, dropDown, html, inPanel, markdown, ME, number, pageTitle, person, q, query, range,
  referenceField, searchBox, table, term, terms, text, THIS,
} from '@solidjs-components/platform/form-parts';
import { HOLIDAYS, STATUSES, TRANSITIONS } from './catalog.mjs';
import {
  CERT_TYPE_FIELDS, COMPANY, COUNTERS, EMPLOYEE_FIELDS, EXPIRY_WARN_DAYS, KEYS, LEAVE_TYPE_FIELDS, LOOKUPS, OPENING_FIELDS, POSITION_VALUE_FIELDS, ROLES, STATUS_KINDS, T, TEAM_VALUE_FIELDS, TIME_ZONE,
} from './model.mjs';

const { docs: hrDocs, lookupFilter, tags, lookup, status: statusPicker } = appParts('hr', { transitions: TRANSITIONS });
export { q, lookupFilter };

const reference = (kind, label) => referenceField(`${kind}Ref`, COUNTERS[kind], label);
const employee = (name, label, extra = {}) => person(name, label, { relatedFields: EMPLOYEE_FIELDS, ...extra });
const photos = (name, label, extra = {}) => ({ componentName: 'solid-photo-capture', name, label, fullWidth: true, ...extra });

const LIVE_LEAVE = terms('leaveStatusRel.name', ['Pending', 'Approved']);
/** Leave covering today in Sydney: it started by now and its last day (stored as that day's start) is within the last 24 hours or later. */
const AWAY_TODAY = [LIVE_LEAVE, range('startDate', { lte: 'now' }), range('endDate', { gte: 'now-1d' })];
const CURRENT_CERTS = { mustNot: [term('supersededBool', true)] };
const MANAGERS = accountsOfType(['Administrator', 'Executive', 'Manager', 'People & Culture']);
const ACTIVE_PEOPLE = query([term('systemHeader.systemType', 'account')], { mustNot: [term('inactiveBool', true)], sort: [{ 'teamRel.indexNum': { order: 'asc', unmapped_type: 'long' } }, { 'systemHeader.summaryName.lcase': 'asc' }] });
const MY_REPORTS = query([term('systemHeader.systemType', 'account')], {
  mustNot: [term('inactiveBool', true)],
  should: [term('managerRel.documentId', ME), term('documentId', ME)],
  sort: [{ 'systemHeader.summaryName.lcase': 'asc' }],
});
const MY_TEAM = query([term('systemHeader.systemType', 'account'), term('teamRel.documentId', '{{account.teamRel.0.documentId}}')], { mustNot: [term('inactiveBool', true)], sort: [{ 'systemHeader.summaryName.lcase': 'asc' }] });

// ------------------------------------------------------------------------------------------------
// Columns reused across pages
// ------------------------------------------------------------------------------------------------

const leaveColumns = ({ wide = false, withPerson = true } = {}) => [
  { displayName: 'Ref', field: 'leaveRef', type: 'key', sortField: 'systemHeader.createdDate' },
  ...(withPerson ? [{ displayName: 'Who', field: 'employeeRel', type: 'user' }] : []),
  { displayName: 'Type', field: 'leaveTypeRel', type: 'labels', responsive: { xs: 0 } },
  { displayName: 'When', field: 'periodText', link: true, sortField: 'startDate', sort: { direction: wide ? 'desc' : 'asc', precedence: 1 } },
  { displayName: 'Days', field: 'daysNum', type: 'numeric', responsive: { xs: 0 } },
  { displayName: 'Status', field: 'leaveStatusRel', type: 'status' },
  { displayName: 'Waiting for', field: 'nextApproverRel', type: 'labels', responsive: { xs: 0, sm: 0 }, emptyText: '' },
  ...(wide
    ? [
        { displayName: 'Team', field: 'teamRel', type: 'labels', responsive: { xs: 0, sm: 0, md: 0 } },
        { displayName: 'Below minimum', field: 'staffingBreachBool', type: 'boolean', responsive: { xs: 0, sm: 0, md: 0 } },
      ]
    : []),
];
const certColumns = ({ withPerson = true } = {}) => [
  { displayName: 'Ref', field: 'certificateRef', type: 'key', sortField: 'systemHeader.createdDate' },
  ...(withPerson ? [{ displayName: 'Who', field: 'personRel', type: 'user' }] : []),
  { displayName: 'Certificate', field: 'certTypeRel', type: 'labels', link: true },
  { displayName: 'Expires', field: 'expiryDate', type: 'due', warnDays: EXPIRY_WARN_DAYS, sort: { direction: 'asc', precedence: 1 } },
  { displayName: 'State', field: 'certStateRel', type: 'status' },
  { displayName: 'Number', field: 'certNumber', responsive: { xs: 0, sm: 0 } },
  ...(withPerson ? [{ displayName: 'Team', field: 'teamRel', type: 'labels', responsive: { xs: 0, sm: 0 } }] : []),
];
const onboardingColumns = () => [
  { displayName: 'Ref', field: 'onboardingRef', type: 'key', sortField: 'systemHeader.createdDate' },
  { displayName: 'New starter', field: 'personRel', type: 'user' },
  { displayName: 'Position', field: 'positionRel', type: 'labels', responsive: { xs: 0 } },
  { displayName: 'First day', field: 'startDate', type: 'date', sort: { direction: 'asc', precedence: 1 } },
  { displayName: 'Done', field: 'progressNum', type: 'numeric', suffix: '%' },
  { displayName: 'Certificates missing', field: 'missingCertsText', responsive: { xs: 0, sm: 0 } },
  { displayName: 'Status', field: 'onboardingStatusRel', type: 'status' },
];
const peopleColumns = () => [
  { displayName: 'Name', field: 'systemHeader.summaryName', link: true, sort: { direction: 'asc', precedence: 2 } },
  { displayName: 'No.', field: 'employeeNo', responsive: { xs: 0 } },
  { displayName: 'Title', field: 'jobTitle' },
  { displayName: 'Team', field: 'teamRel', type: 'labels', sortField: 'teamRel.indexNum', sort: { direction: 'asc', precedence: 1 } },
  { displayName: 'Manager', field: 'managerRel', type: 'user', responsive: { xs: 0, sm: 0 }, emptyText: '' },
  { displayName: 'Annual leave', field: 'annualAvailableNum', type: 'numeric', suffix: 'd', responsive: { xs: 0, sm: 0 } },
  { displayName: 'Personal leave', field: 'personalAvailableNum', type: 'numeric', suffix: 'd', responsive: { xs: 0, sm: 0, md: 0 } },
  { displayName: 'Employment', field: 'employmentType', responsive: { xs: 0, sm: 0, md: 0 } },
  { displayName: 'Email', field: 'email', type: 'email', responsive: { xs: 0, sm: 0, md: 0 } },
];

/**
 * Component lists by template id.
 * @param {{ statuses: Record<string, Record<string, object>>, values: Record<string, Record<string, object>> }} o - lookup values by kind and name
 */
export function templateComponents({ statuses, values }) {
  const leaveTypeList = Object.values(values.leaveType);

  /** The leave calendar: people by day, grouped by team, their annual leave, and who is left against each team's minimum. */
  const calendar = (name, label, rowFilter, extra = {}) => ({
    componentName: 'solid-resource-schedule',
    name,
    label,
    fullWidth: true,
    disableSave: true,
    rowFilter: q(rowFilter),
    rowDetailField: 'jobTitle',
    groupField: 'teamRel.name',
    groupMinField: 'teamRel.minOnDutyNum',
    rowFigures: [{ label: 'Annual leave available', path: 'annualAvailableNum', unit: 'd', warnBelow: 0 }],
    filter: q(query(hrDocs('leave', LIVE_LEAVE))),
    rowField: 'employeeRel.documentId',
    startField: 'startDate',
    endField: 'endDate',
    startHalfField: 'startHalfBool',
    endHalfField: 'endHalfBool',
    labelField: 'leaveTypeRel.name',
    colorField: 'leaveTypeRel.color',
    statusField: 'leaveStatusRel.name',
    tentativeStatuses: ['Pending'],
    timeZone: TIME_ZONE,
    holidays: HOLIDAYS,
    days: 28,
    views: [14, 28, 42],
    templateId: T.leave,
    newLabel: 'Request leave',
    rowValueFields: EMPLOYEE_FIELDS,
    ...extra,
  });
  const matrix = (name, label, peopleFilter, extra = {}) => ({
    componentName: 'solid-skills-matrix',
    name,
    label,
    fullWidth: true,
    disableSave: true,
    peopleFilter: q(peopleFilter),
    typesFilter: lookupFilter('certType'),
    filter: q(query(hrDocs('certificate'), CURRENT_CERTS)),
    requiredField: 'positionRel.requiredCertsRel.documentId',
    groupField: 'teamRel.name',
    detailField: 'jobTitle',
    shortField: 'shortName',
    warnDays: EXPIRY_WARN_DAYS,
    templateId: T.certificate,
    personValueFields: EMPLOYEE_FIELDS,
    typeValueFields: CERT_TYPE_FIELDS,
    ...extra,
  });
  const orgChart = (name, label, extra = {}) => ({
    componentName: 'solid-org-chart',
    name,
    label,
    fullWidth: true,
    disableSave: true,
    filter: q(ACTIVE_PEOPLE),
    awayFilter: q(query(hrDocs('leave', ...AWAY_TODAY))),
    ...extra,
  });
  const balances = (name, label, extra = {}) => ({
    componentName: 'solid-leave-balance', name, label, mode: 'summary', fullWidth: true, disableSave: true, leaveTypes: leaveTypeList, openingFields: OPENING_FIELDS, timeZone: TIME_ZONE, ...extra,
  });

  return {
    // -------------------------------------------------------------------------------- pages
    [T.overview]: [
      pageTitle('overviewTitle', 'People overview', `${COMPANY} · every team`, [
        button(`/form/${T.leave}`, '+ Request leave', true),
        button(`/form/${T.calendar}`, 'Leave calendar'),
        button(`/form/${T.matrix}`, 'Skills matrix'),
        button(`/form/${T.orgChart}`, 'Org chart'),
      ]),
      {
        componentName: 'solid-stat-tiles', name: 'peopleTiles', label: 'Today', fullWidth: true, disableSave: true, refreshSeconds: 120,
        tiles: [
          { label: 'People', filter: q(query([term('systemHeader.systemType', 'account')], { mustNot: [term('inactiveBool', true)] })), tone: 'accent', link: T.directory, icon: 'user' },
          { label: 'Away today', filter: q(query(hrDocs('leave', ...AWAY_TODAY))), tone: 'info', link: T.calendar, icon: 'calendar' },
          { label: 'Waiting for approval', filter: q(query(hrDocs('leave', term('leaveStatusRel.name', 'Pending')))), tone: 'warn', zeroTone: 'good', link: T.leaveRegister, icon: 'clock' },
          { label: 'Below minimum staffing', filter: q(query(hrDocs('leave', LIVE_LEAVE, term('staffingBreachBool', true), range('endDate', { gte: 'now-1d' })))), tone: 'bad', zeroTone: 'good', link: T.calendar, hint: 'Upcoming leave that needs a second approver' },
          { label: 'Certificates expired', filter: q(query(hrDocs('certificate', term('certState', 'Expired')), CURRENT_CERTS)), tone: 'bad', zeroTone: 'good', link: T.certificates },
          { label: `Expiring in ${EXPIRY_WARN_DAYS} days`, filter: q(query(hrDocs('certificate', term('certState', 'Expiring')), CURRENT_CERTS)), tone: 'warn', zeroTone: 'good', link: T.certificates },
          { label: 'Onboarding', filter: q(query(hrDocs('onboarding', terms('onboardingStatusRel.name', ['Not started', 'In progress'])))), tone: 'info', link: T.onboardingList, hint: 'New starters not finished yet' },
        ],
      },
      calendar('overviewCalendar', 'Leave calendar', ACTIVE_PEOPLE, { createFor: 'anyone' }),
      table('pendingLeaveDt', 'Waiting for approval', query(hrDocs('leave', term('leaveStatusRel.name', 'Pending'))), leaveColumns(), { rowsPerPage: 6 }),
      table('expiringCertsDt', 'Certificates expired or expiring', query(hrDocs('certificate', terms('certState', ['Expired', 'Expiring'])), CURRENT_CERTS), certColumns(), { rowsPerPage: 6 }),
      table('startersDt', 'New starters', query(hrDocs('onboarding', terms('onboardingStatusRel.name', ['Not started', 'In progress']))), onboardingColumns(), { rowsPerPage: 6 }),
    ],
    [T.myHr]: [
      pageTitle('myHrTitle', 'My HR', 'Your leave, your certificates, and your team’s calendar.', [button(`/form/${T.leave}`, '+ Request leave', true), button(`/form/${T.certificate}`, '+ Add a certificate')]),
      balances('myBalances', 'My leave balances'),
      table('myLeaveDt', 'My leave', query(hrDocs('leave', term('employeeRel.documentId', ME))), leaveColumns({ withPerson: false, wide: true }), { rowsPerPage: 6 }),
      calendar('myTeamCalendar', 'My team', MY_TEAM, { days: 14, views: [14, 28] }),
      table('myCertsDt', 'My certificates', query(hrDocs('certificate', term('personRel.documentId', ME)), CURRENT_CERTS), certColumns({ withPerson: false }), { rowsPerPage: 8 }),
      table('myOnboardingDt', 'My onboarding', query(hrDocs('onboarding', term('personRel.documentId', ME))), onboardingColumns(), { rowsPerPage: 3, emptyText: 'Nothing to do: you are onboarded.' }),
    ],
    [T.myTeam]: [
      pageTitle('myTeamTitle', 'My team', 'Approvals waiting for you, who is away, and your people’s certificates.', [button(`/form/${T.calendar}`, 'Everyone’s leave'), button(`/form/${T.onboarding}`, '+ New starter')]),
      table('myApprovalsDt', 'Waiting for my approval', query(hrDocs('leave', term('leaveStatusRel.name', 'Pending'), term('nextApproverIds', ME))), leaveColumns(), { rowsPerPage: 8, emptyText: 'Nothing waiting for you.' }),
      calendar('reportsCalendar', 'Leave calendar', MY_REPORTS, { createFor: 'anyone', groupField: '', days: 28 }),
      matrix('reportsMatrix', 'Certificates', MY_REPORTS, { groupField: '' }),
      table('teamOnboardingDt', 'New starters', query(hrDocs('onboarding', term('managerRel.documentId', ME), terms('onboardingStatusRel.name', ['Not started', 'In progress']))), onboardingColumns(), { rowsPerPage: 5, emptyText: 'No new starters.' }),
    ],
    [T.calendar]: [
      pageTitle('calendarTitle', 'Leave calendar', 'Everyone’s leave by team. Pending requests are hatched; a red day is below the team’s minimum.', [button(`/form/${T.leave}`, '+ Request leave', true)]),
      calendar('calendarAll', 'Leave', ACTIVE_PEOPLE, { hideLabel: true, createFor: 'anyone', days: 42 }),
    ],
    [T.leaveRegister]: [
      pageTitle('leaveTitle', 'Leave register', 'Every leave request, newest first.', [button(`/form/${T.leave}`, '+ Request leave', true)]),
      table('allLeaveDt', 'Leave', query(hrDocs('leave')), leaveColumns({ wide: true }), { rowsPerPage: 15, showSearch: true, searchBoxFilter: searchBox('employeeRel.name', 'leaveRef', 'leaveTypeRel.name', 'teamRel.name'), exportTypes: ['CSV'] }),
    ],
    [T.matrix]: [
      pageTitle('matrixTitle', 'Skills matrix', 'Everyone’s certificates against what their position requires. Click a gap to add the certificate.', [button(`/form/${T.certificates}`, 'Certificates')]),
      matrix('matrixAll', 'Certificates', ACTIVE_PEOPLE, { hideLabel: true }),
    ],
    [T.certificates]: [
      pageTitle('certsTitle', 'Certificates', `A certificate within ${EXPIRY_WARN_DAYS} days of expiry tells its holder and their manager.`, [button(`/form/${T.certificate}`, '+ Add a certificate', true), button(`/form/${T.expiryCheck}`, 'Expiry checks')]),
      table('allCertsDt', 'Certificates', query(hrDocs('certificate'), CURRENT_CERTS), certColumns(), { rowsPerPage: 15, showSearch: true, searchBoxFilter: searchBox('personRel.name', 'certTypeRel.name', 'certificateRef', 'certNumber'), exportTypes: ['CSV'] }),
    ],
    [T.orgChart]: [orgChart('orgChartAll', 'Org chart', { hideLabel: true, height: '76vh' })],
    [T.onboardingList]: [
      pageTitle('onboardingTitle', 'Onboarding', 'New starters, their checklists, and the certificates their position needs before they are done.', [button(`/form/${T.onboarding}`, '+ New starter', true)]),
      table('openOnboardingDt', 'In progress', query(hrDocs('onboarding', terms('onboardingStatusRel.name', ['Not started', 'In progress']))), onboardingColumns(), { rowsPerPage: 10 }),
      table('doneOnboardingDt', 'Completed', query(hrDocs('onboarding', term('onboardingStatusRel.name', 'Completed'))), onboardingColumns(), { rowsPerPage: 10 }),
    ],
    [T.directory]: [
      pageTitle('directoryTitle', 'People', `${COMPANY}: everyone, by team.`, [button(`/form/${T.orgChart}`, 'Org chart')]),
      table('peopleDt', 'People', ACTIVE_PEOPLE, peopleColumns(), { rowsPerPage: 40, showSearch: true, searchBoxFilter: searchBox('systemHeader.summaryName', 'jobTitle', 'teamRel.name', 'employeeNo'), exportTypes: ['CSV'] }),
    ],

    // -------------------------------------------------------------------------------- forms
    [T.leave]: [
      tags('leave'),
      reference('leave', 'Leave'),
      statusPicker('leaveStatusRel', 'Status', 'leaveStatus'),
      employee('employeeRel', 'Who', { mandatory: true }),
      lookup('leaveTypeRel', 'Type of leave', 'leaveType', { mandatory: true, relatedFields: LEAVE_TYPE_FIELDS }),
      {
        componentName: 'solid-date-range', name: 'startDate', label: 'When', mode: 'days', endField: 'endDate', mandatory: true, fullWidth: true,
        startHalfField: 'startHalfBool', endHalfField: 'endHalfBool', daysField: 'daysNum', timeZone: TIME_ZONE, holidays: HOLIDAYS,
      },
      ...inPanel('balancePanel', 'Balance', [
        { componentName: 'solid-leave-balance', name: 'balanceView', label: 'Your balance', hideLabel: true, mode: 'request', fullWidth: true, disableSave: true, availableField: 'availableDaysNum', leaveTypes: leaveTypeList, openingFields: OPENING_FIELDS, timeZone: TIME_ZONE },
      ]),
      text('reason', 'What it is for', { fullWidth: true, maxLength: 300 }),
      photos('evidenceArr', 'Medical certificate or statutory declaration', { visible: false }),
      ...inPanel('approvalPanel', 'Approval', [
        { componentName: 'solid-approval-chain', name: 'approvalChain', label: 'Approval', hideLabel: true, fullWidth: true, noun: 'request', people: MANAGERS, emptyText: 'Your line manager approves it once you save. A second approver joins if your team would be below its minimum.' },
      ]),
      text('cancelReason', 'Why it is cancelled', { fullWidth: true, visible: false }),
      ...inPanel('teamPanel', 'Who else is away', [
        calendar('teamCalendar', 'The team', query([term('systemHeader.systemType', 'account'), term('teamRel.documentId', '{{document.teamRel.0.documentId}}{{^document.teamRel}}{{account.teamRel.0.documentId}}{{/document.teamRel}}')], { mustNot: [term('inactiveBool', true)], sort: [{ 'systemHeader.summaryName.lcase': 'asc' }] }), {
          hideLabel: true, days: 14, views: [14, 28], groupField: '', templateId: undefined, rowFigures: [],
        }),
      ], { collapsed: true }),
      comments(),
    ],
    [T.certificate]: [
      tags('certificate'),
      reference('certificate', 'Certificate'),
      employee('personRel', 'Whose', { mandatory: true }),
      lookup('certTypeRel', 'Certificate', 'certType', { mandatory: true, relatedFields: CERT_TYPE_FIELDS }),
      text('certNumber', 'Number'),
      date('issuedDate', 'Issued', { mandatory: true }),
      date('expiryDate', 'Expires'),
      lookup('certStateRel', 'State', 'certState', { enabled: false, relatedFields: { color: 'color', indexNum: 'indexNum' } }),
      photos('evidenceArr', 'A copy of the certificate'),
      table('personCertsDt', 'Their other certificates', query(hrDocs('certificate', term('personRel.documentId', '{{document.personRel.0.documentId}}')), CURRENT_CERTS), certColumns({ withPerson: false }), { rowsPerPage: 10 }),
      comments(),
    ],
    [T.onboarding]: [
      tags('onboarding'),
      reference('onboarding', 'Onboarding'),
      statusPicker('onboardingStatusRel', 'Status', 'onboardingStatus'),
      employee('personRel', 'New starter', { mandatory: true }),
      lookup('positionRel', 'Position', 'position', { mandatory: true, relatedFields: POSITION_VALUE_FIELDS }),
      person('managerRel', 'Manager', { filter: MANAGERS }),
      person('buddyRel', 'Buddy'),
      date('startDate', 'First day', { mandatory: true }),
      date('probationReviewDate', 'Probation review', { enabled: false }),
      {
        componentName: 'solid-checklist', name: 'tasks', label: 'Checklist', fullWidth: true, allowAdd: true, commentOnFail: true, failLabel: 'Blocked',
        answerLabels: { pass: 'Done', fail: 'Blocked' }, passLabel: 'Complete', itemsFrom: { field: 'positionRel', documentField: 'planRel', itemsField: 'checkItems' },
      },
      text('missingCertsText', 'Certificates still needed for the position', { enabled: false, fullWidth: true }),
      matrix('starterMatrix', 'Their certificates', query([term('documentId', '{{document.personRel.0.documentId}}')]), { groupField: '' }),
      comments(),
    ],
    [T.expiryCheck]: [
      tags('expiryCheck'),
      reference('expiryCheck', 'Expiry check'),
      html('expiryHelp', `<div style="font-family:system-ui,sans-serif;color:#5e5e6d">Saving a check looks through every certificate that has expired or expires within the warning period, brings its state up to date, and tells its holder and their manager once. A real deployment would save one every morning from a scheduler.</div>`),
      date('runDate', 'Run', { enabled: false, time: true }),
      number('warnDaysNum', 'Warns this many days ahead', { enabled: false }),
      text('summary', 'What it found', { enabled: false, fullWidth: true }),
      person('toldRel', 'Told', { enabled: false, singleSelection: false }),
      table('flaggedCertsDt', 'Certificates expired or expiring now', query(hrDocs('certificate', terms('certState', ['Expired', 'Expiring'])), CURRENT_CERTS), certColumns(), { rowsPerPage: 10 }),
      table('allChecksDt', 'Earlier checks', query(hrDocs('expiryCheck')), [
        { displayName: 'Check', field: 'expiryCheckRef', type: 'key', sortField: 'systemHeader.createdDate' },
        { displayName: 'Run', field: 'runDate', type: 'datetime', sort: { direction: 'desc', precedence: 1 } },
        { displayName: 'Flagged', field: 'notifiedNum', type: 'numeric' },
        { displayName: 'Expired', field: 'expiredNum', type: 'numeric' },
        { displayName: 'Expiring', field: 'expiringNum', type: 'numeric' },
        { displayName: 'Summary', field: 'summary', responsive: { xs: 0, sm: 0 } },
      ], { rowsPerPage: 8 }),
    ],
    [T.team]: [
      tags('team'),
      text('nameId', 'Team', { mandatory: true }),
      text('code', 'Code'),
      text('site', 'Site', { fullWidth: true }),
      number('minOnDutyNum', 'At least this many in on a work day'),
      { componentName: 'sc-text-box', name: 'color', label: 'Colour (CSS)' },
      number('indexNum', 'Order'),
      check('inactiveBool', 'Inactive'),
      table('teamPeopleDt', 'People', query([term('systemHeader.systemType', 'account'), term('teamRel.documentId', THIS)], { mustNot: [term('inactiveBool', true)] }), peopleColumns(), { rowsPerPage: 20 }),
      table('allTeamsDt', 'Teams', query(hrDocs('team')), [
        { displayName: 'Team', field: 'nameId', link: true },
        { displayName: 'Code', field: 'code' },
        { displayName: 'Site', field: 'site' },
        { displayName: 'Minimum', field: 'minOnDutyNum', type: 'numeric' },
        { displayName: 'Colour', field: 'color', type: 'color' },
        { displayName: 'Order', field: 'indexNum', type: 'numeric', sort: { direction: 'asc' } },
      ], { rowsPerPage: 20 }),
    ],
    [T.position]: [
      tags('position'),
      text('nameId', 'Position', { mandatory: true }),
      lookup('requiredCertsRel', 'Certificates it requires', 'certType', { singleSelection: false, relatedFields: CERT_TYPE_FIELDS }),
      lookup('planRel', 'Onboarding checklist', 'plan'),
      number('indexNum', 'Order'),
      check('inactiveBool', 'Inactive'),
      table('allPositionsDt', 'Positions', query(hrDocs('position')), [
        { displayName: 'Position', field: 'nameId', link: true },
        { displayName: 'Requires', field: 'requiredCertsRel', type: 'labels' },
        { displayName: 'Checklist', field: 'planRel', type: 'labels' },
        { displayName: 'Order', field: 'indexNum', type: 'numeric', sort: { direction: 'asc' } },
      ], { rowsPerPage: 20 }),
    ],
    [T.plan]: [
      tags('plan'),
      text('nameId', 'Checklist', { mandatory: true }),
      { componentName: 'solid-checklist', name: 'checkItems', label: 'Tasks', mode: 'define', fullWidth: true },
      number('indexNum', 'Order'),
      check('inactiveBool', 'Inactive'),
      table('allPlansDt', 'Onboarding checklists', query(hrDocs('plan')), [
        { displayName: 'Checklist', field: 'nameId', link: true, sort: { direction: 'asc' } },
        { displayName: 'Inactive', field: 'inactiveBool', type: 'boolean' },
      ]),
    ],
    [T.counter]: Object.values(COUNTERS).map((c) => text(c.field, `${c.prefix} counter`)),
    ...lookupTemplates(),
  };
}

function lookupTemplates() {
  const extra = {
    leaveType: [
      { componentName: 'sc-text-box', name: 'color', label: 'Colour (CSS)' },
      dropDown('balanceKey', 'Balance it uses', ['', 'annual', 'personal', 'longService']),
      number('accrualDaysNum', 'Days a full-time employee accrues a year'),
      number('evidenceAfterDaysNum', 'Evidence needed for more than (days)'),
      number('maxDaysNum', 'At most (days) at a time'),
      check('needsReasonBool', 'Needs a reason'),
      check('needsHrBool', 'Approved by People & Culture too'),
    ],
    certType: [text('shortName', 'Short name (matrix header)'), number('validityMonthsNum', 'Valid for (months; 0: no expiry)')],
  };
  const out = {};
  for (const [kind, names] of Object.entries(LOOKUPS)) {
    const isStatus = STATUS_KINDS.includes(kind);
    out[T[`lookup_${kind}`]] = [
      tags(kind),
      text('nameId', names.name, { mandatory: true }),
      number('indexNum', 'Order'),
      ...(isStatus ? [{ componentName: 'sc-text-box', name: 'color', label: 'Colour (CSS)' }, dropDown('statusCategory', 'Category', ['todo', 'inprogress', 'done'])] : []),
      ...(extra[kind] ?? []),
      check('inactiveBool', 'Inactive'),
      table('allDocsDt', names.plural, query(hrDocs(kind)), [
        { displayName: 'Name', field: 'nameId', link: true },
        ...(isStatus || kind === 'leaveType' ? [{ displayName: 'Colour', field: 'color', type: 'color' }] : []),
        ...(kind === 'leaveType' ? [{ displayName: 'Balance', field: 'balanceKey' }, { displayName: 'Accrues a year', field: 'accrualDaysNum', type: 'numeric' }] : []),
        ...(kind === 'certType' ? [{ displayName: 'Short', field: 'shortName' }, { displayName: 'Months valid', field: 'validityMonthsNum', type: 'numeric' }] : []),
        { displayName: 'Order', field: 'indexNum', type: 'numeric', sort: { direction: 'asc' } },
        { displayName: 'Inactive', field: 'inactiveBool', type: 'boolean' },
      ], { rowsPerPage: 25 }),
    ];
  }
  return out;
}

/** The employee fields on the account form (this database's copy of the platform's account template). */
export function accountComponents({ statuses, values }) {
  const leaveTypeList = Object.values(values.leaveType);
  return [
    dropDown('accountType', 'Account type', Object.keys(ROLES)),
    text('employeeNo', 'Employee no.'),
    text('jobTitle', 'Title'),
    lookup('teamRel', 'Team', 'team', { relatedFields: TEAM_VALUE_FIELDS }),
    lookup('positionRel', 'Position', 'position', { relatedFields: POSITION_VALUE_FIELDS }),
    person('managerRel', 'Reports to', { filter: MANAGERS, relatedFields: { email: 'email', jobTitle: 'jobTitle' } }),
    dropDown('employmentType', 'Employment', ['Full time', 'Part time', 'Casual']),
    number('fteNum', 'FTE (1 is full time)'),
    date('employmentStartDate', 'Started'),
    text('phone', 'Phone'),
    ...inPanel('accountBalancesPanel', 'Leave', [
      { componentName: 'solid-leave-balance', name: 'accountBalances', label: 'Balances today', mode: 'summary', person: 'document', fullWidth: true, disableSave: true, leaveTypes: leaveTypeList, openingFields: OPENING_FIELDS, timeZone: TIME_ZONE },
      date('balanceDate', 'Opening balances as at'),
      number('annualOpeningNum', 'Annual leave then (days)'),
      number('personalOpeningNum', "Personal/carer's leave then (days)"),
      number('longServiceOpeningNum', 'Long service leave then (days)'),
      table('accountLeaveDt', 'Leave', query(hrDocs('leave', term('employeeRel.documentId', THIS))), leaveColumns({ withPerson: false, wide: true }), { rowsPerPage: 8 }),
    ]),
    ...inPanel('accountCertsPanel', 'Certificates', [
      table('accountCertsDt', 'Certificates', query(hrDocs('certificate', term('personRel.documentId', THIS)), CURRENT_CERTS), certColumns({ withPerson: false }), { rowsPerPage: 10, hideLabel: true }),
    ]),
    ...inPanel('accountOrgPanel', 'Reporting line', [
      { componentName: 'solid-org-chart', name: 'accountOrg', label: 'Reporting line', hideLabel: true, focus: 'document', fullWidth: true, disableSave: true, filter: q(ACTIVE_PEOPLE), awayFilter: q(query(hrDocs('leave', ...AWAY_TODAY))) },
    ]),
  ];
}

/** Menus by account type. */
export function menuFor(type, { menuItem, menuGroup }) {
  const form = (id) => `/form/${id}`;
  const lookups = (kinds) => kinds.map((kind) => menuItem(LOOKUPS[kind].plural, form(T[`lookup_${kind}`])));
  const leave = menuGroup('Leave', [menuItem('Leave calendar', form(T.calendar)), menuItem('Request leave', form(T.leave)), menuItem('Leave register', form(T.leaveRegister))]);
  const people = menuGroup('People', [
    menuItem('People', form(T.directory)),
    menuItem('Org chart', form(T.orgChart)),
    menuItem('Skills matrix', form(T.matrix)),
    menuItem('Certificates', form(T.certificates)),
    menuItem('Onboarding', form(T.onboardingList)),
  ]);
  const setup = menuGroup('Set-up', [
    menuItem('Teams', form(T.team)),
    menuItem('Positions', form(T.position)),
    menuItem('Onboarding checklists', form(T.plan)),
    menuItem('Certificate expiry checks', form(T.expiryCheck)),
    ...lookups(['leaveType', 'certType', ...STATUS_KINDS]),
  ]);
  const admin = menuGroup('Admin', [
    menuItem('Leave request template', `${form(T.leave)}/${TEMPLATE_EDITOR_ID}`),
    menuItem('Rulesets', `/form/${SYSTEM.ruleSet}`),
    menuItem('Configuration', `${form(CONFIG_ID)}/${TEMPLATE_EDITOR_ID}`),
  ]);
  const overview = menuItem('People overview', form(T.overview));
  const myHr = menuItem('My HR', form(T.myHr));
  const myTeam = menuItem('My team', form(T.myTeam));
  switch (type) {
    case 'Administrator':
      return [overview, myTeam, myHr, leave, people, setup, admin];
    case 'People & Culture':
      return [overview, myHr, leave, people, setup];
    case 'Executive':
      return [overview, myTeam, myHr, leave, people];
    case 'Manager':
      return [myTeam, myHr, leave, people];
    default:
      return [myHr, menuItem('Request leave', form(T.leave)), menuItem('Leave calendar', form(T.calendar)), menuItem('Org chart', form(T.orgChart)), menuItem('Add a certificate', form(T.certificate))];
  }
}

/** Where each account type starts. */
export const HOME_BY_TYPE = {
  Administrator: T.overview,
  'People & Culture': T.overview,
  Executive: T.overview,
  Manager: T.myTeam,
  Employee: T.myHr,
};

export { STATUSES, KEYS, ACCOUNTS, markdown };
