// Browser test of the elements the HR app uses, BUILT, against the in-memory host and a small HR
// data set (packages/fixtures), loaded the way fieldtec-web loads them: Solid runtime, the kit, then
// the elements (this repo's and shared's). The harness and mock host come from
// solidjs-components-shared. Run: pnpm test:browser.

/** One element per role; wide roles span both columns. */
const ROLES = ['calendar', 'dates', 'balance', 'approval', 'decided', 'balances', 'matrix', 'org', 'orgFocus', 'unpaidBalance'];
const WIDE = ['calendar', 'balances', 'matrix', 'org'];

export default {
  components: ['solid-date-range', 'solid-approval-chain', 'solid-resource-schedule', 'solid-leave-balance', 'solid-skills-matrix', 'solid-org-chart'],
  setupScripts: ['repo:dist-dev/hr-fixtures/hr-fixtures.js'],

  hostSetup: `const f = HrFixtures;
  window.host = T.installMockHost({ documents: f.documents, forms: f.forms, currentAccountId: f.CURRENT_ACCOUNT_ID });`,

  body: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;width:1240px">${ROLES.map(
    (role) => `<div id="slot-${role}" style="${WIDE.includes(role) ? 'grid-column:1/-1' : ''}"></div>`,
  ).join('')}</div>`,

  pageScript: `
  const formFor = {
    calendar: f.dashboard, balances: f.dashboard, matrix: f.dashboard, org: f.dashboard,
    dates: f.newLeave, balance: f.newLeave, unpaidBalance: f.unpaidLeave, approval: f.meiLeave, decided: f.decidedLeave, orgFocus: f.sarahProfile,
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
    const changesOf = (documentId, fieldName) => tab.evaluate(([d, n]) => host.changes.filter((c) => c.documentId === d && c.fieldName === n), [documentId, fieldName]);
    const lastValue = async (documentId, fieldName) => (await changesOf(documentId, fieldName)).at(-1)?.value;
    const stored = (templateId) => tab.evaluate((t) => JSON.parse(host.storage['initialData:' + t] ?? 'null'), templateId);
    const f = await tab.evaluate(() => ({ day: [0, 1, 2, 3, 4].map((n) => HrFixtures.day(1, n)), week3: HrFixtures.day(3, 0), today: HrFixtures.dayFromToday(0), holiday: HrFixtures.HOLIDAY }));
    await waitIdle(800);

    section('Leave balance: on a request');
    const figures = await texts('#x-balance .lb-figure__value');
    check('shows what is available on the first day, this request and what is left', figures.length === 3 && figures[1] === '5 days' && /^\d+(\.\d)? days$/.test(figures[0]), JSON.stringify(figures));
    const available = Number(figures[0].split(' ')[0]);
    check('…and what is left is the difference', figures[2] === `${Math.round((available - 5) * 10) / 10} days`, JSON.stringify(figures));
    const written = await lastValue('leave-new', 'availableDaysNum');
    check('writes the available days for the client rule', typeof written === 'number' && Math.abs(written - available) < 0.06, String(written));
    await tab.evaluate(() => host.setField('leave-new', 'daysNum', 40));
    await waitIdle();
    check('more than the balance is flagged', /^That's [\d.]+ days more annual leave than James will have on /.test(await text('#x-balance .lb-over')), await text('#x-balance .lb-over'));
    await tab.evaluate(() => host.setField('leave-new', 'daysNum', 5));
    await waitIdle();
    check('a type without a balance says so', (await text('#x-unpaidBalance .lb-hint')) === "Leave without pay doesn't come from a balance.");
    const cards = await texts('#x-balances .lb-card__name');
    check('the summary has a card per balance', eq(cards, ['Annual leave', "Personal/carer's leave"]), JSON.stringify(cards));

    section('Date range: days');
    check('counts working days and shows the strip', (await text('#x-dates .dr-days-count')) === '5 working days' && (await count('#x-dates .dr-strip__day')) === 5);
    await tab.locator('#x-dates .dr-half', { hasText: 'Ends at midday' }).click();
    await waitIdle();
    check('a half day writes its field and the count', (await lastValue('leave-new', 'endHalfBool')) === true && (await lastValue('leave-new', 'daysNum')) === 4.5 && (await text('#x-dates .dr-days-count')) === '4.5 working days');
    check('…and the strip shows the half', (await count('#x-dates .dr-strip__day--am')) === 1);
    await tab.locator('#x-dates input[type=date]').first().fill(f.day[0]);
    await waitIdle();
    const start = await lastValue('leave-new', 'startDate');
    check('moving the first day keeps the length, as starts of days in the time zone', start === `${f.day[0]}T00:00:00.000Z` && (await lastValue('leave-new', 'endDate')) === `${f.day[4]}T00:00:00.000Z`, `${start} ${await lastValue('leave-new', 'endDate')}`);
    check('a public holiday is not counted (nor the half day on it), and is named', (await text('#x-dates .dr-days-count')) === '4 working days' && (await text('#x-dates .dr-duration .dr-max')).includes(f.holiday.name) && (await count('#x-dates .dr-strip__day--holiday')) === 1, await text('#x-dates .dr-duration'));
    await tab.locator('#x-dates .dr-preset', { hasText: '2 days' }).click();
    await waitIdle();
    check('a quick length counts working days and clears the halves', (await lastValue('leave-new', 'daysNum')) === 2 && (await lastValue('leave-new', 'endHalfBool')) === false && (await lastValue('leave-new', 'endDate')) === `${f.day[1]}T00:00:00.000Z`);

    section('Approval chain: deciding');
    check('says it is your turn, with both steps', (await text('#x-approval .ac-head__text')) === 'Waiting for your decision' && (await count('#x-approval .ac-step')) === 2 && (await text('#x-approval .ac-step--current .ac-step__label')) === 'Line manager');
    check('the second step says why it is there', (await text('#x-approval .ac-step--waiting .ac-step__reason')).startsWith('Parramatta Nursing would have 2 of 5'));
    const before = await changeCount();
    await tab.locator('#x-approval .ac-reject').click();
    await waitIdle();
    check('a rejection needs a reason, and nothing is written without one', (await text('#x-approval .ac-problem')) === 'Say why you are rejecting it.' && (await changeCount()) === before);
    await tab.locator('#x-approval textarea').fill('Covered by an agency nurse.');
    await tab.locator('#x-approval .ac-approve').click();
    await waitIdle();
    const chain = await lastValue('lv-2', 'approvalChain');
    check('approving writes the decision in your name, with the comment', chain?.steps?.[0]?.decision === 'approved' && chain.steps[0].decidedBy.documentId === 'account-sarah' && chain.steps[0].comment === 'Covered by an agency nurse.' && chain.steps[1].decision === '', JSON.stringify(chain?.steps?.[0]));
    check('…says to save, and the chain moves on to the second approver', (await count('#x-approval .ac-saved-note')) === 1 && (await text('#x-approval .ac-head__text')) === 'Waiting for David Chen' && (await count('#x-approval .ac-action')) === 0, await text('#x-approval .ac-head__text'));
    await tab.locator('#x-approval .ac-link', { hasText: 'Undo' }).click();
    await waitIdle();
    check('Undo puts it back', (await lastValue('lv-2', 'approvalChain'))?.steps?.[0]?.decision === '' && (await count('#x-approval .ac-action')) === 1);
    await tab.locator('#x-approval button', { hasText: 'Hand to someone else' }).click();
    await waitIdle();
    check('an approver can hand the step to someone else', (await count('#x-approval .ac-delegate')) === 1);
    check('a decided chain shows who decided, with no decision card', (await text('#x-decided .ac-head__text')) === 'Approved' && (await text('#x-decided .ac-decision')).includes('Approved by Sarah Mitchell') && (await count('#x-decided .ac-action')) === 0);

    section('Resource schedule: the leave calendar');
    check('people grouped by team, with their figures', (await count('#x-calendar .rs-row--group')) === 2 && (await count('#x-calendar .rs-row:not(.rs-row--head):not(.rs-row--group)')) === 7 && (await count('#x-calendar .rs-figure')) === 7);
    check('leave as bars; pending ones hatched', (await count('#x-calendar .rs-bar')) === 4 && (await count('#x-calendar .rs-bar--tentative')) === 2, String(await count('#x-calendar .rs-bar')));
    const below = await tab.locator('#x-calendar .rs-staff--below').evaluateAll((els) => els.map((e) => e.getAttribute('title')));
    check('a day below the team’s minimum is flagged, with who is away', below.length === 1 && /^2\.5 of 5 in \(minimum 3\)\. Away: /.test(below[0] ?? ''), JSON.stringify(below));
    check('the public holiday is shaded', (await count('#x-calendar .rs-day-head.rs-day--holiday')) === 1);
    check('the signed-in person’s row stands out', (await text('#x-calendar .rs-row--me .rs-name__link')) === 'Sarah Mitchell');
    const range = await text('#x-calendar .rs-range');
    await tab.locator('#x-calendar button[aria-label="Later"]').click();
    await waitIdle();
    check('Later moves a week on', (await text('#x-calendar .rs-range')) !== range);
    await tab.locator('#x-calendar .sj-segmented button', { hasText: '4 weeks' }).click();
    await tab.locator('#x-calendar button', { hasText: 'Today' }).click();
    await waitIdle();
    check('4 weeks shows 28 days', (await count('#x-calendar .rs-day-head')) === 28);
    const cell = (key) => tab.locator(`#x-calendar .rs-row--me [data-day="${key}"]`);
    const from = await cell(f.week3).boundingBox();
    const to = await cell(new Date(Date.parse(`${f.week3}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10)).boundingBox();
    await tab.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await tab.mouse.down();
    await tab.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
    await tab.mouse.up();
    await waitIdle();
    check('dragging across your own row picks the days', /^You: .+ · 3 working days$/.test(await text('#x-calendar .rs-pick__text')), await text('#x-calendar .rs-pick__text'));
    await tab.locator('#x-calendar .rs-pick button', { hasText: 'Request leave' }).click();
    await waitIdle();
    const values = await stored('template-leave');
    check('…and starts a request for you on those days', values?.employeeRel?.[0]?.documentId === 'account-sarah' && values.startDate === `${f.week3}T00:00:00.000Z` && !!values.endDate, JSON.stringify(values));
    check('another person’s row can’t be dragged on (createFor "me")', (await count('#x-calendar .rs-track--create')) === 1);

    section('Skills matrix');
    const stats = await texts('#x-matrix .sm-stat strong');
    check('sums up compliance, expired, expiring and missing', eq(stats, ['86%', '1', '2', '1']), JSON.stringify(stats));
    check('the latest certificate counts (a renewal replaces the old one)', (await text('#x-matrix .sm-row:nth-child(3) .sm-cell--expiring .sm-chip')) === '12 d' || (await count('#x-matrix .sm-cell--expiring')) === 2);
    check('cells by state', (await count('#x-matrix .sm-cell--valid')) === 10 && (await count('#x-matrix .sm-cell--expired')) === 1 && (await count('#x-matrix .sm-cell--missing')) === 1 && (await count('#x-matrix .sm-cell--held')) === 1,
      JSON.stringify(await tab.locator('#x-matrix .sm-cell').evaluateAll((els) => els.map((e) => e.className.split(' ')[1]))));
    await tab.locator('#x-matrix .sj-segmented button', { hasText: 'Needs attention' }).click();
    await waitIdle();
    check('Needs attention shows only people with something to fix', eq(await texts('#x-matrix .sm-person__name'), ['James Okoro', 'Lucy Hart', 'Mei Lin', 'Grace Kim']), JSON.stringify(await texts('#x-matrix .sm-person__name')));
    await tab.locator('#x-matrix .sj-segmented button', { hasText: 'Everyone' }).click();
    await tab.locator('#x-matrix .sm-search input').fill('recep');
    await waitIdle();
    check('search finds by role or team', eq(await texts('#x-matrix .sm-person__name'), ['Grace Kim', 'Sofia Rossi']), JSON.stringify(await texts('#x-matrix .sm-person__name')));
    await tab.locator('#x-matrix .sm-search input').fill('');
    await waitIdle();
    await tab.locator('#x-matrix .sm-cell--missing button').click();
    await waitIdle();
    const cert = await stored('template-certificate');
    check('a missing certificate starts one for that person and type', cert?.personRel?.[0]?.documentId === 'account-lucy' && cert?.certTypeRel?.[0]?.name === 'First aid (HLTAID011)', JSON.stringify(cert));

    section('Org chart');
    check('everyone, by who they report to', (await count('#x-org .oc-card')) === 7 && (await text('#x-org .oc-tree > .oc-node > .oc-card .oc-name')) === 'David Chen');
    check('who is on leave today', eq(await tab.locator('#x-org .oc-card:has(.oc-away)').locator('.oc-name').allTextContents(), ['Sofia Rossi']));
    await tab.locator('#x-org .oc-card[data-person="account-sarah"] .oc-toggle').click();
    await waitIdle();
    check('closing a branch hides the people in it', (await count('#x-org .oc-card')) === 4);
    await tab.locator('#x-org .oc-search input').fill('lucy');
    await tab.locator('#x-org .oc-search input').press('Enter');
    await waitIdle(500);
    check('search opens the reporting line to the person found', (await count('#x-org .oc-card')) === 7 && (await tab.locator('#x-org .oc-card--hit .oc-name').textContent()) === 'Lucy Hart');
    check('on a person’s form: their line and their reports', eq((await texts('#x-orgFocus .oc-name')).sort(), ['David Chen', 'James Okoro', 'Lucy Hart', 'Mei Lin', 'Sarah Mitchell']) && (await count('#x-orgFocus .oc-card--focus')) === 1);

    section('Theme');
    await tab.evaluate(() => document.body.classList.add('dark-theme'));
    await waitIdle();
    const themes = await tab.evaluate(() => ['x-calendar', 'x-matrix', 'x-org', 'x-approval', 'x-balance', 'x-dates'].map((id) => document.getElementById(id).getAttribute('data-sj-theme')));
    check('every element follows dark mode', themes.every((t) => t === 'dark'), JSON.stringify(themes));
    if (process.env.SHOT) await tab.screenshot({ path: process.env.SHOT, fullPage: true });
  },
};
