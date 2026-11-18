// Component lists for the demo templates. Field names and filters follow SDMS, so the published
// solid-intray-board and SDMS-style rules work on the same data.

import { COUNTER_FIELD, COUNTER_ID, KEY_PREFIX, TEMPLATES } from './model.mjs';

/** Elasticsearch filter for active lookup documents of one kind (SDMS appTags convention). */
export const lookupFilter = (kind) =>
  `{'sort':[{'indexNum':'asc'},{'systemHeader.summaryName':'asc'}],'query':{'bool':{'filter':[{'term':{'systemHeader.systemType':'document'}},{'term':{'appTags':'${kind}'}},{'term':{'appTags':'sdms'}}],'must_not':[{'term':{'inactiveBool':true}}]}}}`;

const PROJECT_FILTER =
  "{'sort':[{'systemHeader.summaryName':'asc'}],'query':{'bool':{'filter':[{'term':{'systemHeader.systemType':'document'}},{'term':{'appTags':'project'}},{'term':{'appTags':'sdms'}}],'must_not':[{'term':{'inactiveBool':true}}]}}}";

/** Until the issue rules narrow it to the project's people. */
const ACCOUNT_FILTER =
  "{'sort':[{'systemHeader.summaryName':'asc'}],'query':{'bool':{'filter':[{'term':{'systemHeader.systemType':'account'}}],'must_not':[{'term':{'inactiveBool':true}}]}}}";

const LOOKUP_FIELDS = { projectRel: 'projectRel', isGlobalDefaultBool: 'isGlobalDefaultBool' };
const PERSON_FIELDS = { email: 'email' };

const staticTags = (...tags) => ({ componentName: 'sc-static-value', name: 'appTags', value: ['sdms', ...tags], visible: false });
// sc-panel-collapse wraps everything between an "open" and a "close" entry with the same name.
const panelOpen = (name, label) => ({
  componentName: 'sc-panel-collapse', name, label, fullWidth: true, wrapAction: 'open', wrapHtmlType: 'wrap',
  wrapClass: 'panel-fb', disableSave: true, wrapPanelCollapsed: false, allowFullBarSelection: true,
});
const panelClose = (name) => ({ componentName: 'sc-panel-collapse', name, wrapAction: 'close', wrapHtmlType: 'wrap' });
const html = (name, markup) => ({ componentName: 'sc-static-html', name, fullWidth: true, disableSave: true, html: markup });

// ------------------------------------------------------------------------------------------------
// Lists (<solid-table>)
// ------------------------------------------------------------------------------------------------

/** Case-insensitive "contains" match on a lower-cased keyword sub-field (strings have `.lcase` in Formbird's index). */
const contains = (field) => `{'wildcard':{'${field}.lcase':{'value':'*{{{search}}}*','case_insensitive':true}}}`;

/**
 * Free-text search of the All issues list: key, summary, description and comments. A plain
 * substring match, so "TRK-12" and "Offline" both work; SDMS's query_string filter splits keys on
 * the hyphen and matches case-sensitive keywords with lower-cased terms.
 */
const SEARCH_BOX = `{'bool':{'should':[${['itemRef', 'summary', 'description', 'notesCommentsArr.detail'].map(contains).join(',')}],'minimum_should_match':1}}`;

/** Columns of an issue list; `wide` adds the ones only All issues shows. Narrow tables drop columns by `responsive`. */
export function issueColumns({ wide = false } = {}) {
  return [
    { displayName: 'Type', field: 'typeRel', type: 'issueType', iconOnly: true },
    // Keys were handed out in creation order, so sort them by creation date rather than as text (TRK-10 < TRK-9).
    { displayName: 'Key', field: 'itemRef', type: 'key', sortField: 'systemHeader.createdDate' },
    { displayName: 'Summary', field: 'summary', link: true },
    { displayName: 'Project', field: 'projectRel', type: 'labels', responsive: { xs: 0, sm: 0, md: 0 } },
    { displayName: 'Status', field: 'statusRel', type: 'status' },
    { displayName: 'Priority', field: 'priorityRel', type: 'priority', responsive: { xs: 0, sm: 0 } },
    { displayName: 'Assignee', field: 'assigneeRel', type: 'user', responsive: { xs: 0 } },
    ...(wide
      ? [
          { displayName: 'Labels', field: 'tagsRel', type: 'labels', responsive: { xs: 0, sm: 0, md: 0 } },
          { displayName: 'Points', field: 'storyPointsNum', type: 'numeric', responsive: { xs: 0, sm: 0, md: 0 } },
        ]
      : []),
    { displayName: 'Updated', field: 'updatedDate', type: 'date', sort: { direction: 'desc', precedence: 1 }, responsive: { xs: 0 } },
  ];
}

const ISSUE_TERMS = "{'term':{'systemHeader.systemType':'document'}},{'term':{'appTags':'item'}},{'term':{'appTags':'sdms'}}";

/** An issue table; `extraFilter` / `mustNot` are ES clauses in the same single-quote JSON style. */
function issueTable(name, label, { extraFilter = '', mustNot = '', rows = 10, wide = false, emptyText }) {
  return {
    componentName: 'solid-table',
    name,
    label,
    fullWidth: true,
    disableSave: true,
    filter: `{'query':{'bool':{'filter':[${ISSUE_TERMS}${extraFilter ? `,${extraFilter}` : ''}]${mustNot ? `,'must_not':[${mustNot}]` : ''}}}}`,
    statusFilter: lookupFilter('status'),
    gridColumns: issueColumns({ wide }),
    rowsPerPage: rows,
    showReload: true,
    emptyText,
    ...(wide ? { showSearch: true, searchPlaceholder: 'Search issues', searchBoxFilter: SEARCH_BOX, exportTypes: ['CSV'] } : {}),
  };
}

// ------------------------------------------------------------------------------------------------
// Templates
// ------------------------------------------------------------------------------------------------

/**
 * Every demo template's components, keyed by template.
 * @param {{ transitions: Record<string,string[]>, doneStatusIds: string[], boardIds: Record<string,string> }} ctx
 */
export function templateComponents({ transitions, doneStatusIds, boardIds }) {
  const notDone = `{'terms':{'statusRel.documentId':${JSON.stringify(doneStatusIds).replace(/"/g, "'")}}}`;
  const button = (href, text, primary) =>
    `<a href="${href}" style="display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:8px;font:600 14px/1 system-ui,sans-serif;text-decoration:none;${
      primary ? 'background:#5b47e0;color:#fff' : 'background:#fff;color:#1b1b24;border:1px solid #e2e2ea'
    }">${text}</a>`;

  return {
    [TEMPLATES.issue]: [
      staticTags('item'),
      {
        componentName: 'solid-record-key', name: 'itemRef', label: 'Key', enabled: false, newText: 'New issue',
        // Built-in ReferenceNoPreprocessor assigns "TRK-n" on first save, whatever the component is called.
        type: 'Reference No', counterDocumentId: COUNTER_ID, counterFieldName: COUNTER_FIELD, format: `${KEY_PREFIX}-#`,
      },
      { componentName: 'solid-issue-summary', name: 'summary', label: 'Summary', mandatory: true, fullWidth: true, maxLength: 255 },
      panelOpen('detailsPanel', 'Details'),
      {
        componentName: 'solid-status', name: 'statusRel', label: 'Status', mandatory: true,
        filter: lookupFilter('status'),
        relatedFields: { ...LOOKUP_FIELDS, disableItemBool: 'disableItemBool', indexNum: 'indexNum' },
        categoryField: 'statusCategory',
        transitions,
        resolution: { fieldName: 'resolutionRel', label: 'Resolution', requiredFor: ['done'], filter: lookupFilter('resolution'), relatedFields: LOOKUP_FIELDS },
      },
      { componentName: 'solid-lookup-picker', name: 'projectRel', label: 'Project', mandatory: true, singleSelection: true, showDropDown: true, iconSet: 'none', filter: PROJECT_FILTER, relatedFields: { projectKey: 'projectKey' } },
      { componentName: 'solid-lookup-picker', name: 'typeRel', label: 'Type', mandatory: true, singleSelection: true, showDropDown: true, filter: lookupFilter('type'), relatedFields: LOOKUP_FIELDS },
      { componentName: 'solid-lookup-picker', name: 'priorityRel', label: 'Priority', singleSelection: true, showDropDown: true, filter: lookupFilter('priority'), relatedFields: { ...LOOKUP_FIELDS, indexNum: 'indexNum' } },
      { componentName: 'solid-user-picker', name: 'assigneeRel', label: 'Assignee', singleSelection: true, showDropDown: true, filter: ACCOUNT_FILTER, relatedFields: PERSON_FIELDS },
      { componentName: 'solid-user-picker', name: 'reporterRel', label: 'Reporter', mandatory: true, singleSelection: true, showDropDown: true, filter: ACCOUNT_FILTER, relatedFields: PERSON_FIELDS },
      { componentName: 'sc-numeric', name: 'storyPointsNum', label: 'Story points' },
      { componentName: 'solid-lookup-picker', name: 'resolutionRel', label: 'Resolution', singleSelection: true, showDropDown: true, filter: lookupFilter('resolution'), relatedFields: LOOKUP_FIELDS },
      { componentName: 'solid-lookup-picker', name: 'tagsRel', label: 'Labels', fullWidth: true, showDropDown: true, filter: lookupFilter('tag'), relatedFields: LOOKUP_FIELDS },
      { componentName: 'solid-user-picker', name: 'monitoringRel', label: 'Watchers', fullWidth: true, showDropDown: false, filter: ACCOUNT_FILTER, relatedFields: PERSON_FIELDS },
      panelClose('detailsPanel'),
      { componentName: 'sc-markdown', name: 'description', label: 'Description', fullWidth: true },
      { componentName: 'solid-comments', name: 'notesCommentsArr', label: 'Activity', fullWidth: true, textEditor: 'markdown', placeholder: 'Add a comment…' },
    ],

    [TEMPLATES.project]: [
      staticTags('project'),
      { componentName: 'sc-text-box', name: 'name', label: 'Project name', mandatory: true },
      { componentName: 'sc-text-box', name: 'projectKey', label: 'Key', mandatory: true, maxLength: 5 },
      { componentName: 'solid-user-picker', name: 'leadRel', label: 'Project lead', singleSelection: true, showDropDown: true, filter: ACCOUNT_FILTER, relatedFields: PERSON_FIELDS },
      { componentName: 'sc-drop-down', name: 'configStatus', label: 'Board statuses', dropDownList: ['Global Default', 'Project Specific', 'Combined'] },
      { componentName: 'sc-markdown', name: 'description', label: 'About', fullWidth: true },
      issueTable('projectIssuesDt', 'Issues', { extraFilter: "{'term':{'projectRel.documentId':'{{document.documentId}}'}}", rows: 15, emptyText: 'No issues in this project yet.' }),
      {
        componentName: 'solid-table', name: 'projectTeamDt', label: 'Team', fullWidth: true, disableSave: true, rowsPerPage: 10,
        filter: "{'query':{'bool':{'filter':[{'term':{'systemHeader.systemType':'account'}},{'term':{'sdmsProjectRel.documentId':'{{document.documentId}}'}}]}}}",
        gridColumns: [
          { displayName: 'Name', field: 'systemHeader.summaryName', type: 'user', sort: { direction: 'asc' } },
          { displayName: 'Role', field: 'jobTitle' },
          { displayName: 'Email', field: 'email', type: 'email', responsive: { xs: 0 } },
        ],
      },
    ],

    [TEMPLATES.board]: [
      html('boardIntro', "<div style='font:14px/1.5 system-ui,sans-serif;color:#5e5e6d'>Drag a card to another column to change its status, or to another person to reassign it. Issues without an assignee don't appear on the board.</div>"),
      { componentName: 'solid-lookup-picker', name: 'projectRel', label: 'Project', singleSelection: true, showDropDown: true, iconSet: 'none', filter: PROJECT_FILTER, relatedFields: { projectKey: 'projectKey' }, enabled: false },
      { componentName: 'solid-intray-board', name: 'board', fullWidth: true, disableSave: true },
    ],

    [TEMPLATES.home]: [
      html(
        'welcome',
        `<div style="font-family:system-ui,sans-serif;padding:2px 0 6px">
  <div style="font-size:24px;font-weight:700;letter-spacing:-.01em">Your work</div>
  <div style="color:#5e5e6d;margin-top:4px">What's assigned to you, what you reported, and what changed recently across Mobile App, Web Platform and Customer Support.</div>
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">${button(`/form/${TEMPLATES.issue}`, '+ Create issue', true)}${button(`/form/${boardIds.all}`, 'Board')}${button(`/form/${TEMPLATES.allIssues}`, 'All issues')}</div>
</div>`,
      ),
      issueTable('assignedToMeDt', 'Assigned to me', { extraFilter: "{'term':{'assigneeRel.documentId':'{{account.documentId}}'}}", mustNot: notDone, emptyText: 'Nothing assigned to you. Nice.' }),
      issueTable('reportedByMeDt', 'Reported by me', { extraFilter: "{'term':{'reporterRel.documentId':'{{account.documentId}}'}}", mustNot: notDone, emptyText: 'Nothing open that you reported.' }),
      issueTable('watchingDt', 'Watching', { extraFilter: "{'term':{'monitoringRel.documentId':'{{account.documentId}}'}}", emptyText: "You aren't watching any issues." }),
      issueTable('recentDt', 'Recently updated', { emptyText: 'No issues yet.' }),
    ],

    [TEMPLATES.allIssues]: [
      html('allIssuesTitle', "<div style='font:700 24px/1.3 system-ui,sans-serif;letter-spacing:-.01em'>All issues</div>"),
      issueTable('allIssuesDt', 'Issues', { rows: 25, wide: true, emptyText: 'No issues yet.' }),
    ],

    [TEMPLATES.counter]: [{ componentName: 'sc-numeric', name: COUNTER_FIELD, label: 'Last issue number' }],

    ...lookupTemplates(),
  };
}

/** Admin pages for each lookup kind: the editor fields plus a list of every value. */
function lookupTemplates() {
  const list = (kind, label, extraColumns = []) => ({
    componentName: 'solid-table', name: 'allDocsDt', label, fullWidth: true, disableSave: true, rowsPerPage: 25,
    filter: `{'query':{'bool':{'filter':[{'term':{'systemHeader.systemType':'document'}},{'term':{'appTags':'${kind}'}},{'term':{'appTags':'sdms'}}]}}}`,
    gridColumns: [
      { displayName: 'Name', field: 'systemHeader.summaryName', link: true },
      ...extraColumns,
      { displayName: 'Order', field: 'indexNum', type: 'numeric', sort: { direction: 'asc' } },
      { displayName: 'Inactive', field: 'inactiveBool', type: 'boolean' },
    ],
  });
  const base = (kind) => [
    staticTags(kind),
    { componentName: 'sc-text-box', name: 'nameId', label: 'Name', mandatory: true },
    { componentName: 'sc-numeric', name: 'indexNum', label: 'Order' },
  ];
  const flags = [
    { componentName: 'sc-check-box', name: 'isGlobalDefaultBool', label: 'Available in every project' },
    { componentName: 'sc-check-box', name: 'inactiveBool', label: 'Inactive' },
  ];
  return {
    [TEMPLATES.status]: [
      ...base('status'),
      { componentName: 'sc-text-box', name: 'color', label: 'Colour (CSS)' },
      { componentName: 'sc-drop-down', name: 'statusCategory', label: 'Category', dropDownList: ['todo', 'inprogress', 'done'] },
      { componentName: 'sc-check-box', name: 'disableItemBool', label: 'Issues in this status are read-only' },
      ...flags,
      list('status', 'All statuses', [
        { displayName: 'Colour', field: 'color', type: 'color' },
        { displayName: 'Category', field: 'statusCategory' },
      ]),
    ],
    [TEMPLATES.type]: [...base('type'), ...flags, list('type', 'All issue types')],
    [TEMPLATES.priority]: [...base('priority'), ...flags, list('priority', 'All priorities')],
    [TEMPLATES.resolution]: [...base('resolution'), ...flags, list('resolution', 'All resolutions')],
    [TEMPLATES.tag]: [...base('tag'), ...flags, list('tag', 'All labels')],
  };
}
