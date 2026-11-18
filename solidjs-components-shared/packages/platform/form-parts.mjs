// Building blocks for an app's template components: Elasticsearch filters as component definitions
// write them, the standard sc-* fields, the solid-* pickers, statuses and tables, panels and page
// headers. The fleet and safety demos build every form and page from these.
//
// Records of an app are tagged `appTags: [app, kind]` (see seed-kit.mjs `appDocuments`), so the
// app-specific parts (lookup filters, the appTags field, lookup and status pickers) come from
// `appParts(app)`.

/** A filter as component definitions write it: single-quoted JSON, rendered with Handlebars first. */
export const q = (request) => JSON.stringify(request).replace(/"/g, "'");

export const term = (field, value) => ({ term: { [field]: value } });
export const terms = (field, values) => ({ terms: { [field]: values } });
export const range = (field, bounds) => ({ range: { [field]: bounds } });
export const exists = (field) => ({ exists: { field } });

/** A bool query: filter clauses, plus must_not, sort and should (at least one). */
export const query = (filter, { mustNot = [], sort, should } = {}) => ({
  ...(sort ? { sort } : {}),
  query: { bool: { filter, ...(mustNot.length ? { must_not: mustNot } : {}), ...(should ? { should, minimum_should_match: 1 } : {}) } },
});

/** Handlebars for the signed-in account and the open document, inside filters. */
export const ME = '{{account.documentId}}';
export const THIS = '{{document.documentId}}';

/** What pickers store besides documentId and name. */
export const LOOKUP_FIELDS = { indexNum: 'indexNum' };
export const STATUS_FIELDS = { color: 'color', statusCategory: 'statusCategory', indexNum: 'indexNum' };
export const PERSON_FIELDS = { email: 'email', accountType: 'accountType' };

/** Every active account, by name. */
export const ACCOUNTS = q(query([term('systemHeader.systemType', 'account')], { mustNot: [term('inactiveBool', true)], sort: [{ 'systemHeader.summaryName': 'asc' }] }));
/** Active accounts of some account types, by name. */
export const accountsOfType = (types) =>
  q(query([term('systemHeader.systemType', 'account'), terms('accountType', types)], { mustNot: [term('inactiveBool', true)], sort: [{ 'systemHeader.summaryName': 'asc' }] }));

// ------------------------------------------------------------------------------------------------
// Fields
// ------------------------------------------------------------------------------------------------

export const panel = (name, label, { collapsed = false } = {}) => [
  { componentName: 'sc-panel-collapse', name, label, fullWidth: true, wrapAction: 'open', wrapHtmlType: 'wrap', wrapClass: 'panel-fb', disableSave: true, wrapPanelCollapsed: collapsed, allowFullBarSelection: true },
  { componentName: 'sc-panel-collapse', name, wrapAction: 'close', wrapHtmlType: 'wrap' },
];
/** Components inside a collapsible panel. */
export const inPanel = (name, label, components, options) => {
  const [open, close] = panel(name, label, options);
  return [open, ...components, close];
};
export const html = (name, markup) => ({ componentName: 'sc-static-html', name, fullWidth: true, disableSave: true, html: markup });
export const text = (name, label, extra = {}) => ({ componentName: 'sc-text-box', name, label, ...extra });
export const number = (name, label, extra = {}) => ({ componentName: 'sc-numeric', name, label, ...extra });
export const date = (name, label, extra = {}) => ({ componentName: 'sc-date-time', name, label, ...extra });
export const check = (name, label, extra = {}) => ({ componentName: 'sc-check-box', name, label, ...extra });
export const dropDown = (name, label, list, extra = {}) => ({ componentName: 'sc-drop-down', name, label, dropDownList: list, ...extra });
export const markdown = (name, label, extra = {}) => ({ componentName: 'sc-markdown', name, label, fullWidth: true, ...extra });
export const person = (name, label, extra = {}) => ({ componentName: 'solid-user-picker', name, label, singleSelection: true, showDropDown: true, filter: ACCOUNTS, relatedFields: PERSON_FIELDS, ...extra });
export const comments = () => ({ componentName: 'solid-comments', name: 'notesCommentsArr', label: 'Activity', fullWidth: true, textEditor: 'markdown', placeholder: 'Add a note…' });

/**
 * A reference number ("BK-12"), assigned on first save by fieldtec-web's Reference No preprocessor.
 * Its format replaces YY, MM and DD with the date, so a prefix must not contain those pairs.
 * @param {string} name - Field name
 * @param {{ id: string, field: string, prefix: string }} counter - Counter document, its field, the prefix
 * @param {string} label
 * @param {Record<string, unknown>} [extra]
 */
export const referenceField = (name, counter, label, extra = {}) => ({
  componentName: 'solid-record-key', name, label, enabled: false, typeField: '',
  type: 'Reference No', counterDocumentId: counter.id, counterFieldName: counter.field, format: `${counter.prefix}-#`, ...extra,
});

export const table = (name, label, request, columns, extra = {}) => ({
  componentName: 'solid-table', name, label, fullWidth: true, disableSave: true, filter: q(request), gridColumns: columns, rowsPerPage: 10, showReload: true, ...extra,
});
/** Text search inside a table: the box's text anywhere in the fields (their case-insensitive `.lcase`). */
export const contains = (field) => ({ wildcard: { [`${field}.lcase`]: { value: '*{{{search}}}*', case_insensitive: true } } });
export const searchBox = (...fields) => q({ bool: { should: fields.map(contains), minimum_should_match: 1 } });

// ------------------------------------------------------------------------------------------------
// Page headers
// ------------------------------------------------------------------------------------------------

export const button = (href, label, primary) =>
  `<a href="${href}" style="display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:8px;font:600 14px/1 system-ui,sans-serif;text-decoration:none;${
    primary ? 'background:#5b47e0;color:#fff' : 'background:#fff;color:#1b1b24;border:1px solid #e2e2ea'
  }">${label}</a>`;
export const pageTitle = (name, title, subtitle, buttons = []) =>
  html(
    name,
    `<div style="font-family:system-ui,sans-serif;padding:2px 0 6px">
  <div style="font-size:24px;font-weight:700;letter-spacing:-.01em">${title}</div>
  ${subtitle ? `<div style="color:#5e5e6d;margin-top:4px">${subtitle}</div>` : ''}
  ${buttons.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">${buttons.join('')}</div>` : ''}
</div>`,
  );

// ------------------------------------------------------------------------------------------------
// One app's records
// ------------------------------------------------------------------------------------------------

/**
 * The parts that know the app's tag.
 * @param {string} app - The first appTags value of every record of the app ("fleet", "whs")
 * @param {{ transitions?: Record<string, Record<string, string[]>> }} [options] - Allowed status moves by status kind
 */
export function appParts(app, { transitions = {} } = {}) {
  /** Filter clauses for the app's documents of a kind. */
  const docs = (kind, ...more) => [term('systemHeader.systemType', 'document'), term('appTags', app), term('appTags', kind), ...more];
  /** Active lookup values of a kind, in order. */
  const lookupFilter = (kind, extra = []) =>
    q(query(docs(kind, ...extra), { mustNot: [term('inactiveBool', true)], sort: [{ indexNum: 'asc' }, { 'systemHeader.summaryName': 'asc' }] }));
  return {
    docs,
    lookupFilter,
    /** The hidden appTags field every form of the app carries. */
    tags: (kind) => ({ componentName: 'sc-static-value', name: 'appTags', value: [app, kind], visible: false }),
    lookup: (name, label, kind, extra = {}) => ({
      componentName: 'solid-lookup-picker', name, label, singleSelection: true, showDropDown: true, iconSet: 'none', filter: lookupFilter(kind), relatedFields: LOOKUP_FIELDS, ...extra,
    }),
    status: (name, label, kind, extra = {}) => ({
      componentName: 'solid-status', name, label, mandatory: true, filter: lookupFilter(kind), relatedFields: STATUS_FIELDS, categoryField: 'statusCategory', transitions: transitions[kind], ...extra,
    }),
  };
}
