// What the HR demo is made of: Bluegum Community Health's teams, positions, people and reporting
// lines, leave types and certificate types, onboarding checklists, NSW public holidays, and the
// story the seed tells about this week's leave.

/** Statuses: [name, colour, category]. */
export const STATUSES = {
  leaveStatus: [
    ['Pending', '#d97706', 'inprogress'],
    ['Approved', '#2e9d5b', 'done'],
    ['Rejected', '#d33a3a', 'done'],
    ['Cancelled', '#8b8d98', 'done'],
  ],
  onboardingStatus: [
    ['Not started', '#7c7f8f', 'todo'],
    ['In progress', '#3e63dd', 'inprogress'],
    ['Completed', '#2e9d5b', 'done'],
    ['Cancelled', '#8b8d98', 'done'],
  ],
  certState: [
    ['Valid', '#2e9d5b', 'done'],
    ['Expiring', '#d97706', 'inprogress'],
    ['Expired', '#d33a3a', 'todo'],
    ['No expiry', '#3e63dd', 'done'],
  ],
};

/**
 * Status moves people make by hand. Leave goes Pending → Approved or Rejected through its approval
 * chain (the rules move it); people can only cancel. Onboarding is moved by hand.
 */
export const TRANSITIONS = {
  leaveStatus: { Pending: ['Cancelled'], Approved: ['Cancelled'], Rejected: [], Cancelled: [] },
  onboardingStatus: { 'Not started': ['In progress', 'Cancelled'], 'In progress': ['Completed', 'Cancelled', 'Not started'], Completed: ['In progress'], Cancelled: ['Not started'] },
  certState: {},
};

/**
 * Leave types: the balance each uses and what a full-time employee accrues a year (the National
 * Employment Standards: 4 weeks' annual leave, 10 days' personal/carer's leave; NSW long service
 * leave, about 4.3 days a year), and the rules each brings.
 */
export const LEAVE_TYPES = [
  { name: 'Annual leave', color: '#3e63dd', balanceKey: 'annual', accrualDaysNum: 20 },
  { name: "Personal/carer's leave", color: '#12a594', balanceKey: 'personal', accrualDaysNum: 10, evidenceAfterDaysNum: 2 },
  { name: 'Long service leave', color: '#8e4ec6', balanceKey: 'longService', accrualDaysNum: 4.33 },
  { name: 'Compassionate leave', color: '#d6409f', maxDaysNum: 2, needsReasonBool: true },
  { name: 'Parental leave', color: '#e5a000', needsHrBool: true, needsReasonBool: true },
  { name: 'Leave without pay', color: '#8b8d98', needsHrBool: true, needsReasonBool: true },
];

/** Certificate types: [name, short name, months valid (0: no expiry)]. */
export const CERT_TYPES = [
  ['AHPRA registration', 'AHPRA', 12],
  ['CPR (HLTAID009)', 'CPR', 12],
  ['First aid (HLTAID011)', 'First aid', 36],
  ['Infection control', 'Infection', 12],
  ['Medication administration', 'Meds', 24],
  ['Manual handling', 'Manual', 24],
  ['National police check', 'Police', 36],
  ['Working with Children Check', 'WWCC', 60],
  ["Driver's licence", 'Licence', 60],
  ['Fire warden', 'Warden', 24],
];

/** Onboarding checklists: tasks [question, category, mandatory]. */
export const PLANS = {
  clinical: {
    name: 'Clinical starter',
    items: [
      ['Contract signed and returned', 'Before day one', true],
      ['Bank, tax file and super details entered in payroll', 'Before day one', true],
      ['Network account and email set up', 'Before day one', true],
      ['ID badge and building access issued', 'Before day one', true],
      ['Welcome and site tour', 'Day one', true],
      ['Emergency procedures and fire exits walked through', 'Day one', true],
      ['Clinical systems (patient records, medication charts) access', 'Day one', true],
      ['Infection control induction', 'First week', true],
      ['Buddy shifts (three)', 'First week', true],
      ['Manual handling session', 'First week', false],
      ['Medication competency assessed', 'First month', true],
      ['One-month check-in with manager', 'First month', true],
      ['Probation review booked', 'First month', false],
    ],
  },
  community: {
    name: 'Home care starter',
    items: [
      ['Contract signed and returned', 'Before day one', true],
      ['Bank, tax file and super details entered in payroll', 'Before day one', true],
      ["Driver's licence and car insurance sighted", 'Before day one', true],
      ['Phone and rostering app set up', 'Before day one', true],
      ['Welcome and office tour', 'Day one', true],
      ['Client confidentiality and privacy briefing', 'Day one', true],
      ['Manual handling session', 'First week', true],
      ['Shadow visits with a senior carer (five)', 'First week', true],
      ['Lone worker and check-in procedure', 'First week', true],
      ['One-month check-in with coordinator', 'First month', true],
    ],
  },
  office: {
    name: 'Office starter',
    items: [
      ['Contract signed and returned', 'Before day one', true],
      ['Bank, tax file and super details entered in payroll', 'Before day one', true],
      ['Laptop, network account and email', 'Before day one', true],
      ['Welcome and office tour', 'Day one', true],
      ['Emergency procedures and fire wardens', 'Day one', true],
      ['Systems training for the role', 'First week', true],
      ['Policies read and acknowledged', 'First week', true],
      ['One-month check-in with manager', 'First month', true],
    ],
  },
};

/** Positions: required certificates (by name) and their onboarding checklist. */
export const POSITIONS = [
  { name: 'Chief Executive', certs: ['National police check'], plan: 'office' },
  { name: 'Clinical Director', certs: ['AHPRA registration', 'National police check', 'Working with Children Check'], plan: 'clinical' },
  { name: 'People & Culture', certs: ['National police check', 'Fire warden'], plan: 'office' },
  { name: 'Finance', certs: ['National police check'], plan: 'office' },
  { name: 'Nurse Unit Manager', certs: ['AHPRA registration', 'CPR (HLTAID009)', 'First aid (HLTAID011)', 'Infection control', 'Medication administration', 'National police check', 'Working with Children Check'], plan: 'clinical' },
  { name: 'Registered Nurse', certs: ['AHPRA registration', 'CPR (HLTAID009)', 'First aid (HLTAID011)', 'Infection control', 'Medication administration', 'National police check', 'Working with Children Check'], plan: 'clinical' },
  { name: 'Enrolled Nurse', certs: ['AHPRA registration', 'CPR (HLTAID009)', 'First aid (HLTAID011)', 'Infection control', 'Medication administration', 'National police check'], plan: 'clinical' },
  { name: 'Practice Manager', certs: ['First aid (HLTAID011)', 'National police check', 'Fire warden'], plan: 'office' },
  { name: 'Receptionist', certs: ['First aid (HLTAID011)', 'National police check'], plan: 'office' },
  { name: 'Home Care Coordinator', certs: ['First aid (HLTAID011)', 'CPR (HLTAID009)', 'Manual handling', 'National police check', 'Working with Children Check', "Driver's licence"], plan: 'community' },
  { name: 'Care Worker', certs: ['First aid (HLTAID011)', 'CPR (HLTAID009)', 'Manual handling', 'National police check', 'Working with Children Check', "Driver's licence"], plan: 'community' },
  { name: 'IT', certs: ['National police check'], plan: 'office' },
];

/** Teams: code, site, colour, the fewest people needed on a work day. */
export const TEAMS = [
  { key: 'exe', name: 'Executive', code: 'EXE', site: 'Head office, Parramatta', color: '#5b47e0', min: 0 },
  { key: 'pac', name: 'People & Culture', code: 'P&C', site: 'Head office, Parramatta', color: '#d6409f', min: 1 },
  { key: 'fin', name: 'Finance', code: 'FIN', site: 'Head office, Parramatta', color: '#0b8fb3', min: 1 },
  { key: 'pnu', name: 'Parramatta Nursing', code: 'PNU', site: 'Parramatta Clinic', color: '#3e63dd', min: 4 },
  { key: 'pre', name: 'Parramatta Reception', code: 'PRE', site: 'Parramatta Clinic', color: '#12a594', min: 2 },
  { key: 'enu', name: 'Penrith Nursing', code: 'ENU', site: 'Penrith Clinic', color: '#8e4ec6', min: 2 },
  { key: 'hca', name: 'Home Care', code: 'HCA', site: 'Western Sydney (community)', color: '#e5711a', min: 3 },
  { key: 'its', name: 'IT', code: 'ITS', site: 'Head office, Parramatta', color: '#46a758', min: 1 },
];

/**
 * The people: account type, team, position, title, manager, FTE, employment type and how many years
 * they have been with Bluegum (fractions: months). `starts` (days from today) marks a new starter.
 */
export const PEOPLE = [
  { key: 'margaret', first: 'Margaret', last: 'Ellis', type: 'Executive', team: 'exe', position: 'Chief Executive', title: 'Chief Executive', manager: null, years: 9 },
  { key: 'david', first: 'David', last: 'Chen', type: 'Executive', team: 'exe', position: 'Clinical Director', title: 'Clinical Director', manager: 'margaret', years: 7.5 },
  { key: 'nadia', first: 'Nadia', last: 'Haddad', type: 'Administrator', team: 'pac', position: 'People & Culture', title: 'People & Culture Manager', manager: 'margaret', years: 6 },
  { key: 'tom', first: 'Tom', last: 'Becker', type: 'People & Culture', team: 'pac', position: 'People & Culture', title: 'HR Advisor', manager: 'nadia', years: 3 },
  { key: 'leah', first: 'Leah', last: 'Morgan', type: 'People & Culture', team: 'pac', position: 'People & Culture', title: 'HR Coordinator', manager: 'nadia', years: 1.5, fte: 0.6, employment: 'Part time' },
  { key: 'raj', first: 'Raj', last: 'Malhotra', type: 'Manager', team: 'fin', position: 'Finance', title: 'Finance Manager', manager: 'margaret', years: 5 },
  { key: 'emma', first: 'Emma', last: 'Walsh', type: 'Employee', team: 'fin', position: 'Finance', title: 'Finance Officer', manager: 'raj', years: 2 },
  { key: 'ben', first: 'Ben', last: 'Tran', type: 'Employee', team: 'fin', position: 'Finance', title: 'Payroll Officer', manager: 'raj', years: 4 },
  { key: 'sarah', first: 'Sarah', last: 'Mitchell', type: 'Manager', team: 'pnu', position: 'Nurse Unit Manager', title: 'Nurse Unit Manager, Parramatta', manager: 'david', years: 8 },
  { key: 'james', first: 'James', last: 'Okoro', type: 'Employee', team: 'pnu', position: 'Registered Nurse', title: 'Registered Nurse', manager: 'sarah', years: 3.5 },
  { key: 'mei', first: 'Mei', last: 'Lin', type: 'Employee', team: 'pnu', position: 'Registered Nurse', title: 'Registered Nurse', manager: 'sarah', years: 6 },
  { key: 'lucy', first: 'Lucy', last: 'Hart', type: 'Employee', team: 'pnu', position: 'Enrolled Nurse', title: 'Enrolled Nurse', manager: 'sarah', years: 2.5, fte: 0.8, employment: 'Part time' },
  { key: 'ahmed', first: 'Ahmed', last: 'Karimi', type: 'Employee', team: 'pnu', position: 'Registered Nurse', title: 'Registered Nurse', manager: 'sarah', years: 1.2 },
  { key: 'chloe', first: 'Chloe', last: 'Brennan', type: 'Employee', team: 'pnu', position: 'Enrolled Nurse', title: 'Enrolled Nurse', manager: 'sarah', years: 0, starts: -19 },
  { key: 'grace', first: 'Grace', last: 'Kim', type: 'Manager', team: 'pre', position: 'Practice Manager', title: 'Practice Manager, Parramatta', manager: 'david', years: 5.5 },
  { key: 'sofia', first: 'Sofia', last: 'Rossi', type: 'Employee', team: 'pre', position: 'Receptionist', title: 'Receptionist', manager: 'grace', years: 2 },
  { key: 'liam', first: 'Liam', last: 'Doyle', type: 'Employee', team: 'pre', position: 'Receptionist', title: 'Receptionist', manager: 'grace', years: 0.8 },
  { key: 'hannah', first: 'Hannah', last: 'Price', type: 'Manager', team: 'enu', position: 'Nurse Unit Manager', title: 'Nurse Unit Manager, Penrith', manager: 'david', years: 4 },
  { key: 'oliver', first: 'Oliver', last: 'Grant', type: 'Employee', team: 'enu', position: 'Registered Nurse', title: 'Registered Nurse', manager: 'hannah', years: 3 },
  { key: 'zara', first: 'Zara', last: 'Ahmed', type: 'Employee', team: 'enu', position: 'Enrolled Nurse', title: 'Enrolled Nurse', manager: 'hannah', years: 1.8 },
  { key: 'noah', first: 'Noah', last: 'Fischer', type: 'Employee', team: 'enu', position: 'Registered Nurse', title: 'Registered Nurse', manager: 'hannah', years: 0, starts: 6 },
  { key: 'kate', first: 'Kate', last: 'Sullivan', type: 'Manager', team: 'hca', position: 'Home Care Coordinator', title: 'Home Care Coordinator', manager: 'david', years: 6.5 },
  { key: 'jack', first: 'Jack', last: 'Wilson', type: 'Employee', team: 'hca', position: 'Care Worker', title: 'Care Worker', manager: 'kate', years: 2 },
  { key: 'amara', first: 'Amara', last: 'Okafor', type: 'Employee', team: 'hca', position: 'Care Worker', title: 'Senior Care Worker', manager: 'kate', years: 5 },
  { key: 'ryan', first: 'Ryan', last: 'Cole', type: 'Employee', team: 'hca', position: 'Care Worker', title: 'Care Worker', manager: 'kate', years: 1, fte: 0.6, employment: 'Part time' },
  { key: 'isla', first: 'Isla', last: 'Thompson', type: 'Employee', team: 'hca', position: 'Care Worker', title: 'Care Worker', manager: 'kate', years: 3 },
  { key: 'mateo', first: 'Mateo', last: 'Garcia', type: 'Employee', team: 'hca', position: 'Care Worker', title: 'Care Worker', manager: 'kate', years: 0.6 },
  { key: 'ethan', first: 'Ethan', last: 'Park', type: 'Manager', team: 'its', position: 'IT', title: 'IT Manager', manager: 'margaret', years: 4.5 },
  { key: 'ava', first: 'Ava', last: 'Nguyen', type: 'Employee', team: 'its', position: 'IT', title: 'IT Support Officer', manager: 'ethan', years: 1.5 },
];

/** NSW public holidays that fall on weekdays or are observed (the leave rules skip them). */
export const HOLIDAYS = [
  ['2025-01-01', "New Year's Day"], ['2025-01-27', 'Australia Day (observed)'], ['2025-04-18', 'Good Friday'], ['2025-04-21', 'Easter Monday'],
  ['2025-04-25', 'Anzac Day'], ['2025-06-09', "King's Birthday"], ['2025-10-06', 'Labour Day'], ['2025-12-25', 'Christmas Day'], ['2025-12-26', 'Boxing Day'],
  ['2026-01-01', "New Year's Day"], ['2026-01-26', 'Australia Day'], ['2026-04-03', 'Good Friday'], ['2026-04-06', 'Easter Monday'],
  ['2026-06-08', "King's Birthday"], ['2026-10-05', 'Labour Day'], ['2026-12-25', 'Christmas Day'], ['2026-12-28', 'Boxing Day (additional day)'],
  ['2027-01-01', "New Year's Day"], ['2027-01-26', 'Australia Day'], ['2027-03-26', 'Good Friday'], ['2027-03-29', 'Easter Monday'],
  ['2027-06-14', "King's Birthday"], ['2027-10-04', 'Labour Day'], ['2027-12-27', 'Christmas Day (additional day)'], ['2027-12-28', 'Boxing Day (additional day)'],
].map(([date, name]) => ({ date, name }));

/**
 * The leave story, relative to this week's Monday (`week` 0); `days` working days long, `asked` days
 * ago. `approvals` are the decisions already made ('manager', 'second'). Minimum staffing is first
 * come, first served: a request is judged against approved leave and requests asked for before it.
 * The seed gives everyone else a year of ordinary, approved leave around these.
 */
export const STORY_LEAVE = [
  // Parramatta Nursing (six with the NUM, minimum four on a work day): next week Lucy is away, Mei
  // asks for some of the same days (4 of 6 left: fine), and Ahmed's request on top would leave 3, so
  // after Sarah it needs a second approver, David.
  { who: 'lucy', type: 'Annual leave', week: 1, day: 1, days: 4, status: 'Approved', asked: 21, approvals: ['manager'], note: 'Family wedding in Brisbane.' },
  { who: 'mei', type: 'Annual leave', week: 1, day: 2, days: 3, status: 'Pending', asked: 6, approvals: [], note: 'Moving house.' },
  { who: 'ahmed', type: 'Annual leave', week: 1, day: 2, days: 2, status: 'Pending', asked: 2, approvals: ['manager'], breach: true, note: 'Graduation ceremony.' },
  // James: a long break over Christmas, waiting for Sarah.
  { who: 'james', type: 'Annual leave', week: 5, day: 1, days: 9, status: 'Pending', asked: 3, approvals: [], note: 'Christmas with family in Lagos.' },
  // On leave today.
  { who: 'oliver', type: "Personal/carer's leave", week: 0, day: 'today', days: 1, status: 'Approved', asked: 0.1, approvals: ['manager'], note: 'Sick: gastro.' },
  { who: 'emma', type: 'Annual leave', week: 0, day: 'today-1', days: 3, status: 'Approved', asked: 15, approvals: ['manager'], note: 'Long weekend at the coast.' },
  // Home Care: Jack's request rejected (three others away), Isla's cancelled.
  { who: 'jack', type: 'Annual leave', week: 2, day: 1, days: 5, status: 'Rejected', asked: 9, approvals: ['manager:rejected'], note: 'Road trip.', comment: 'Amara and Ryan are already away that week and we have four new clients starting. Could you take the week after?' },
  { who: 'isla', type: 'Annual leave', week: 3, day: 3, days: 2, status: 'Cancelled', asked: 12, approvals: ['manager'], note: 'Concert in Melbourne (cancelled).' },
  { who: 'amara', type: 'Annual leave', week: 2, day: 1, days: 5, status: 'Approved', asked: 30, approvals: ['manager'], note: 'School holidays.' },
  { who: 'ryan', type: 'Annual leave', week: 2, day: 2, days: 2, status: 'Approved', asked: 25, approvals: ['manager'], note: '' },
  // Leave without pay goes to People & Culture after the manager.
  { who: 'ava', type: 'Leave without pay', week: 6, day: 1, days: 10, status: 'Pending', asked: 4, approvals: ['manager'], note: 'Volunteering overseas for a fortnight.' },
  // Sofia's carer's leave needs a certificate after two days; Grace delegated it to Sarah.
  { who: 'sofia', type: "Personal/carer's leave", week: 0, day: 3, days: 2, status: 'Pending', asked: 1, approvals: [], delegateTo: 'sarah', note: 'Looking after my son (school closure).' },
];
