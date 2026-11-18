// Browser test of solidjs-components-shared's BUILT elements on an SDMS-like issue, a list page and
// the comment thread, against the in-memory host (packages/testing). Run: pnpm test:browser.
// The harness (packages/tools/browser-test.mjs) loads the bundles the way fieldtec-web does and adds
// the registration, version and console checks.

import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const FIELDS = ['itemRef', 'statusRel', 'typeRel', 'priorityRel', 'assigneeRel', 'tagsRel', 'monitoringRel', 'resolutionRel', 'notesCommentsArr'];
const runtime = process.env.SOLID_RUNTIME ? '/__runtime__.js' : '/shared/dist-dev/solid-runtime/solid-runtime.js';

// PNG files made here, for uploads and for what fieldtec-web's api/getFile serves.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const pngChunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
/** A PNG with a vertical gradient: opaque RGB, or RGBA with every pixel at `alpha`. */
function png(width, height, alpha) {
  const channels = alpha === undefined ? 3 : 4;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const line = Buffer.alloc(1 + width * channels);
    const r = Math.round(40 + (180 * y) / height);
    const b = Math.round(220 - (160 * y) / height);
    for (let x = 0; x < width; x++) {
      const o = 1 + x * channels;
      line[o] = r;
      line[o + 1] = 120;
      line[o + 2] = b;
      if (channels === 4) line[o + 3] = alpha;
    }
    rows.push(line);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(Buffer.concat(rows))), pngChunk('IEND', Buffer.alloc(0))]);
}

export default {
  components: ['solid-record-key', 'solid-status', 'solid-lookup-picker', 'solid-user-picker', 'solid-table', 'solid-comments', 'solid-photo-capture', 'solid-image-pins'],

  hostSetup: `const f = T.fixtures;
  const incidentCopy = (documentId, values) => Object.assign(structuredClone(f.incident), { documentId }, values || {});
  window.host = T.installMockHost({
    documents: f.documents,
    forms: [f.issue, f.newIssue, f.listPage, f.incident, incidentCopy('incident-max'), incidentCopy('incident-files', { photosArr: [] }), incidentCopy('incident-readonly'), f.photoReference, f.pdfReference],
    currentAccountId: f.CURRENT_ACCOUNT_ID,
  });`,

  body: '<div id="issue"></div><div id="new"></div><div id="lists" style="width:1100px"></div><div id="whs" style="width:760px"></div>',

  pageScript: `
  const make = (field, documentId, extra) => {
    const def = Object.assign(f.definitionFor(field), extra || {});
    const el = T.createFormElement(def.componentName, { document: Object.assign(host.form(documentId), { documentId }), template: f.issueTemplate, componentDefinition: def });
    el.id = (documentId === f.ISSUE_ID ? 'i-' : 'n-') + field;
    return el;
  };
  ${JSON.stringify(FIELDS)}.forEach((field) => document.getElementById('issue').appendChild(make(field, f.ISSUE_ID)));
  ['itemRef', 'statusRel', 'assigneeRel'].forEach((field) => document.getElementById('new').appendChild(make(field, f.newIssue.documentId)));
  f.listTemplate.components.forEach((def) => {
    const el = T.createFormElement(def.componentName, { document: Object.assign(host.form(f.listPage.documentId), { documentId: f.listPage.documentId }), template: f.listTemplate, componentDefinition: structuredClone(def) });
    el.id = 't-' + def.name;
    document.getElementById('lists').appendChild(el);
  });
  // Photos and pins: an incident, copies of it, and fieldtec-web's file reference documents.
  const place = (template, field, documentId, id, extra) => {
    const def = Object.assign(f.definitionFor(field, template), extra || {});
    const el = T.createFormElement(def.componentName, { document: Object.assign(host.form(documentId), { documentId }), template, componentDefinition: def });
    el.id = id;
    document.getElementById('whs').appendChild(el);
  };
  place(f.incidentTemplate, 'photosArr', f.INCIDENT_ID, 'photos-edit');
  place(f.incidentTemplate, 'photosArr', f.INCIDENT_ID, 'photos-view', { mode: 'view' });
  place(f.incidentTemplate, 'photosArr', 'incident-max', 'photos-max', { maxPhotos: 4 });
  place(f.incidentTemplate, 'photosArr', 'incident-files', 'photos-files', { allowFiles: true, label: 'Attachments' });
  place(f.fileReferenceTemplate, 'fileDetails', 'fileref-photo', 'photos-ref-photo');
  place(f.fileReferenceTemplate, 'fileDetails', 'fileref-pdf', 'photos-ref-pdf');
  place(f.incidentTemplate, 'injuryPinsArr', f.INCIDENT_ID, 'pins-body');
  place(f.incidentTemplate, 'injuryPinsArr', 'incident-readonly', 'pins-readonly', { readOnly: true });
  place(f.incidentTemplate, 'defectPinsArr', f.INCIDENT_ID, 'pins-plan', { maxPins: 3 });`,

  // fieldtec-web serves stored files at api/getFile/<fileNo>; here every one is a small PNG.
  async prepare(context) {
    const picture = png(96, 72);
    await context.route('**/api/getFile/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: picture }));
  },

  // A page whose kit is older than the components (what a stale service-worker cache serves): the
  // real kit minus a function <solid-table> uses. The table must explain itself instead of rendering nothing.
  extraPages: {
    'stale.html': `<!doctype html>
<html><head><meta charset="utf-8"><title>stale kit</title><link rel="icon" href="data:,">
<script src="${runtime}"></script>
<script src="/shared/dist/solidjs-components-kit/solidjs-components-kit.js"></script>
<script>
  window.SolidJsComponentsKit = Object.fromEntries(Object.entries(SolidJsComponentsKit).filter(([name]) => name !== 'searchPage'));
</script>
<script src="/shared/dist/solid-table/solid-table.js"></script>
</head><body><solid-table id="stale"></solid-table></body></html>`,
  },

  async run({ tab, context, origin, check, eq, section, waitIdle, lastChange, changeCount, optionLabels }) {
    let change;
    let before;
    const sheets = await tab.evaluate(() => {
      const a = document.querySelector('#i-statusRel').shadowRoot;
      const b = document.querySelector('#i-assigneeRel').shadowRoot;
      return { a: a.adoptedStyleSheets.length, b: b.adoptedStyleSheets.length, shared: a.adoptedStyleSheets[0] === b.adoptedStyleSheets[0] };
    });
    check('kit stylesheet is one CSSStyleSheet shared by every shadow root', sheets.shared && sheets.a === 2 && sheets.b === 1, JSON.stringify(sheets));

    section('Record key');
    check('shows prefix + number', (await tab.locator('#i-itemRef .rk-key').textContent()) === 'SDMS-482');
    check('shows the issue type icon from typeRel', (await tab.locator('#i-itemRef svg.sj-type-icon title').textContent()) === 'Bug');
    await tab.locator('#i-itemRef .rk-copy').click();
    await waitIdle();
    check('copy button copies the document URL', (await tab.evaluate(() => navigator.clipboard.readText())) === `${origin}/form/issue-sdms-482`);
    check('copy button confirms', (await tab.locator('#i-itemRef .rk-copy').getAttribute('title')) === 'Copied');
    check('new document shows newText ("New issue")', (await tab.locator('#n-itemRef .rk-pending').textContent()) === 'New issue');

    section('Status');
    check('colour comes from the status document', (await tab.locator('#i-statusRel .st-button').getAttribute('style'))?.includes('#3e63dd'));
    await tab.locator('#i-statusRel .st-button').click();
    await waitIdle();
    check('only the template transitions from In Progress are offered', eq(await optionLabels('i-statusRel'), ['Assigned', 'In Review', 'Resolved']), JSON.stringify(await optionLabels('i-statusRel')));
    await tab.locator('#i-statusRel li[role=option][aria-label="In Review"]').click();
    await waitIdle();
    change = await lastChange();
    check('choosing a status writes it with relatedFields', change?.fieldName === 'statusRel' && eq(change.value, [{ documentId: 'status-in-review', name: 'In Review', projectRel: [], isGlobalDefaultBool: true, disableItemBool: false, indexNum: 50 }]), JSON.stringify(change));
    check('button shows the new status', (await tab.locator('#i-statusRel .st-text').textContent()) === 'In Review');
    await tab.locator('#i-statusRel .st-button').click();
    await waitIdle();
    await tab.locator('#i-statusRel li[role=option][aria-label="Resolved"]').click();
    await waitIdle();
    check('a "done" status asks for a resolution first', (await tab.locator('#i-statusRel .st-step').count()) === 1 && (await changeCount()) > 0);
    before = await changeCount();
    await tab.locator('#i-statusRel li[role=option]', { hasText: 'Fixed' }).click();
    await waitIdle();
    const pair = await tab.evaluate(() => host.changes.slice(-2).map((c) => [c.fieldName, c.value.map((v) => v.name)]));
    check('resolution writes status and resolution together', eq(pair, [['statusRel', ['Resolved']], ['resolutionRel', ['Fixed']]]), JSON.stringify(pair));
    check('resolution picker reflects the other field', (await tab.locator('#i-resolutionRel .sj-trigger__value').textContent()).includes('Fixed'));
    await tab.locator('#i-statusRel .st-button').click();
    await waitIdle();
    await tab.locator('#i-statusRel li[role=option][aria-label="In Progress"]').click();
    await waitIdle();
    const reopen = await tab.evaluate(() => host.changes.slice(-2).map((c) => [c.fieldName, c.value.map((v) => v.name)]));
    check('reopening clears the resolution', eq(reopen, [['statusRel', ['In Progress']], ['resolutionRel', []]]), JSON.stringify(reopen));
    await tab.evaluate(() => host.setField(SolidJsComponentsTesting.fixtures.ISSUE_ID, 'statusRel', [{ documentId: 'status-closed', name: 'Closed' }]));
    await waitIdle();
    check('external change (ruleset) updates the button', (await tab.locator('#i-statusRel .st-text').textContent()) === 'Closed');
    check('invalid/empty status colour falls back to the category colour', (await tab.locator('#i-statusRel .st-button').getAttribute('style'))?.includes('#2f9e5b'));
    await tab.evaluate(() => host.updateDefinition(SolidJsComponentsTesting.fixtures.issueTemplate.documentId, 'statusRel', { enabled: false }));
    await waitIdle();
    await tab.locator('#i-statusRel .st-button').click({ force: true, timeout: 2000 });
    await waitIdle();
    check('ruleset enabled:false makes it read-only', (await tab.locator('#i-statusRel .st-button').getAttribute('aria-disabled')) === 'true' && (await tab.locator('#i-statusRel li[role=option]').count()) === 0);

    section('Lookup picker');
    await tab.locator('#i-priorityRel .sj-trigger').click();
    await waitIdle();
    check('priority options in indexNum order, with "None" to clear', eq(await optionLabels('i-priorityRel'), ['None', 'Immediate', 'Urgent', 'High', 'Normal', 'Low']), JSON.stringify(await optionLabels('i-priorityRel')));
    await tab.locator('#i-priorityRel li[role=option]', { hasText: 'Urgent' }).click();
    await waitIdle();
    change = await lastChange();
    check('single pick writes [{documentId, name, ...relatedFields}] and closes', change?.fieldName === 'priorityRel' && eq(change.value, [{ documentId: 'priority-urgent', name: 'Urgent', projectRel: [], isGlobalDefaultBool: true, indexNum: 20 }]) && (await tab.locator('#i-priorityRel li[role=option]').count()) === 0, JSON.stringify(change));
    await tab.locator('#i-typeRel .sj-trigger').click();
    await tab.locator('#i-typeRel input[role=combobox]').fill('feat');
    await tab.waitForTimeout(500);
    check('type-ahead narrows results', eq(await optionLabels('i-typeRel'), ['New Feature']), JSON.stringify(await optionLabels('i-typeRel')));
    const lastSearch = await tab.evaluate(() => JSON.stringify(host.searches.at(-1)));
    check('type-ahead adds the summaryName wildcard like sc-related-document', lastSearch.includes('"systemHeader.summaryName.lcase":"*feat*"'));
    await tab.keyboard.press('Escape');
    await tab.locator('#i-tagsRel .sj-add-btn').click();
    await waitIdle();
    await tab.locator('#i-tagsRel li[role=option]', { hasText: 'performance' }).click();
    await waitIdle();
    check('multi pick adds and keeps the list open', eq((await lastChange())?.value.map((v) => v.name), ['frontend', 'regression', 'performance']) && (await tab.locator('#i-tagsRel li[role=option]').count()) > 0);
    await tab.keyboard.press('Escape');
    await tab.locator('#i-tagsRel .sj-chip', { hasText: 'frontend' }).locator('.sj-chip__remove').click();
    await waitIdle();
    check('chip remove button removes the value', eq((await lastChange())?.value.map((v) => v.name), ['regression', 'performance']));

    section('User picker');
    await tab.locator('#i-assigneeRel .sj-trigger').click();
    await waitIdle();
    const people = await optionLabels('i-assigneeRel');
    check('"Assign to me" first; inactive and other-app accounts filtered out', people[0] === 'Assign to me' && !people.includes('Diego Alvarez') && !people.includes('Erin External'), JSON.stringify(people));
    const assigneeSearch = await tab.evaluate(() => JSON.stringify(host.searches.at(-1)));
    check('Handlebars in the filter rendered against the document', assigneeSearch.includes('"sdmsProjectRel.documentId":"project-sdms"'));
    await tab.locator('#i-assigneeRel li[role=option][data-key="__me"]').click();
    await waitIdle();
    change = await lastChange();
    check('"Assign to me" writes the signed-in account with relatedFields', change?.fieldName === 'assigneeRel' && eq(change.value, [{ documentId: 'account-alex', name: 'Alex Morgan', email: 'alex.morgan@example.com' }]), JSON.stringify(change));
    before = await tab.evaluate(() => host.searches.length);
    await tab.locator('#i-monitoringRel .sj-add-btn').click();
    await waitIdle();
    check('showDropDown:false waits for typing (no search, hint shown)', (await tab.evaluate(() => host.searches.length)) === before && (await tab.locator('#i-monitoringRel .sj-listbox__status').textContent()).includes('Type to search'));
    await tab.locator('#i-monitoringRel input[role=combobox]').fill('han');
    await tab.waitForTimeout(500);
    await tab.keyboard.press('ArrowDown');
    await tab.keyboard.press('Enter');
    await waitIdle();
    check('keyboard: type, arrow, Enter adds a watcher', eq((await lastChange())?.value.map((v) => v.name), ['Mei Chen', 'Hana Kobayashi']), JSON.stringify(await lastChange()));
    await tab.keyboard.press('Escape');
    await tab.evaluate(() =>
      host.updateDefinition(SolidJsComponentsTesting.fixtures.issueTemplate.documentId, 'assigneeRel', {
        filter: { query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'account' } }, { term: { documentId: 'account-tom' } }] } } },
      }),
    );
    await waitIdle();
    await tab.locator('#i-assigneeRel .sj-trigger').click();
    await waitIdle();
    check('ruleset setFilter (object filter) takes effect', eq((await optionLabels('i-assigneeRel')).filter((l) => !['Assign to me', 'Unassigned'].includes(l)), ['Tom Becker']), JSON.stringify(await optionLabels('i-assigneeRel')));
    await tab.keyboard.press('Escape');

    section('Table');
    const all = '#t-allItemsDt';
    const lastAllSearch = () =>
      tab.evaluate(() =>
        host.searches
          .filter((s) => {
            const filter = JSON.stringify(s.filter);
            return filter.includes('"appTags":"item"') && filter.includes('"appTags":"sdms"');
          })
          .at(-1),
      );
    const range = (id) => tab.locator(`${id} .tb-range`).textContent();
    const cellTexts = (id, type) => tab.locator(`${id} tbody tr .tb-td--${type}`).allTextContents();
    await tab.waitForFunction(() => document.querySelector('#t-allItemsDt')?.shadowRoot?.querySelectorAll('tbody tr.tb-row').length > 0);
    await waitIdle();
    check(
      'first page: 10 of 25 rows, most recently updated first',
      (await tab.locator(`${all} tbody tr.tb-row`).count()) === 10 && (await range(all)) === '1–10 of 25' && (await cellTexts(all, 'key'))[0] === 'SDMS-482',
      JSON.stringify({ range: await range(all), keys: await cellTexts(all, 'key') }),
    );
    let request = await lastAllSearch();
    check(
      'sort comes from the column definition, with a tie-breaker; page and exact total requested',
      eq(request.filter.sort, [{ updatedDate: { order: 'desc', unmapped_type: 'date' } }, { documentId: { order: 'asc', unmapped_type: 'keyword' } }]) &&
        request.page === 0 &&
        request.pageSize === 10 &&
        request.trackTotalHits === true,
      JSON.stringify(request),
    );
    check("status lozenges take the status documents' colours", (await tab.locator(`${all} tbody tr`).first().locator('.sj-lozenge').getAttribute('style'))?.includes('#3e63dd'));
    const summaryHeader = tab.locator(`${all} th`, { hasText: 'Summary' }).locator('button');
    await summaryHeader.click();
    await waitIdle();
    request = await lastAllSearch();
    check(
      'clicking a header sorts by it on the server, case-insensitively',
      eq(request.filter.sort[0], { 'summary.lcase': { order: 'asc', unmapped_type: 'keyword' } }) &&
        (await cellTexts(all, 'text'))[0] === 'Add dark theme to the template editor' &&
        (await tab.locator(`${all} th[aria-sort="ascending"]`).textContent()) === 'Summary',
      JSON.stringify(request.filter.sort),
    );
    await summaryHeader.click();
    await waitIdle();
    check('clicking it again reverses the order', (await lastAllSearch()).filter.sort[0]['summary.lcase'].order === 'desc');
    await tab.locator(`${all} button[aria-label="Next page"]`).click();
    await waitIdle();
    request = await lastAllSearch();
    check('next page asks the server for page 2', request.page === 1 && (await range(all)) === '11–20 of 25', JSON.stringify({ page: request.page, range: await range(all) }));
    await tab.locator(`${all} input[type=search]`).fill('C++');
    await tab.waitForTimeout(600);
    request = await lastAllSearch();
    const clause = request.filter.query.bool.filter.at(-1);
    check(
      'search uses searchBoxFilter with the text escaped, from page 1',
      clause.bool?.should?.[1]?.wildcard?.['summary.lcase']?.value === '*C\\+\\+*' && request.page === 0,
      JSON.stringify(clause),
    );
    check('search narrows the rows', eq(await cellTexts(all, 'text'), ['Support C++ code blocks in comments']), JSON.stringify(await cellTexts(all, 'text')));
    await tab.locator(`${all} input[type=search]`).fill('zzzz');
    await tab.waitForTimeout(600);
    check('no match shows an empty state', (await tab.locator(`${all} .sj-empty`).textContent()).includes('Nothing matches “zzzz”'));
    await tab.locator(`${all} input[type=search]`).fill('');
    await tab.waitForTimeout(600);
    await tab.locator(`${all} tbody tr`).nth(1).locator('.tb-td--status').click();
    await waitIdle();
    let event = await tab.evaluate(() => host.events.at(-1));
    check('clicking a row opens its document through the router', event?.type === 'navigate' && /^\/form\/issue-sdms-\d+$/.test(event.detail), JSON.stringify(event));
    const keyLink = tab.locator(`${all} tbody tr .tb-key`).first();
    const keyHref = await keyLink.getAttribute('href');
    await keyLink.click();
    await waitIdle();
    event = await tab.evaluate(() => host.events.at(-1));
    check('key cells are real links, opened in-app', event?.type === 'navigate' && event.detail === keyHref && tab.url() === `${origin}/`, JSON.stringify({ event, keyHref, url: tab.url() }));
    const [download] = await Promise.all([tab.waitForEvent('download'), tab.locator(`${all} button`, { hasText: 'Export CSV' }).click()]);
    const csv = readFileSync(await download.path(), 'utf8').replace(/^﻿/, '').split('\r\n');
    check(
      'CSV export: the visible columns and every matching row',
      download.suggestedFilename() === 'all-issues.csv' && csv[0] === 'Type,Key,Summary,Status,Priority,Assignee,Labels,Updated' && csv.length === 26,
      JSON.stringify({ name: download.suggestedFilename(), header: csv[0], lines: csv.length }),
    );
    const mine = '#t-assignedToMeDt';
    check(
      '{{account.documentId}} in a filter is the signed-in user',
      (await tab.evaluate(() => host.searches.some((s) => JSON.stringify(s.filter).includes('"assigneeRel.documentId":"account-alex"')))) &&
        eq(await cellTexts(mine, 'key'), ['SDMS-460', 'SDMS-478']),
      JSON.stringify(await cellTexts(mine, 'key')),
    );
    await tab.evaluate(() =>
      host.updateDefinition(SolidJsComponentsTesting.fixtures.listTemplate.documentId, 'peopleDt', {
        filter: { query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'account' } }, { term: { documentId: 'account-tom' } }] } } },
      }),
    );
    await waitIdle();
    check('ruleset setFilter (object filter) reloads the table', eq(await cellTexts('#t-peopleDt', 'text'), ['Tom Becker']), JSON.stringify(await cellTexts('#t-peopleDt', 'text')));
    await tab.evaluate(() => (document.getElementById('lists').style.width = '900px'));
    await waitIdle();
    const narrow = await tab.locator(`${all} th`).allTextContents();
    await tab.evaluate(() => (document.getElementById('lists').style.width = '1100px'));
    await waitIdle();
    const wide = await tab.locator(`${all} th`).allTextContents();
    check("columns drop by the table's own width (responsive)", !narrow.includes('Labels') && narrow.includes('Priority') && wide.includes('Labels'), JSON.stringify({ narrow, wide }));

    section('Comments');
    const cm = '#i-notesCommentsArr';
    const notesNow = async () => (await lastChange()).value;
    check(
      'notes newest first, with their authors',
      eq(await tab.locator(`${cm} .cm-note > .cm-main > .cm-meta .cm-author`).allTextContents(), ['Sam Okafor', 'Alex Morgan', 'Priya Natarajan']),
    );
    check(
      'Markdown is rendered: bold, lists, external links',
      (await tab.locator(`${cm} .cm-note strong`, { hasText: 'Chrome 131' }).count()) === 1 &&
        (await tab.locator(`${cm} .cm-note .sj-markdown ol li`).count()) === 2 &&
        (await tab.locator(`${cm} a[href="https://example.com/statuses"]`).getAttribute('rel')) === 'noopener noreferrer',
    );
    check(
      'pasted HTML and script links stay text',
      await tab.evaluate(() => {
        const root = document.querySelector('#i-notesCommentsArr').shadowRoot;
        return !root.querySelector('img, a[href^="javascript"]') && window.__xss === undefined && root.textContent.includes('<img src=x onerror=');
      }),
    );
    check('only the signed-in author can edit', (await tab.locator(`${cm} .cm-action`, { hasText: 'Edit' }).count()) === 1);
    await tab.locator(`${cm} .cm-prompt`).click();
    await waitIdle();
    await tab.keyboard.type('Fixed in **2.4.1**');
    await tab.keyboard.press('Control+Enter');
    await waitIdle();
    change = await lastChange();
    const added = change?.value?.at(-1);
    check(
      'adding a comment writes an sc-note-comment entry',
      change?.fieldName === 'notesCommentsArr' &&
        change.value.length === 4 &&
        typeof added.dataId === 'string' &&
        added.detail === 'Fixed in **2.4.1**' &&
        eq(added.createdBy, { documentId: 'account-alex', name: 'Alex Morgan' }) &&
        !Number.isNaN(Date.parse(added.createdDate)),
      JSON.stringify(added),
    );
    const newest = tab.locator(`${cm} .cm-note`).first();
    check('it shows first, rendered, marked "Not saved yet"', (await newest.locator('strong').textContent()) === '2.4.1' && (await newest.locator('.cm-unsaved').count()) === 1);
    await tab.locator(`${cm} .cm-note`, { hasText: 'Reproduced on' }).locator('.cm-action', { hasText: 'Reply' }).click();
    await waitIdle();
    await tab.keyboard.type('Also on Safari.');
    await tab.keyboard.press('Control+Enter');
    await waitIdle();
    const priyaNote = (await notesNow()).find((n) => n.dataId === 'note-priya');
    check('a reply goes under its note', eq(priyaNote.comments.map((c) => c.detail), ['Same on Edge.', 'Also on Safari.']), JSON.stringify(priyaNote.comments));
    await tab.locator(`${cm} .cm-note`, { hasText: 'shared status cache' }).locator('.cm-action', { hasText: 'Edit' }).click();
    await waitIdle();
    await tab.keyboard.type(' Done.');
    await tab.keyboard.press('Control+Enter');
    await waitIdle();
    const edited = (await notesNow()).find((n) => n.dataId === 'note-alex');
    check(
      'editing keeps the old text in notesHistory and the author in createdBy',
      edited.detail.endsWith('/statuses Done.') &&
        edited.notesHistory?.[0]?.detail.startsWith('A shared status cache') &&
        edited.createdBy.name === 'Alex Morgan' &&
        edited.modifiedBy?.name === 'Alex Morgan' &&
        (await tab.locator(`${cm} .cm-edited`).count()) === 1,
      JSON.stringify(edited),
    );
    const samNoteEl = tab.locator(`${cm} .cm-note`, { hasText: 'From the customer' });
    await samNoteEl.locator('.cm-vote[title="Thumbs up"]').click();
    await waitIdle();
    let samNote = (await notesNow()).find((n) => n.dataId === 'note-sam');
    const votedOnce = samNote.thumbsUp === 1 && samNote.votes.length === 1 && (await samNoteEl.locator('.cm-vote[aria-pressed="true"]').count()) === 1;
    await samNoteEl.locator('.cm-vote[title="Thumbs up"]').click();
    await waitIdle();
    samNote = (await notesNow()).find((n) => n.dataId === 'note-sam');
    check('thumbs up toggles the vote and keeps thumbsUp in step', votedOnce && samNote.thumbsUp === 0 && samNote.votes.length === 0, JSON.stringify(samNote));
    before = await changeCount();
    await tab.locator(`${cm} .cm-prompt`).click();
    await waitIdle();
    await tab.keyboard.type('never mind');
    await tab.keyboard.press('Escape');
    await waitIdle();
    check('Escape discards a draft without writing', (await changeCount()) === before && (await tab.locator(`${cm} .cm-prompt`).count()) === 1);
    check('changes stay marked until the document is saved', (await tab.locator(`${cm} .cm-unsaved`).count()) >= 3);
    await tab.evaluate(() => host.saveForm(SolidJsComponentsTesting.fixtures.ISSUE_ID));
    await waitIdle();
    check("the host's save broadcast clears the marks", (await tab.locator(`${cm} .cm-unsaved`).count()) === 0);
    await tab.evaluate(() => host.updateDefinition(SolidJsComponentsTesting.fixtures.issueTemplate.documentId, 'notesCommentsArr', { enabled: false }));
    await waitIdle();
    check(
      'ruleset enabled:false leaves the thread read-only',
      (await tab.locator(`${cm} .cm-prompt`).count()) === 0 && (await tab.locator(`${cm} .cm-action`).count()) === 0 && (await tab.locator(`${cm} .cm-note`).count()) === 4,
    );

    section('Photo capture');
    const INC = 'incident-slip-aisle-4';
    const PE = '#photos-edit';
    const fieldChanges = (documentId, fieldName) => tab.evaluate(([d, n]) => host.changes.filter((c) => c.documentId === d && c.fieldName === n), [documentId, fieldName]);
    const lastOf = async (documentId, fieldName) => (await fieldChanges(documentId, fieldName)).at(-1);
    const uploadEvents = () => tab.evaluate(() => host.events.filter((e) => e.type === 'upload').map((e) => e.detail));
    const waitForUploads = (count) => tab.waitForFunction((n) => host.events.filter((e) => e.type === 'upload').length >= n, count, { timeout: 15000 });
    const waitForChanges = (documentId, fieldName, count) =>
      tab.waitForFunction(([d, n, c]) => host.changes.filter((x) => x.documentId === d && x.fieldName === n).length >= c, [documentId, fieldName, count], { timeout: 15000 });
    const shown = (selector) =>
      tab.evaluate((sel) => {
        const [host, inner] = sel.split(' ');
        return [...document.querySelector(host).shadowRoot.querySelectorAll(inner)].filter((img) => img.complete && img.naturalWidth > 0).length;
      }, selector);
    const uploadInput = (sel) => tab.locator(`${sel} input[type=file][multiple]`);
    const lightbox = (sel) =>
      tab.evaluate((s) => {
        const root = document.querySelector(s).shadowRoot;
        const dialog = root.querySelector('dialog');
        return {
          open: dialog.open,
          role: dialog.getAttribute('role'),
          modal: dialog.getAttribute('aria-modal'),
          counter: dialog.querySelector('.pc-lb__counter')?.textContent ?? '',
          name: dialog.querySelector('.pc-lb__name')?.textContent ?? '',
          focusInside: dialog.contains(root.activeElement),
          image: dialog.querySelector('.pc-lb__img')?.getAttribute('alt') ?? null,
          caption: dialog.querySelector('.pc-lb__caption-field input')?.value ?? null,
          taken: dialog.querySelector('.pc-lb__row .pc-lb__muted')?.textContent ?? '',
          download: dialog.querySelector('a[download]')?.getAttribute('href') ?? null,
          deleteButtons: dialog.querySelectorAll('.pc-lb__delete').length,
        };
      }, sel);

    await tab.waitForFunction(() => {
      const root = document.querySelector('#photos-edit').shadowRoot;
      return [...root.querySelectorAll('.pc-thumb__img')].filter((img) => img.complete && img.naturalWidth > 0).length === 3;
    });
    check(
      'stored photos show as thumbnails from api/getFile, with their captions and alt text',
      eq(await tab.locator(`${PE} .pc-caption`).allTextContents(), ['Aisle 4 after the spill', 'Wet floor sign put out', '']) &&
        eq(await tab.locator(`${PE} .pc-thumb__img`).evaluateAll((imgs) => imgs.map((i) => [i.getAttribute('src'), i.alt])), [
          ['api/getFile/file-aisle-4', 'Aisle 4 after the spill'],
          ['api/getFile/file-wet-floor', 'Wet floor sign put out'],
          ['api/getFile/file-pallet', 'pallet.jpg'],
        ]),
      JSON.stringify(await tab.locator(`${PE} .pc-thumb__img`).evaluateAll((imgs) => imgs.map((i) => [i.getAttribute('src'), i.alt]))),
    );
    check('the header counts them', (await tab.locator(`${PE} .pc-count`).textContent()) === '3 photos');
    check(
      '"Take photo" opens the camera (accept image/*, capture=environment); Upload takes several',
      (await tab.locator(`${PE} input[type=file][capture="environment"][accept="image/*"]:not([multiple])`).count()) === 1 &&
        (await tab.locator(`${PE} input[type=file][multiple][accept="image/*"]`).count()) === 1 &&
        eq(await tab.locator(`${PE} .pc-add__btn`).allTextContents(), ['Take photo', 'Upload']),
    );

    let uploadsBefore = (await uploadEvents()).length;
    let changesBefore = (await fieldChanges(INC, 'photosArr')).length;
    await tab.evaluate(() => host.setLatency(400));
    await uploadInput(PE).setInputFiles({ name: 'spill.png', mimeType: 'image/png', buffer: png(640, 480) });
    await tab.locator(`${PE} .pc-pending`).waitFor({ timeout: 3000 });
    check('while a file uploads its tile shows a spinner and the file name', (await tab.locator(`${PE} .pc-pending`).textContent()).includes('spill.png') && (await tab.locator(`${PE} .pc-pending .sj-spinner`).count()) === 1);
    check('nothing is written before the upload succeeds', (await fieldChanges(INC, 'photosArr')).length === changesBefore);
    await waitForUploads(uploadsBefore + 1);
    await waitForChanges(INC, 'photosArr', changesBefore + 1);
    await tab.evaluate(() => host.setLatency(0));
    await waitIdle();
    let upload = (await uploadEvents()).at(-1);
    check('the upload goes through FileProviderService for this document', upload.fileName === 'spill.png' && upload.type === 'image/png' && upload.documentId === INC, JSON.stringify(upload));
    change = await lastOf(INC, 'photosArr');
    let stored = change.value.at(-1);
    check(
      'then the field gets the stored entry: fileNo, fileName, fileType, basePath, takenDate (now), takenByRel (me), size',
      change.value.length === 4 &&
        stored.fileNo === upload.fileNo &&
        stored.fileName === 'spill.png' &&
        stored.fileType === 'png' &&
        stored.basePath === '20261101' &&
        Math.abs(Date.parse(stored.takenDate) - Date.now()) < 120_000 &&
        eq(stored.takenByRel, [{ documentId: 'account-alex', name: 'Alex Morgan' }]) &&
        stored.width === 640 &&
        stored.height === 480 &&
        !('caption' in stored) &&
        eq(change.value.slice(0, 3).map((p) => p.fileNo), ['file-aisle-4', 'file-wet-floor', 'file-pallet']),
      JSON.stringify(change.value),
    );
    check(
      'the new photo shows, the count follows, and another element on the same field shows it too',
      (await tab.locator(`${PE} .pc-thumb`).count()) === 4 && (await tab.locator(`${PE} .pc-pending`).count()) === 0 && (await tab.locator(`${PE} .pc-count`).textContent()) === '4 photos' && (await tab.locator('#photos-view .pc-thumb').count()) === 4,
    );

    uploadsBefore = (await uploadEvents()).length;
    changesBefore = (await fieldChanges(INC, 'photosArr')).length;
    const widePng = png(2400, 1600);
    await uploadInput(PE).setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: widePng });
    await waitForUploads(uploadsBefore + 1);
    await waitForChanges(INC, 'photosArr', changesBefore + 1);
    upload = (await uploadEvents()).at(-1);
    stored = (await lastOf(INC, 'photosArr')).value.at(-1);
    const uploadedSize = await tab.evaluate(async (fileNo) => {
      const resources = await window.FormbirdServiceInjector.FileProviderService.getFileResources({ fileNo });
      const image = new Image();
      image.src = resources.url;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, upload.fileNo);
    check(
      'a photo larger than maxDimension (1920) is scaled down to fit and sent as JPEG',
      upload.fileName === 'wide.jpg' && upload.type === 'image/jpeg' && eq(uploadedSize, [1920, 1280]) && stored.width === 1920 && stored.height === 1280 && stored.fileName === 'wide.jpg' && stored.fileType === 'jpg',
      JSON.stringify({ upload, uploadedSize, stored }),
    );
    uploadsBefore = (await uploadEvents()).length;
    await uploadInput(PE).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png(2200, 1100, 128) });
    await waitForUploads(uploadsBefore + 1);
    upload = (await uploadEvents()).at(-1);
    check('a large PNG with transparency is scaled down but stays a PNG', upload.fileName === 'logo.png' && upload.type === 'image/png', JSON.stringify(upload));
    await waitIdle();

    changesBefore = (await fieldChanges(INC, 'photosArr')).length;
    uploadsBefore = (await uploadEvents()).length;
    await tab.evaluate(() => host.refuse('upload', 'File type not allowed: exe'));
    await uploadInput(PE).setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: png(320, 240) });
    await tab.locator(`${PE} .pc-failed`).waitFor({ timeout: 5000 });
    await waitIdle();
    check(
      "a refused upload shows the server's message on its tile and writes nothing",
      (await tab.locator(`${PE} .pc-failed[role=alert]`).textContent()).includes('scan.png') &&
        (await tab.locator(`${PE} .pc-failed__message`).textContent()) === 'File type not allowed: exe' &&
        (await fieldChanges(INC, 'photosArr')).length === changesBefore &&
        (await uploadEvents()).length === uploadsBefore,
      await tab.locator(`${PE} .pc-failed`).textContent(),
    );
    await tab.evaluate(() => host.refuse('upload', null));
    await tab.locator(`${PE} .pc-failed__dismiss`).click();
    await waitIdle();
    check('dismissing the failed tile removes it', (await tab.locator(`${PE} .pc-failed`).count()) === 0);
    await uploadInput(PE).setInputFiles({ name: 'setup.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
    await waitIdle();
    check(
      'a file that is not a photo is turned away before uploading',
      (await tab.locator(`${PE} .pc-failed__message`).textContent()) === 'Only photos can be added here.' && (await uploadEvents()).length === uploadsBefore,
    );
    await tab.locator(`${PE} .pc-failed__dismiss`).click();

    uploadsBefore = (await uploadEvents()).length;
    changesBefore = (await fieldChanges(INC, 'photosArr')).length;
    const dropped = await tab.evaluateHandle(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const context = canvas.getContext('2d');
      context.fillStyle = '#4a90d9';
      context.fillRect(0, 0, 320, 240);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], 'dropped.png', { type: 'image/png' }));
      return transfer;
    });
    await tab.locator(`${PE} .pc`).dispatchEvent('dragenter', { dataTransfer: dropped });
    const highlighted = (await tab.locator(`${PE} .pc--dropping`).count()) === 1;
    await tab.locator(`${PE} .pc`).dispatchEvent('drop', { dataTransfer: dropped });
    await waitForUploads(uploadsBefore + 1);
    await waitForChanges(INC, 'photosArr', changesBefore + 1);
    check(
      'dropping a file on the element highlights it and uploads the file',
      highlighted && (await lastOf(INC, 'photosArr')).value.at(-1).fileName === 'dropped.png' && (await tab.locator(`${PE} .pc--dropping`).count()) === 0,
    );
    await waitIdle();
    const total = (await lastOf(INC, 'photosArr')).value.length;

    await tab.locator(`${PE} .pc-thumb`).first().click();
    await waitIdle();
    let box = await lightbox(PE);
    check(
      'a thumbnail opens the lightbox: a modal dialog with focus inside, "1 of N", when and by whom, a download link',
      box.open &&
        box.role === 'dialog' &&
        box.modal === 'true' &&
        box.focusInside &&
        box.counter === `1 of ${total}` &&
        box.image === 'Aisle 4 after the spill' &&
        box.caption === 'Aisle 4 after the spill' &&
        box.taken.includes('by Priya Natarajan') &&
        box.download === 'api/getFile/file-aisle-4',
      JSON.stringify(box),
    );
    await tab.keyboard.press('ArrowRight');
    await waitIdle(100);
    const second = (await lightbox(PE)).counter;
    await tab.keyboard.press('ArrowLeft');
    await tab.keyboard.press('ArrowLeft');
    await waitIdle(100);
    check('→ and ← move between photos, wrapping at the ends', second === `2 of ${total}` && (await lightbox(PE)).counter === `${total} of ${total}`, JSON.stringify([second, (await lightbox(PE)).counter]));
    let trapped = true;
    for (let i = 0; i < 9; i++) {
      await tab.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
      trapped &&= (await lightbox(PE)).focusInside;
    }
    check('Tab and Shift+Tab stay inside the lightbox', trapped);
    await tab.keyboard.press('Escape');
    await waitIdle();
    check(
      'Esc closes it and focus goes back to the thumbnail',
      !(await lightbox(PE)).open && (await tab.evaluate(() => document.querySelector('#photos-edit').shadowRoot.activeElement?.getAttribute('aria-label'))).startsWith('Open Aisle 4 after the spill'),
    );

    await tab.locator(`${PE} .pc-thumb`).nth(2).click();
    await waitIdle();
    changesBefore = (await fieldChanges(INC, 'photosArr')).length;
    await tab.locator(`${PE} .pc-lb__caption-field input`).fill('Pallet with broken slats');
    await tab.keyboard.press('Enter');
    await waitIdle();
    change = await lastOf(INC, 'photosArr');
    check(
      'editing the caption writes it to that photo only',
      (await fieldChanges(INC, 'photosArr')).length === changesBefore + 1 &&
        change.value.find((p) => p.fileNo === 'file-pallet').caption === 'Pallet with broken slats' &&
        change.value.find((p) => p.fileNo === 'file-aisle-4').caption === 'Aisle 4 after the spill' &&
        change.value.length === total,
      JSON.stringify(change.value.map((p) => [p.fileNo, p.caption])),
    );
    await tab.keyboard.press('Escape');
    await waitIdle();
    check('the grid shows the new caption', (await tab.locator(`${PE} .pc-caption`).nth(2).textContent()) === 'Pallet with broken slats');

    await tab.locator(`${PE} .pc-thumb`).nth(1).click();
    await waitIdle();
    changesBefore = (await fieldChanges(INC, 'photosArr')).length;
    await tab.locator(`${PE} .pc-lb__delete`).click();
    await waitIdle();
    check(
      'Delete asks first, and writes nothing yet',
      (await tab.locator(`${PE} .pc-confirm`).textContent()).includes("The stored file isn't deleted") && (await fieldChanges(INC, 'photosArr')).length === changesBefore,
    );
    await tab.locator(`${PE} .pc-confirm__yes`).click();
    await waitIdle();
    change = await lastOf(INC, 'photosArr');
    box = await lightbox(PE);
    check(
      'confirming removes the entry from the field and the lightbox moves on to the next photo',
      change.value.length === total - 1 && !change.value.some((p) => p.fileNo === 'file-wet-floor') && box.open && box.counter === `2 of ${total - 1}` && box.name === 'Pallet with broken slats' && box.focusInside,
      JSON.stringify({ box, files: change.value.map((p) => p.fileNo) }),
    );
    await tab.keyboard.press('Escape');
    await waitIdle();

    const PV = '#photos-view';
    check(
      'view mode: the same photos, no add tile and no file inputs',
      (await tab.locator(`${PV} .pc-thumb`).count()) === total - 1 && (await tab.locator(`${PV} .pc-tile--add`).count()) === 0 && (await tab.locator(`${PV} input[type=file]`).count()) === 0,
    );
    await tab.locator(`${PV} .pc-thumb`).first().click();
    await waitIdle();
    box = await lightbox(PV);
    check('view mode: the lightbox shows the caption as text, with no Delete', box.open && box.deleteButtons === 0 && box.caption === null && (await tab.locator(`${PV} .pc-lb__caption`).textContent()) === 'Aisle 4 after the spill', JSON.stringify(box));
    await tab.keyboard.press('Escape');
    await waitIdle();

    const lazyBefore = await tab.locator('#photos-ref-photo .pc-thumb__img').count();
    await tab.locator('#photos-ref-photo').scrollIntoViewIfNeeded();
    await tab.waitForFunction(() => document.querySelector('#photos-ref-photo').shadowRoot.querySelector('.pc-thumb__img')?.naturalWidth > 0);
    check('thumbnails load only when they come near the viewport', lazyBefore === 0);
    check(
      "fieldtec-web's file reference (fileDetails, mode view): an image shows as a photo",
      (await tab.locator('#photos-ref-photo .pc-thumb__img').getAttribute('alt')) === 'site-overview.jpg' && (await tab.locator('#photos-ref-photo .pc-count').textContent()) === '1 photo',
    );
    const pdfLink = tab.locator('#photos-ref-pdf a.pc-caption--file');
    check(
      'and a PDF as a file tile with a download link',
      (await tab.locator('#photos-ref-pdf .pc-file__ext').textContent()) === 'pdf' &&
        (await tab.locator('#photos-ref-pdf img').count()) === 0 &&
        (await pdfLink.getAttribute('href')) === 'api/getFile/file-ref-pdf' &&
        (await pdfLink.getAttribute('download')) === 'SWMS-forklift.pdf' &&
        (await tab.locator('#photos-ref-pdf .pc-count').textContent()) === '1 file',
    );

    const PM = '#photos-max';
    uploadsBefore = (await uploadEvents()).length;
    await uploadInput(PM).setInputFiles([
      { name: 'one.png', mimeType: 'image/png', buffer: png(200, 150) },
      { name: 'two.png', mimeType: 'image/png', buffer: png(200, 150) },
    ]);
    await waitForUploads(uploadsBefore + 1);
    await waitIdle(400);
    check(
      'maxPhotos: only what fits is uploaded, and the element says why',
      (await uploadEvents()).length === uploadsBefore + 1 &&
        (await lastOf('incident-max', 'photosArr')).value.length === 4 &&
        (await tab.locator(`${PM} .sj-note`).textContent()).includes('1 file was not added: 4 photos is the most this field takes'),
      await tab.locator(`${PM} .sj-note`).textContent(),
    );
    check(
      'when full, adding is disabled and explained',
      eq(await tab.locator(`${PM} .pc-add__btn`).evaluateAll((b) => b.map((x) => x.getAttribute('aria-disabled'))), ['true', 'true']) &&
        (await tab.locator(`${PM} .pc-add__full`).textContent()).includes('4 of 4'),
    );

    const PF = '#photos-files';
    uploadsBefore = (await uploadEvents()).length;
    await uploadInput(PF).setInputFiles({ name: 'permit.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') });
    await waitForUploads(uploadsBefore + 1);
    await waitIdle();
    stored = (await lastOf('incident-files', 'photosArr')).value.at(-1);
    check(
      'allowFiles: other files upload too and show as file tiles',
      (await uploadInput(PF).getAttribute('accept')) === null && stored.fileName === 'permit.pdf' && stored.fileType === 'pdf' && !('width' in stored) && (await tab.locator(`${PF} .pc-file__ext`).textContent()) === 'pdf' && (await tab.locator(`${PF} .pc-count`).textContent()) === '1 file',
      JSON.stringify(stored),
    );

    await tab.evaluate(() => host.updateDefinition(SolidJsComponentsTesting.fixtures.incidentTemplate.documentId, 'photosArr', { enabled: false }));
    await waitIdle();
    check('ruleset enabled:false makes it view-only', (await tab.locator(`${PE} .pc-tile--add`).count()) === 0 && (await tab.locator(`${PE} .pc-thumb`).count()) === total - 1);

    section('Image pins');
    const PB = '#pins-body';
    const figureColours = () =>
      tab.evaluate(() => {
        const pins = document.querySelector('#pins-readonly').shadowRoot;
        const photos = document.querySelector('#photos-view').shadowRoot;
        return [getComputedStyle(pins.querySelector('path[data-region="Chest"]')).fill, getComputedStyle(photos.querySelector('.pc-thumb')).backgroundColor];
      });
    const lightColours = await figureColours();
    const regionUnderPin = (sel, id) =>
      tab.evaluate(
        ([s, pinId]) => {
          const root = document.querySelector(s).shadowRoot;
          const pin = root.querySelector(`.ip-pin[data-pin="${pinId}"]`);
          if (!pin) return null;
          const r = pin.getBoundingClientRect();
          return root.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).find((e) => e.matches('path[data-region]'))?.getAttribute('data-region') ?? null;
        },
        [sel, id],
      );
    const activePin = (sel) => tab.evaluate((s) => document.querySelector(s).shadowRoot.activeElement?.getAttribute('data-pin') ?? null, sel);
    const editorOpen = (sel) => tab.evaluate((s) => !!document.querySelector(s).shadowRoot.querySelector('.sj-popover[data-open] .ip-editor'), sel);
    const pinsNow = async (documentId, fieldName) => (await lastOf(documentId, fieldName))?.value;

    await tab.locator(`${PB} .ip-views`).scrollIntoViewIfNeeded();
    const figure = await tab.evaluate(() => {
      const root = document.querySelector('#pins-body').shadowRoot;
      return [...root.querySelectorAll('.ip-view')].map((view) => ({
        label: view.querySelector('.ip-view__label')?.textContent,
        regions: [...view.querySelectorAll('path[data-region]')].map((p) => p.getAttribute('data-region')),
      }));
    });
    check(
      'the body figure: Front and Back views drawn from named regions',
      eq(
        figure.map((v) => v.label),
        ['Front', 'Back'],
      ) &&
        figure[0].regions.length >= 30 &&
        ['Head', 'Face', 'Neck', 'Chest', 'Abdomen', 'Groin', 'Left shoulder', 'Right forearm', 'Left knee', 'Right foot'].every((r) => figure[0].regions.includes(r)) &&
        ['Back of head', 'Upper back', 'Lower back', 'Left buttock', 'Right calf', 'Back of left knee'].every((r) => figure[1].regions.includes(r)) &&
        new Set(figure[0].regions).size === figure[0].regions.length,
      JSON.stringify(figure.map((v) => [v.label, v.regions.length])),
    );
    check(
      'stored pins show as numbered markers on their regions, and in the list',
      eq(await tab.locator(`${PB} .ip-pin`).allTextContents(), ['1', '2']) &&
        eq(await tab.locator(`${PB} .ip-item__region`).allTextContents(), ['Left wrist', 'Right knee']) &&
        (await regionUnderPin(PB, 'pin-wrist')) === 'Left wrist' &&
        (await regionUnderPin(PB, 'pin-knee')) === 'Right knee',
      JSON.stringify([await regionUnderPin(PB, 'pin-wrist'), await regionUnderPin(PB, 'pin-knee')]),
    );
    check("left and right are the person's: on the front view their left is on the viewer's right", (await tab.locator(`${PB} .ip-sides`).textContent()).includes("person's right and left"));
    await tab.locator(`${PB} path[data-region="Chest"]`).hover();
    await waitIdle(100);
    check('hovering a region highlights it and shows its name', (await tab.locator(`${PB} .ip-hover`).textContent()) === 'Chest' && (await tab.locator(`${PB} path[data-region="Chest"][data-hover]`).count()) === 1);

    changesBefore = (await fieldChanges(INC, 'injuryPinsArr')).length;
    await tab.locator(`${PB} path[data-region="Left forearm"]`).click();
    await waitIdle();
    let pins = await pinsNow(INC, 'injuryPinsArr');
    let pin = pins?.at(-1);
    check(
      'clicking the figure adds a pin there with the region under the pointer (x, y as fractions)',
      (await fieldChanges(INC, 'injuryPinsArr')).length === changesBefore + 1 &&
        pins.length === 3 &&
        pin.view === 'front' &&
        pin.region === 'Left forearm' &&
        pin.x > 0 &&
        pin.x < 1 &&
        pin.y > 0 &&
        pin.y < 1 &&
        typeof pin.id === 'string' &&
        (await regionUnderPin(PB, pin.id)) === 'Left forearm',
      JSON.stringify(pin),
    );
    const newPin = pin.id;
    check(
      "and opens the pin's editor, focus on its first kind",
      (await editorOpen(PB)) && (await tab.evaluate(() => document.querySelector('#pins-body').shadowRoot.activeElement?.textContent)) === 'Cut' && eq(await tab.locator(`${PB} .ip-kind`).allTextContents(), ['Cut', 'Bruise', 'Burn', 'Fracture', 'Sprain or strain', 'Pain', 'Other']),
    );
    await tab.locator(`${PB} .ip-kind`, { hasText: 'Burn' }).click();
    await waitIdle();
    pin = (await pinsNow(INC, 'injuryPinsArr')).find((p) => p.id === newPin);
    check("choosing a kind writes it, and the pin takes the kind's colour", pin.kind === 'Burn' && (await tab.locator(`${PB} .ip-pin[data-pin="${newPin}"]`).getAttribute('style')).includes('#f76b15'), JSON.stringify(pin));
    changesBefore = (await fieldChanges(INC, 'injuryPinsArr')).length;
    await tab.locator(`${PB} .ip-note`).click();
    await tab.keyboard.type('Touched the hot press', { delay: 15 });
    const whileTyping = (await fieldChanges(INC, 'injuryPinsArr')).length - changesBefore;
    await waitIdle(700);
    pin = (await pinsNow(INC, 'injuryPinsArr')).find((p) => p.id === newPin);
    check('the note is written once typing pauses (not on every key)', whileTyping === 0 && (await fieldChanges(INC, 'injuryPinsArr')).length === changesBefore + 1 && pin.note === 'Touched the hot press', JSON.stringify({ whileTyping, pin }));
    await tab.locator(`${PB} .ip-editor select`).selectOption('Left hand');
    await waitIdle();
    pin = (await pinsNow(INC, 'injuryPinsArr')).find((p) => p.id === newPin);
    check('choosing another region moves the pin onto it', pin.region === 'Left hand' && (await regionUnderPin(PB, newPin)) === 'Left hand', JSON.stringify(pin));
    await tab.locator(`${PB} .ip-editor button`, { hasText: 'Done' }).click();
    await waitIdle();
    check('Done closes the editor and returns focus to the pin', !(await editorOpen(PB)) && (await activePin(PB)) === newPin);

    changesBefore = (await fieldChanges(INC, 'injuryPinsArr')).length;
    await tab.locator(`${PB} .ip-add select`).first().selectOption('back');
    await waitIdle(100);
    await tab.locator(`${PB} .ip-add select`).nth(1).selectOption('Lower back');
    await tab.locator(`${PB} .ip-add__button`).focus();
    await tab.keyboard.press('Enter');
    await waitIdle();
    pins = await pinsNow(INC, 'injuryPinsArr');
    pin = pins.at(-1);
    const keyboardPin = pin.id;
    check(
      'keyboard: choosing a view and a region and pressing Add pin places a pin on that region',
      pins.length === 4 && pin.view === 'back' && pin.region === 'Lower back' && (await regionUnderPin(PB, keyboardPin)) === 'Lower back' && (await editorOpen(PB)),
      JSON.stringify(pin),
    );
    await tab.keyboard.press('Escape');
    await waitIdle();
    check('Esc closes the editor and focus is on the new pin', !(await editorOpen(PB)) && (await activePin(PB)) === keyboardPin);
    await tab.keyboard.press('ArrowRight');
    await waitIdle();
    let moved = (await pinsNow(INC, 'injuryPinsArr')).find((p) => p.id === keyboardPin);
    check('arrow keys nudge a focused pin', Math.abs(moved.x - pin.x - 0.01) < 0.0002 && moved.y === pin.y && moved.region === 'Lower back', JSON.stringify({ before: pin, after: moved }));
    await tab.keyboard.press('Delete');
    await waitIdle();
    pins = await pinsNow(INC, 'injuryPinsArr');
    check('Delete removes it and offers Undo', pins.length === 3 && !pins.some((p) => p.id === keyboardPin) && (await tab.locator(`${PB} .ip-undo`).textContent()).includes('Pin 4 (Lower back) removed'));
    await tab.locator(`${PB} .ip-undo button`).click();
    await waitIdle();
    pins = await pinsNow(INC, 'injuryPinsArr');
    check('Undo puts it back as it was', pins.length === 4 && eq(pins[3], moved) && (await tab.locator(`${PB} .ip-undo`).count()) === 0, JSON.stringify(pins[3]));

    const pinBox = await tab.locator(`${PB} .ip-pin[data-pin="pin-wrist"]`).boundingBox();
    const thighBox = await tab.locator(`${PB} path[data-region="Right thigh"]`).boundingBox();
    changesBefore = (await fieldChanges(INC, 'injuryPinsArr')).length;
    await tab.mouse.move(pinBox.x + pinBox.width / 2, pinBox.y + pinBox.height / 2);
    await tab.mouse.down();
    await tab.mouse.move(thighBox.x + thighBox.width / 2, thighBox.y + thighBox.height / 2, { steps: 10 });
    await tab.mouse.up();
    await waitIdle();
    pin = (await pinsNow(INC, 'injuryPinsArr')).find((p) => p.id === 'pin-wrist');
    check(
      'dragging a pin moves it and its region follows (one write, no editor)',
      (await fieldChanges(INC, 'injuryPinsArr')).length === changesBefore + 1 && pin.region === 'Right thigh' && pin.kind === 'Sprain or strain' && (await regionUnderPin(PB, 'pin-wrist')) === 'Right thigh' && !(await editorOpen(PB)),
      JSON.stringify(pin),
    );
    const kneeBox = await tab.locator(`${PB} .ip-pin[data-pin="pin-knee"]`).boundingBox();
    const stageBox = await tab.locator(`${PB} .ip-stage`).first().boundingBox();
    changesBefore = (await fieldChanges(INC, 'injuryPinsArr')).length;
    await tab.mouse.move(kneeBox.x + kneeBox.width / 2, kneeBox.y + kneeBox.height / 2);
    await tab.mouse.down();
    await tab.mouse.move(stageBox.x + 6, stageBox.y + stageBox.height - 6, { steps: 10 });
    await tab.mouse.up();
    await waitIdle();
    check('dropped off the figure, a pin goes back where it was', (await fieldChanges(INC, 'injuryPinsArr')).length === changesBefore && (await regionUnderPin(PB, 'pin-knee')) === 'Right knee');
    await tab.locator(`${PB} .ip-item`).nth(1).click();
    await waitIdle();
    check('clicking a list item opens its pin', (await editorOpen(PB)) && (await tab.locator(`${PB} .ip-editor__title strong`).textContent()) === 'Pin 2');
    await tab.locator(`${PB} .ip-editor button`, { hasText: 'Delete pin' }).click();
    await waitIdle();
    pins = await pinsNow(INC, 'injuryPinsArr');
    check('Delete pin in the editor removes it', pins.length === 3 && !pins.some((p) => p.id === 'pin-knee') && !(await editorOpen(PB)));

    const PR = '#pins-readonly';
    changesBefore = (await fieldChanges('incident-readonly', 'injuryPinsArr')).length;
    await tab.locator(`${PR} path[data-region="Chest"]`).click();
    await waitIdle();
    check(
      'read-only: pins and the list show, nothing can be added, moved or edited',
      (await tab.locator(`${PR} button.ip-pin`).count()) === 0 &&
        (await tab.locator(`${PR} .ip-pin--static`).count()) === 2 &&
        (await tab.locator(`${PR} .ip-add`).count()) === 0 &&
        (await tab.locator(`${PR} button.ip-item`).count()) === 0 &&
        eq(await tab.locator(`${PR} .ip-item__region`).allTextContents(), ['Left wrist', 'Right knee']) &&
        (await fieldChanges('incident-readonly', 'injuryPinsArr')).length === changesBefore,
    );

    const PP = '#pins-plan';
    await tab.waitForFunction(() => document.querySelector('#pins-plan').shadowRoot.querySelector('.ip-image')?.naturalWidth > 0);
    check(
      'a custom image instead of the figure, with the definition’s kinds',
      (await tab.locator(`${PP} svg.ip-figure`).count()) === 0 && (await tab.locator(`${PP} .ip-pin`).count()) === 1 && eq(await tab.locator(`${PP} .ip-item__kind`).allTextContents(), ['Leak']),
    );
    await tab.locator(`${PP} .ip-stage`).scrollIntoViewIfNeeded();
    const planBox = await tab.locator(`${PP} .ip-stage`).boundingBox();
    await tab.mouse.click(planBox.x + planBox.width * 0.75, planBox.y + planBox.height * 0.2);
    await waitIdle();
    pin = (await pinsNow(INC, 'defectPinsArr')).at(-1);
    check(
      'clicking the image adds a pin at that spot (no region to look up)',
      pin.view === 'image' && Math.abs(pin.x - 0.75) < 0.01 && Math.abs(pin.y - 0.2) < 0.01 && !('region' in pin) && eq(await tab.locator(`${PP} .ip-kind`).allTextContents(), ['Crack', 'Leak', 'Trip hazard']),
      JSON.stringify(pin),
    );
    await tab.locator(`${PP} .ip-editor input`).fill('Office');
    await tab.keyboard.press('Tab');
    await waitIdle();
    check('its place is free text', (await pinsNow(INC, 'defectPinsArr')).at(-1).region === 'Office');
    await tab.keyboard.press('Escape');
    await tab.mouse.click(planBox.x + planBox.width * 0.5, planBox.y + planBox.height * 0.8);
    await waitIdle();
    await tab.keyboard.press('Escape');
    changesBefore = (await fieldChanges(INC, 'defectPinsArr')).length;
    await tab.mouse.click(planBox.x + planBox.width * 0.3, planBox.y + planBox.height * 0.8);
    await waitIdle();
    check(
      'maxPins: at the limit no more pins are added, Add pin is off and the element says why',
      (await pinsNow(INC, 'defectPinsArr')).length === 3 &&
        (await fieldChanges(INC, 'defectPinsArr')).length === changesBefore &&
        (await tab.locator(`${PP} .ip-add__button`).isDisabled()) &&
        (await tab.locator(`${PP} .sj-note--warning`).textContent()).includes('3 pins is the most'),
    );

    section('Validation and theme');
    await tab.evaluate(() => host.validate('issue-new', 'statusRel', SolidJsComponentsTesting.fixtures.definitionFor('statusRel')));
    await waitIdle();
    check('host validation errors are shown', (await tab.locator('#n-statusRel .sj-field__errors').textContent()).includes('This field is required'));
    await tab.evaluate(() => document.body.classList.add('dark-theme'));
    await waitIdle();
    const themes = await tab.evaluate(() => [...document.querySelectorAll('[fb-component-version]')].map((e) => e.getAttribute('data-sj-theme')));
    check('body.dark-theme switches every element to dark', themes.length > 0 && themes.every((t) => t === 'dark'), JSON.stringify(themes));
    const darkColours = await figureColours();
    check('the body figure and photo tiles take the dark colours', darkColours.every((colour, i) => colour !== lightColours[i]), JSON.stringify({ lightColours, darkColours }));

    section('Stale kit');
    const staleTab = await context.newPage();
    const staleErrors = [];
    staleTab.on('console', (m) => m.type() === 'error' && staleErrors.push(m.text()));
    await staleTab.goto(`${origin}/stale.html`, { waitUntil: 'load' });
    await staleTab.waitForTimeout(250);
    const staleText = (await staleTab.locator('#stale [role=alert]').textContent().catch(() => '')) ?? '';
    check(
      'with an older kit on the page, the element explains why instead of rendering nothing',
      staleText.includes('needs a newer solidjs-components-kit.js') && staleText.includes('missing: searchPage') && staleErrors.some((t) => t.includes('missing: searchPage')),
      JSON.stringify({ staleText, staleErrors }),
    );
    await staleTab.close();

  },
};
