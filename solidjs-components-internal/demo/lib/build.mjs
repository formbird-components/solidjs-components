// Assembles every document of the issue tracker demo database. Platform documents, accounts and the
// configuration document come from solidjs-components-shared's platform package.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentRepos, DocumentSet, menuGroup, menuItem } from '@solidjs-components/platform/documents';
import { ANGULAR_ELEMENTS_CDN, SOLID_VENDOR } from '@solidjs-components/tools/formbird';
import { LABELS, PEOPLE, PRIORITIES, PROJECTS, RESOLUTIONS, STATUSES, TRANSITIONS, TYPES, emailOf } from './catalog.mjs';
import { ISSUES } from './issues.mjs';
import {
  ADMIN_KEY, CONFIG_ID, COUNTER_FIELD, COUNTER_ID, DEMO_PASSWORD, KEY_PREFIX, TEMPLATES, TEMPLATE_EDITOR_ID,
  demoId, header, related,
} from './model.mjs';
import { boardClientRules, issueClientRules, issueServerRules } from './rules.mjs';
import { templateComponents } from './templates.mjs';

/** This repo: its elements get component documents alongside shared's. */
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const DAY = 24 * 60 * 60 * 1000;
const LOOKUP_FIELDS = { projectRel: 'projectRel', isGlobalDefaultBool: 'isGlobalDefaultBool' };

/**
 * Builds the demo documents.
 * @param {{ now?: Date, urlRoot?: string }} [options]
 * @returns {{ documents: Record<string, any>[], people: { name: string, email: string, role: string }[], urls: Record<string, string>, password: string }}
 */
export function buildDemo({ now = new Date(), urlRoot = 'http://localhost:3000' } = {}) {
  const daysAgo = (days, hour = 10) => {
    const d = new Date(now.getTime() - days * DAY);
    d.setUTCHours(hour, (days * 17) % 60, 0, 0);
    return d > now ? new Date(now.getTime() - 60_000) : d;
  };
  const seededAt = daysAgo(45, 8);
  const adminId = demoId('account', 'alex');
  const at = (d) => ({ at: d, by: adminId });
  const set = new DocumentSet({ at: seededAt, by: adminId });
  const add = (doc) => set.add(doc);

  // ---------------------------------------------------------------- lookups
  const lookup = (kind, templateId, name, index, extra = {}) =>
    add({
      documentId: demoId(kind, name),
      systemHeader: header({ systemType: 'document', templateId, summaryName: name, ...at(seededAt) }),
      appTags: ['sdms', kind],
      nameId: name,
      indexNum: index,
      isGlobalDefaultBool: true,
      inactiveBool: false,
      projectRel: [],
      ...extra,
    });
  const statuses = Object.fromEntries(
    STATUSES.map((s, i) => [s.name, lookup('status', TEMPLATES.status, s.name, (i + 1) * 10, { color: s.color, statusCategory: s.category, disableItemBool: !!s.locked })]),
  );
  const types = Object.fromEntries(TYPES.map((t, i) => [t, lookup('type', TEMPLATES.type, t, (i + 1) * 10)]));
  const priorities = Object.fromEntries(PRIORITIES.map((p, i) => [p, lookup('priority', TEMPLATES.priority, p, (i + 1) * 10)]));
  const resolutions = Object.fromEntries(RESOLUTIONS.map((r, i) => [r, lookup('resolution', TEMPLATES.resolution, r, (i + 1) * 10)]));
  const labels = Object.fromEntries(LABELS.map((l, i) => [l, lookup('tag', TEMPLATES.tag, l, (i + 1) * 10)]));

  // Stored values, exactly as the pickers on the issue template write them.
  const statusValue = (name) => related(statuses[name], { ...LOOKUP_FIELDS, disableItemBool: 'disableItemBool', indexNum: 'indexNum' });
  const priorityValue = (name) => related(priorities[name], { ...LOOKUP_FIELDS, indexNum: 'indexNum' });
  const lookupValue = (doc) => related(doc, LOOKUP_FIELDS);

  // ---------------------------------------------------------------- projects and people
  const projects = Object.fromEntries(
    PROJECTS.map((p) => [
      p.key,
      add({
        documentId: demoId('project', p.key),
        systemHeader: header({ systemType: 'document', templateId: TEMPLATES.project, summaryName: p.name, ...at(seededAt) }),
        appTags: ['sdms', 'project'],
        name: p.name,
        projectKey: p.key,
        configStatus: 'Global Default',
        description: p.description,
        leadRel: [], // filled once accounts exist
        inactiveBool: false,
      }),
    ]),
  );
  const projectValue = (key) => related(projects[key], { projectKey: 'projectKey' });

  const boardIds = { all: demoId('board', 'all'), ...Object.fromEntries(PROJECTS.map((p) => [p.key, demoId('board', p.key)])) };
  const rulesetIds = {
    issueClient: demoId('ruleset', 'Tracker Issue - Client'),
    issueServer: demoId('ruleset', 'Tracker Issue - PreSaveServer'),
    boardClient: demoId('ruleset', 'Tracker Board - Client'),
  };

  const group = menuGroup;
  const menuFor = (person) => [
    menuItem('Your work', `/form/${TEMPLATES.home}`),
    group('Boards', [menuItem('All projects', `/form/${boardIds.all}`), ...PROJECTS.map((p) => menuItem(p.name, `/form/${boardIds[p.key]}`))]),
    menuItem('All issues', `/form/${TEMPLATES.allIssues}`),
    menuItem('Create issue', `/form/${TEMPLATES.issue}`),
    group('Projects', PROJECTS.map((p) => menuItem(p.name, `/form/${projects[p.key].documentId}`))),
    ...(person.admin
      ? [
          group('Admin', [
            menuItem('Statuses', `/form/${TEMPLATES.status}`),
            menuItem('Issue types', `/form/${TEMPLATES.type}`),
            menuItem('Priorities', `/form/${TEMPLATES.priority}`),
            menuItem('Resolutions', `/form/${TEMPLATES.resolution}`),
            menuItem('Labels', `/form/${TEMPLATES.tag}`),
            menuItem('New project', `/form/${TEMPLATES.project}`),
            menuItem('Issue template', `/form/${TEMPLATES.issue}/${TEMPLATE_EDITOR_ID}`),
            menuItem('Issue rules (client)', `/form/${rulesetIds.issueClient}`),
            menuItem('Issue rules (server)', `/form/${rulesetIds.issueServer}`),
            menuItem('Board rules', `/form/${rulesetIds.boardClient}`),
            menuItem('Configuration', `/form/${CONFIG_ID}/${TEMPLATE_EDITOR_ID}`),
          ]),
        ]
      : []),
  ];

  const people = {};
  for (const person of PEOPLE) {
    const name = `${person.first} ${person.last}`;
    const email = emailOf(person);
    // Password hashes and permissions: only the admin's access key can read these.
    const account = set.account({
      id: demoId('account', person.key),
      securityId: demoId('accountSecurity', person.key),
      controlId: demoId('accountControl', person.key),
      first: person.first,
      last: person.last,
      email,
      title: person.title,
      password: DEMO_PASSWORD,
      adminKey: ADMIN_KEY,
      accessKeys: person.admin ? [ADMIN_KEY] : [],
      fields: {
        defaultURL: TEMPLATES.home,
        menu: menuFor(person),
        sdmsProjectRel: person.projects.map((key) => related(projects[key])),
      },
    });
    people[person.key] = { ...person, name, email, documentId: account.documentId };
  }
  const personValue = (key) => ({ documentId: people[key].documentId, name: people[key].name, email: people[key].email });
  const authorValue = (key) => ({ documentId: people[key].documentId, name: people[key].name });
  for (const p of PROJECTS) projects[p.key].leadRel = [personValue(p.lead)];

  // ---------------------------------------------------------------- templates and rules
  const doneStatusIds = STATUSES.filter((s) => s.category === 'done').map((s) => statuses[s.name].documentId);
  const components = templateComponents({ transitions: TRANSITIONS, doneStatusIds, boardIds });
  const ruleRef = (id, name) => [{ documentId: id, name }];
  const template = (id, name, extra = {}) => set.template({ id, name, components: components[id], ...extra });
  const issueClient = ruleRef(rulesetIds.issueClient, 'Tracker Issue - Client');
  template(TEMPLATES.issue, 'Issue', {
    summaryNameRule: '{{{itemRef}}}: {{{summary}}}',
    appTags: ['sdms', 'item'],
    preRenderClientRuleRel: issueClient,
    onLoadClientRuleRel: issueClient,
    onFieldChangeClientRuleRel: issueClient,
    preSaveServerRuleRel: ruleRef(rulesetIds.issueServer, 'Tracker Issue - PreSaveServer'),
  });
  template(TEMPLATES.project, 'Project', { summaryNameRule: '{{{name}}}', appTags: ['sdms', 'project'] });
  template(TEMPLATES.board, 'Board', {
    summaryNameRule: '{{#if projectRel.0.name}}{{{projectRel.0.name}}}{{else}}All projects{{/if}} board',
    onLoadClientRuleRel: ruleRef(rulesetIds.boardClient, 'Tracker Board - Client'),
  });
  template(TEMPLATES.home, 'Your work', { hideCommandBar: true });
  template(TEMPLATES.allIssues, 'All issues', { hideCommandBar: true });
  template(TEMPLATES.counter, 'Issue counter', { summaryNameRule: 'Issue counter' });
  for (const [id, name] of [
    [TEMPLATES.status, 'Status'], [TEMPLATES.type, 'Issue type'], [TEMPLATES.priority, 'Priority'],
    [TEMPLATES.resolution, 'Resolution'], [TEMPLATES.tag, 'Label'],
  ]) {
    template(id, name, { summaryNameRule: '{{{nameId}}}' });
  }

  const ruleset = (id, name, dsl, linked) => set.ruleset({ id, name, dsl, group: 'tracker', linked });
  ruleset(
    rulesetIds.issueClient,
    'Tracker Issue - Client',
    issueClientRules({
      defaults: { statusRel: statusValue('To Do'), priorityRel: priorityValue('Medium'), typeRel: lookupValue(types.Task) },
      lockedFields: ['summary', 'projectRel', 'typeRel', 'priorityRel', 'assigneeRel', 'storyPointsNum', 'tagsRel', 'description'],
    }),
    [{ documentId: TEMPLATES.issue, name: 'Issue', eventNames: 'preRenderClient | onLoadClient | onFieldChangeClient' }],
  );
  ruleset(
    rulesetIds.issueServer,
    'Tracker Issue - PreSaveServer',
    issueServerRules({
      resolutionByStatusId: {
        [statuses.Done.documentId]: lookupValue(resolutions.Done),
        [statuses["Won't Do"].documentId]: lookupValue(resolutions["Won't Do"]),
      },
    }),
    [{ documentId: TEMPLATES.issue, name: 'Issue', eventNames: 'preSaveServer' }],
  );
  ruleset(
    rulesetIds.boardClient,
    'Tracker Board - Client',
    boardClientRules({
      statusesByName: Object.fromEntries(STATUSES.map((s) => [s.name, statusValue(s.name)])),
      peopleById: Object.fromEntries(Object.keys(people).map((key) => [people[key].documentId, personValue(key)])),
      transitions: TRANSITIONS,
    }),
    [{ documentId: TEMPLATES.board, name: 'Board', eventNames: 'onLoadClient' }],
  );

  // ---------------------------------------------------------------- platform documents
  // The published board, plus the platform's documents and component documents for shared's
  // elements and this repo's.
  const boardComponentId = demoId('component', 'solid-intray-board');
  set.platformDocuments(componentRepos(appRoot), [
    {
      documentId: boardComponentId,
      systemHeader: { systemType: 'component', summaryName: 'solid-intray-board' },
      name: 'solid-intray-board',
      description: 'Kanban board (assignee swimlanes x status columns), published in @formbird/angular-elements.',
      vendorLibrariesRel: [
        SOLID_VENDOR,
        { documentId: boardComponentId, name: 'solid-intray-board', fileName: `${ANGULAR_ELEMENTS_CDN}/solid-elements/solid-intray-board/solid-intray-board.umd.js` },
      ],
    },
  ]);

  set.configuration({ defaultTemplate: TEMPLATES.home, urlRoot });

  // ---------------------------------------------------------------- boards
  for (const [key, id] of Object.entries(boardIds)) {
    const projectName = key === 'all' ? 'All projects' : projects[key].name;
    add({
      documentId: id,
      systemHeader: header({ systemType: 'document', templateId: TEMPLATES.board, summaryName: `${projectName} board`, ...at(seededAt) }),
      projectRel: key === 'all' ? [] : [projectValue(key)],
    });
  }

  // ---------------------------------------------------------------- issues (keys in creation order)
  const ordered = [...ISSUES].sort((a, b) => b.created - a.created || a.summary.localeCompare(b.summary));
  ordered.forEach((spec, index) => {
    const itemRef = `${KEY_PREFIX}-${index + 1}`;
    const created = daysAgo(spec.created, 8 + (index % 9));
    const updated = spec.updated === spec.created ? created : daysAgo(spec.updated, 9 + ((index * 5) % 8));
    const done = STATUSES.find((s) => s.name === spec.status)?.category === 'done';
    const watchers = [...new Set([spec.reporter, spec.assignee, ...(spec.watchers ?? [])].filter(Boolean))];
    add({
      documentId: demoId('issue', itemRef),
      systemHeader: { ...header({ systemType: 'document', templateId: TEMPLATES.issue, summaryName: `${itemRef}: ${spec.summary}`, at: created, by: people[spec.reporter].documentId }), serverUpdatedDate: updated },
      appTags: ['sdms', 'item'],
      itemRef,
      summary: spec.summary,
      description: spec.description,
      projectRel: [projectValue(spec.project)],
      typeRel: [lookupValue(types[spec.type])],
      priorityRel: [priorityValue(spec.priority)],
      statusRel: [statusValue(spec.status)],
      resolutionRel: spec.resolution ? [lookupValue(resolutions[spec.resolution])] : [],
      assigneeRel: spec.assignee ? [personValue(spec.assignee)] : [],
      reporterRel: [personValue(spec.reporter)],
      monitoringRel: watchers.map(personValue),
      tagsRel: (spec.labels ?? []).map((l) => lookupValue(labels[l])),
      storyPointsNum: spec.points ?? null,
      notesCommentsArr: (spec.comments ?? []).map(([by, days, detail], i) => ({
        dataId: demoId('note', `${itemRef}:${i}`),
        detail,
        createdBy: authorValue(by),
        createdDate: daysAgo(days, 11 + i).toISOString(),
      })),
      createdDate: created.toISOString(),
      updatedDate: updated.toISOString(),
      createdByRel: [authorValue(spec.reporter)],
      updatedByRel: [authorValue(spec.assignee ?? spec.reporter)],
      resolvedDate: done ? updated.toISOString() : null,
    });
  });

  add({
    documentId: COUNTER_ID,
    systemHeader: header({ systemType: 'document', templateId: TEMPLATES.counter, summaryName: 'Issue counter', ...at(seededAt) }),
    [COUNTER_FIELD]: ordered.length,
  });

  return {
    documents: set.finish(),
    password: DEMO_PASSWORD,
    people: Object.values(people).map((p) => ({ name: p.name, email: p.email, role: p.admin ? `${p.title}, admin` : p.title })),
    urls: {
      home: `/form/${TEMPLATES.home}`,
      board: `/form/${boardIds.all}`,
      allIssues: `/form/${TEMPLATES.allIssues}`,
      createIssue: `/form/${TEMPLATES.issue}`,
      firstIssue: `/form/${demoId('issue', `${KEY_PREFIX}-1`)}`,
    },
  };
}
