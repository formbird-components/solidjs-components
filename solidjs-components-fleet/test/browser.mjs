// Browser test of this repo's BUILT elements against the in-memory host and a small fleet
// (packages/fixtures), loaded the way fieldtec-web loads them: Solid runtime, OpenLayers (the test
// copy of openlayers-shared), the kit, then the elements. The harness and mock host come from
// solidjs-components-shared. Run: pnpm test:browser.

// A 1×1 tile, so maps need no network.
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

const ROLES = ['tiles', 'calendar', 'period', 'availability', 'summary', 'location', 'map', 'meter', 'checks', 'sheet', 'lines'];

export default {
  components: [
    'solid-stat-tiles',
    'solid-booking-calendar',
    'solid-date-range',
    'solid-map',
    'solid-asset-summary',
    'solid-meter-reading',
    'solid-checklist',
    'solid-line-items',
  ],
  setupScripts: ['repo:dist-dev/fleet-fixtures/fleet-fixtures.js'],
  vendorScripts: ['shared:dist-dev/openlayers/openlayers.js'],
  // OpenLayers 6 reads its hit-detection canvas back; Chrome suggests willReadFrequently. Not ours.
  ignoreConsole: [/willReadFrequently/],

  hostSetup: `const f = FleetFixtures;
  window.host = T.installMockHost({ documents: f.documents, forms: f.forms, currentAccountId: f.CURRENT_ACCOUNT_ID });`,

  body: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;width:1240px">${ROLES.map(
    (role) => `<div id="slot-${role}" style="${['tiles', 'calendar', 'map'].includes(role) ? 'grid-column:1/-1' : ''}"></div>`,
  ).join('')}</div>`,

  pageScript: `
  const formFor = { tiles: f.dashboard, calendar: f.dashboard, map: f.dashboard, period: f.newBooking, availability: f.newBooking,
    summary: f.assets.v101, location: f.assets.v101, meter: f.dailyDriver, checks: f.dailyDriver, sheet: f.handSheet, lines: f.workOrder };
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

  async prepare(context) {
    await context.route(/tile\.openstreetmap\.org/, (route) => route.fulfill({ contentType: 'image/png', body: TILE }));
  },

  async run({ tab, check, eq, section, waitIdle, lastChange }) {
    const text = (selector) => tab.locator(selector).first().textContent();
    const changesFor = (field) => tab.evaluate((name) => host.changes.filter((c) => c.fieldName === name), field);
    await waitIdle(600);

    section('Stat tiles');
    const tiles = await tab.locator('#x-tiles .st-tile').evaluateAll((els) => els.map((e) => [e.querySelector('.st-label').textContent.trim(), e.querySelector('.st-value').textContent.trim()]));
    check('each tile counts its filter', eq(tiles, [['Available For Hire', '2'], ['On Hire', '1'], ['Hire Overdue', '1'], ['Rego due in 30 days', '1']]), JSON.stringify(tiles));
    const countRequest = await tab.evaluate(() => host.searches.find((s) => JSON.stringify(s.filter).includes('Hire Commenced') && s.trackTotalHits));
    check('counts ask for exact totals (trackTotalHits)', !!countRequest);
    check('the overdue tile is "bad", the rego tile "warn"', (await tab.locator('#x-tiles .st-tile--bad').count()) === 1 && (await tab.locator('#x-tiles .st-tile--warn').count()) === 1);
    await tab.locator('#x-tiles a.st-link').first().click();
    await waitIdle();
    check('a tile with a link opens its page in-app', eq(await tab.evaluate(() => host.events.at(-1)), { type: 'navigate', detail: '/form/page-assets' }));

    section('Booking calendar');
    const rows = await tab.locator('#x-calendar .bc-row .bc-label__id').allTextContents();
    check('assets are rows, grouped by location then ID', eq(rows, ['F-301', 'V-101', 'V-102', 'U-201']), JSON.stringify(rows));
    const groups = await tab.locator('#x-calendar .bc-group__title').allTextContents();
    check('location groups with counts', groups.length === 2 && groups[0].includes('Alexandria Depot') && groups[0].includes('3') && groups[1].includes('Parramatta Depot'), JSON.stringify(groups));
    const bk11 = tab.locator('#x-calendar .bc-bar', { hasText: 'BK-11' });
    check('a reserved booking is a bar on its asset, with its status', (await bk11.count()) === 1 && (await bk11.getAttribute('aria-label')).includes('Asset Reserved'));
    const overdue = tab.locator('#x-calendar .bc-bar--overdue');
    check('a hire out past its end shows as Hire Overdue', (await overdue.count()) === 1 && (await overdue.getAttribute('aria-label')).includes('BK-12') && (await overdue.getAttribute('aria-label')).includes('Hire Overdue'));
    check('a workshop request blocks its asset', (await tab.locator('#x-calendar .bc-bar--block', { hasText: 'REQ-4' }).count()) === 1);
    const bookingQuery = await tab.evaluate(() => JSON.stringify(host.searches.find((s) => JSON.stringify(s.filter).includes('"bookingRef"') || (JSON.stringify(s.filter).includes('appTags":"booking') && JSON.stringify(s.filter).includes('startDate')))?.filter ?? null));
    check('bookings are searched by asset and overlap with the window, plus unreturned hires', bookingQuery.includes('"assetRel.documentId"') && bookingQuery.includes('"startDate":{"lt"') && bookingQuery.includes('"bookingStatusRel.name":"Hire Commenced"'), bookingQuery.slice(0, 300));
    await bk11.click();
    await waitIdle();
    check('clicking a bar opens the booking', eq(await tab.evaluate(() => host.events.at(-1)), { type: 'navigate', detail: '/form/booking-bk-11' }));

    // Drag from free time at 08:30 into BK-11 (10:00–13:00) on V-101, then across free 15:00–16:30 on U-201.
    const dragOn = async (assetId, fromHour, toHour) => {
      const row = tab.locator('#x-calendar .bc-row', { has: tab.locator('.bc-label__id', { hasText: assetId }) });
      const track = row.locator('.bc-track');
      await tab.locator('#x-calendar .bc-scroll').evaluate((el, hour) => (el.scrollLeft = Math.max(0, hour * 56 - 300)), fromHour);
      await waitIdle(100);
      const box = await track.boundingBox();
      const xAt = (hour) => box.x + hour * 56 + 4;
      await tab.mouse.move(xAt(fromHour), box.y + box.height / 2);
      await tab.mouse.down();
      await tab.mouse.move(xAt(toHour) - 8, box.y + box.height / 2, { steps: 6 });
      await tab.mouse.up();
      await waitIdle();
    };
    await dragOn('V-101', 8.5, 10.5);
    const clashText = await tab.locator('.bc-pop').textContent().catch(() => '');
    check('dragging across booked time offers the booking but shows the clash', clashText.includes('V-101') && clashText.includes('Clashes with BK-11'), clashText);
    check('…and won’t book it', await tab.locator('.bc-pop button', { hasText: 'Book V-101' }).isDisabled());
    await tab.keyboard.press('Escape');
    await waitIdle();
    await dragOn('U-201', 15, 16.5);
    await tab.locator('.bc-pop button', { hasText: 'Book U-201' }).click();
    await waitIdle();
    const initial = await tab.evaluate(() => JSON.parse(host.storage['initialData:template-booking'] ?? 'null'));
    const start = new Date(initial?.startDate ?? 0);
    check(
      'booking free time starts a new booking with the asset and times filled in',
      initial?.assetRel?.[0]?.documentId === 'asset-u-201' && initial.assetRel[0].assetId === 'U-201' && start.getHours() === 15 && start.getMinutes() === 0 &&
        new Date(initial.endDate) - start === 1.5 * 3_600_000 && eq(await tab.evaluate(() => host.events.at(-1)), { type: 'navigate', detail: '/form/template-booking' }),
      JSON.stringify(initial),
    );
    await tab.locator('#x-calendar button[aria-label="Next day"]').click();
    await waitIdle(400);
    check('the next day shows tomorrow’s bookings', (await tab.locator('#x-calendar .bc-bar', { hasText: 'BK-13' }).count()) === 1);
    await tab.locator('#x-calendar button', { hasText: 'Week' }).click();
    await waitIdle(400);
    check('the week view shows the week from Monday', /–/.test(await text('#x-calendar .bc-range')) && (await tab.locator('#x-calendar .bc-tick').count()) === 7);
    await tab.locator('#x-calendar .bc-search input').fill('ute');
    await waitIdle();
    check('finding an asset narrows the rows', eq(await tab.locator('#x-calendar .bc-row .bc-label__id').allTextContents(), ['U-201']));

    section('Date range');
    check('shows the period and its length against the asset’s maximum', (await text('#x-period .dr-duration')).replace(/\s+/g, ' ').trim() === '3 h of max 48 h', await text('#x-period .dr-duration'));
    const startBefore = await tab.evaluate(() => host.form('booking-new').startDate);
    await tab.locator('#x-period .dr-preset', { hasText: '2 h' }).click();
    await waitIdle();
    const afterPreset = await tab.evaluate(() => host.form('booking-new'));
    check('a quick duration sets the end from the start', afterPreset.startDate === startBefore && new Date(afterPreset.endDate) - new Date(afterPreset.startDate) === 2 * 3_600_000);
    const endDate = tab.locator('#x-period .dr-row').nth(1).locator('input[type=date]');
    const startDay = await tab.locator('#x-period .dr-row').first().locator('input[type=date]').inputValue();
    const threeDaysLater = new Date(new Date(`${startDay}T12:00`).getTime() + 3 * 86_400_000);
    await endDate.fill(`${threeDaysLater.getFullYear()}-${String(threeDaysLater.getMonth() + 1).padStart(2, '0')}-${String(threeDaysLater.getDate()).padStart(2, '0')}`);
    await endDate.dispatchEvent('change');
    await waitIdle();
    check('longer than the asset allows is flagged', (await text('#x-period .dr-problems')).includes('at most 48 hours'), await text('#x-period .dr-problems'));
    const beforeMove = await tab.evaluate(() => host.form('booking-new'));
    const startTime = tab.locator('#x-period .dr-row').first().locator('select');
    await startTime.selectOption('09:00');
    await waitIdle();
    const moved = await tab.evaluate(() => host.form('booking-new'));
    const length = (form) => new Date(form.endDate) - new Date(form.startDate);
    check('moving the start keeps the length', new Date(moved.startDate).getHours() === 9 && length(moved) === length(beforeMove), JSON.stringify({ beforeMove, moved }));
    // Put the period back to 11:00–14:00 for the availability checks.
    await tab.evaluate(() => {
      const d = new Date();
      d.setHours(11, 0, 0, 0);
      host.setField('booking-new', 'startDate', d.toISOString());
      d.setHours(14);
      host.setField('booking-new', 'endDate', d.toISOString());
    });
    await waitIdle(500);

    section('Availability');
    check('the chosen asset isn’t free: it says so', (await text('#x-availability .av-status')).includes('isn’t free then') || (await text('#x-availability .av-status')).includes("isn't free then"), await text('#x-availability .av-status'));
    check('…and lists the clash', (await text('#x-availability .av-clashes')).includes('BK-11'));
    const free = await tab.locator('#x-availability .av-option__id').allTextContents();
    check('it offers what is free instead, leaving out unavailable and unreturned assets', eq(free, ['U-201']), JSON.stringify(free));
    await tab.locator('#x-availability .av-option', { hasText: 'U-201' }).click();
    await waitIdle(500);
    const assetChange = (await changesFor('assetRel')).at(-1);
    check(
      'choosing one writes the booking’s asset as its picker would',
      eq(assetChange?.value, [{ documentId: 'asset-u-201', name: 'U-201 · Toyota HiLux SR · BT77AA', assetId: 'U-201', maxBookingHours: 72 }]),
      JSON.stringify(assetChange),
    );
    check('then the asset is free for the whole period', (await text('#x-availability .av-status')).includes('free for the whole period'));
    check('the date range follows the new asset’s maximum', (await text('#x-period .dr-duration')).includes('max 72 h'));

    section('Asset summary');
    const heading = (await text('#x-summary .as-title')).replace(/\s+/g, ' ').trim();
    check('ID, make and model, and year', heading === 'V-101 Toyota HiAce 2023', heading);
    check('registration plate and statuses', (await text('#x-summary .as-plate')) === 'CX45LM' && eq(await tab.locator('#x-summary .sj-lozenge__text').allTextContents(), ['Active', 'Available For Hire']));
    const facts = (await tab.locator('#x-summary .as-fact__value').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
    check('meter, next service (km or date) and rego due', facts[0] === '48,210 km' && facts[1].startsWith('790 km or') && facts[2] === 'Due in 12 days', JSON.stringify(facts));
    check('a service within the lead is "Due Soon"', (await text('#x-summary .as-fact--service .as-fact__hint')).includes('Due Soon'));
    await tab.locator('#x-summary button', { hasText: 'Report a fault' }).click();
    await waitIdle();
    const fault = await tab.evaluate(() => JSON.parse(host.storage['initialData:template-request'] ?? 'null'));
    check('a quick action starts a new record for this asset', fault?.assetRel?.[0]?.documentId === 'asset-v-101' && fault.assetRel[0].assetId === 'V-101' && fault.assetRel[0].name.startsWith('V-101'), JSON.stringify(fault));

    section('Map');
    check('OpenLayers drew a map', (await tab.locator('#x-map canvas').count()) > 0);
    const layers = (await tab.locator('#x-map .mp-layer').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
    check('layers with their counts', eq(layers, ['Assets 4', 'Depots 2']), JSON.stringify(layers));
    check('the list names every asset on the map', (await tab.locator('#x-map .mp-item').count()) === 4);
    await tab.locator('#x-map .mp-item', { hasText: 'V-102' }).click();
    await waitIdle(600);
    const popup = (await text('#x-map .mp-popup__card')).replace(/\s+/g, ' ');
    check('picking an asset opens its popup with its fields', popup.includes('V-102') && popup.includes('On Hire') && popup.includes('61,022 km'), popup);
    await tab.locator('#x-map .mp-popup__card button', { hasText: 'Book' }).click();
    await waitIdle();
    const fromMap = await tab.evaluate(() => JSON.parse(host.storage['initialData:template-booking'] ?? 'null'));
    check('a popup action books that asset', fromMap?.assetRel?.[0]?.documentId === 'asset-v-102' && fromMap.assetRel[0].assetId === 'V-102', JSON.stringify(fromMap));
    const searches = await tab.evaluate(() => host.searches.filter((s) => JSON.stringify(s.filter).includes('"appTags":"location"')).map((s) => s.sourceFilter?.include ?? []));
    check('layers load only the fields they draw', searches.length > 0 && searches[0].includes('boundaryGeo') && !searches[0].includes('checkItems'), JSON.stringify(searches[0]));
    await tab.locator('#x-map .mp-layer', { hasText: 'Assets' }).locator('input').uncheck();
    await waitIdle();
    check('switching a layer off empties the list and closes its popup', (await tab.locator('#x-map .mp-item').count()) === 0 && (await tab.locator('#x-map .mp-popup__card').count()) === 0);

    section('Location (point)');
    check('shows where the asset is', (await text('#x-location .mp-edit__value')).includes('-33.91010, 151.19680'));
    const mapBox = await tab.locator('#x-location .mp-map').boundingBox();
    await tab.mouse.click(mapBox.x + mapBox.width * 0.75, mapBox.y + mapBox.height * 0.3);
    await waitIdle(700);
    const moved2 = (await changesFor('locationGeo')).at(-1)?.value;
    const point = moved2?.features?.[0];
    check(
      'clicking the map moves it, in Formbird’s GeoJSON shape',
      moved2?.type === 'FeatureCollection' && point?.geometry?.type === 'Point' && point.geometry.coordinates[0] > 151.1968 && point.geometry.coordinates[1] > -33.9101 && point.properties.source === 'manual',
      JSON.stringify(moved2),
    );

    section('Meter reading');
    check('shows the asset’s meter', (await text('#x-meter .mr-asset')).includes('48,210 km'));
    const meter = tab.locator('#x-meter input');
    await meter.fill('48100');
    await meter.dispatchEvent('change');
    await waitIdle();
    check('a reading below the asset meter is flagged (and still written)', (await text('#x-meter .sj-note')).includes('Primary Meter < Asset Meter') && (await lastChange())?.value === 48100);
    await meter.fill('48,300');
    await meter.dispatchEvent('change');
    await waitIdle();
    check('a good reading shows the distance since', (await text('#x-meter .mr-delta')).trim() === '+90 km' && (await tab.locator('#x-meter .sj-note').count()) === 0 && (await lastChange())?.value === 48300);

    section('Checklist');
    const loaded = (await changesFor('checksArr'))[0]?.value;
    check('loads the checks from the asset’s check sheet (two hops) into the record', loaded?.length === 8 && loaded[0].key === 'tyres' && loaded[0].mandatory === true && loaded[0].result === '', JSON.stringify(loaded?.[0]));
    check('groups checks by category', eq(await tab.locator('#x-checks .cl-group__title').evaluateAll((els) => els.map((e) => e.firstChild.textContent.trim())), ['Exterior', 'Engine', 'Cabin']));
    const item = (question) => tab.locator('#x-checks .cl-item', { hasText: question });
    await item('Body damage').locator('button', { hasText: 'Fail' }).click();
    await waitIdle();
    await tab.locator('#x-checks button', { hasText: 'Pass the remaining' }).click();
    await waitIdle();
    check('a failure needs a comment before the sheet is complete', (await text('#x-checks .sj-lozenge__text')) === 'Incomplete' && (await text('#x-checks .sj-note--warning')).includes('Body damage'));
    const comment = item('Body damage').locator('input');
    await comment.fill('Dent in the rear door');
    await comment.dispatchEvent('change');
    await waitIdle();
    const final = (await changesFor('checksArr')).at(-1).value;
    check('with it, the sheet comes to "Defects found"', (await text('#x-checks .sj-lozenge__text')) === 'Defects found' && final.find((i) => i.key === 'body').comment === 'Dent in the rear door');
    check('answers are stored per check', final.filter((i) => i.result === 'pass').length === 7 && final.find((i) => i.key === 'body').result === 'fail');
    const questions = await tab.locator('#x-sheet input[placeholder="Check question"]').evaluateAll((els) => els.map((e) => e.value));
    check('define mode shows checks stored without keys', eq(questions, ['Coupling and safety chains', 'Lights and plug']), JSON.stringify(questions));
    await tab.locator('#x-sheet button', { hasText: 'Add check' }).click();
    await waitIdle();
    const sheetItems = (await changesFor('checkItems')).at(-1)?.value;
    check('…and adding one keeps them, now keyed', sheetItems?.length === 3 && sheetItems[0].question === 'Coupling and safety chains' && sheetItems[0].key === 'coupling-and-safety-chains' && sheetItems[0].mandatory === true, JSON.stringify(sheetItems));

    section('Line items');
    check('totals parts, labour and GST', (await text('#x-lines .li-total dd')) === '$218.35', await text('#x-lines .li-total dd'));
    await tab.locator('#x-lines button', { hasText: 'Add part' }).click();
    await waitIdle(400);
    await tab.locator('li[role=option]', { hasText: 'Brake pads' }).click();
    await waitIdle();
    const lines = (await lastChange())?.value;
    check('a part comes from the materials list with its part number and cost', lines?.length === 3 && lines[2].materialRel?.[0]?.partNo === 'BP-HIACE-F' && lines[2].unitCost === 96, JSON.stringify(lines?.[2]));
    check('totals follow', (await text('#x-lines .li-total dd')) === '$323.95', await text('#x-lines .li-total dd'));

    section('Theme');
    await tab.evaluate(() => document.body.classList.add('dark-theme'));
    await waitIdle();
    const themes = await tab.evaluate(() => [...document.querySelectorAll('[fb-component-version]')].map((e) => e.getAttribute('data-sj-theme')));
    check('body.dark-theme switches every element to dark', themes.length === 11 && themes.every((t) => t === 'dark'), JSON.stringify(themes));
  },
};
