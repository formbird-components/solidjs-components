// Browser test of the elements the procurement app uses, BUILT, against the in-memory host and a
// small procurement data set (packages/fixtures), loaded the way fieldtec-web loads them. The harness
// and mock host come from solidjs-components-shared. Run: pnpm test:browser.

const ROLES = ['lines', 'budget', 'budgetOver', 'quotes', 'docs', 'budgets', 'budgetsNone'];
const WIDE = ['lines', 'quotes', 'docs', 'budgets'];
// A one-page PDF, for the upload.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

export default {
  components: ['solid-line-items', 'solid-photo-capture', 'solid-budget-check', 'solid-quote-compare'],
  setupScripts: ['repo:dist-dev/proc-fixtures/proc-fixtures.js'],

  hostSetup: `const f = ProcFixtures;
  window.host = T.installMockHost({ documents: f.documents, forms: f.forms, currentAccountId: f.CURRENT_ACCOUNT_ID });`,

  body: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;width:1240px">${ROLES.map(
    (role) => `<div id="slot-${role}" style="${WIDE.includes(role) ? 'grid-column:1/-1' : ''}"></div>`,
  ).join('')}</div>`,

  pageScript: `
  window.draftLines = () => structuredClone(f.draft.lineItemsArr);
  const formFor = { lines: f.draft, budget: f.draft, budgetOver: f.itRequest, quotes: f.draft, docs: f.draft, budgets: f.dashboard, budgetsNone: f.dashboard };
  let key = 0;
  ${JSON.stringify(ROLES)}.forEach((role) => {
    const form = formFor[role];
    const def = structuredClone(f.definitions[role]);
    const el = T.createFormElement(def.componentName, {
      document: Object.assign(host.form(form.documentId), { documentId: form.documentId, systemHeader: form.systemHeader }),
      template: f.template, componentDefinition: def, key: key++,
    });
    el.id = 'x-' + role;
    document.getElementById('slot-' + role).appendChild(el);
  });`,

  async run({ tab, check, eq, section, waitIdle }) {
    const clean = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
    const text = async (selector) => clean(await tab.locator(selector).first().textContent());
    const texts = async (selector) => (await tab.locator(selector).allTextContents()).map(clean);
    const count = (selector) => tab.locator(selector).count();
    const lastValue = (documentId, fieldName) => tab.evaluate(([d, n]) => host.changes.filter((c) => c.documentId === d && c.fieldName === n).at(-1)?.value, [documentId, fieldName]);
    const totals = async (id) => Object.fromEntries((await tab.locator(`#${id} .li-totals > div`).evaluateAll((els) => els.map((e) => [e.querySelector('dt').textContent.trim(), e.querySelector('dd').textContent.trim()]))));
    await waitIdle(800);

    section('Line items: a purchase');
    check('kinds of its own: the add buttons and the cost heading', eq(await texts('#x-lines .li-add button'), ['From a catalogue', 'Add an item', 'Add a service', 'Freight']) && (await text('#x-lines thead th:nth-child(4)')) === 'Unit price, ex GST', JSON.stringify(await texts('#x-lines .li-add button')));
    check('totals by kind, the subtotal, GST and total', eq(await totals('x-lines'), { Goods: '$18,900.00', Subtotal: '$18,900.00', GST: '$1,890.00', Total: '$20,790.00' }), JSON.stringify(await totals('x-lines')));
    await tab.locator('#x-lines button', { hasText: 'Add a service' }).click();
    await waitIdle();
    let lines = await lastValue('pr-10', 'lineItemsArr');
    check('a service line', lines?.length === 2 && lines[1].kind === 'service' && lines[1].unit === 'ea', JSON.stringify(lines?.[1]));
    await tab.locator('#x-lines tbody tr').nth(1).locator('input[aria-label="Description"]').fill('Installation');
    await tab.locator('#x-lines tbody tr').nth(1).locator('input[aria-label="Quantity"]').fill('1');
    await tab.locator('#x-lines tbody tr').nth(1).locator('input[aria-label="Unit cost"]').fill('650');
    await tab.locator('#x-lines tbody tr').nth(1).locator('input[aria-label="Unit cost"]').press('Tab');
    await waitIdle();
    check('…its own total row', (await totals('x-lines')).Services === '$650.00' && (await totals('x-lines')).Total === '$21,505.00', JSON.stringify(await totals('x-lines')));
    await tab.locator('#x-lines button', { hasText: 'From a catalogue' }).click();
    await waitIdle(300);
    check('the catalogue searches its items', (await tab.locator('#x-lines .sj-option').count()) === 3 && (await tab.locator('#x-lines input[placeholder="Search catalogue items…"]').count()) === 1);
    await tab.locator('#x-lines .sj-option', { hasText: 'Nitrile work gloves' }).click();
    await waitIdle();
    lines = await lastValue('pr-10', 'lineItemsArr');
    check('a catalogue item comes in as goods, with its part number and price', lines?.length === 3 && lines[2].kind === 'goods' && lines[2].materialRel?.[0]?.partNo === 'CP-GL-100' && lines[2].unitCost === 38, JSON.stringify(lines?.[2]));
    // Back to the two generators, for the budget and quote checks below.
    await tab.evaluate(() => host.setField('pr-10', 'lineItemsArr', draftLines()));
    await waitIdle();

    section('Budget check');
    const figures = Object.fromEntries(await tab.locator('#x-budget .bc-legend__item').evaluateAll((els) => els.map((e) => [e.querySelector('dt').textContent.trim(), e.querySelector('dd').textContent.trim()])));
    check('spent, committed, waiting, this request and what is left after', eq(figures, { Spent: '$50,500', Committed: '$5,000', 'Waiting for approval': '$3,000', 'This request': '$18,900', 'Left after': '$25,600' }), JSON.stringify(figures));
    check('it fits', /^Fits in the budget: \$25,600 left after this request\.$/.test(await text('#x-budget .bc-verdict')), await text('#x-budget .bc-verdict'));
    check('writes what is left before the request, for the client rule', (await lastValue('pr-10', 'budgetRemainingNum')) === 44500);
    check('over budget: by how much, and the override', (await text('#x-budgetOver .bc-verdict')) === 'Over budget by $7,000: Finance approves an override before this can be ordered.' && (await count('#x-budgetOver .bc-bar__over')) === 1, await text('#x-budgetOver .bc-verdict'));
    await tab.evaluate(() => host.setField('pr-10', 'lineItemsArr', [{ id: 'l1', kind: 'goods', description: 'Generator', qty: 5, unit: 'ea', unitCost: 9450 }]));
    await waitIdle();
    check('follows the lines as they change', (await text('#x-budget .bc-verdict')).startsWith('Over budget by $2,750'), await text('#x-budget .bc-verdict'));
    await tab.evaluate(() => host.setField('pr-10', 'lineItemsArr', draftLines()));
    await waitIdle();
    check('no cost centres: says so', (await text('#x-budgetsNone .bc-empty')) === 'You don’t look after a cost centre.' && (await count('#x-budgetsNone .bc-rows')) === 0);
    check('the summary: a row per cost centre, with what is left', eq(await texts('#x-budgets .bc-row__left'), ['$44,500 of $100,000', '$18,000 of $50,000']), JSON.stringify(await texts('#x-budgets .bc-row__left')));

    section('Quote compare');
    check('the quotes, cheapest first, the expired one dimmed', eq(await texts('#x-quotes .qc-supplier'), ['Ridgeway Equipment', 'PowerGen Hire and Sales', 'Precision Survey Rentals']) && (await count('#x-quotes .qc-card--expired')) === 1 && (await text('#x-quotes .qc-card--cheapest .qc-supplier')) === 'Ridgeway Equipment');
    check('each against the cheapest', (await text('#x-quotes .qc-card:nth-child(2) .qc-diff')) === '+$650 (4%)', await text('#x-quotes .qc-card:nth-child(2) .qc-diff'));
    check('what the amount needs, and how many valid quotes there are', (await text('#x-quotes .qc-need')) === '3 written quotes are needed for $18,900. 2 valid quotes so far.', await text('#x-quotes .qc-need'));
    check('what is still wrong', eq(await texts('#x-quotes .qc-problems li'), ['3 written quotes are needed above $10,000 (2 so far), or a reason there is only one supplier.', 'Choose the quote you are going with.']), JSON.stringify(await texts('#x-quotes .qc-problems li')));
    check('writes how many quotes are valid', (await lastValue('pr-10', 'quotesValidNum')) === 2);
    await tab.locator('#x-quotes .qc-card:nth-child(2) button', { hasText: 'Choose' }).click();
    await waitIdle();
    check('choosing writes the quote and its supplier', (await lastValue('pr-10', 'chosenQuoteRel'))?.[0]?.documentId === 'qt-1' && (await lastValue('pr-10', 'supplierRel'))?.[0]?.name === 'PowerGen Hire and Sales');
    check('…marks it chosen, and asks why not the cheapest', (await text('#x-quotes .qc-card--chosen .qc-supplier')) === 'PowerGen Hire and Sales' && (await texts('#x-quotes .qc-problems li')).includes('Say why not the cheapest quote (Ridgeway Equipment, $18,250).'));
    await tab.locator('#x-quotes button', { hasText: 'Add a quote' }).click();
    await tab.locator('#x-quotes button[type=submit]').click();
    await waitIdle();
    check('the add form says what is missing', (await count('#x-quotes .qc-form__error')) === 1 && (await text('#x-quotes .qc-form .sj-field__errors')).includes('Choose the supplier.'));
    await tab.locator('#x-quotes .qc-form .sj-trigger').click();
    await waitIdle(300);
    await tab.locator('#x-quotes .sj-option', { hasText: 'Heritage Joinery Co' }).click();
    await tab.locator('#x-quotes .qc-form input[inputmode=decimal]').fill('19,400');
    await tab.locator('#x-quotes button[type=submit]').click();
    await waitIdle(400);
    const inserted = await tab.evaluate(() => host.events.filter((e) => e.type === 'insert').at(-1)?.detail);
    check('saving creates the quote for this request', inserted?.amountNum === 19400 && inserted?.requestRel?.[0]?.documentId === 'pr-10' && inserted?.supplierRel?.[0]?.name === 'Heritage Joinery Co' && eq(inserted?.appTags, ['proc', 'quote']), JSON.stringify(inserted));
    check('…shows it straight away, flagging the unapproved supplier', (await count('#x-quotes .qc-card')) === 4 && (await count('#x-quotes .qc-unapproved')) === 1 && (await text('#x-quotes .qc-need')).endsWith('3 valid quotes so far.'));

    section('Photo capture: documents');
    check('a row per document, with its type', (await count('#x-docs .pc-row')) === 2 && eq(await tab.locator('#x-docs .pc-row__kind').evaluateAll((els) => els.map((e) => e.value)), ['Specification', 'Other']) && (await text('#x-docs .pc-count')) === '2 documents');
    await tab.locator('#x-docs .pc-row__kind').nth(1).selectOption('Quote');
    await waitIdle();
    check('changing a type writes it', (await lastValue('pr-10', 'attachmentsArr'))?.[1]?.kind === 'Quote');
    await tab.locator('#x-docs input[type=file][multiple]').setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: PDF });
    await waitIdle(500);
    const docs = await lastValue('pr-10', 'attachmentsArr');
    check('an upload is a new row, with the first type', docs?.length === 3 && docs[2].fileName === 'invoice.pdf' && docs[2].kind === 'Quote' && (await count('#x-docs .pc-row__icon--pdf')) === 2, JSON.stringify(docs?.[2]));
    await tab.locator('#x-docs .pc-row__open').nth(2).click();
    await waitIdle(500);
    check('a PDF opens in the browser’s viewer', (await count('#x-docs .pc-lb__pdf-frame')) === 1 && (await text('#x-docs .pc-lb__muted .pc-kind')) === 'Quote');
    await tab.keyboard.press('Escape');

    section('Theme');
    await tab.evaluate(() => document.body.classList.add('dark-theme'));
    await waitIdle();
    const themes = await tab.evaluate(() => ['x-lines', 'x-budget', 'x-quotes', 'x-docs', 'x-budgets'].map((id) => document.getElementById(id).getAttribute('data-sj-theme')));
    check('every element follows dark mode', themes.every((t) => t === 'dark'), JSON.stringify(themes));
    if (process.env.SHOT) await tab.screenshot({ path: process.env.SHOT, fullPage: true });
  },
};
