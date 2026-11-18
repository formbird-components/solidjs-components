// Browser test of this repo's BUILT element, <solid-issue-summary>, on an SDMS-like issue next to
// shared elements (key, status), loaded from both repos the way fieldtec-web loads them. The
// harness and the mock host come from solidjs-components-shared. Run: pnpm test:browser.

export default {
  components: ['solid-issue-summary', 'solid-record-key', 'solid-status'],

  hostSetup: `const f = T.fixtures;
  window.host = T.installMockHost({ documents: f.documents, forms: [f.issue, f.newIssue], currentAccountId: f.CURRENT_ACCOUNT_ID });`,

  body: '<div id="issue"></div><div id="new"></div>',

  pageScript: `
  // The shared fixture template shows the summary as solid-issue-summary.
  const make = (field, documentId) => {
    const def = f.definitionFor(field);
    const el = T.createFormElement(def.componentName, { document: Object.assign(host.form(documentId), { documentId }), template: f.issueTemplate, componentDefinition: def });
    el.id = (documentId === f.ISSUE_ID ? 'i-' : 'n-') + field;
    return el;
  };
  ['itemRef', 'summary', 'statusRel'].forEach((field) => document.getElementById('issue').appendChild(make(field, f.ISSUE_ID)));
  document.getElementById('new').appendChild(make('summary', f.newIssue.documentId));`,

  async run({ tab, check, section, waitIdle, lastChange, changeCount }) {
    section('Summary');
    await tab.locator('#i-summary .is-title').click();
    check('click opens the editor focused', await tab.locator('#i-summary textarea').evaluate((el) => el.getRootNode().activeElement === el));
    await tab.locator('#i-summary textarea').fill('Status lozenge flickers when switching projects');
    await tab.keyboard.press('Enter');
    await waitIdle();
    let change = await lastChange();
    check('Enter writes the summary', change?.fieldName === 'summary' && change.value === 'Status lozenge flickers when switching projects', JSON.stringify(change));
    check('display shows the saved text', (await tab.locator('#i-summary .is-title').textContent()) === 'Status lozenge flickers when switching projects');
    let before = await changeCount();
    await tab.locator('#i-summary .is-title').click();
    await tab.locator('#i-summary textarea').fill('discard me');
    await tab.keyboard.press('Escape');
    await waitIdle();
    check('Escape cancels without writing', (await changeCount()) === before && (await tab.locator('#i-summary .is-title').textContent()).startsWith('Status lozenge'));
    await tab.locator('#i-summary .is-title').click();
    await tab.locator('#i-summary textarea').fill('   ');
    await tab.keyboard.press('Enter');
    await waitIdle();
    check('empty mandatory summary is refused with a message', (await changeCount()) === before && (await tab.locator('#i-summary .is-problem').textContent()).includes('required'));
    await tab.keyboard.press('Escape');


    section('Validation and theme');
    await tab.evaluate(() => host.validate('issue-new', 'summary', SolidJsComponentsTesting.fixtures.definitionFor('summary')));
    await waitIdle();
    check('host validation errors are shown', (await tab.locator('#n-summary .sj-field__errors').textContent()).includes('This field is required'));
    await tab.evaluate(() => document.body.classList.add('dark-theme'));
    await waitIdle();
    const themes = await tab.evaluate(() => [...document.querySelectorAll('[fb-component-version]')].map((e) => e.getAttribute('data-sj-theme')));
    check('body.dark-theme switches every element to dark', themes.length > 0 && themes.every((t) => t === 'dark'), JSON.stringify(themes));
  },
};
