// Assembles every document of the safety demo database: lookups, check sheets, people, sites, a year
// of incidents, the hazard register, corrective actions, workplace inspections, the templates and
// rulesets, and the platform documents.
//
// Data is generated around "now" with a seeded random generator, so every seed tells the same story
// relative to the day it runs: a near miss reported this morning waiting for triage, an ammonia leak
// the regulator hasn't been told about yet, a scaffold fall (the last lost time injury, 9 days ago)
// under investigation, actions overdue, and a warehouse inspection a few days late. Derived values
// (ratings, injury classes, notifiable flags, due dates, action counts, inspection results) come
// from the same functions the rulesets use, so seeded records look exactly as if they had been saved.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentRepos, DocumentSet, header, menuGroup, menuItem, related, SYSTEM } from '@solidjs-components/platform/documents';
import { LOOKUP_FIELDS, PERSON_FIELDS, q } from '@solidjs-components/platform/form-parts';
import { appDocuments, boxRing, companyClock, iso, pointGeo, polygonGeo, random, slug } from '@solidjs-components/platform/seed-kit';
import { checklistOutcome } from '../../../solidjs-components-shared/packages/kit/src/domain/checklist.ts';
import { actionDueDate, actionsSummary, CONTROL_LEVELS } from '../../packages/whs-kit/src/logic/actions.ts';
import { nextReviewDate } from '../../packages/whs-kit/src/logic/hazard.ts';
import { injuryClass, notifiable, reportingDelayHours } from '../../packages/whs-kit/src/logic/incident.ts';
import { RATINGS, riskRating, riskResponse } from '../../packages/whs-kit/src/logic/risk.ts';
import { pinAt } from './body.mjs';
import {
  BACKGROUND_COUNT, CAUSE_CATEGORIES, CHECK_CATEGORY_HAZARD, CHECK_SHEETS, DANGEROUS_KINDS, HAZARD_CATEGORIES, HAZARDS, INCIDENT_SCENARIOS, INCIDENT_TYPES,
  INJURY_NATURES, MECHANISMS, PEOPLE, PERSON_TYPES, RISK_RATINGS, SITES, STATUSES, STORY_INCIDENTS, TREATMENTS,
} from './catalog.mjs';
import { COMPANY, COUNTERS, DEMO_PASSWORD, KEYS, LATE_REPORT_HOURS, LOOKUPS, ROLES, RULESETS, SITE_VALUE_FIELDS, T, TIME_ZONE, whsId } from './model.mjs';
import * as rules from './rules.mjs';
import { HOME_BY_TYPE, menuFor, templateComponents } from './templates.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const LEVELS = ['', 'Low', 'Medium', 'High', 'Extreme'];
const INVESTIGATION_TEXT = {
  none: "None: the supervisor's review is enough",
  supervisor: "A supervisor's review, with findings",
  full: 'A full investigation, with root causes',
};
const CONTRACTORS = ['Sam Okoye (Apex Formwork)', 'Leo Brennan (Metro Scaffolding)', 'Nina Kovac (Coastline Labour Hire)', 'Raj Singh (Western Civil)', 'Will Harper (Coastline Labour Hire)'];

/**
 * Builds the safety demo documents.
 * @param {{ now?: Date, urlRoot?: string, platform?: boolean }} [options] - `platform: false` leaves out the platform and
 *   component documents (unit tests: they need built bundles)
 * @returns {{ documents: Record<string, any>[], people: { name: string, email: string, role: string }[], urls: Record<string, string>, password: string, stats: Record<string, number> }}
 */
export function buildDemo({ now = new Date(), urlRoot = 'http://localhost:3002', platform = true } = {}) {
  const NOW = now.getTime();
  const rand = random(20261105);
  const { at } = companyClock({ now: NOW, timeZone: TIME_ZONE });
  /** `days` ago (fractions are hours), as ms. */
  const ago = (days) => NOW - days * DAY;

  const seededAt = new Date(at(-420, 8));
  const adminId = whsId('account', 'priya');
  const set = new DocumentSet({ at: seededAt, by: adminId });
  const { doc, statusValues, lookupValues } = appDocuments({ set, app: 'whs', idOf: whsId, at: seededAt, by: adminId });

  // ---------------------------------------------------------------------------------- lookups
  const statuses = {};
  for (const [kind, list] of Object.entries(STATUSES)) statuses[kind] = statusValues(kind, T[`lookup_${kind}`], list);
  const values = {};
  const lookupList = (kind, names, extra, relatedFields) => (values[kind] = lookupValues(kind, T[`lookup_${kind}`], names, extra, relatedFields));
  lookupList('riskRating', RISK_RATINGS.map((r) => r.name), (name) => ({ color: RISK_RATINGS.find((r) => r.name === name).color }), { color: 'color', indexNum: 'indexNum' });
  lookupList('incidentType', INCIDENT_TYPES);
  lookupList('injuryNature', INJURY_NATURES.map((n) => n.name), (name) => ({ seriousBool: INJURY_NATURES.find((n) => n.name === name).serious }), { indexNum: 'indexNum', seriousBool: 'seriousBool' });
  lookupList('mechanism', MECHANISMS);
  lookupList('treatment', TREATMENTS);
  lookupList('dangerousKind', DANGEROUS_KINDS);
  lookupList('personType', PERSON_TYPES);
  lookupList('hazardCategory', HAZARD_CATEGORIES);
  lookupList('controlLevel', CONTROL_LEVELS.map((l) => l.name), (name) => {
    const level = CONTROL_LEVELS.find((l) => l.name === name);
    return { rank: level.rank, description: level.hint };
  }, { rank: 'rank', indexNum: 'indexNum' });
  lookupList('causeCategory', CAUSE_CATEGORIES);
  const ratingValues = values.riskRating;

  // ---------------------------------------------------------------------------- check sheets
  const sheets = {};
  const sheetValue = {};
  Object.entries(CHECK_SHEETS).forEach(([key, sheet], i) => {
    sheets[key] = doc('checkSheet', T.checkSheet, sheet.name, {
      nameId: sheet.name, indexNum: (i + 1) * 10, inactiveBool: false,
      checkItems: sheet.items.map(([question, category, mandatory]) => ({ key: slug(question).slice(0, 40), question, category, ...(mandatory ? { mandatory: true } : {}) })),
    });
    sheetValue[key] = related(sheets[key], LOOKUP_FIELDS);
  });

  // ---------------------------------------------------------------------------------- people
  const people = {};
  const personValue = (key) => ({ documentId: people[key].documentId, name: people[key].name, email: people[key].email, accountType: people[key].type });
  const authorValue = (key) => ({ documentId: people[key].documentId, name: people[key].name });
  for (const p of PEOPLE) {
    const email = `${p.first}.${p.last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com';
    const account = set.account({
      id: whsId('account', p.key),
      securityId: whsId('accountSecurity', p.key),
      controlId: whsId('accountControl', p.key),
      first: p.first,
      last: p.last,
      email,
      title: p.title,
      password: DEMO_PASSWORD,
      adminKey: KEYS.admin,
      accessKeys: ROLES[p.type].map((k) => KEYS[k]),
      fields: {
        accountType: p.type,
        phone: `04${rand.int(10, 99)} ${rand.int(100, 999)} ${rand.int(100, 999)}`,
        defaultURL: HOME_BY_TYPE[p.type],
        menu: menuFor(p.type, { menuItem, menuGroup }),
      },
    });
    people[p.key] = { ...p, name: `${p.first} ${p.last}`, email, documentId: account.documentId, account };
  }
  const executives = PEOPLE.filter((p) => p.type === 'Executive').map((p) => authorValue(p.key));

  // ----------------------------------------------------------------------------------- sites
  const sites = {};
  const siteValue = {};
  SITES.forEach((s, i) => {
    sites[s.key] = doc('site', T.site, s.name, {
      nameId: s.name, code: s.code, siteType: s.type, indexNum: (i + 1) * 10, inactiveBool: false,
      addressGeo: pointGeo(s.at, { suburb: s.suburb, postcode: s.postcode, state: 'NSW', label: `${s.suburb} NSW ${s.postcode}` }),
      boundaryGeo: polygonGeo(boxRing(s.at, 0.0022, 0.0014)),
      siteManagerRel: [personValue(s.manager)], supervisorRel: [personValue(s.supervisor)], whsAdvisorRel: [personValue(s.advisor)],
      headcountNum: s.headcount, hoursPerMonthNum: s.hoursPerMonth, inspectionWeeksNum: s.inspectionWeeks, checkSheetRel: [sheetValue[s.sheet]],
    });
    siteValue[s.key] = related(sites[s.key], SITE_VALUE_FIELDS);
  });
  // Each person's site, as records store it: new reports default to it, and its people are who hear about them.
  for (const p of PEOPLE) people[p.key].account.siteRel = [siteValue[p.site]];
  const siteOf = (key) => SITES.find((s) => s.key === key);
  const near = ([lon, lat], spread = 0.0028) => [Math.round((lon + (rand.next() - 0.5) * spread) * 1e6) / 1e6, Math.round((lat + (rand.next() - 0.5) * spread * 0.6) * 1e6) / 1e6];
  const workersAt = (site) => PEOPLE.filter((p) => p.site === site && p.type === 'Worker').map((p) => p.key);
  const counterFor = {};
  const nextRef = (kind) => `${COUNTERS[kind].prefix}-${(counterFor[kind] = (counterFor[kind] ?? 0) + 1)}`;
  const noteId = () => `note-${rand.int(1e6, 9e6).toString(36)}${rand.int(1e6, 9e6).toString(36)}`;
  const note = (by, at, detail) => ({ dataId: noteId(), detail, createdBy: authorValue(by), createdDate: iso(at), comments: [], votes: [] });
  const authorship = (by, created, updated = created, updatedBy = by) => ({
    createdDate: iso(created), createdByRel: [authorValue(by)], updatedDate: iso(updated), updatedByRel: [authorValue(updatedBy)],
  });
  const rated = (l, c) => {
    const r = riskRating(l, c);
    return { likelihood: l, consequence: c, score: r.score, rating: r.rating };
  };

  // ------------------------------------------------------------------------------ incidents
  // Plan every incident first (stories and a year of background), then number them by date.
  const scenario = (key) => INCIDENT_SCENARIOS.find((s) => s.key === key);
  const plans = [];
  for (const story of STORY_INCIDENTS) plans.push({ ...story, s: scenario(story.scenario), occurred: ago(story.days) });
  const notifiableScenario = (s) => s.type === 'Dangerous incident' || ['Hospitalised (in-patient)', 'Fatality'].includes(s.treatment) || (s.natures ?? []).some((n) => INJURY_NATURES.find((x) => x.name === n)?.serious);
  const lostTime = (s) => injuryClass(s.treatment)?.lostTime;
  for (let i = 0; i < BACKGROUND_COUNT; i++) {
    const days = 35 + Math.round(rand.next() * 325);
    let s;
    do s = rand.pick(INCIDENT_SCENARIOS);
    while ((notifiableScenario(s) || lostTime(s)) && rand.chance(0.8));
    const siteKey = rand.pick(s.sites);
    const status = rand.chance(0.05) && !notifiableScenario(s) ? 'Rejected' : 'Closed';
    plans.push({ s, site: siteKey, days, occurred: at(-Math.floor(days), rand.int(6, 17), rand.pick([0, 10, 20, 30, 40, 50])), status, background: true });
  }
  plans.sort((a, b) => a.occurred - b.occurred);

  const incidents = [];
  const actions = [];
  const actionPlans = [];
  for (const plan of plans) {
    const { s } = plan;
    const site = siteOf(plan.site);
    const reporterKey = plan.reporter ?? (rand.chance(0.6) ? site.supervisor : rand.pick(workersAt(plan.site).length ? workersAt(plan.site) : [site.supervisor]));
    const delayHours = plan.background ? (rand.chance(0.12) ? rand.int(26, 60) : rand.int(1, 8) / 4 + rand.next()) : Math.min(plan.days * 24 * 0.6, rand.next() * 2 + 0.2);
    const reported = plan.occurred + delayHours * HOUR;
    const isInjury = s.type === 'Injury' || s.type === 'Illness';
    const personType = s.person ?? 'Employee';
    const injuredKey = isInjury && personType === 'Employee' ? plan.involved ?? rand.pick(workersAt(plan.site).length ? workersAt(plan.site) : [site.supervisor]) : null;
    const status = plan.status;
    const triaged = status !== 'Reported';
    const risk = triaged ? rated(s.l, s.c) : null;
    const treatment = s.treatment ?? '';
    const injury = injuryClass(treatment);
    const natures = (s.natures ?? []).map((n) => values.injuryNature[n]);
    const notice = notifiable({ type: s.type, treatment, natures: natures.map((n) => ({ name: n.name, serious: n.seriousBool })), dangerousKind: s.dangerous });
    const response = risk ? riskResponse(risk.rating) : null;
    let investigation = response ? response.investigation : 'none';
    if (notice.notifiable || injury?.lostTime) investigation = 'full';
    else if (injury?.recordable && investigation === 'none') investigation = 'supervisor';
    const closeBy = notice.notifiable ? 'Executive' : response ? response.closeBy : 'WHS';
    const advisor = site.advisor;
    const investigated = ['Investigating', 'Actions Pending', 'Closed'].includes(status);
    const documentId = whsId('incident', `${plan.site}:${s.key}:${Math.round(plan.occurred / 60000)}`);
    const ref = nextRef('incident');
    const summaryName = `${ref}: ${s.title}`;

    // The five whys: the scenario's chain, the last answer a root cause.
    const chain = (count) => {
      const whys = s.why.slice(0, count);
      const node = (i) => ({
        id: `why-${i + 1}`,
        text: whys[i],
        ...(i === s.why.length - 1 && count >= s.why.length ? { root: true, category: s.rootCategory } : {}),
        children: i + 1 < whys.length ? [node(i + 1)] : [],
      });
      return whys.length ? [node(0)] : [];
    };
    const tree = investigated && investigation !== 'none' ? { problem: s.title, nodes: chain(status === 'Investigating' ? plan.partialWhys ?? 1 : s.why.length) } : null;
    const closed = status === 'Closed' ? reported + rand.int(investigation === 'full' ? 20 : 4, investigation === 'full' ? 45 : 18) * DAY : null;
    const closer = closeBy === 'Executive' ? 'marcus' : closeBy === 'Manager' ? site.manager : advisor;
    const regulator = notice.notifiable && (plan.regulator ?? true) && triaged && (investigated || plan.regulator);

    const d = {
      incidentRef: ref,
      title: s.title,
      incidentStatusRel: [statuses.incidentStatus[status]],
      lastStatus: status,
      transition: null,
      incidentTypeRel: [values.incidentType[s.type]],
      ...(s.dangerous ? { dangerousKindRel: [values.dangerousKind[s.dangerous]] } : {}),
      occurredDate: iso(plan.occurred),
      reportedDate: iso(reported),
      reportedByRel: [personValue(reporterKey)],
      siteRel: [siteValue[plan.site]],
      exactLocation: plan.background ? rand.pick(site.areas) : s.area,
      locationGeo: pointGeo(near(site.at)),
      description: s.description,
      immediateActions: s.immediate,
      personTypeRel: [values.personType[personType]],
      ...(injuredKey ? { injuredPersonRel: [personValue(injuredKey)] } : {}),
      ...(isInjury && !injuredKey ? { injuredName: rand.pick(CONTRACTORS) } : {}),
      ...(isInjury
        ? {
            injuryPins: (s.pins ?? []).map(([view, region, kind], i) => ({ id: `pin-${i + 1}`, ...pinAt(view, region), view, region, kind, note: '' })),
            injuryNatureRel: natures,
            ...(s.mechanism ? { mechanismRel: [values.mechanism[s.mechanism]] } : {}),
            treatmentRel: [values.treatment[treatment]],
            ...(s.daysLost ? { daysLostNum: s.daysLost, returnToWorkDate: iso(plan.occurred + (s.daysLost + 2) * DAY) } : {}),
          }
        : s.mechanism ? { mechanismRel: [values.mechanism[s.mechanism]] } : {}),
      photosArr: [],
      // Derived, as the PreSaveServer rule keeps them.
      riskAssessment: risk,
      riskRating: risk?.rating ?? '',
      riskScoreNum: risk?.score ?? null,
      riskRatingRel: risk ? [ratingValues[risk.rating]] : [],
      injuryClass: injury?.code ?? '',
      injuryClassLabel: injury?.label ?? '',
      recordableBool: !!injury?.recordable,
      lostTimeBool: !!injury?.lostTime,
      notifiableBool: notice.notifiable,
      notifiableReasons: notice.reasons,
      notifiableReasonsText: notice.reasons.join('; '),
      bodyParts: [...new Set((s.pins ?? []).map(([, region]) => region))],
      investigationLevel: investigation,
      investigationLevelText: INVESTIGATION_TEXT[investigation],
      reportDelayHours: reportingDelayHours(iso(plan.occurred), iso(reported)),
      lateReportBool: delayHours > LATE_REPORT_HOURS,
      ...(response ? { responseRating: risk.rating, responseDueDate: iso(reported + response.respondHours * HOUR) } : {}),
      ...(investigation !== 'none' ? { investigationDueDate: iso(plan.occurred + (response?.investigationDays || 14) * DAY) } : {}),
      ...(regulator ? { regulatorNotifiedDate: iso(reported + 0.4 * HOUR), regulatorRef: `SWN-${rand.int(100000, 999999)}`, sitePreservedBool: true } : {}),
      ...(investigated && investigation !== 'none' ? { investigatorRel: [personValue(plan.investigator ?? advisor)] } : {}),
      ...(tree ? { rootCauseTree: tree } : {}),
      ...(['Actions Pending', 'Closed'].includes(status) && investigation !== 'none'
        ? { investigationSummary: `${s.why[0]}. ${s.why.length > 1 ? `Underlying cause: ${s.why[s.why.length - 1].toLowerCase()}.` : ''} Corrective actions below.` }
        : {}),
      ...(status === 'Closed' ? { closedByRel: [authorValue(plan.signedOff ?? closer)], closedDate: iso(closed), closureNotes: 'Actions complete and checked. Closed.' } : {}),
      ...(status === 'Rejected' ? { rejectReason: 'Duplicate of an earlier report of the same event.' } : {}),
      ...(response ? { escalationLevel: risk.rating } : {}),
      ...(notice.notifiable && triaged ? { regulatorAlertBool: true } : {}),
      ...authorship(reporterKey, reported, closed ?? reported + DAY, closed ? closer : advisor),
    };
    // Who was told, and the note the escalation rule writes.
    const notes = [];
    if (response) {
      const byRole = { Supervisor: [site.supervisor], 'WHS Advisor': [site.advisor], 'Site Manager': [site.manager], Executive: ['marcus'] };
      const roles = [...response.notify, ...(notice.notifiable && !response.notify.includes('Executive') ? ['Executive'] : [])];
      const told = [...new Set(roles.flatMap((role) => byRole[role].map((key) => `${key}|${role}`)))].map((s2) => s2.split('|'));
      const toldUnique = told.filter(([key], i) => told.findIndex(([k]) => k === key) === i);
      d.notifiedRel = toldUnique.map(([key]) => authorValue(key));
      const lines = [`**${risk.rating} risk${notice.notifiable ? ', notifiable' : ''}.**`, `Told ${toldUnique.map(([key, role]) => `${people[key].name} (${role})`).join(', ')}.`];
      lines.push(`Triage by ${new Date(reported + response.respondHours * HOUR).toLocaleString('en-AU', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}; actions due within ${response.actionDays} ${response.actionDays === 1 ? 'day' : 'days'}.`);
      if (notice.notifiable) lines.push(`**Notifiable**: ${notice.reasons.join('; ')}. Tell the regulator immediately, and leave the site undisturbed until an inspector releases it.`);
      notes.push(note(plan.reviewer ?? site.supervisor, reported + 0.5 * HOUR, lines.join(' ')));
    }
    if (plan.scenario === 'ammonia-leak') notes.push(note('grace', reported + 2 * HOUR, 'Fire brigade has left. Plant room ventilated and gas-tested clear. **Still need to call SafeWork NSW**: Sophie is on it.'));
    if (plan.scenario === 'scaffold-fall') notes.push(note('tom', reported + 3 * HOUR, 'SafeWork NSW inspector attended at 3 pm and released the area at 5:30 pm. Scaffold remains tagged out.'), note('ravi', reported + 26 * HOUR, 'Sam is home from hospital. Wrist in plaster for six weeks.'));
    if (plan.scenario === 'forklift-pedestrian' && !plan.background) notes.push(note('hannah', reported + 30 * HOUR, 'Walked the dock with Daniel. The office move put the main door right in the forklift lane.'));
    if (notes.length) d.notesCommentsArr = notes;

    const incident = doc('incident', T.incident, summaryName, d, { id: documentId, created: reported, by: people[reporterKey].documentId });
    incidents.push({ doc: incident, plan, site, risk, investigation, status, reported, closed, notice });

    // Corrective actions from the scenario, once the incident has been investigated.
    if (investigated && risk) {
      const list = s.actions ?? [];
      const strict = risk.rating === 'High' || risk.rating === 'Extreme' || notice.notifiable;
      list.forEach(([title, level], i) => {
        const raised = reported + (status === 'Investigating' ? 0.3 + i * 0.1 : 1 + i * 0.5) * DAY;
        let state;
        if (status === 'Closed') state = strict ? 'Verified' : rand.chance(0.6) ? 'Verified' : 'Completed';
        else if (status === 'Actions Pending') state = i === 0 ? 'Completed' : i === 1 ? 'In Progress' : 'Open';
        else state = i === 0 && !plan.actionsOpen ? 'In Progress' : 'Open';
        actionPlans.push({ title, level, raised, state, source: incident, sourceKind: 'incident', sourceRef: ref, rating: risk.rating, site, closedBy: closed });
      });
    }
  }

  // -------------------------------------------------------------------------------- hazards
  const hazards = [];
  const hazardDoc = (h) => {
    const ref = nextRef('hazard');
    return doc('hazard', T.hazard, `${ref}: ${h.title}`, { hazardRef: ref, ...h.fields }, { id: h.id, created: h.reported, by: people[h.reporter].documentId });
  };
  const hazardPlans = [];
  for (const [siteKey, list] of Object.entries(HAZARDS)) {
    const site = siteOf(siteKey);
    list.forEach(([title, category, description, inherent, residual, controls, status], i) => {
      const reported = at(-rand.int(40, 330), rand.int(7, 16));
      hazardPlans.push({ siteKey, site, title, category, description, inherent, residual, controls, status, reported, reporter: rand.chance(0.5) ? site.supervisor : rand.pick([...workersAt(siteKey), site.supervisor]), key: `${siteKey}:${i}` });
    });
  }

  // ---------------------------------------------------------------------------- inspections
  // Each site's inspections over the last six months, every `inspectionWeeks`: completed ones with
  // their answers, a failed check raising a hazard (as the PostSave rule does), and what's next.
  const inspectionPlans = [];
  for (const site of SITES) {
    const sheet = sheets[site.sheet];
    const period = site.inspectionWeeks * 7;
    const inspectors = [site.supervisor, site.advisor, ...(site.key === 'bot' ? ['chloe'] : [])];
    let day = -Math.floor(182 / period) * period + rand.int(0, 3);
    const lastPast = (() => {
      let d = day;
      while (d + period <= 0) d += period;
      return d;
    })();
    for (; day <= period; day += period) {
      const scheduled = at(day, 9);
      const inspector = rand.pick(inspectors);
      let state;
      if (day < lastPast) state = 'Completed';
      else if (day === lastPast) state = site.key === 'wpk' ? 'Overdue' : site.key === 'bot' ? 'In Progress' : 'Completed';
      else state = 'Scheduled';
      if (state === 'Scheduled' && inspectionPlans.some((p) => p.site === site && p.state === 'Scheduled')) break;
      if (state === 'Overdue' && day > -3) day -= 5;
      inspectionPlans.push({ site, sheet, scheduled: state === 'Overdue' ? at(-5, 9) : scheduled, inspector, state });
      // An overdue inspection is the site's only scheduled one; one in progress has the next booked.
      if (state === 'Overdue') break;
      if (state === 'In Progress') {
        inspectionPlans.push({ site, sheet, scheduled: at(day + period, 9), inspector, state: 'Scheduled' });
        break;
      }
    }
  }
  inspectionPlans.sort((a, b) => a.scheduled - b.scheduled);
  const inspections = [];
  for (const plan of inspectionPlans) {
    const { site, sheet } = plan;
    const ref = nextRef('inspection');
    const status = plan.state === 'Overdue' ? 'Scheduled' : plan.state;
    const completedAt = status === 'Completed' ? Math.min(plan.scheduled + rand.int(0, 2) * DAY + rand.int(1, 5) * HOUR, NOW - HOUR) : null;
    const items = sheet.checkItems.map((item) => {
      if (status === 'Scheduled') return { ...item, result: '', comment: '' };
      if (status === 'In Progress' && rand.chance(0.45)) return { ...item, result: '', comment: '' };
      const fail = rand.chance(0.045);
      const na = !fail && !item.mandatory && rand.chance(0.08);
      return { ...item, result: fail ? 'fail' : na ? 'na' : 'pass', comment: fail ? failComment(item.question, rand) : '' };
    });
    const outcome = checklistOutcome(items, { commentOnFail: true, failLabel: 'Hazards found' });
    const id = whsId('inspection', `${site.key}:${Math.round(plan.scheduled / 60000)}`);
    const summaryName = `${ref}: ${site.code} ${sheet.nameId}`;
    const insp = doc('inspection', T.inspection, summaryName, {
      inspectionRef: ref,
      inspectionStatusRel: [statuses.inspectionStatus[status]],
      lastStatus: status,
      transition: null,
      siteRel: [siteValue[site.key]],
      checkSheetRel: [sheetValue[site.sheet]],
      scheduledDate: iso(plan.scheduled),
      inspectorRel: [personValue(plan.inspector)],
      checkItems: status === 'Scheduled' ? [] : items,
      photosArr: [],
      totalNum: status === 'Scheduled' ? 0 : outcome.total,
      answeredNum: status === 'Scheduled' ? 0 : outcome.answered,
      passedNum: outcome.passed,
      failedNum: outcome.failed,
      naNum: outcome.na,
      ...(status === 'Completed'
        ? { completedDate: iso(completedAt), resultText: outcome.result, summary: outcome.failed ? `${outcome.failed} ${outcome.failed === 1 ? 'check' : 'checks'} failed; ${outcome.failed === 1 ? 'a hazard was' : 'hazards were'} raised.` : 'All checks passed.' }
        : {}),
      ...authorship(plan.inspector, Math.min(plan.scheduled - 7 * DAY, NOW - 7 * DAY), completedAt ?? Math.min(plan.scheduled, NOW - HOUR)),
    }, { id, created: Math.min(plan.scheduled - 7 * DAY, NOW - 7 * DAY), by: people[plan.inspector].documentId });
    inspections.push({ doc: insp, plan, status, completedAt });
    // A failed check raises a hazard: recent ones are still open, older ones were fixed.
    if (status === 'Completed') {
      for (const item of items.filter((x) => x.result === 'fail')) {
        const recent = NOW - completedAt < 40 * DAY;
        const l = rand.int(2, 3);
        const c = rand.int(2, 3);
        hazardPlans.push({
          siteKey: site.key, site, title: item.question.slice(0, 120), category: CHECK_CATEGORY_HAZARD[item.category] ?? 'Slips, trips and falls',
          description: `${item.comment}\n\nRaised by ${ref} (${item.category}).`, inherent: [l, c], residual: recent ? null : [1, Math.max(1, c - 1)],
          controls: recent ? [] : [[`Fix: ${item.comment.replace(/\.$/, '').toLowerCase()}`, 'Eliminate', 'done']], status: recent ? (rand.chance(0.5) ? 'Reported' : 'Assessed') : 'Closed',
          reported: completedAt + HOUR, reporter: plan.inspector, key: `insp:${insp.documentId}:${item.key}`,
          source: [{ documentId: insp.documentId, name: summaryName, ref, kind: 'inspection' }], sourceItemKey: item.key,
          closeNotes: recent ? undefined : 'Fixed during the inspection and checked the next week.',
        });
      }
    }
  }

  hazardPlans.sort((a, b) => a.reported - b.reported);
  for (const h of hazardPlans) {
    const inherent = rated(...h.inherent);
    const residual = h.residual ? rated(...h.residual) : null;
    const current = residual ?? inherent;
    const assessed = h.status !== 'Reported';
    const owner = h.site.manager;
    const lastReview = h.status === 'Controlled' ? at(-rand.int(10, 120), 10) : null;
    const id = whsId('hazard', h.key);
    const fields = {
      title: h.title,
      hazardStatusRel: [statuses.hazardStatus[h.status]],
      lastStatus: h.status,
      transition: null,
      hazardCategoryRel: [values.hazardCategory[h.category]],
      siteRel: [siteValue[h.siteKey]],
      exactLocation: rand.pick(h.site.areas),
      locationGeo: pointGeo(near(h.site.at)),
      description: h.description,
      reportedByRel: [personValue(h.reporter)],
      reportedDate: iso(h.reported),
      photosArr: [],
      ...(h.source ? { sourceRel: h.source, sourceItemKey: h.sourceItemKey } : {}),
      ...(assessed ? { inherentRisk: inherent, ownerRel: [personValue(owner)] } : {}),
      ...(assessed && residual ? { residualRisk: residual } : {}),
      inherentRating: assessed ? inherent.rating : '',
      inherentScoreNum: assessed ? inherent.score : null,
      inherentRatingRel: assessed ? [ratingValues[inherent.rating]] : [],
      residualRating: assessed && residual ? residual.rating : '',
      residualScoreNum: assessed && residual ? residual.score : null,
      residualRatingRel: assessed && residual ? [ratingValues[residual.rating]] : [],
      currentRisk: assessed ? current : null,
      currentRating: assessed ? current.rating : '',
      currentRatingRel: assessed ? [ratingValues[current.rating]] : [],
      ...(lastReview ? { lastReviewDate: iso(lastReview), reviewDate: nextReviewDate(lastReview, residual.rating) } : {}),
      ...(h.closeNotes || h.status === 'Closed' ? { closeNotes: h.closeNotes ?? 'The hazard has been removed.' } : {}),
      ...authorship(h.reporter, h.reported, h.reported + 2 * DAY, owner),
    };
    if (!h.reporter || !people[h.reporter]) throw new Error(`No reporter for hazard ${h.title}`);
    const hazard = hazardDoc({ id, title: h.title, fields, reported: h.reported, reporter: h.reporter });
    hazards.push({ doc: hazard, plan: h, inherent, residual });
    for (const [title, level, state] of h.controls) {
      // Controls in place were raised soon after the report; planned ones recently, a few now late.
      const days = riskResponse(inherent.rating).actionDays;
      const raised = state === 'done' ? h.reported + rand.int(2, 10) * DAY : NOW - (rand.chance(0.25) ? days + rand.int(2, 9) : rand.int(0, Math.max(1, days - 1))) * DAY - rand.int(1, 6) * HOUR;
      actionPlans.push({
        title, level, raised, state: state === 'done' ? (rand.chance(0.7) ? 'Verified' : 'Completed') : rand.chance(0.4) ? 'In Progress' : 'Open',
        source: hazard, sourceKind: 'hazard', sourceRef: hazard.hazardRef, rating: inherent.rating, site: h.site,
      });
    }
  }

  // ------------------------------------------------------------------------ corrective actions
  actionPlans.sort((a, b) => a.raised - b.raised);
  const ownerFor = (level, site) => {
    const owner = ['Administrative', 'PPE'].includes(level) ? site.supervisor : site.manager;
    return owner === site.advisor ? site.manager : owner;
  };
  for (const a of actionPlans) {
    const ref = nextRef('action');
    const response = riskResponse(a.rating);
    const due = Date.parse(actionDueDate(a.raised, response.actionDays));
    const done = a.state === 'Completed' || a.state === 'Verified';
    // Open actions on older records ran late; done ones finished before their due date or the sign-off.
    const completed = done ? Math.min(a.closedBy ? a.closedBy - DAY : NOW - HOUR, a.raised + rand.int(1, Math.max(1, response.actionDays)) * DAY * 0.8 + HOUR) : null;
    const owner = ownerFor(a.level, a.site);
    const verifier = a.site.advisor === owner ? 'priya' : a.site.advisor;
    const source = a.source;
    const id = whsId('action', `${source.documentId}:${slug(a.title)}`);
    const d = doc('action', T.action, `${ref}: ${a.title}`, {
      actionRef: ref,
      title: a.title,
      actionStatusRel: [statuses.actionStatus[a.state]],
      lastStatus: a.state,
      transition: null,
      sourceRel: [{ documentId: source.documentId, name: source.systemHeader.summaryName, ref: a.sourceRef, kind: a.sourceKind, riskRating: a.rating }],
      controlLevelRel: [values.controlLevel[a.level]],
      controlRankNum: CONTROL_LEVELS.find((l) => l.name === a.level).rank,
      ownerRel: [personValue(owner)],
      raisedDate: iso(a.raised),
      dueDate: iso(due),
      riskRatingRel: [ratingValues[a.rating]],
      ...(done ? { completedDate: iso(completed), completionNotes: `Done. ${a.level === 'Administrative' ? 'Briefed at the toolbox talk; sign-on sheet filed.' : 'Installed and checked on site.'}` } : {}),
      ...(a.state === 'Verified' ? { verifiedByRel: [authorValue(verifier)], verifiedDate: iso(Math.min(completed + 2 * DAY, NOW - HOUR)), verificationNotes: 'Checked on site.' } : {}),
      ...authorship(a.site.advisor, a.raised, completed ?? a.raised),
    }, { id, created: a.raised, by: people[a.site.advisor].documentId });
    actions.push({ doc: d, plan: a, due });
  }

  // Each record's action counts, as the action PostSave rule keeps them.
  const levels = CONTROL_LEVELS.map((l) => l.name);
  const bySource = new Map();
  for (const a of actions) bySource.set(a.plan.source.documentId, [...(bySource.get(a.plan.source.documentId) ?? []), a]);
  for (const [sourceId, list] of bySource) {
    const source = set.documents.find((d) => d.documentId === sourceId);
    const items = list.map((a) => ({ status: a.plan.state, dueDate: a.doc.dueDate, controlLevel: a.plan.level }));
    const all = actionsSummary(items, NOW);
    const inPlace = actionsSummary(items.filter((x) => x.status === 'Completed' || x.status === 'Verified'), NOW);
    Object.assign(source, {
      actionsTotalNum: all.total, actionsOpenNum: all.open, actionsDoneNum: all.done, actionsOverdueNum: all.overdue,
      strongestControl: inPlace.strongestRank < 99 ? levels[inPlace.strongestRank - 1] : '',
    });
  }
  for (const site of SITES) {
    const here = incidents.filter((i) => i.plan.site === site.key && i.status !== 'Rejected').map((i) => i.doc);
    const latest = (list) => list.reduce((best, d) => (!best || d.occurredDate > best ? d.occurredDate : best), '');
    Object.assign(sites[site.key], { lastIncidentDate: latest(here) || null, lastLtiDate: latest(here.filter((d) => d.lostTimeBool)) || null });
  }

  // ------------------------------------------------------------------------------- counters
  for (const [key, c] of Object.entries(COUNTERS)) {
    set.add({ documentId: c.id, systemHeader: header({ systemType: 'document', templateId: T.counter, summaryName: `${c.prefix} counter`, at: seededAt, by: adminId }), [c.field]: counterFor[key] ?? 0 });
  }

  // ------------------------------------------------------------------------ templates and rules
  const components = templateComponents({ statuses, values });
  const ref = (key, name) => [{ documentId: RULESETS[key], name }];
  const client = (key, name) => ({ preRenderClientRuleRel: ref(key, name), onLoadClientRuleRel: ref(key, name), onFieldChangeClientRuleRel: ref(key, name), preSaveClientRuleRel: ref(key, name) });
  const template = (id, name, extra = {}) => set.template({ id, name, components: components[id], ...extra });
  const page = (id, name) => template(id, name, { hideCommandBar: true });
  page(T.overview, 'Safety overview');
  page(T.mySafety, 'My safety');
  page(T.incidents, 'Incident register');
  page(T.hazards, 'Hazard register');
  page(T.actions, 'Corrective actions');
  page(T.inspections, 'Inspections');
  page(T.map, 'Safety map');
  template(T.incident, 'Incident', {
    appTags: ['whs', 'incident'], summaryNameRule: '{{{incidentRef}}}: {{{title}}}',
    ...client('incidentClient', 'Safety Incident - Client'), preSaveServerRuleRel: ref('incidentServer', 'Safety Incident - PreSaveServer'), postSaveServerRuleRel: ref('incidentPost', 'Safety Incident - PostSave'),
  });
  template(T.hazard, 'Hazard', {
    appTags: ['whs', 'hazard'], summaryNameRule: '{{{hazardRef}}}: {{{title}}}',
    ...client('hazardClient', 'Safety Hazard - Client'), preSaveServerRuleRel: ref('hazardServer', 'Safety Hazard - PreSaveServer'),
  });
  template(T.action, 'Corrective action', {
    appTags: ['whs', 'action'], summaryNameRule: '{{{actionRef}}}: {{{title}}}',
    ...client('actionClient', 'Safety Action - Client'), preSaveServerRuleRel: ref('actionServer', 'Safety Action - PreSaveServer'), postSaveServerRuleRel: ref('actionPost', 'Safety Action - PostSave'),
  });
  template(T.inspection, 'Inspection', {
    appTags: ['whs', 'inspection'], summaryNameRule: '{{{inspectionRef}}}: {{{siteRel.0.code}}} {{{checkSheetRel.0.name}}}',
    ...client('inspectionClient', 'Safety Inspection - Client'), preSaveServerRuleRel: ref('inspectionServer', 'Safety Inspection - PreSaveServer'), postSaveServerRuleRel: ref('inspectionPost', 'Safety Inspection - PostSave'),
  });
  template(T.site, 'Site', { appTags: ['whs', 'site'], summaryNameRule: '{{{nameId}}}' });
  template(T.checkSheet, 'Inspection checklist', { appTags: ['whs', 'checkSheet'], summaryNameRule: '{{{nameId}}}' });
  template(T.counter, 'Counter', { summaryNameRule: 'Counter' });
  for (const [kind, names] of Object.entries(LOOKUPS)) template(T[`lookup_${kind}`], names.name, { appTags: ['whs', kind], summaryNameRule: '{{{nameId}}}' });

  const linked = (templateId, name, events) => [{ documentId: templateId, name, eventNames: events }];
  const CLIENT_EVENTS = 'preRenderClient | onLoadClient | onFieldChangeClient | preSaveClient';
  const rs = (key, name, dsl, templateId, templateName, events) => set.ruleset({ id: RULESETS[key], name, dsl, group: 'whs', linked: linked(templateId, templateName, events) });
  rs('incidentClient', 'Safety Incident - Client', rules.incidentClientRules({ statuses, values }), T.incident, 'Incident', CLIENT_EVENTS);
  rs('incidentServer', 'Safety Incident - PreSaveServer', rules.incidentServerRules({ ratings: ratingValues, executives }), T.incident, 'Incident', 'preSaveServer');
  rs('incidentPost', 'Safety Incident - PostSave', rules.incidentPostRules(), T.incident, 'Incident', 'postSaveServer');
  rs('hazardClient', 'Safety Hazard - Client', rules.hazardClientRules({ statuses }), T.hazard, 'Hazard', CLIENT_EVENTS);
  rs('hazardServer', 'Safety Hazard - PreSaveServer', rules.hazardServerRules({ ratings: ratingValues }), T.hazard, 'Hazard', 'preSaveServer');
  rs('actionClient', 'Safety Action - Client', rules.actionClientRules({ statuses }), T.action, 'Corrective action', CLIENT_EVENTS);
  rs('actionServer', 'Safety Action - PreSaveServer', rules.actionServerRules({ ratings: ratingValues }), T.action, 'Corrective action', 'preSaveServer');
  rs('actionPost', 'Safety Action - PostSave', rules.actionPostRules(), T.action, 'Corrective action', 'postSaveServer');
  rs('inspectionClient', 'Safety Inspection - Client', rules.inspectionClientRules({ statuses }), T.inspection, 'Inspection', CLIENT_EVENTS);
  rs('inspectionServer', 'Safety Inspection - PreSaveServer', rules.inspectionServerRules(), T.inspection, 'Inspection', 'preSaveServer');
  rs('inspectionPost', 'Safety Inspection - PostSave', rules.inspectionPostRules({ statuses, values, hazardTemplateId: T.hazard, inspectionTemplateId: T.inspection }), T.inspection, 'Inspection', 'postSaveServer');

  // ---------------------------------------------------------------------- platform documents
  if (platform) set.platformDocuments(componentRepos(appRoot));
  // People's safety details on the account form (this database's copy of the platform template).
  const accountTemplate = set.documents.find((d) => d.documentId === SYSTEM.account);
  if (accountTemplate?.components) {
    accountTemplate.components.splice(1, 0,
      { componentName: 'sc-drop-down', name: 'accountType', label: 'Account type', dropDownList: Object.keys(ROLES) },
      { componentName: 'solid-lookup-picker', name: 'siteRel', label: 'Site', singleSelection: true, showDropDown: true, iconSet: 'none', filter: q({ sort: [{ indexNum: 'asc' }], query: { bool: { filter: [{ term: { appTags: 'whs' } }, { term: { appTags: 'site' } }] } } }), relatedFields: SITE_VALUE_FIELDS },
      { componentName: 'sc-text-box', name: 'phone', label: 'Phone' },
    );
  }
  set.configuration({ defaultTemplate: T.overview, urlRoot });

  return {
    documents: set.finish(),
    password: DEMO_PASSWORD,
    people: PEOPLE.map((p) => ({ name: people[p.key].name, email: people[p.key].email, role: p.type })),
    urls: {
      overview: `/form/${T.overview}`,
      mySafety: `/form/${T.mySafety}`,
      incidents: `/form/${T.incidents}`,
      hazards: `/form/${T.hazards}`,
      actions: `/form/${T.actions}`,
      inspections: `/form/${T.inspections}`,
      map: `/form/${T.map}`,
      newIncident: `/form/${T.incident}`,
    },
    stats: { incidents: incidents.length, hazards: hazards.length, actions: actions.length, inspections: inspections.length, company: COMPANY.length > 0 ? 1 : 0 },
    // For tests: what the seed knows about each record.
    seedFacts: { incidents, hazards, actions, inspections, levels: LEVELS, ratings: RATINGS, personFields: PERSON_FIELDS },
  };
}

/** What an inspector writes for a failed check. */
function failComment(question, rand) {
  const lower = question.toLowerCase();
  if (lower.includes('extinguisher')) return rand.pick(['Extinguisher by dock 7 out of test date.', 'Extinguisher blocked by a pallet of stock.']);
  if (lower.includes('racking')) return 'Upright in aisle 9 dented at the base; load offloaded and bay tagged out.';
  if (lower.includes('walkway') || lower.includes('aisles')) return 'Pallets stacked across the walkway at dispatch.';
  if (lower.includes('exit')) return 'Exit sign light failed at the north fire door.';
  if (lower.includes('guard')) return 'Guard on the labeller left off after maintenance.';
  if (lower.includes('edge protection') || lower.includes('scaffold')) return 'Missing handrail on the east side, level 1.';
  if (lower.includes('excavation')) return 'Barricade knocked over at the chainage 360 pit.';
  if (lower.includes('electrical') || lower.includes('tested and tagged') || lower.includes('leads')) return 'Two leads out of test date in the workshop.';
  if (lower.includes('first aid')) return 'First aid kit missing burn gel and saline.';
  if (lower.includes('chemical') || lower.includes('labelled') || lower.includes('safety data')) return 'Unlabelled spray bottle in the wash bay.';
  if (lower.includes('floor')) return 'Oil patch near the battery bay.';
  return 'Not up to standard; reported to the supervisor.';
}
