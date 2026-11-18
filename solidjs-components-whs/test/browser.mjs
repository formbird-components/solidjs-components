// Browser test of the elements the safety app uses, BUILT, against the in-memory host and a small
// safety data set (packages/fixtures), loaded the way fieldtec-web loads them: Solid runtime, the
// kit, then the elements (this repo's and shared's). The harness and mock host come from
// solidjs-components-shared. Run: pnpm test:browser.

/** One element per role, in a two-column page; wide roles span both columns. */
const ROLES = ['tiles', 'matrix', 'residual', 'heatmap', 'rootCause', 'rootCauseNew', 'actions', 'actionsNew', 'hazardActions'];
const WIDE = ['tiles', 'heatmap', 'actions'];

export default {
  components: ['solid-stat-tiles', 'solid-risk-matrix', 'solid-root-cause', 'solid-corrective-actions'],
  setupScripts: ['repo:dist-dev/whs-fixtures/whs-fixtures.js'],

  hostSetup: `const f = WhsFixtures;
  window.host = T.installMockHost({ documents: f.documents, forms: f.forms, currentAccountId: f.CURRENT_ACCOUNT_ID });`,

  body: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;width:1240px">${ROLES.map(
    (role) => `<div id="slot-${role}" style="${WIDE.includes(role) ? 'grid-column:1/-1' : ''}"></div>`,
  ).join('')}</div>`,

  pageScript: `
  const formFor = {
    tiles: f.dashboard, heatmap: f.dashboard, matrix: f.incident, rootCause: f.incident, actions: f.incident,
    rootCauseNew: f.newIncident, actionsNew: f.newIncident, residual: f.pedestrianHazard, hazardActions: f.pedestrianHazard,
  };
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

  async run({ tab, check, eq, section, waitIdle, changeCount }) {
    const clean = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
    const text = async (selector) => clean(await tab.locator(selector).first().textContent());
    const texts = async (selector) => (await tab.locator(selector).allTextContents()).map(clean);
    const count = (selector) => tab.locator(selector).count();
    const changesOf = (documentId, fieldName) =>
      tab.evaluate(([d, n]) => host.changes.filter((c) => c.documentId === d && c.fieldName === n), [documentId, fieldName]);
    const lastValue = async (documentId, fieldName) => (await changesOf(documentId, fieldName)).at(-1)?.value;
    const lastEvent = () => tab.evaluate(() => host.events.at(-1));
    /** What has focus inside an element's shadow root. */
    const focused = (id) =>
      tab.evaluate((elementId) => {
        const a = document.getElementById(elementId).shadowRoot.activeElement;
        return a ? { tag: a.tagName, value: a.value ?? '', text: (a.textContent ?? '').replace(/\s+/g, ' ').trim(), cell: a.dataset?.cell ?? '', name: a.name ?? '' } : null;
      }, id);
    const cell = (role, key) => tab.locator(`#x-${role} [data-cell="${key}"]`);
    // actionDueDate (whs-kit), for checking what the form stored: `days` on, 5 pm in eastern Australia.
    const dueFrom = (raised, days) =>
      tab.evaluate(([r, d]) => {
        const eastern = new Date(Date.parse(r) + d * 86_400_000 + 10 * 3_600_000);
        return new Date(Date.UTC(eastern.getUTCFullYear(), eastern.getUTCMonth(), eastern.getUTCDate(), 7)).toISOString();
      }, [raised, days]);
    await waitIdle(600);

    section('Stat tiles: days since');
    const tiles = await tab.locator('#x-tiles .st-tile').evaluateAll((els) =>
      els.map((e) => ({ label: e.querySelector('.st-label').textContent.trim(), value: e.querySelector('.st-value').textContent.trim(), hint: e.querySelector('.st-hint')?.textContent.trim() ?? '', cls: e.className })),
    );
    check('counts whole days since the latest match', tiles[0]?.value === '21', JSON.stringify(tiles[0]));
    check('the hint gives the date of the latest match', /^Last: /.test(tiles[0]?.hint ?? ''), tiles[0]?.hint);
    check('below goodFrom it keeps its tone; nothing found reads as none recorded, in the good tone',
      tiles[0]?.cls.includes('st-tile--warn') && tiles[1]?.value === '–' && tiles[1]?.hint === 'None recorded' && tiles[1]?.cls.includes('st-tile--good'), JSON.stringify(tiles.slice(0, 2)));
    const latest = await tab.evaluate(() => host.searches.find((s) => JSON.stringify(s.filter).includes('lostTimeBool'))?.filter);
    check('it asks for the latest match only, sorted inside the request', JSON.stringify(latest?.sort) === JSON.stringify([{ occurredDate: { order: 'desc', unmapped_type: 'date' } }]), JSON.stringify(latest?.sort));
    check('counts still count', tiles[2]?.value === '5' && tiles[2]?.cls.includes('st-tile--bad'), JSON.stringify(tiles[2]));

    section('Risk matrix: assessing a risk');
    check('the stored risk is the selected cell', (await cell('matrix', '4-4').getAttribute('aria-selected')) === 'true' && (await count('#x-matrix [aria-selected="true"]')) === 1);
    const resultParts = () => texts('#x-matrix .rm-result__line > *');
    const result = await resultParts();
    check('the result: rating, score and levels', eq(result, ['High', 'Score 16', 'Likely × Major']), JSON.stringify(result));
    const response = await text('#x-matrix .rm-response');
    check('a High risk asks for actions within 7 days, a full investigation, and tells three roles',
      response === 'Actions due within 7 days · Investigation: full · Notify: Supervisor, WHS Advisor, Site Manager', response);
    const label44 = await cell('matrix', '4-4').getAttribute('aria-label');
    check('cells are named by their levels, rating and score, and described by the levels’ hints',
      label44 === 'Likely × Major: High, score 16' && !!(await cell('matrix', '4-4').getAttribute('aria-describedby')), label44);
    await cell('matrix', '5-5').click();
    await waitIdle();
    check('picking a cell writes likelihood, consequence, score and rating',
      eq(await lastValue('incident-12', 'riskAssessment'), { likelihood: 5, consequence: 5, score: 25, rating: 'Extreme' }), JSON.stringify(await lastValue('incident-12', 'riskAssessment')));
    check('…and the response follows the rating', (await text('#x-matrix .rm-response')).startsWith('Actions due within 1 day · Investigation: full · Notify: Supervisor, WHS Advisor, Site Manager, Executive'));
    const stops = await tab.locator('#x-matrix [role=gridcell][tabindex="0"]').evaluateAll((els) => els.map((e) => e.dataset.cell));
    check('the grid is one tab stop, on the chosen cell', eq(stops, ['5-5']), JSON.stringify(stops));
    await cell('matrix', '5-5').focus();
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowLeft']) await tab.keyboard.press(key);
    check('arrows move focus, with Almost certain at the top', (await focused('x-matrix'))?.cell === '3-4', JSON.stringify(await focused('x-matrix')));
    await tab.keyboard.press('Enter');
    await waitIdle();
    check('Enter picks the focused cell', eq(await lastValue('incident-12', 'riskAssessment'), { likelihood: 3, consequence: 4, score: 12, rating: 'High' }));
    await tab.keyboard.press('Home');
    await tab.keyboard.press(' ');
    await waitIdle();
    check('Home goes to the start of the row; Space picks', eq(await lastValue('incident-12', 'riskAssessment'), { likelihood: 3, consequence: 1, score: 3, rating: 'Low' }));
    await tab.locator('#x-matrix select').first().selectOption('2');
    await waitIdle();
    await tab.locator('#x-matrix select').nth(1).selectOption('4');
    await waitIdle();
    check('the Likelihood and Consequence selects are another way to choose',
      eq(await lastValue('incident-12', 'riskAssessment'), { likelihood: 2, consequence: 4, score: 8, rating: 'Medium' }) && (await cell('matrix', '2-4').getAttribute('aria-selected')) === 'true');
    const beforeDelete = await changeCount();
    await cell('matrix', '2-4').focus();
    await tab.keyboard.press('Delete');
    await waitIdle();
    check('a mandatory risk has no Clear, and Delete keeps it', (await count('#x-matrix .rm-clear')) === 0 && (await changeCount()) === beforeDelete);
    await tab.evaluate(() => host.updateDefinition('template-incident', 'riskAssessment', { enabled: false }));
    await waitIdle();
    check('read-only (a ruleset disables it): no tab stops or selects, marked read-only',
      (await count('#x-matrix [role=gridcell][tabindex]')) === 0 && (await count('#x-matrix select')) === 0 && (await tab.locator('#x-matrix [role=grid]').getAttribute('aria-readonly')) === 'true');
    const beforeReadOnlyClick = await changeCount();
    await cell('matrix', '1-1').click();
    await waitIdle();
    check('…clicking a cell changes nothing, and the result still shows', (await changeCount()) === beforeReadOnlyClick && eq(await resultParts(), ['Medium', 'Score 8', 'Unlikely × Major']));
    await tab.evaluate(() => host.updateDefinition('template-incident', 'riskAssessment', { enabled: true }));
    await waitIdle();

    section('Risk matrix: residual risk against the risk before controls');
    check('the inherent risk is a ghost marker in its cell', (await count('#x-residual .rm-ghost')) === 1 && (await count('#x-residual [data-cell="4-4"] .rm-ghost')) === 1);
    check('…with an arrow from it to the residual risk', (await count('#x-residual svg.rm-arrow polygon')) === 1);
    check('…a key, and the ghost cell says what it is',
      (await text('#x-residual .rm-compare')) === 'Before controls: Likely × Major · High 16' && (await cell('residual', '4-4').getAttribute('aria-label')).endsWith('; Before controls'),
      await text('#x-residual .rm-compare'));
    check('no warning while the residual risk is lower', (await count('#x-residual .rm-problem')) === 0);
    await cell('residual', '5-4').click();
    await waitIdle();
    check('a residual risk higher than the inherent one is flagged (and still written)',
      (await text('#x-residual .rm-problem')).includes("can't be higher than the risk before controls") &&
        eq(await lastValue('hazard-7', 'residualRisk'), { likelihood: 5, consequence: 4, score: 20, rating: 'Extreme' }),
      await text('#x-residual .rm-problem'));
    await cell('residual', '2-5').click();
    await waitIdle();
    check('so is a consequence that went up', (await text('#x-residual .rm-problem')).includes('neither can go up'));
    await tab.evaluate(() => host.setField('hazard-7', 'inherentRisk', { likelihood: 5, consequence: 5, score: 25, rating: 'Extreme' }));
    await waitIdle(400);
    check('it follows the inherent risk live: the ghost moves and the warning goes',
      (await count('#x-residual [data-cell="5-5"] .rm-ghost')) === 1 && (await count('#x-residual .rm-problem')) === 0);
    await tab.locator('#x-residual .rm-clear').click();
    await waitIdle();
    check('Clear empties a risk that isn’t mandatory', (await lastValue('hazard-7', 'residualRisk')) === null && (await count('#x-residual [aria-selected="true"]')) === 0 && (await count('#x-residual svg.rm-arrow')) === 0);

    section('Risk matrix: heatmap');
    const counts = await tab.locator('#x-heatmap [data-cell]').evaluateAll((els) =>
      Object.fromEntries(els.map((e) => [e.dataset.cell, e.querySelector('.rm-count')?.textContent.trim()]).filter(([, n]) => n !== '·')),
    );
    check('counts hazards per cell of their residual risk', eq(counts, { '4-2': '1', '2-2': '1', '2-4': '2', '1-5': '1' }), JSON.stringify(counts));
    const totals = () => texts('#x-heatmap .rm-summary__counts > *');
    check('a total and a count per rating; a hazard without a residual risk is left out and said so',
      eq(await totals(), ['5 hazards', 'Extreme 0', 'High 1', 'Medium 3', 'Low 1', '1 not assessed']), JSON.stringify(await totals()));
    const heatInclude = await tab.evaluate(() => host.searches.find((s) => s.sourceFilter?.include?.includes('residualRisk'))?.sourceFilter.include);
    check('it loads only the fields it needs', eq(heatInclude, ['documentId', 'residualRisk', 'systemHeader.summaryName']), JSON.stringify(heatInclude));
    await cell('heatmap', '2-4').click();
    await waitIdle(300);
    const listed = await texts('#x-heatmap .rm-list__link');
    check('a cell lists its hazards', eq(listed, ['HAZ-7: Pedestrians crossing the forklift aisle at dock 3', 'HAZ-8: Damaged pallet racking, aisle 12']), JSON.stringify(listed));
    check('…its cell says its list is open, and focus moves into the list',
      (await cell('heatmap', '2-4').getAttribute('aria-expanded')) === 'true' && (await focused('x-heatmap'))?.tag === 'A');
    await tab.locator('#x-heatmap .rm-list__link', { hasText: 'HAZ-8' }).click();
    await waitIdle();
    check('a hazard in the list opens it', eq(await lastEvent(), { type: 'navigate', detail: '/form/hazard-8' }) && (await count('#x-heatmap .rm-list')) === 0, JSON.stringify(await lastEvent()));
    await cell('heatmap', '2-4').focus();
    await tab.keyboard.press('ArrowDown');
    await tab.keyboard.press('ArrowRight');
    await tab.keyboard.press('Enter');
    await waitIdle(300);
    check('from the keyboard too', eq(await texts('#x-heatmap .rm-list__link'), ['HAZ-11: Battery charging bay ventilation']));
    await tab.keyboard.press('Escape');
    await waitIdle();
    check('Escape closes the list and returns to its cell', (await count('#x-heatmap .rm-list')) === 0 && (await focused('x-heatmap'))?.cell === '1-5', JSON.stringify(await focused('x-heatmap')));
    await cell('heatmap', '5-5').click({ force: true });
    await waitIdle();
    check('an empty cell has nothing to open', (await cell('heatmap', '5-5').getAttribute('aria-disabled')) === 'true' && (await count('#x-heatmap .rm-list')) === 0);
    await tab.evaluate(async () => {
      await window.FormbirdServiceInjector.DataService.insert({
        documentId: 'hazard-13',
        systemHeader: { systemType: 'document', summaryName: 'HAZ-13: Spill kit missing at the wash bay', templateId: 'template-hazard' },
        appTags: ['whs', 'hazard'],
        residualRisk: { likelihood: 5, consequence: 5, score: 25, rating: 'Extreme' },
      });
      host.saveForm('hazard-7');
    });
    await waitIdle(400);
    check('it counts again after a save in the app', (await text('#x-heatmap [data-cell="5-5"] .rm-count')) === '1' && eq((await totals()).slice(0, 2), ['6 hazards', 'Extreme 1']));

    section('Root cause: five whys');
    const answers = () => tab.locator('#x-rootCause textarea.rc-textarea:not(.rc-problem__input)').evaluateAll((els) => els.map((e) => e.value));
    const problems = () => texts('#x-rootCause .rc-problems__item');
    const nodeCard = (id) => tab.locator(`#x-rootCause [data-node="${id}"] > .rc-card`);
    const counts3 = async () => (await texts('#x-rootCause .rc-summary__counts > *')).join(' ');
    const tree = () => lastValue('incident-12', 'rootCauseTree');
    check('shows the problem and the stored whys, one under the other',
      (await tab.locator('#x-rootCause .rc-problem__input').inputValue()) === 'Forklift struck racking upright' &&
        eq(await answers(), ['The operator could not see the upright while reversing', 'The load was stacked above eye level']) &&
        eq(await texts('#x-rootCause .rc-depth'), ['Why 1', 'Why 2']));
    check('sums it up, and says what it still needs',
      (await counts3()) === '2 whys · 2 deep · 0 root causes' && eq(await problems(), ['Mark at least one answer as a root cause.']),
      `${await counts3()} ${JSON.stringify(await problems())}`);
    await nodeCard('w2').locator('.rc-actions button', { hasText: 'Ask why' }).click();
    await waitIdle();
    const asked = (await tree())?.nodes?.[0]?.children?.[0]?.children ?? [];
    check('Ask why adds an answer under it, saved at once', asked.length === 1 && asked[0].text === '' && typeof asked[0].id === 'string', JSON.stringify(await tree()));
    check('…focus moves to the new answer, “Why 3”',
      (await focused('x-rootCause'))?.tag === 'TEXTAREA' && (await focused('x-rootCause'))?.value === '' && (await text(`#x-rootCause [data-node="${asked[0]?.id}"] .rc-depth`)) === 'Why 3');
    check('…and a blank answer is flagged', (await problems()).includes('One why has no answer: fill it in or remove it.'));
    const beforeTyping = (await changesOf('incident-12', 'rootCauseTree')).length;
    await tab.keyboard.type('No height limit for loads on reach trucks', { delay: 12 });
    await waitIdle(700);
    const typed = (await changesOf('incident-12', 'rootCauseTree')).slice(beforeTyping);
    check('typing is saved once, after a pause', typed.length === 1 && typed[0].value.nodes[0].children[0].children[0].text === 'No height limit for loads on reach trucks', `${typed.length} writes`);
    const third = asked[0]?.id;
    await nodeCard(third).locator('.rc-toggle').click();
    await waitIdle();
    check('marking a root cause saves it and asks for a category',
      (await tree())?.nodes[0].children[0].children[0].root === true && (await problems()).includes('Give each root cause a category.') && (await text(`#x-rootCause [data-node="${third}"] .rc-category__needed`)) === 'Choose one');
    await nodeCard(third).locator('.rc-chip', { hasText: 'Procedure' }).click();
    await waitIdle();
    check('choosing a category completes the analysis',
      (await tree())?.nodes[0].children[0].children[0].category === 'Procedure' && (await count('#x-rootCause .rc-ready')) === 1 &&
        (await counts3()) === '3 whys · 3 deep · 1 root cause' &&
        eq(await texts('#x-rootCause .rc-roots__item > span'), ['No height limit for loads on reach trucks', 'Procedure']),
      await text('#x-rootCause .rc-summary'));
    await nodeCard('w1').locator('.rc-actions button', { hasText: 'Add another cause' }).click();
    await waitIdle();
    check('Add another cause adds one beside it', (await tree())?.nodes.length === 2 && (await focused('x-rootCause'))?.tag === 'TEXTAREA');
    const sibling = (await tree()).nodes[1].id;
    await tab.keyboard.type('The aisle lights were out');
    await tab.keyboard.press('Control+Enter');
    await waitIdle();
    check(`Ctrl+Enter asks why about the answer`, (await tree())?.nodes[1].children.length === 1 && (await tree()).nodes[1].text === 'The aisle lights were out' && (await focused('x-rootCause'))?.value === '');
    await tab.keyboard.type('Nobody reports faulty lights');
    await tab.keyboard.press('Enter');
    await waitIdle();
    check('Enter adds another cause beside it', (await tree())?.nodes[1].children.length === 2 && (await focused('x-rootCause'))?.value === '');
    await tab.keyboard.press('Enter');
    await tab.keyboard.type('Bulbs');
    await tab.keyboard.press('Shift+Enter');
    await tab.keyboard.type('are old');
    await waitIdle(600);
    check('…but not from an empty answer; Shift+Enter is a new line', (await tree())?.nodes[1].children.length === 2 && (await tree()).nodes[1].children[1].text === 'Bulbs\nare old', JSON.stringify((await tree())?.nodes[1]));
    const shallow = (await tree()).nodes[1].children[0].id;
    await nodeCard(shallow).locator('.rc-toggle').click();
    await nodeCard(shallow).locator('.rc-chip', { hasText: 'Environment' }).click();
    await waitIdle();
    check('a root cause only 2 whys deep falls short of minDepth 3', eq(await problems(), ['Ask why at least 3 times before settling on a root cause.']), JSON.stringify(await problems()));
    await nodeCard('w1').locator('button[aria-expanded]').click();
    await waitIdle();
    check('a branch collapses, saying how much is hidden', (await count('#x-rootCause [data-node="w2"]')) === 0 && (await text('#x-rootCause .rc-hidden')) === '2 whys hidden');
    await tab.locator('#x-rootCause .rc-hidden').click();
    await waitIdle();
    check('…and opens again', (await count('#x-rootCause [data-node="w2"]')) === 1);
    await nodeCard(sibling).locator('.rc-actions button[aria-label^="Remove"]').click();
    await waitIdle();
    check('removing an answer with answers under it asks first, focused on Keep',
      (await text(`#x-rootCause [data-node="${sibling}"] .rc-confirm__text`)) === 'Remove this why and the 2 answers under it?' && (await focused('x-rootCause'))?.text === 'Keep');
    await tab.keyboard.press('Enter');
    await waitIdle();
    check('Keep keeps it', (await count('#x-rootCause .rc-confirm')) === 0 && (await tree())?.nodes.length === 2 && (await focused('x-rootCause'))?.value === 'The aisle lights were out');
    await nodeCard(sibling).locator('.rc-actions button[aria-label^="Remove"]').click();
    await tab.locator('#x-rootCause .rc-confirm__remove').click();
    await waitIdle();
    check('Remove takes it and everything under it; focus goes to the answer before it',
      (await tree())?.nodes.length === 1 && (await count('#x-rootCause .rc-ready')) === 1 && (await focused('x-rootCause'))?.value === 'No height limit for loads on reach trucks');

    section('Root cause: a new incident');
    check('starts empty, offering the incident’s title as the problem',
      (await tab.locator('#x-rootCauseNew .rc-problem__input').inputValue()) === '' && (await text('#x-rootCauseNew .rc-suggest')) === 'Use “Chemical splash in the wash bay”');
    check('…and says what is missing', eq(await texts('#x-rootCauseNew .rc-problems__item'), ['Say what the problem is before asking why.', 'Ask why it happened, at least once.']));
    await tab.locator('#x-rootCauseNew .rc-empty button', { hasText: 'Ask why' }).click();
    await waitIdle();
    const first = await lastValue('incident-new', 'rootCauseTree');
    check('the first why takes the title as the problem', first?.problem === 'Chemical splash in the wash bay' && first.nodes.length === 1 && (await focused('x-rootCauseNew'))?.tag === 'TEXTAREA', JSON.stringify(first));

    section('Root cause: read-only');
    await tab.evaluate(() => host.updateDefinition('template-incident', 'rootCauseTree', { enabled: false }));
    await waitIdle();
    check('read-only shows the answers as text; only collapsing is left',
      (await count('#x-rootCause textarea')) === 0 && (await count('#x-rootCause button:not([aria-expanded])')) === 0 && (await count('#x-rootCause button[aria-expanded]')) === 2 &&
        eq(await texts('#x-rootCause .rc-text'), ['The operator could not see the upright while reversing', 'The load was stacked above eye level', 'No height limit for loads on reach trucks']) &&
        (await text('#x-rootCause .rc-category .rc-tag')) === 'Procedure');

    section('Corrective actions');
    const refs = (role) => texts(`#x-${role} .ca-ref`);
    const row = (ref) => tab.locator('#x-actions .ca-row', { has: tab.locator('.ca-ref', { hasText: ref }) });
    check('lists the incident’s actions, outstanding first; cancelled ones hidden', eq(await refs('actions'), ['ACT-31', 'ACT-33', 'ACT-32']), JSON.stringify(await refs('actions')));
    check('progress: 2 of 3 done (cancelled not counted)',
      (await text('#x-actions .ca-progress__text')) === '2 of 3 done' && (await tab.locator('#x-actions [role=progressbar]').getAttribute('aria-valuenow')) === '2' &&
        (await tab.locator('#x-actions [role=progressbar]').getAttribute('aria-valuemax')) === '3');
    check('an overdue badge, and the overdue action marked',
      (await text('#x-actions .ca-overdue')) === '1 overdue' && (await row('ACT-31').getAttribute('class')).includes('ca-row--overdue') && (await row('ACT-31').locator('.ca-due__text').textContent()) === 'Overdue · yesterday');
    check('done actions say so', (await row('ACT-33').getAttribute('class')).includes('ca-row--done') && (await row('ACT-33').locator('.ca-due__text').textContent()).startsWith('Done '));
    check('the strongest control in place', (await text('#x-actions .ca-strongest')) === 'Strongest control in place: Engineering');
    check('each row: control level, reference and title, owner, status',
      (await row('ACT-31').locator('.ca-level__name').textContent()) === 'Engineering' && (await row('ACT-31').locator('.ca-title').textContent()) === 'Install convex mirrors at the aisle 12 intersections' &&
        (await row('ACT-31').locator('.ca-owner__name').textContent()) === 'Daniel Okafor' && (await row('ACT-31').locator('.sj-lozenge__text').textContent()) === 'Open');
    const actionSearch = await tab.evaluate(() => host.searches.find((s) => JSON.stringify(s.filter).includes('"sourceRel.documentId":"incident-12"')));
    check('it searches for this record’s actions, sorted by due date inside the request',
      actionSearch?.filter?.sort?.[0]?.dueDate?.order === 'asc' && actionSearch.sourceFilter.include.includes('ownerRel') && JSON.stringify(actionSearch.filter).includes('"appTags":"action"'));
    await tab.locator('#x-actions .ca-toggle').click();
    await waitIdle();
    check('“Show 1 cancelled” shows it, struck through', eq(await refs('actions'), ['ACT-31', 'ACT-33', 'ACT-32', 'ACT-34']) && (await count('#x-actions .ca-row--cancelled')) === 1);
    await tab.locator('#x-actions .ca-toggle').click();
    await waitIdle();
    await row('ACT-31').locator('a').click();
    await waitIdle();
    check('an action opens from its row', eq(await lastEvent(), { type: 'navigate', detail: '/form/action-31' }));
    const searchesFor = () => tab.evaluate(() => host.searches.filter((s) => JSON.stringify(s.filter).includes('"sourceRel.documentId":"incident-12"')).length);
    const searchedBefore = await searchesFor();
    await tab.evaluate(() => host.saveForm('incident-12'));
    await waitIdle(300);
    check('it looks again after a save in the app', (await searchesFor()) === searchedBefore + 1);

    section('Corrective actions: adding one');
    const actionInserts = () => tab.evaluate(() => host.events.filter((e) => e.type === 'insert' && e.detail.appTags?.includes('action')).map((e) => e.detail));
    await tab.locator('#x-actions button', { hasText: 'Add action' }).click();
    await waitIdle();
    check('Add action opens the form, on the title', (await focused('x-actions'))?.name === 'title');
    const expectedDay = (await dueFrom(new Date().toISOString(), 7)).slice(0, 10);
    check('the due date defaults from the High rating: 7 days',
      (await tab.locator('#x-actions input[type=date]').inputValue()) === expectedDay && (await text('#x-actions .ca-due-field .ca-field__hint')) === 'High risk: due within 7 days',
      `${await tab.locator('#x-actions input[type=date]').inputValue()} vs ${expectedDay}`);
    await tab.locator('#x-actions button[type=submit]').click();
    await waitIdle();
    const formErrors = await texts('#x-actions .ca-form .ca-field__error, #x-actions .ca-form .sj-field__errors p');
    check('saving with nothing filled in says what each field needs, as the action rules would, and saves nothing',
      eq(formErrors, ['Say what will be done.', 'Choose the control level.', 'Choose who owns the action.']) && (await actionInserts()).length === 0 && (await focused('x-actions'))?.name === 'title',
      JSON.stringify(formErrors));
    await tab.locator('#x-actions input[name=title]').fill('Fit blue spot warning lights to the reach trucks');
    check('the control levels run from Eliminate to PPE', eq(await texts('#x-actions .ca-levels__name'), ['Eliminate', 'Substitute', 'Isolate', 'Engineering', 'Administrative', 'PPE']));
    await tab.locator('#x-actions .ca-levels__option', { hasText: 'Engineering' }).click();
    await waitIdle();
    check('…each with its hint', (await text('#x-actions .ca-levels__hint')).startsWith('Engineering: Change the plant or process'), await text('#x-actions .ca-levels__hint'));
    await tab.locator('#x-actions button[type=submit]').click();
    await waitIdle();
    check('…and moves to the first one still missing', (await focused('x-actions'))?.tag === 'BUTTON' && eq(await texts('#x-actions .ca-form .sj-field__errors p'), ['Choose who owns the action.']));
    const pickOwner = async (name) => {
      await tab.locator('#x-actions .ca-owner-field .sj-trigger').click();
      await waitIdle(300);
      await tab.locator('#x-actions li[role=option]', { hasText: name }).click();
      await waitIdle();
    };
    await pickOwner('Liam Murphy');
    check('an owner comes from the people picker', (await text('#x-actions .ca-owner-field .sj-trigger .sj-truncate')) === 'Liam Murphy' && (await count('#x-actions .ca-form .sj-field__errors')) === 0, await text('#x-actions .ca-owner-field .sj-trigger'));
    await tab.locator('#x-actions button[type=submit]').click();
    await waitIdle(300);
    const [inserted] = await actionInserts();
    const source = inserted?.sourceRel?.[0] ?? {};
    check('saving creates the action through DataService.insert, with its template',
      inserted?.systemHeader?.templateId === 'template-action' && eq(inserted.appTags, ['whs', 'action']) && inserted.title === 'Fit blue spot warning lights to the reach trucks', JSON.stringify(inserted));
    check('…pointing back at the incident, its reference and rating',
      source.documentId === 'incident-12' && source.name === 'INC-12: Forklift struck racking upright' && source.ref === 'INC-12' && source.kind === 'incident' && source.riskRating === 'High',
      JSON.stringify(source));
    check('…with the control level, owner and Open status values',
      inserted?.controlLevelRel?.[0]?.documentId === 'controlLevel-engineering' && inserted.controlLevelRel[0].rank === 4 &&
        eq(inserted.ownerRel, [{ documentId: 'account-liam', name: 'Liam Murphy', email: 'liam.murphy@example.com', accountType: 'Supervisor' }]) &&
        inserted.actionStatusRel?.[0]?.documentId === 'actionStatus-open' && inserted.actionStatusRel[0].name === 'Open',
      JSON.stringify(inserted));
    check('…raised now, due 7 days on at the end of the working day', !!inserted && inserted.dueDate === (await dueFrom(inserted.raisedDate, 7)) && Math.abs(Date.parse(inserted.raisedDate) - Date.now()) < 60_000, `${inserted?.raisedDate} → ${inserted?.dueDate}`);
    check('the new action shows straight away, and the form closes',
      (await count('#x-actions .ca-form')) === 0 && (await count(`#x-actions .ca-row a[href="/form/${inserted?.documentId}"]`)) === 1 && (await text('#x-actions .ca-progress__text')) === '2 of 4 done');
    check('…with focus on it', (await focused('x-actions'))?.tag === 'A' && (await focused('x-actions'))?.text.includes('Fit blue spot warning lights'));
    await tab.evaluate(() => host.refuse('insert', 'An action needs an owner before it can be raised.'));
    await tab.locator('#x-actions button', { hasText: 'Add action' }).click();
    await tab.locator('#x-actions input[name=title]').fill('Toolbox talk on reversing');
    await tab.locator('#x-actions .ca-levels__option', { hasText: 'Administrative' }).click();
    await pickOwner('Aisha Rahman');
    await tab.locator('#x-actions button[type=submit]').click();
    await waitIdle(300);
    check('a refused save shows the server’s message and keeps the form',
      (await text('#x-actions .ca-form__error')) === 'An action needs an owner before it can be raised.' && (await tab.locator('#x-actions input[name=title]').inputValue()) === 'Toolbox talk on reversing' && (await actionInserts()).length === 1);
    await tab.evaluate(() => host.refuse('insert', null));
    await tab.locator('#x-actions .ca-form button', { hasText: 'Cancel' }).click();
    await waitIdle();
    check('Cancel closes the form', (await count('#x-actions .ca-form')) === 0 && (await focused('x-actions'))?.text === 'Add action');

    section('Corrective actions: an unsaved incident, a hazard');
    check('an incident that hasn’t been saved can’t take actions yet',
      (await text('#x-actionsNew .ca-unsaved')) === 'Save the incident first, then add its actions.' && (await count('#x-actionsNew button')) === 0);
    check('…and isn’t searched for', !(await tab.evaluate(() => host.searches.some((s) => JSON.stringify(s.filter).includes('incident-new')))));
    await tab.evaluate(() => host.saveForm('incident-new'));
    await waitIdle(400);
    check('once it is saved, actions can be added', (await count('#x-actionsNew button', )) === 1 && (await text('#x-actionsNew .ca-empty__title')) === 'No actions yet.');
    check('a hazard lists only its own actions', eq(await refs('hazardActions'), ['ACT-41']));
    await tab.locator('#x-hazardActions button', { hasText: 'Add control' }).click();
    await waitIdle();
    check('…and dates new ones by its residual rating', (await text('#x-hazardActions .ca-due-field .ca-field__hint')) === 'Medium risk: due within 30 days');
    await tab.keyboard.press('Escape');
    await waitIdle();
    check('Escape closes the form', (await count('#x-hazardActions .ca-form')) === 0);

    section('Theme');
    await tab.evaluate(() => document.body.classList.add('dark-theme'));
    await waitIdle();
    const themes = await tab.evaluate(() => [...document.querySelectorAll('[fb-component-version]')].map((e) => e.getAttribute('data-sj-theme')));
    check('body.dark-theme switches every element to dark', themes.length === 9 && themes.every((t) => t === 'dark'), JSON.stringify(themes));
  },
};
