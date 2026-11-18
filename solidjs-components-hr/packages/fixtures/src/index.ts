// A small HR data set in the demo's data model (demo/lib), for the preview gallery and the browser
// test: two teams with their managers, leave types and statuses, leave over the coming weeks (one
// request waiting for the signed-in manager, one taking a team below its minimum), certificate types
// and certificates (valid, expiring, expired, missing). Days are UTC and relative to when the page
// loads, so the definitions use the "UTC" time zone.

const DAY = 86_400_000;
const now = Date.now();
/** "YYYY-MM-DD" `days` from today (UTC). */
export const dayFromToday = (days: number) => new Date(now + days * DAY).toISOString().slice(0, 10);
const weekday = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay();
/** The Monday of this week, and a weekday `n` work days after it. */
export const MONDAY = dayFromToday(-((weekday(dayFromToday(0)) + 6) % 7));
const addDays = (key: string, days: number) => new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
/** Day `n` (0: Monday) of week `w` (0: this week). */
export const day = (w: number, n: number) => addDays(MONDAY, w * 7 + n);
const at = (key: string) => `${key}T00:00:00.000Z`;

type Doc = Record<string, unknown> & { documentId: string };
export type ComponentDef = Record<string, unknown> & { componentName: string; name: string };

const header = (summaryName: string, templateId: string, systemType = 'document', extra: Record<string, unknown> = {}) => ({ systemType, summaryName, templateId, versionId: `v-${summaryName}`, ...extra });
const rel = (doc: Doc, fields: Record<string, unknown> = {}) => ({ documentId: doc.documentId, name: (doc.systemHeader as { summaryName: string }).summaryName, ...fields });
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const lookup = (kind: string, name: string, extra: Record<string, unknown> = {}): Doc => ({
  documentId: `${kind}-${slug(name)}`,
  systemHeader: header(name, `template-${kind}`),
  appTags: ['hr', kind],
  nameId: name,
  inactiveBool: false,
  ...extra,
});

// ------------------------------------------------------------------------------------ lookups
export const leaveStatuses = {
  Pending: lookup('leaveStatus', 'Pending', { color: '#d97706', statusCategory: 'inprogress', indexNum: 10 }),
  Approved: lookup('leaveStatus', 'Approved', { color: '#2e9d5b', statusCategory: 'done', indexNum: 20 }),
};
const statusValue = (doc: Doc) => rel(doc, { color: doc.color, statusCategory: doc.statusCategory, indexNum: doc.indexNum });
export const leaveTypes = {
  annual: lookup('leaveType', 'Annual leave', { color: '#3e63dd', balanceKey: 'annual', accrualDaysNum: 20, indexNum: 10 }),
  personal: lookup('leaveType', "Personal/carer's leave", { color: '#12a594', balanceKey: 'personal', accrualDaysNum: 10, evidenceAfterDaysNum: 2, indexNum: 20 }),
  unpaid: lookup('leaveType', 'Leave without pay', { color: '#8b8d98', needsHrBool: true, indexNum: 30 }),
};
const typeValue = (doc: Doc) => rel(doc, { color: doc.color, balanceKey: doc.balanceKey ?? '', accrualDaysNum: doc.accrualDaysNum ?? 0 });
export const leaveTypeValues = Object.values(leaveTypes).map(typeValue);

export const certTypes = {
  cpr: lookup('certType', 'CPR (HLTAID009)', { shortName: 'CPR', validityMonthsNum: 12, indexNum: 10 }),
  firstAid: lookup('certType', 'First aid (HLTAID011)', { shortName: 'First aid', validityMonthsNum: 36, indexNum: 20 }),
  police: lookup('certType', 'National police check', { shortName: 'Police', validityMonthsNum: 36, indexNum: 30 }),
  wwcc: lookup('certType', 'Working with Children Check', { validityMonthsNum: 60, indexNum: 40 }),
};
const certValue = (doc: Doc) => rel(doc, { validityMonthsNum: doc.validityMonthsNum, shortName: doc.shortName });

export const teams = {
  nursing: lookup('team', 'Parramatta Nursing', { code: 'PNU', color: '#3e63dd', minOnDutyNum: 3, indexNum: 10 }),
  reception: lookup('team', 'Reception', { code: 'PRE', color: '#12a594', minOnDutyNum: 1, indexNum: 20 }),
};
const teamValue = (doc: Doc) => rel(doc, { color: doc.color, minOnDutyNum: doc.minOnDutyNum, indexNum: doc.indexNum });
export const positions = {
  nurse: lookup('position', 'Registered Nurse', { requiredCertsRel: [certValue(certTypes.cpr), certValue(certTypes.firstAid), certValue(certTypes.police)] }),
  reception: lookup('position', 'Receptionist', { requiredCertsRel: [certValue(certTypes.firstAid), certValue(certTypes.police)] }),
  manager: lookup('position', 'Manager', { requiredCertsRel: [certValue(certTypes.police)] }),
};
const positionValue = (doc: Doc) => rel(doc, { requiredCertsRel: doc.requiredCertsRel });

// ------------------------------------------------------------------------------------- people
const account = (key: string, first: string, last: string, o: { type: string; title: string; team: Doc; position: Doc; manager?: Doc; annual?: number; fte?: number }): Doc => ({
  documentId: `account-${key}`,
  systemHeader: header(`${first} ${last}`, 'template-account', 'account'),
  email: `${first}.${last}`.toLowerCase() + '@example.com',
  accountType: o.type,
  jobTitle: o.title,
  teamRel: [teamValue(o.team)],
  positionRel: [positionValue(o.position)],
  ...(o.manager ? { managerRel: [rel(o.manager)] } : {}),
  fteNum: o.fte ?? 1,
  balanceDate: at(dayFromToday(-120)),
  annualOpeningNum: o.annual ?? 10,
  personalOpeningNum: 6,
  annualAvailableNum: (o.annual ?? 10) + 6.6,
});
const david = account('david', 'David', 'Chen', { type: 'Executive', title: 'Clinical Director', team: teams.nursing, position: positions.manager });
const sarah = account('sarah', 'Sarah', 'Mitchell', { type: 'Manager', title: 'Nurse Unit Manager', team: teams.nursing, position: positions.manager, manager: david });
export const people: Record<string, Doc> = {
  david,
  sarah,
  james: account('james', 'James', 'Okoro', { type: 'Employee', title: 'Registered Nurse', team: teams.nursing, position: positions.nurse, manager: sarah, annual: 4 }),
  mei: account('mei', 'Mei', 'Lin', { type: 'Employee', title: 'Registered Nurse', team: teams.nursing, position: positions.nurse, manager: sarah }),
  lucy: account('lucy', 'Lucy', 'Hart', { type: 'Employee', title: 'Enrolled Nurse', team: teams.nursing, position: positions.nurse, manager: sarah, fte: 0.8 }),
  grace: account('grace', 'Grace', 'Kim', { type: 'Manager', title: 'Practice Manager', team: teams.reception, position: positions.manager, manager: david }),
};
const grace = people.grace;
Object.assign(people, { sofia: account('sofia', 'Sofia', 'Rossi', { type: 'Employee', title: 'Receptionist', team: teams.reception, position: positions.reception, manager: grace }) });
/** The signed-in account: Sarah, the nursing team's manager. */
export const CURRENT_ACCOUNT_ID = sarah.documentId;
const person = (doc: Doc) => rel(doc, { email: doc.email, jobTitle: doc.jobTitle, teamRel: doc.teamRel, managerRel: doc.managerRel ?? [] });

// -------------------------------------------------------------------------------------- leave
const leave = (id: string, who: Doc, type: Doc, first: string, last: string, status: Doc, extra: Record<string, unknown> = {}): Doc => ({
  documentId: id,
  systemHeader: header(`${id}: ${(who.systemHeader as { summaryName: string }).summaryName}`, 'template-leave'),
  appTags: ['hr', 'leave'],
  leaveRef: id.toUpperCase(),
  employeeRel: [person(who)],
  teamRel: who.teamRel,
  leaveTypeRel: [typeValue(type)],
  leaveStatusRel: [statusValue(status)],
  startDate: at(first),
  endDate: at(last),
  startHalfBool: false,
  endHalfBool: false,
  ...extra,
});
const step = (id: string, label: string, approvers: Doc[], decided?: { by: Doc; decision: string; comment?: string }) => ({
  id,
  label,
  approvers: approvers.map((a) => rel(a)),
  decision: decided?.decision ?? '',
  decidedBy: decided ? rel(decided.by) : null,
  decidedAt: decided ? new Date(now - 3 * 3_600_000).toISOString() : null,
  comment: decided?.comment ?? '',
});
/** Lucy is away all of next week; Mei asked for next Tue–Thu (waiting for Sarah); James's Wed takes the team below its minimum. */
export const lucyLeave = leave('lv-1', people.lucy, leaveTypes.annual, day(1, 0), day(1, 4), leaveStatuses.Approved, { daysNum: 5, approvalChain: { steps: [step('manager', 'Line manager', [sarah], { by: sarah, decision: 'approved', comment: 'Enjoy the wedding!' })] } });
export const meiLeave = leave('lv-2', people.mei, leaveTypes.annual, day(1, 1), day(1, 3), leaveStatuses.Pending, {
  daysNum: 3,
  approvalChain: { steps: [step('manager', 'Line manager', [sarah]), { ...step('second', 'Second approver', [david]), reason: 'Parramatta Nursing would have 2 of 5 on Wed, below its minimum of 3.' }] },
});
export const jamesLeave = leave('lv-3', people.james, leaveTypes.personal, day(1, 2), day(1, 2), leaveStatuses.Pending, { daysNum: 1, startHalfBool: true });
export const graceLeave = leave('lv-4', people.grace, leaveTypes.annual, day(2, 0), day(2, 1), leaveStatuses.Approved, { daysNum: 2 });
export const sofiaToday = leave('lv-5', people.sofia, leaveTypes.personal, dayFromToday(0), dayFromToday(0), leaveStatuses.Approved, { daysNum: 1 });
/** A decided request (read-only chain). */
export const decidedLeave = leave('lv-6', people.mei, leaveTypes.annual, day(4, 0), day(4, 1), leaveStatuses.Approved, {
  daysNum: 2,
  approvalChain: { steps: [step('manager', 'Line manager', [sarah], { by: sarah, decision: 'approved', comment: 'Fine.' })] },
});

// ------------------------------------------------------------------------------- certificates
const cert = (id: string, who: Doc, type: Doc, expiryDays: number | null): Doc => ({
  documentId: id,
  systemHeader: header(`${id}: ${(who.systemHeader as { summaryName: string }).summaryName}`, 'template-certificate'),
  appTags: ['hr', 'certificate'],
  personRel: [rel(who)],
  certTypeRel: [certValue(type)],
  issuedDate: new Date(now - 300 * DAY).toISOString(),
  ...(expiryDays === null ? {} : { expiryDate: new Date(now + expiryDays * DAY + 3_600_000).toISOString() }),
});
export const certificates = [
  cert('crt-1', people.james, certTypes.cpr, 12), // expiring
  cert('crt-2', people.james, certTypes.firstAid, 400),
  cert('crt-3', people.james, certTypes.police, 600),
  cert('crt-4', people.mei, certTypes.cpr, 200),
  cert('crt-5', people.mei, certTypes.firstAid, -5), // expired
  cert('crt-6', people.mei, certTypes.police, 500),
  cert('crt-7', people.mei, certTypes.wwcc, 900), // held, not required
  cert('crt-8', people.lucy, certTypes.cpr, 150),
  cert('crt-9', people.lucy, certTypes.police, 700), // first aid missing
  cert('crt-10', people.sofia, certTypes.firstAid, 300),
  cert('crt-11', people.sofia, certTypes.police, 300),
  cert('crt-12', people.sarah, certTypes.police, 300),
  cert('crt-13', people.grace, certTypes.police, 20), // expiring
  cert('crt-14', people.david, certTypes.police, 800),
  cert('crt-15', people.james, certTypes.cpr, -360), // the older CPR, superseded by crt-1
];

// ------------------------------------------------------------------------------ forms and pages
export const template = { documentId: 'template-hr', components: [] as ComponentDef[] };
export const dashboard: Doc = { documentId: 'page-hr', systemHeader: header('People overview', 'template-page', 'document', { serverCreatedDate: '2026-01-01T00:00:00.000Z' }) };
export const newLeave: Doc = {
  documentId: 'leave-new',
  systemHeader: { templateId: 'template-leave', systemType: 'document' },
  employeeRel: [person(people.james)],
  leaveTypeRel: [typeValue(leaveTypes.annual)],
  startDate: at(day(3, 0)),
  endDate: at(day(3, 4)),
  startHalfBool: false,
  endHalfBool: false,
  daysNum: 5,
};
export const unpaidLeave: Doc = { ...newLeave, documentId: 'leave-unpaid', leaveTypeRel: [typeValue(leaveTypes.unpaid)] };
export const sarahProfile: Doc = { ...sarah };

export const documents: Doc[] = [
  ...Object.values(leaveStatuses),
  ...Object.values(leaveTypes),
  ...Object.values(certTypes),
  ...Object.values(teams),
  ...Object.values(positions),
  ...Object.values(people),
  lucyLeave,
  meiLeave,
  jamesLeave,
  graceLeave,
  sofiaToday,
  decidedLeave,
  ...certificates,
];
export const forms: Doc[] = [dashboard, newLeave, unpaidLeave, meiLeave, decidedLeave, sarahProfile];

const ACCOUNTS = "{'query':{'bool':{'filter':[{'term':{'systemHeader.systemType':'account'}}]}},'sort':[{'teamRel.indexNum':'asc'},{'systemHeader.summaryName':'asc'}]}";
const LIVE_LEAVE = "{'query':{'bool':{'filter':[{'term':{'appTags':'leave'}},{'terms':{'leaveStatusRel.name':['Pending','Approved']}}]}}}";
/** A day that is a public holiday in the fixtures: next week's Friday. */
export const HOLIDAY = { date: day(1, 4), name: 'Show Day' };

/** One definition per element on the page. */
export const definitions: Record<string, ComponentDef> = {
  dates: {
    componentName: 'solid-date-range', name: 'startDate', label: 'When', mode: 'days', endField: 'endDate', fullWidth: true,
    startHalfField: 'startHalfBool', endHalfField: 'endHalfBool', daysField: 'daysNum', timeZone: 'UTC', holidays: [HOLIDAY],
  },
  balance: {
    componentName: 'solid-leave-balance', name: 'balanceView', label: 'Balance', mode: 'request', disableSave: true, availableField: 'availableDaysNum', leaveTypes: leaveTypeValues, timeZone: 'UTC',
  },
  unpaidBalance: { componentName: 'solid-leave-balance', name: 'balanceView', label: 'Balance', mode: 'request', disableSave: true, leaveTypes: leaveTypeValues, timeZone: 'UTC' },
  balances: { componentName: 'solid-leave-balance', name: 'myBalances', label: 'My leave balances', mode: 'summary', disableSave: true, leaveTypes: leaveTypeValues, timeZone: 'UTC' },
  approval: { componentName: 'solid-approval-chain', name: 'approvalChain', label: 'Approval', noun: 'request' },
  decided: { componentName: 'solid-approval-chain', name: 'approvalChain', label: 'Approval', noun: 'request' },
  calendar: {
    componentName: 'solid-resource-schedule', name: 'calendar', label: 'Leave calendar', disableSave: true,
    rowFilter: ACCOUNTS, rowDetailField: 'jobTitle', groupField: 'teamRel.name', groupMinField: 'teamRel.minOnDutyNum',
    rowFigures: [{ label: 'Annual leave available', path: 'annualAvailableNum', unit: 'd', warnBelow: 0 }],
    filter: LIVE_LEAVE, rowField: 'employeeRel.documentId', startField: 'startDate', endField: 'endDate', startHalfField: 'startHalfBool', endHalfField: 'endHalfBool',
    labelField: 'leaveTypeRel.name', colorField: 'leaveTypeRel.color', statusField: 'leaveStatusRel.name', tentativeStatuses: ['Pending'],
    timeZone: 'UTC', holidays: [HOLIDAY], days: 14, views: [14, 28], templateId: 'template-leave', newLabel: 'Request leave', createFor: 'me', rowValueFields: { email: 'email', teamRel: 'teamRel' },
  },
  matrix: {
    componentName: 'solid-skills-matrix', name: 'matrix', label: 'Skills matrix', disableSave: true,
    peopleFilter: ACCOUNTS, typesFilter: "{'query':{'bool':{'filter':[{'term':{'appTags':'certType'}}]}},'sort':[{'indexNum':'asc'}]}",
    filter: "{'query':{'bool':{'filter':[{'term':{'appTags':'certificate'}}]}}}", requiredField: 'positionRel.requiredCertsRel.documentId', groupField: 'teamRel.name', detailField: 'jobTitle',
    shortField: 'shortName', warnDays: 30, templateId: 'template-certificate',
  },
  org: {
    componentName: 'solid-org-chart', name: 'org', label: 'Org chart', disableSave: true, height: '420px',
    filter: ACCOUNTS, awayFilter: `{'query':{'bool':{'filter':[{'term':{'appTags':'leave'}},{'term':{'leaveStatusRel.name':'Approved'}},{'range':{'startDate':{'lte':'now'}}},{'range':{'endDate':{'gte':'now-1d'}}}]}}}`,
  },
  orgFocus: { componentName: 'solid-org-chart', name: 'orgFocus', label: 'Reporting line', disableSave: true, focus: 'document', filter: ACCOUNTS },
};
