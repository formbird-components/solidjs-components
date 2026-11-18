// Assembles every document of the HR demo database: lookups (statuses, leave and certificate types),
// onboarding checklists, positions, teams, the people with their reporting lines and opening
// balances, a year of leave and this week's story, certificates, onboarding, an expiry check, the
// templates and rulesets, and the platform documents.
//
// Data is generated around "now" with a seeded random generator, so every seed tells the same story
// relative to the week it runs: next week Parramatta Nursing would drop below its minimum (Ahmed's
// request waits for a second approver), James's Christmas leave waits for Sarah, Jack's request was
// rejected, Oliver is off sick today, three home carers' certificates are expiring or expired, and
// two new nurses are onboarding. Derived values (working days, balances, approval chains, staffing,
// certificate states, onboarding progress) come from the same functions the rulesets use, so seeded
// records look exactly as if they had been saved.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentRepos, DocumentSet, header, menuGroup, menuItem, related, SYSTEM } from '@solidjs-components/platform/documents';
import { LOOKUP_FIELDS, PERSON_FIELDS } from '@solidjs-components/platform/form-parts';
import { appDocuments, companyClock, iso, random, slug } from '@solidjs-components/platform/seed-kit';
import { approvalStatus } from '../../../solidjs-components-shared/packages/kit/src/domain/approval.ts';
import { checklistOutcome } from '../../../solidjs-components-shared/packages/kit/src/domain/checklist.ts';
import { dayKey, dayStart, workingDays } from '../../../solidjs-components-shared/packages/kit/src/domain/range.ts';
import { certState, expiryFromIssue, missingCertificates } from '../../packages/hr-kit/src/logic/certs.ts';
import { leaveApprovalSteps, leaveBalance, leavePeriodText, staffingBreaches } from '../../packages/hr-kit/src/logic/leave.ts';
import { CERT_TYPES, HOLIDAYS, LEAVE_TYPES, PEOPLE, PLANS, POSITIONS, STATUSES, STORY_LEAVE, TEAMS } from './catalog.mjs';
import {
  CERT_TYPE_FIELDS, COMPANY, COUNTERS, DEMO_PASSWORD, EMPLOYEE_FIELDS, EXPIRY_WARN_DAYS, hrId, KEYS, LEAVE_TYPE_FIELDS, LOOKUPS, OPENING_FIELDS, POSITION_VALUE_FIELDS, ROLES, RULESETS, T,
  TEAM_VALUE_FIELDS, TIME_ZONE,
} from './model.mjs';
import * as rules from './rules.mjs';
import { accountComponents, HOME_BY_TYPE, menuFor, templateComponents } from './templates.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const keyTime = (key) => Date.parse(`${key}T00:00:00Z`);
const keyAdd = (key, days) => new Date(keyTime(key) + days * DAY).toISOString().slice(0, 10);
const weekdayOf = (key) => new Date(keyTime(key)).getUTCDay();
const HOLIDAY_KEYS = new Set(HOLIDAYS.map((h) => h.date));
const isWorkDay = (key) => weekdayOf(key) >= 1 && weekdayOf(key) <= 5 && !HOLIDAY_KEYS.has(key);
const nextWorkDay = (key) => {
  let k = key;
  while (!isWorkDay(k)) k = keyAdd(k, 1);
  return k;
};
/** The last day of `n` working days starting on `first` (itself moved to a working day). */
const lastOfWorkDays = (first, n) => {
  let k = nextWorkDay(first);
  let counted = 1;
  while (counted < n) {
    k = keyAdd(k, 1);
    if (isWorkDay(k)) counted++;
  }
  return k;
};

/** The same day of the month, `months` earlier (or that month's last day). */
const monthsBefore = (time, months) => {
  const e = new Date(time);
  const d = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - months, 1, e.getUTCHours(), e.getUTCMinutes()));
  d.setUTCDate(Math.min(e.getUTCDate(), new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d.getTime();
};

/**
 * Builds the HR demo documents.
 * @param {{ now?: Date, urlRoot?: string, platform?: boolean }} [options] - `platform: false` leaves out the platform and
 *   component documents (unit tests: they need built bundles)
 */
export function buildDemo({ now = new Date(), urlRoot = 'http://localhost:3004', platform = true } = {}) {
  const NOW = now.getTime();
  const rand = random(20261118);
  const { at } = companyClock({ now: NOW, timeZone: TIME_ZONE });
  const today = dayKey(NOW, TIME_ZONE);
  const monday = keyAdd(today, -((weekdayOf(today) + 6) % 7));
  const [ty, tm] = today.split('-').map(Number);
  const fyStart = `${tm >= 7 ? ty : ty - 1}-07-01`;
  const instant = (key, hour = 9) => at(Math.round((keyTime(key) - keyTime(today)) / DAY), hour);

  const seededAt = new Date(at(-420, 8));
  const adminId = hrId('account', 'nadia');
  const set = new DocumentSet({ at: seededAt, by: adminId });
  const { doc, statusValues, lookupValues } = appDocuments({ set, app: 'hr', idOf: hrId, at: seededAt, by: adminId });

  // ---------------------------------------------------------------------------------- lookups
  const statuses = {};
  for (const [kind, list] of Object.entries(STATUSES)) statuses[kind] = statusValues(kind, T[`lookup_${kind}`], list);
  const values = {};
  values.leaveType = lookupValues('leaveType', T.lookup_leaveType, LEAVE_TYPES.map((t) => t.name), (name) => {
    const { name: _, ...fields } = LEAVE_TYPES.find((t) => t.name === name);
    return { balanceKey: '', accrualDaysNum: 0, evidenceAfterDaysNum: 0, maxDaysNum: 0, needsReasonBool: false, needsHrBool: false, ...fields };
  }, LEAVE_TYPE_FIELDS);
  values.certType = lookupValues('certType', T.lookup_certType, CERT_TYPES.map(([name]) => name), (name) => {
    const [, shortName, months] = CERT_TYPES.find(([n]) => n === name);
    return { shortName, validityMonthsNum: months };
  }, CERT_TYPE_FIELDS);
  const leaveTypeById = Object.fromEntries(Object.values(values.leaveType).map((v) => [v.documentId, v]));

  // ------------------------------------------------------------------ checklists, positions, teams
  const planValue = {};
  Object.entries(PLANS).forEach(([key, plan], i) => {
    const d = doc('plan', T.plan, plan.name, {
      nameId: plan.name, indexNum: (i + 1) * 10, inactiveBool: false,
      checkItems: plan.items.map(([question, category, mandatory]) => ({ key: slug(question).slice(0, 40), question, category, ...(mandatory ? { mandatory: true } : {}) })),
    });
    planValue[key] = related(d, LOOKUP_FIELDS);
  });
  const plans = Object.fromEntries(Object.keys(PLANS).map((key) => [key, set.documents.find((d) => d.documentId === planValue[key].documentId)]));
  const positionValue = {};
  POSITIONS.forEach((p, i) => {
    const d = doc('position', T.position, p.name, { nameId: p.name, indexNum: (i + 1) * 10, inactiveBool: false, requiredCertsRel: p.certs.map((c) => values.certType[c]), planRel: [planValue[p.plan]] });
    positionValue[p.name] = related(d, POSITION_VALUE_FIELDS);
  });
  const teamDocs = {};
  const teamValue = {};
  TEAMS.forEach((t, i) => {
    teamDocs[t.key] = doc('team', T.team, t.name, { nameId: t.name, code: t.code, site: t.site, color: t.color, minOnDutyNum: t.min, indexNum: (i + 1) * 10, inactiveBool: false });
    teamValue[t.key] = related(teamDocs[t.key], TEAM_VALUE_FIELDS);
  });

  // ---------------------------------------------------------------------------------- people
  const people = {};
  const storyNeeds = {};
  for (const s of STORY_LEAVE) {
    const type = LEAVE_TYPES.find((t) => t.name === s.type);
    if (type.balanceKey) storyNeeds[`${s.who}:${type.balanceKey}`] = (storyNeeds[`${s.who}:${type.balanceKey}`] ?? 0) + s.days;
  }
  PEOPLE.forEach((p, i) => {
    const email = `${p.first}.${p.last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com';
    const started = p.starts !== undefined ? keyAdd(today, p.starts) : keyAdd(today, -Math.round(p.years * 365) - rand.int(0, 40));
    const isNew = p.starts !== undefined;
    const balanceDay = started > fyStart ? started : fyStart;
    const fte = p.fte ?? 1;
    const openingAnnual = isNew ? 0 : Math.max(Math.round((rand.int(6, 22) + rand.next()) * fte * 10) / 10, (storyNeeds[`${p.key}:annual`] ?? 0) + 3);
    const openingPersonal = isNew ? 0 : Math.round((rand.int(4, 14) + rand.next()) * fte * 10) / 10;
    const openingLong = p.years >= 2 ? Math.round(p.years * 4.33 * fte * 0.85 * 10) / 10 : 0;
    const account = set.account({
      id: hrId('account', p.key),
      securityId: hrId('accountSecurity', p.key),
      controlId: hrId('accountControl', p.key),
      first: p.first,
      last: p.last,
      email,
      title: p.title,
      password: DEMO_PASSWORD,
      adminKey: KEYS.admin,
      accessKeys: ROLES[p.type].map((k) => KEYS[k]),
      fields: {
        accountType: p.type,
        employeeNo: `BG${String(1001 + i)}`,
        teamRel: [teamValue[p.team]],
        positionRel: [positionValue[p.position]],
        employmentType: p.employment ?? 'Full time',
        fteNum: fte,
        employmentStartDate: dayStart(started, TIME_ZONE),
        balanceDate: dayStart(balanceDay, TIME_ZONE),
        annualOpeningNum: openingAnnual,
        personalOpeningNum: openingPersonal,
        longServiceOpeningNum: openingLong,
        phone: `04${rand.int(10, 99)} ${rand.int(100, 999)} ${rand.int(100, 999)}`,
        defaultURL: HOME_BY_TYPE[p.type],
        menu: menuFor(p.type, { menuItem, menuGroup }),
        onboardingStatus: isNew ? 'In progress' : 'Completed',
      },
    });
    people[p.key] = { ...p, name: `${p.first} ${p.last}`, email, documentId: account.documentId, account, started, balanceDay, isNew };
  });
  for (const p of PEOPLE) if (p.manager) people[p.key].account.managerRel = [{ ...related(people[p.manager].account, { email: 'email', jobTitle: 'jobTitle' }) }];
  for (const t of TEAMS) {
    const manager = PEOPLE.find((p) => p.team === t.key && (p.type === 'Manager' || p.type === 'Administrator')) ?? PEOPLE.find((p) => p.team === t.key);
    teamDocs[t.key].managerRel = [related(people[manager.key].account, PERSON_FIELDS)];
  }
  const personValue = (key) => related(people[key].account, EMPLOYEE_FIELDS);
  const author = (key) => ({ documentId: people[key].documentId, name: people[key].name });
  const hrPeople = PEOPLE.filter((p) => p.type === 'People & Culture' || p.type === 'Administrator').map((p) => author(p.key)).sort((a, b) => a.name.localeCompare(b.name));
  const teamSize = (team) => PEOPLE.filter((p) => p.team === team && (!people[p.key].isNew || people[p.key].started <= today)).length;
  const noteId = () => `note-${rand.int(1e6, 9e6).toString(36)}${rand.int(1e6, 9e6).toString(36)}`;
  const note = (by, time, detail) => ({ dataId: noteId(), detail, createdBy: author(by), createdDate: iso(time), comments: [], votes: [] });

  // ----------------------------------------------------------------------------------- leave
  const leaves = [];
  const live = (l) => l.status === 'Approved' || l.status === 'Pending';
  const balanceFor = (key, balanceKey, atKey, exclude) => {
    const type = LEAVE_TYPES.find((t) => t.balanceKey === balanceKey);
    const acc = people[key].account;
    return leaveBalance({
      opening: acc[OPENING_FIELDS[balanceKey]], accrualPerYear: type.accrualDaysNum, fte: acc.fteNum, since: people[key].balanceDay, at: atKey, exclude,
      requests: leaves.filter((l) => l.who === key && l.type.balanceKey === balanceKey).map((l) => ({ documentId: l.id, days: l.days, status: l.status, first: l.first })),
    });
  };
  const overlapsOwn = (key, first, last) => leaves.some((l) => l.who === key && live(l) && l.first <= last && first <= l.last);
  // First come, first served: approved leave, and requests asked for before this one.
  const teamBreaches = (key, first, last, count, half = {}, askedAt = Infinity) =>
    staffingBreaches({
      dates: count.dates, first, last, halfFirst: half.first, halfLast: half.last, employeeId: key, teamSize: teamSize(people[key].team), min: TEAMS.find((t) => t.key === people[key].team).min,
      others: leaves
        .filter((l) => people[l.who].team === people[key].team && (l.status === 'Approved' || (l.status === 'Pending' && l.createdAt < askedAt)))
        .map((l) => ({ employeeId: l.who, first: l.first, last: l.last, halfFirst: l.halfFirst, halfLast: l.halfLast })),
    });
  const blocked = []; // story ranges by team: ordinary leave stays clear of them
  const addLeave = (plan) => {
    const type = LEAVE_TYPES.find((t) => t.name === plan.type);
    const count = workingDays({ first: plan.first, last: plan.last, holidays: HOLIDAYS, halfFirst: plan.halfFirst, halfLast: plan.halfLast });
    const id = hrId('leave', `${plan.who}:${plan.first}:${plan.type}`);
    const breaches = teamBreaches(plan.who, plan.first, plan.last, count, { first: plan.halfFirst, last: plan.halfLast }, plan.createdAt);
    const entry = { ...plan, id, type, days: count.days, count, breaches, balanceAtStart: type.balanceKey ? balanceFor(plan.who, type.balanceKey, plan.first, id).available : null };
    leaves.push(entry);
    return entry;
  };

  // The story first, so ordinary leave can keep clear of it.
  for (const s of STORY_LEAVE) {
    const base = s.day === 'today' ? nextWorkDay(today) : s.day === 'today-1' ? (isWorkDay(keyAdd(today, -1)) ? keyAdd(today, -1) : nextWorkDay(today)) : keyAdd(monday, s.week * 7 + s.day);
    const first = nextWorkDay(base);
    const last = lastOfWorkDays(first, s.days);
    const createdAt = Math.min(NOW - HOUR, NOW - s.asked * DAY);
    addLeave({ who: s.who, type: s.type, first, last, status: s.status, story: s, createdAt, reason: s.note });
    blocked.push({ team: people[s.who].team, first: keyAdd(first, -3), last: keyAdd(last, 3) });
  }
  // Ordinary leave: a year of approved leave behind everyone, and some booked ahead.
  for (const p of PEOPLE) {
    const person = people[p.key];
    if (person.isNew) continue;
    const from = person.started > keyAdd(today, -330) ? person.started : keyAdd(today, -330);
    const span = Math.round((keyTime(today) - keyTime(from)) / DAY);
    const tries = [
      ...Array.from({ length: rand.int(2, 3) }, () => ({ type: 'Annual leave', offset: rand.int(10, Math.max(11, span - 5)), days: rand.pick([2, 3, 4, 5, 5, 8, 10]) })),
      ...Array.from({ length: rand.int(0, 2) }, () => ({ type: "Personal/carer's leave", offset: rand.int(5, Math.max(6, span - 2)), days: rand.pick([1, 1, 2]) })),
      ...(rand.chance(0.45) ? [{ type: 'Annual leave', offset: -rand.int(16, 75), days: rand.pick([3, 5, 5, 10]) }] : []),
    ];
    for (const t of tries) {
      const first = nextWorkDay(keyAdd(today, -t.offset));
      const last = lastOfWorkDays(first, t.days);
      if (first <= person.started) continue;
      if (last >= today && first <= today) continue;
      if (overlapsOwn(p.key, first, last)) continue;
      if (blocked.some((b) => b.team === p.team && b.first <= last && first <= b.last)) continue;
      const count = workingDays({ first, last, holidays: HOLIDAYS });
      const type = LEAVE_TYPES.find((x) => x.name === t.type);
      if (balanceFor(p.key, type.balanceKey, first).available < count.days) continue;
      if (first > today && teamBreaches(p.key, first, last, count).length) continue;
      const createdAt = Math.min(NOW - 3 * HOUR, instant(first, 10) - rand.int(10, 45) * DAY);
      addLeave({ who: p.key, type: t.type, first, last, status: 'Approved', createdAt });
    }
  }

  // Number by when they were asked for, then write each as the rules would have left it.
  leaves.sort((a, b) => a.createdAt - b.createdAt);
  let leaveCount = 0;
  for (const l of leaves) {
    const person = people[l.who];
    const ref = `${COUNTERS.leave.prefix}-${++leaveCount}`;
    const manager = person.account.managerRel?.[0] ? author(PEOPLE.find((p) => people[p.key].documentId === person.account.managerRel[0].documentId).key) : null;
    const managerKey = PEOPLE.find((p) => p.key === l.who).manager;
    const skipKey = managerKey ? PEOPLE.find((p) => p.key === managerKey).manager : null;
    const team = TEAMS.find((t) => t.key === person.team);
    const steps = leaveApprovalSteps({
      employee: author(l.who), manager, skipLevel: skipKey ? author(skipKey) : null, hr: hrPeople, breaches: l.breaches,
      teamName: team.name, teamSize: teamSize(person.team), min: team.min, needsHr: !!l.type.needsHrBool, typeName: l.type.name,
    });
    const s = l.story;
    const decisions = s ? s.approvals : steps.map((step) => step.id);
    const keyOf = (p) => PEOPLE.find((x) => people[x.key].documentId === p.documentId).key;
    const notes = [];
    const told = [];
    const tellPeople = (list) => list.forEach((p) => !told.some((t) => t.documentId === p.documentId) && told.push({ documentId: p.documentId, name: p.name }));
    let time = l.createdAt;
    const typeText = l.type.name.toLowerCase();
    const what = `${l.days} ${l.days === 1 ? 'day' : 'days'} of ${typeText}, ${l.first === l.last ? leavePeriodText(l.first, l.last) : leavePeriodText(l.first, l.last)}`;
    tellPeople(steps[0].approvers);
    notes.push(note(l.who, time, `Requested ${what}. Waiting for ${steps[0].approvers.map((p) => p.name).join(' or ')} (${steps[0].label}). Told ${steps[0].approvers.map((p) => p.name).join(', ')}.`));
    const chainSteps = steps.map((step, i) => {
      const made = decisions.find((d) => d.split(':')[0] === step.id);
      const delegate = s?.delegateTo && i === 0 ? author(s.delegateTo) : null;
      if (delegate) notes.push(note(keyOf(step.approvers[0]), time + 2 * HOUR, `${step.approvers[0].name} handed the ${step.label} step to ${delegate.name}.`));
      if (!made) return { ...step, decision: '', decidedBy: null, decidedAt: null, comment: '', delegate, delegatedBy: delegate ? step.approvers[0] : null, delegatedAt: delegate ? iso(time + 2 * HOUR) : null };
      time = Math.min(NOW - HOUR, time + rand.int(3, 30) * HOUR);
      const decision = made.endsWith(':rejected') ? 'rejected' : 'approved';
      const by = step.approvers[0];
      const comment = decision === 'rejected' ? s.comment : rand.chance(0.25) ? rand.pick(['Enjoy!', 'Approved, have a good break.', 'No problem.', 'Covered by the roster.']) : '';
      notes.push(note(keyOf(by), time, `**${decision === 'approved' ? 'Approved' : 'Rejected'}** by ${by.name} (${step.label})${comment ? `: ${comment}` : '.'}`));
      const next = steps[i + 1];
      if (decision === 'approved' && next) {
        tellPeople(next.approvers);
        notes.push(note(keyOf(by), time + 60_000, `Now waiting for ${next.approvers.map((p) => p.name).join(' or ')} (${next.label})${next.reason ? `: ${next.reason}` : '.'} Told ${next.approvers.map((p) => p.name).join(', ')}.`));
      }
      return { ...step, decision, decidedBy: by, decidedAt: iso(time), comment, delegate: null, delegatedBy: null, delegatedAt: null };
    });
    const chain = { steps: chainSteps };
    const state = approvalStatus(chain);
    const status = l.status;
    if (status === 'Approved' || status === 'Rejected') {
      tellPeople([author(l.who)]);
      notes.push(note(keyOf(chainSteps.filter((x) => x.decision).at(-1).decidedBy), time + 60_000, `**${status}**: ${what}. ${people[l.who].name} has been told.`));
    }
    if (status === 'Cancelled') notes.push(note(l.who, time + 2 * DAY, `**Cancelled** by ${people[l.who].name}: the concert was cancelled.`));
    if (s?.delegateTo) tellPeople([author(s.delegateTo)]);
    const waiting = status === 'Pending' ? state.waitingOn : [];
    set.add({
      documentId: l.id,
      systemHeader: header({ systemType: 'document', templateId: T.leave, summaryName: `${ref}: ${people[l.who].name}, ${l.type.name}`, at: new Date(l.createdAt), by: people[l.who].documentId }),
      appTags: ['hr', 'leave'],
      leaveRef: ref,
      leaveStatusRel: [statuses.leaveStatus[status]],
      lastStatus: status,
      transition: null,
      employeeRel: [personValue(l.who)],
      leaveTypeRel: [values.leaveType[l.type.name]],
      startDate: dayStart(l.first, TIME_ZONE),
      endDate: dayStart(l.last, TIME_ZONE),
      startHalfBool: !!l.halfFirst,
      endHalfBool: !!l.halfLast,
      daysNum: l.days,
      calendarDaysNum: l.count.calendarDays,
      firstDay: l.first,
      lastDay: l.last,
      periodText: leavePeriodText(l.first, l.last, l.halfFirst, l.halfLast),
      reason: l.reason ?? '',
      evidenceArr: [],
      ...(l.balanceAtStart !== null ? { balanceAtStartNum: l.balanceAtStart, availableDaysNum: l.balanceAtStart } : {}),
      teamRel: person.account.teamRel,
      managerRel: person.account.managerRel ?? [],
      approvalChain: chain,
      approvalState: state.state,
      nextApproverIds: waiting.map((p) => p.documentId),
      nextApproverRel: waiting.map((p) => ({ documentId: p.documentId, name: p.name })),
      staffingBreachBool: l.breaches.length > 0,
      staffingNote: l.breaches.length ? chainSteps.find((x) => x.id === 'second')?.reason ?? '' : '',
      notifiedRel: told,
      notesCommentsArr: notes,
      ...(status === 'Approved' || status === 'Rejected' ? { decidedDate: iso(time) } : {}),
      ...(status === 'Cancelled' ? { cancelReason: 'The concert was cancelled.' } : {}),
      createdDate: iso(l.createdAt),
      createdByRel: [author(l.who)],
      updatedDate: iso(time),
      updatedByRel: [author(l.who)],
    });
    l.ref = ref;
  }
  // Everyone's balances today, as the leave PostSave rule keeps them.
  for (const p of PEOPLE) {
    const acc = people[p.key].account;
    acc.leaveBalances = {};
    for (const key of Object.keys(OPENING_FIELDS)) {
      const b = balanceFor(p.key, key, today);
      acc.leaveBalances[key] = b;
      acc[`${key}AvailableNum`] = b.available;
    }
  }

  // ------------------------------------------------------------------------------ certificates
  const certTypeByName = Object.fromEntries(CERT_TYPES.map(([name, , months]) => [name, months]));
  /** Story certificates: [person, type, days until expiry (negative: expired)]; null: not held. */
  const STORY_CERTS = [
    ['jack', 'CPR (HLTAID009)', 12],
    ['mateo', "Driver's licence", 25],
    ['ryan', 'First aid (HLTAID011)', -9],
    ['lucy', 'Infection control', -20],
    ['oliver', 'AHPRA registration', 5],
    ['sofia', 'First aid (HLTAID011)', null],
    ['chloe', 'Medication administration', null],
    ['noah', 'CPR (HLTAID009)', null],
    ['noah', 'First aid (HLTAID011)', null],
    ['noah', 'Infection control', null],
    ['noah', 'Medication administration', null],
    ['noah', 'Working with Children Check', null],
  ];
  const extras = { amara: ['Fire warden'], grace: ['Manual handling'], tom: ['First aid (HLTAID011)'], kate: ['Fire warden'], sarah: ['Fire warden'] };
  const certs = [];
  let certCount = 0;
  const certPlans = [];
  for (const p of PEOPLE) {
    const position = POSITIONS.find((x) => x.name === p.position);
    for (const typeName of [...position.certs, ...(extras[p.key] ?? [])]) {
      const story = STORY_CERTS.find(([who, t]) => who === p.key && t === typeName);
      if (story && story[2] === null) continue;
      const months = certTypeByName[typeName];
      let expiry;
      if (story) expiry = NOW + story[2] * DAY + 6 * HOUR;
      else if (months) expiry = NOW + rand.int(40, Math.max(60, months * 30 - 20)) * DAY;
      const issued = Math.min(months ? monthsBefore(expiry, months) : NOW - rand.int(200, 2000) * DAY, NOW - DAY);
      certPlans.push({ who: p.key, typeName, issued, expiry: months ? Date.parse(expiryFromIssue(new Date(issued), months)) : null, story: !!story });
      // A renewal now and then: the certificate before it, superseded.
      if (months && !story && rand.chance(0.18)) certPlans.push({ who: p.key, typeName, issued: monthsBefore(issued, months), expiry: issued + 2 * DAY, superseded: true });
    }
  }
  certPlans.sort((a, b) => a.issued - b.issued);
  const toldByCheck = new Map();
  for (const c of certPlans) {
    const person = people[c.who];
    const ref = `${COUNTERS.certificate.prefix}-${++certCount}`;
    const s = certState(c.expiry ? iso(c.expiry) : '', NOW, EXPIRY_WARN_DAYS);
    const label = { valid: 'Valid', expiring: 'Expiring', expired: 'Expired', none: 'No expiry' }[s.state];
    const flagged = !c.superseded && (s.state === 'expiring' || s.state === 'expired');
    const manager = person.account.managerRel?.[0];
    const told = flagged ? [author(c.who), ...(manager ? [{ documentId: manager.documentId, name: manager.name }] : [])] : [];
    if (flagged) told.forEach((p) => toldByCheck.set(p.documentId, p.name));
    const id = hrId('certificate', `${c.who}:${c.typeName}:${c.issued}`);
    const createdAt = Math.min(c.issued + rand.int(1, 9) * DAY, NOW - 2 * DAY);
    set.add({
      documentId: id,
      systemHeader: header({ systemType: 'document', templateId: T.certificate, summaryName: `${ref}: ${person.name}, ${c.typeName}`, at: new Date(createdAt), by: person.documentId }),
      appTags: ['hr', 'certificate'],
      certificateRef: ref,
      personRel: [personValue(c.who)],
      certTypeRel: [values.certType[c.typeName]],
      certNumber: `${c.typeName.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X')}${rand.int(100000, 999999)}`,
      issuedDate: iso(c.issued),
      ...(c.expiry ? { expiryDate: iso(c.expiry) } : {}),
      certState: c.superseded ? 'Expired' : label,
      certStateRel: [statuses.certState[c.superseded ? 'Expired' : label]],
      daysLeftNum: s.daysLeft,
      teamRel: person.account.teamRel,
      managerRel: person.account.managerRel ?? [],
      supersededBool: !!c.superseded,
      expiryNotifiedBool: flagged,
      notifiedRel: told,
      evidenceArr: [],
      notesCommentsArr: flagged
        ? [note('nadia', NOW - DAY + 2 * HOUR, `**${c.typeName} ${s.state === 'expired' ? 'expired' : 'expires'} ${leavePeriodText(dayKey(c.expiry, TIME_ZONE), dayKey(c.expiry, TIME_ZONE))}**. Told ${told.map((p) => p.name).join(' and ')} (expiry check ${COUNTERS.expiryCheck.prefix}-1).`)]
        : [],
      createdDate: iso(createdAt),
      createdByRel: [author(c.who)],
      updatedDate: iso(flagged ? NOW - DAY + 2 * HOUR : createdAt),
      updatedByRel: [author(flagged ? 'nadia' : c.who)],
    });
    certs.push({ ...c, id, state: s.state });
  }
  const flaggedCount = certs.filter((c) => !c.superseded && (c.state === 'expiring' || c.state === 'expired')).length;
  set.add({
    documentId: hrId('expiryCheck', 'yesterday'),
    systemHeader: header({ systemType: 'document', templateId: T.expiryCheck, summaryName: `${COUNTERS.expiryCheck.prefix}-1: certificate expiry check`, at: new Date(NOW - DAY), by: adminId }),
    appTags: ['hr', 'expiryCheck'],
    expiryCheckRef: `${COUNTERS.expiryCheck.prefix}-1`,
    runDate: iso(NOW - DAY + 2 * HOUR),
    warnDaysNum: EXPIRY_WARN_DAYS,
    doneBool: true,
    expiredNum: certs.filter((c) => !c.superseded && c.state === 'expired').length,
    expiringNum: certs.filter((c) => !c.superseded && c.state === 'expiring').length,
    notifiedNum: flaggedCount,
    updatedNum: flaggedCount,
    toldRel: [...toldByCheck].map(([documentId, name]) => ({ documentId, name })),
    summary: `Flagged ${flaggedCount} certificates and told ${toldByCheck.size} people (${[...toldByCheck.values()].join(', ')}).`,
    createdDate: iso(NOW - DAY),
    createdByRel: [author('nadia')],
  });

  // ------------------------------------------------------------------------------- onboarding
  const ONBOARDING = [
    { who: 'chloe', status: 'In progress', done: (item) => item.question !== 'Medication competency assessed' && !item.question.startsWith('One-month') && !item.question.startsWith('Probation'), buddy: 'mei' },
    { who: 'noah', status: 'In progress', done: (item) => item.category === 'Before day one' && !item.question.startsWith('ID badge'), buddy: 'oliver' },
    { who: 'liam', status: 'Completed', done: () => true, buddy: 'sofia' },
    { who: 'mateo', status: 'Completed', done: () => true, buddy: 'amara' },
  ];
  let onbCount = 0;
  const onboardings = [];
  for (const o of ONBOARDING) {
    const person = people[o.who];
    const position = POSITIONS.find((x) => x.name === PEOPLE.find((p) => p.key === o.who).position);
    const plan = plans[position.plan];
    const tasks = plan.checkItems.map((item) => ({ ...item, result: o.done(item) ? 'pass' : '', comment: '' }));
    const outcome = checklistOutcome(tasks, { commentOnFail: true, failLabel: 'Blocked' });
    const held = certs.filter((c) => c.who === o.who && !c.superseded).map((c) => ({ typeId: values.certType[c.typeName].documentId, expiryDate: c.expiry ? iso(c.expiry) : '' }));
    const missing = missingCertificates(positionValue[position.name].requiredCertsRel, held, NOW);
    const ref = `${COUNTERS.onboarding.prefix}-${++onbCount}`;
    const createdAt = Math.min(keyTime(person.started) - 14 * DAY, NOW - 3 * DAY);
    const completedAt = o.status === 'Completed' ? Math.min(keyTime(person.started) + 45 * DAY, NOW - 10 * DAY) : null;
    const managerKey = PEOPLE.find((p) => p.key === o.who).manager;
    set.add({
      documentId: hrId('onboarding', o.who),
      systemHeader: header({ systemType: 'document', templateId: T.onboarding, summaryName: `${ref}: ${person.name}`, at: new Date(createdAt), by: adminId }),
      appTags: ['hr', 'onboarding'],
      onboardingRef: ref,
      onboardingStatusRel: [statuses.onboardingStatus[o.status]],
      lastStatus: o.status,
      transition: null,
      personRel: [personValue(o.who)],
      positionRel: [positionValue[position.name]],
      managerRel: [related(people[managerKey].account, PERSON_FIELDS)],
      buddyRel: [related(people[o.buddy].account, PERSON_FIELDS)],
      startDate: dayStart(person.started, TIME_ZONE),
      probationReviewDate: expiryFromIssue(dayStart(person.started, TIME_ZONE), 3),
      tasks,
      tasksTotalNum: outcome.total,
      tasksDoneNum: outcome.passed + outcome.na,
      tasksBlockedNum: outcome.failed,
      progressNum: outcome.total ? Math.round(((outcome.passed + outcome.na) / outcome.total) * 100) : 0,
      missingCerts: missing,
      missingCertsNum: missing.length,
      missingCertsText: missing.join(', '),
      teamRel: person.account.teamRel,
      ...(completedAt ? { completedDate: iso(completedAt), completedByRel: [author(managerKey)] } : {}),
      notesCommentsArr: [
        note('tom', createdAt, `Onboarding set up for ${person.name}, starting ${leavePeriodText(person.started, person.started)}. Buddy: ${people[o.buddy].name}.`),
        ...(missing.length && o.status !== 'Completed' ? [note('tom', NOW - 2 * DAY, `Still needs ${missing.join(', ')} before onboarding can be completed.`)] : []),
        ...(completedAt ? [note(managerKey, completedAt, `**Onboarding complete** for ${person.name}: every required task done and every required certificate held.`)] : []),
      ],
      createdDate: iso(createdAt),
      createdByRel: [author('tom')],
    });
    person.account.onboardingStatus = o.status;
    person.account.onboardingProgressNum = outcome.total ? Math.round(((outcome.passed + outcome.na) / outcome.total) * 100) : 0;
    if (completedAt) person.account.onboardedDate = iso(completedAt);
    onboardings.push({ ...o, missing, outcome });
  }

  // ------------------------------------------------------------------------------- counters
  const counts = { leave: leaveCount, certificate: certCount, onboarding: onbCount, expiryCheck: 1 };
  for (const [key, c] of Object.entries(COUNTERS)) {
    set.add({ documentId: c.id, systemHeader: header({ systemType: 'document', templateId: T.counter, summaryName: `${c.prefix} counter`, at: seededAt, by: adminId }), [c.field]: counts[key] ?? 0 });
  }

  // ------------------------------------------------------------------------ templates and rules
  const components = templateComponents({ statuses, values });
  const ref = (key, name) => [{ documentId: RULESETS[key], name }];
  const client = (key, name) => ({ preRenderClientRuleRel: ref(key, name), onLoadClientRuleRel: ref(key, name), onFieldChangeClientRuleRel: ref(key, name), preSaveClientRuleRel: ref(key, name) });
  const template = (id, name, extra = {}) => set.template({ id, name, components: components[id], ...extra });
  const page = (id, name) => template(id, name, { hideCommandBar: true });
  page(T.overview, 'People overview');
  page(T.myHr, 'My HR');
  page(T.myTeam, 'My team');
  page(T.calendar, 'Leave calendar');
  page(T.leaveRegister, 'Leave register');
  page(T.matrix, 'Skills matrix');
  page(T.certificates, 'Certificates');
  page(T.orgChart, 'Org chart');
  page(T.onboardingList, 'Onboarding');
  page(T.directory, 'People');
  template(T.leave, 'Leave request', {
    appTags: ['hr', 'leave'], summaryNameRule: '{{{leaveRef}}}: {{{employeeRel.0.name}}}, {{{leaveTypeRel.0.name}}}',
    ...client('leaveClient', 'HR Leave - Client'), preSaveServerRuleRel: ref('leaveServer', 'HR Leave - PreSaveServer'), postSaveServerRuleRel: ref('leavePost', 'HR Leave - PostSave'),
  });
  template(T.certificate, 'Certificate', {
    appTags: ['hr', 'certificate'], summaryNameRule: '{{{certificateRef}}}: {{{personRel.0.name}}}, {{{certTypeRel.0.name}}}',
    ...client('certClient', 'HR Certificate - Client'), preSaveServerRuleRel: ref('certServer', 'HR Certificate - PreSaveServer'),
  });
  template(T.onboarding, 'Onboarding', {
    appTags: ['hr', 'onboarding'], summaryNameRule: '{{{onboardingRef}}}: {{{personRel.0.name}}}',
    ...client('onboardingClient', 'HR Onboarding - Client'), preSaveServerRuleRel: ref('onboardingServer', 'HR Onboarding - PreSaveServer'), postSaveServerRuleRel: ref('onboardingPost', 'HR Onboarding - PostSave'),
  });
  template(T.expiryCheck, 'Certificate expiry check', {
    appTags: ['hr', 'expiryCheck'], summaryNameRule: '{{{expiryCheckRef}}}: certificate expiry check',
    preSaveServerRuleRel: ref('expiryServer', 'HR Expiry Check - PreSaveServer'), postSaveServerRuleRel: ref('expiryPost', 'HR Expiry Check - PostSave'),
  });
  template(T.team, 'Team', { appTags: ['hr', 'team'], summaryNameRule: '{{{nameId}}}' });
  template(T.position, 'Position', { appTags: ['hr', 'position'], summaryNameRule: '{{{nameId}}}' });
  template(T.plan, 'Onboarding checklist', { appTags: ['hr', 'plan'], summaryNameRule: '{{{nameId}}}' });
  template(T.counter, 'Counter', { summaryNameRule: 'Counter' });
  for (const [kind, names] of Object.entries(LOOKUPS)) template(T[`lookup_${kind}`], names.name, { appTags: ['hr', kind], summaryNameRule: '{{{nameId}}}' });

  const linked = (templateId, name, events) => [{ documentId: templateId, name, eventNames: events }];
  const CLIENT_EVENTS = 'preRenderClient | onLoadClient | onFieldChangeClient | preSaveClient';
  const rs = (key, name, dsl, templateId, templateName, events) => set.ruleset({ id: RULESETS[key], name, dsl, group: 'hr', linked: linked(templateId, templateName, events) });
  const certStates = statuses.certState;
  rs('leaveClient', 'HR Leave - Client', rules.leaveClientRules({ statuses, values }), T.leave, 'Leave request', CLIENT_EVENTS);
  rs('leaveServer', 'HR Leave - PreSaveServer', rules.leaveServerRules({ statuses, leaveTypes: leaveTypeById }), T.leave, 'Leave request', 'preSaveServer');
  rs('leavePost', 'HR Leave - PostSave', rules.leavePostRules({ leaveTypes: leaveTypeById }), T.leave, 'Leave request', 'postSaveServer');
  rs('certClient', 'HR Certificate - Client', rules.certClientRules(), T.certificate, 'Certificate', CLIENT_EVENTS);
  rs('certServer', 'HR Certificate - PreSaveServer', rules.certServerRules({ certStates }), T.certificate, 'Certificate', 'preSaveServer');
  rs('onboardingClient', 'HR Onboarding - Client', rules.onboardingClientRules({ statuses }), T.onboarding, 'Onboarding', CLIENT_EVENTS);
  rs('onboardingServer', 'HR Onboarding - PreSaveServer', rules.onboardingServerRules(), T.onboarding, 'Onboarding', 'preSaveServer');
  rs('onboardingPost', 'HR Onboarding - PostSave', rules.onboardingPostRules(), T.onboarding, 'Onboarding', 'postSaveServer');
  rs('expiryServer', 'HR Expiry Check - PreSaveServer', rules.expiryServerRules(), T.expiryCheck, 'Certificate expiry check', 'preSaveServer');
  rs('expiryPost', 'HR Expiry Check - PostSave', rules.expiryPostRules({ certStates }), T.expiryCheck, 'Certificate expiry check', 'postSaveServer');

  // ---------------------------------------------------------------------- platform documents
  if (platform) set.platformDocuments(componentRepos(appRoot));
  // The employee's details on the account form (this database's copy of the platform template).
  const accountTemplate = set.documents.find((d) => d.documentId === SYSTEM.account);
  if (accountTemplate?.components) accountTemplate.components.splice(1, 0, ...accountComponents({ statuses, values }));
  set.configuration({ defaultTemplate: T.overview, urlRoot });

  return {
    documents: set.finish(),
    password: DEMO_PASSWORD,
    people: PEOPLE.map((p) => ({ name: people[p.key].name, email: people[p.key].email, role: `${p.type}, ${TEAMS.find((t) => t.key === p.team).name}` })),
    urls: {
      overview: `/form/${T.overview}`,
      myHr: `/form/${T.myHr}`,
      myTeam: `/form/${T.myTeam}`,
      calendar: `/form/${T.calendar}`,
      matrix: `/form/${T.matrix}`,
      orgChart: `/form/${T.orgChart}`,
      newLeave: `/form/${T.leave}`,
    },
    stats: { people: PEOPLE.length, leave: leaves.length, certificates: certs.length, onboarding: onboardings.length, company: COMPANY.length > 0 ? 1 : 0 },
    // For tests: what the seed knows.
    seedFacts: { people, leaves, certs, onboardings, statuses, values, today, monday, fyStart, hrPeople },
  };
}
