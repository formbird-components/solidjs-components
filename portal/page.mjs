// The demo documentation page (portal/dist/index.html): what the demos are, every app's pages and
// sample accounts, and how they run behind nginx. Written for developers. Every link is relative
// (fleet/, fleet/form/<id>) so the page works under any host. See build.mjs.

import path from 'node:path';

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** "newBooking" → "New booking"; "myHr" → "My HR". */
const label = (key) =>
  key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\bhr\b/gi, 'HR');

/** "Executive, Executive" (a position named after its team) reads as "Executive". */
const role = (p) => [...new Set(String(p.role ?? p.title ?? '').split(', ').filter(Boolean))].join(', ');

const svg = (body, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const COPY = '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>';
const CHECK = '<path d="M5 12.5l4.5 4.5L19 7.5"/>';
const SEARCH = '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>';
const EXTERNAL = '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>';

const copyButton = (value, what) =>
  `<button class="copy" type="button" data-copy="${esc(value)}" aria-label="Copy ${esc(what)}" title="Copy ${esc(what)}"><span class="i-copy">${svg(COPY)}</span><span class="i-done">${svg(CHECK)}</span></button>`;

const code = (text) => `<div class="code"><pre><code>${esc(text)}</code></pre>${copyButton(text, 'command')}</div>`;

const shortName = (app) => app.portal.name.replace('Work health and safety', 'Safety (WHS)');

const appSection = (app) => {
  const repo = path.basename(app.appRoot);
  return `
      <section id="${esc(app.basePath)}" class="app" data-app="${esc(app.basePath)}">
        <h2><a class="anchor" href="#${esc(app.basePath)}">${esc(app.portal.name)}</a></h2>
        ${app.image ? `<img class="banner" src="${esc(app.image)}" alt="" loading="lazy">` : ''}
        <p>${esc(app.portal.tagline)} The demo company is <strong>${esc(app.portal.company)}</strong>.</p>

        <dl class="facts">
          <div><dt>Open</dt><dd><a href="${esc(app.basePath)}/">/${esc(app.basePath)}/</a></dd></div>
          <div><dt>Password</dt><dd><code>${esc(app.password)}</code>${copyButton(app.password, `the ${app.portal.name} password`)}</dd></div>
          <div><dt>Source</dt><dd><code>solidjs-components/${esc(repo)}</code></dd></div>
          <div><dt>Database</dt><dd><code>${esc(app.db)}</code> (MongoDB and Elasticsearch index)</dd></div>
          <div><dt>Server</dt><dd>fieldtec-web on port <code>${esc(app.port)}</code>, config <code>server/config/${esc(app.config)}.json</code>, Redis db <code>${esc(app.redisDb)}</code></dd></div>
        </dl>

        <h3>Pages</h3>
        <ul class="pages">
          ${Object.entries(app.urls).map(([key, url]) => `<li><a href="${esc(app.basePath)}${esc(url)}">${esc(label(key))}</a></li>`).join('\n          ')}
        </ul>

        <h3>Sample accounts <span class="muted">(${app.people.length})</span></h3>
        <p class="note">Every account uses the password <code>${esc(app.password)}</code>.</p>
        <div class="table-wrap">
          <table class="accounts">
            <thead><tr><th>Name</th><th>Role</th><th>Email</th></tr></thead>
            <tbody>${app.people.map((p) => `
              <tr data-search="${esc(`${p.name} ${role(p)} ${p.email}`.toLowerCase())}">
                <td class="name">${esc(p.name)}</td>
                <td class="role">${esc(role(p))}</td>
                <td class="email"><span><code>${esc(p.email)}</code>${copyButton(p.email, `${p.name}'s email`)}</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
          <p class="no-match">No accounts in this app match the filter.</p>
        </div>
      </section>`;
};

/**
 * The documentation page.
 * @param {(import('../solidjs-components-shared/packages/platform/setup.mjs').AppSetup & {
 *   image?: string, password: string, urls: Record<string, string>,
 *   people: { name: string, email: string, role?: string, title?: string }[] })[]} apps
 * @param {{ port: number, storybook?: boolean }} o - The port nginx listens on; whether the Storybook is built
 * @returns {string} The HTML
 */
export function renderPage(apps, { port, storybook = false }) {
  const accounts = apps.reduce((n, a) => n + a.people.length, 0);
  const built = new Date().toISOString().slice(0, 10);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Formbird demo apps</title>
  <meta name="description" content="The Formbird demo apps: where they are, their sample accounts, and how they run.">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%234f46e5'/%3E%3Cpath d='M9 9h14v4H13v3h8v4h-8v3H9z' fill='white'/%3E%3C/svg%3E">
  <style>
    :root {
      --bg: #ffffff; --sidebar: #f8f9fb; --text: #1b1f2a; --muted: #5f6677; --faint: #8b92a3; --line: #e5e8ef;
      --code-bg: #f3f4f7; --accent: #4f46e5; --accent-soft: #eef0fe; --ok: #15803d;
      color-scheme: light;
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #11141b; --sidebar: #0d1016; --text: #e6e8ee; --muted: #a3a9b8; --faint: #747b8c; --line: #252a36;
              --code-bg: #1a1e28; --accent: #8b93f8; --accent-soft: #1d2033; --ok: #4ade80; color-scheme: dark; }
    }
    * { box-sizing: border-box; }
    html { scroll-padding-top: 24px; -webkit-text-size-adjust: 100%; }
    body { margin: 0; background: var(--bg); color: var(--text);
           font: 15px/1.65 "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code, pre { font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace; font-size: .88em; }
    :not(pre) > code { background: var(--code-bg); padding: 1px 5px; border-radius: 5px; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
    .muted { color: var(--faint); font-weight: 400; }

    /* layout */
    .layout { display: grid; grid-template-columns: 270px minmax(0, 1fr); min-height: 100vh; }
    aside { position: sticky; top: 0; height: 100vh; overflow-y: auto; background: var(--sidebar);
            border-right: 1px solid var(--line); padding: 24px 18px; }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 15px; color: var(--text); margin-bottom: 20px; }
    .brand .logo { width: 26px; height: 26px; border-radius: 7px; background: var(--accent); color: #fff; display: grid;
                   place-items: center; font-size: 14px; font-weight: 800; }
    .filter { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: var(--bg);
              border-radius: 8px; padding: 0 10px; color: var(--faint); margin-bottom: 20px; }
    .filter:focus-within { border-color: var(--accent); }
    .filter input { flex: 1; min-width: 0; border: 0; background: none; color: var(--text); font: inherit; font-size: 14px; padding: 8px 0; }
    .filter input:focus { outline: none; }
    .filter kbd { font: 11px ui-monospace, monospace; border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; color: var(--faint); }
    nav h4 { margin: 18px 0 6px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--faint); }
    nav ul { list-style: none; margin: 0; padding: 0; }
    nav a { display: flex; justify-content: space-between; gap: 8px; padding: 5px 10px; border-radius: 6px; color: var(--muted); font-size: 14px; }
    nav a:hover { background: var(--accent-soft); color: var(--text); text-decoration: none; }
    nav a.current { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
    nav a .hits { font-size: 12px; color: var(--faint); }
    main { padding: 40px 48px 80px; max-width: 920px; }

    /* content */
    h1 { font-size: 30px; line-height: 1.2; letter-spacing: -0.02em; margin: 0 0 8px; }
    .subtitle { font-size: 17px; color: var(--muted); margin: 0 0 28px; }
    h2 { font-size: 22px; letter-spacing: -0.01em; margin: 56px 0 12px; padding-top: 24px; border-top: 1px solid var(--line); }
    h2 .anchor { color: var(--text); }
    h2 .anchor:hover { text-decoration: none; }
    h2 .anchor:hover::after { content: " #"; color: var(--faint); }
    h3 { font-size: 15px; margin: 28px 0 8px; }
    p { margin: 0 0 12px; }
    ul.plain { margin: 0 0 12px; padding-left: 20px; }
    ul.plain li { margin: 4px 0; }
    .note { font-size: 14px; color: var(--muted); }
    .callout { border: 1px solid var(--line); border-left: 3px solid var(--accent); background: var(--sidebar); border-radius: 6px;
               padding: 12px 16px; margin: 16px 0; font-size: 14px; }
    .callout p:last-child { margin: 0; }
    .banner { display: block; width: 100%; height: 150px; object-fit: cover; border-radius: 8px; margin: 4px 0 16px;
              border: 1px solid var(--line); }

    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted);
         border-bottom: 1px solid var(--line); padding: 8px 12px; background: var(--sidebar); }
    td { border-bottom: 1px solid var(--line); padding: 8px 12px; vertical-align: middle; }
    tbody tr:hover td { background: var(--sidebar); }
    .table-wrap { border: 1px solid var(--line); border-radius: 8px; overflow-x: auto; margin: 8px 0 12px; }
    .table-wrap table tr:last-child td { border-bottom: 0; }
    .accounts .name { font-weight: 600; white-space: nowrap; }
    .accounts .role { color: var(--muted); }
    .accounts .email span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
    .accounts .email code { background: none; padding: 0; }
    tr.miss { display: none; }
    .no-match { display: none; margin: 0; padding: 12px; color: var(--faint); font-size: 14px; }
    .app.empty .no-match { display: block; }
    .app.empty table { display: none; }
    .overview td code { white-space: nowrap; }

    dl.facts { display: grid; margin: 16px 0; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; font-size: 14px; }
    dl.facts div { display: grid; grid-template-columns: 110px minmax(0, 1fr); border-bottom: 1px solid var(--line); }
    dl.facts div:last-child { border-bottom: 0; }
    dl.facts dt { padding: 8px 12px; background: var(--sidebar); color: var(--muted); font-weight: 600; }
    dl.facts dd { margin: 0; padding: 8px 12px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }

    ul.pages { list-style: none; padding: 0; margin: 0 0 8px; display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 14px; }

    button.copy { display: inline-grid; place-items: center; width: 26px; height: 26px; flex: none; border-radius: 6px; cursor: pointer;
                  border: 1px solid transparent; background: none; color: var(--faint); padding: 0; }
    button.copy:hover { color: var(--accent); border-color: var(--line); background: var(--bg); }
    button.copy .i-done { display: none; }
    button.copy.done { color: var(--ok); }
    button.copy.done .i-copy { display: none; }
    button.copy.done .i-done { display: grid; }

    .code { position: relative; margin: 8px 0 16px; }
    .code pre { margin: 0; background: var(--code-bg); border: 1px solid var(--line); border-radius: 8px; padding: 12px 44px 12px 14px;
                overflow-x: auto; line-height: 1.55; }
    .code button.copy { position: absolute; top: 8px; right: 8px; }
    .code .c { color: var(--faint); }

    footer { margin-top: 64px; padding-top: 16px; border-top: 1px solid var(--line); font-size: 13px; color: var(--faint); }
    .toast { position: fixed; right: 24px; bottom: 24px; z-index: 10; display: flex; align-items: center; gap: 8px;
             opacity: 0; transform: translateY(8px); pointer-events: none; transition: .18s ease;
             background: var(--text); color: var(--bg); padding: 8px 14px; border-radius: 8px; font-size: 14px; max-width: calc(100% - 48px); }
    .toast.show { opacity: 1; transform: none; }

    @media (max-width: 860px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
      aside { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); padding: 16px; }
      nav { display: none; }
      .filter { margin-bottom: 0; }
      main { padding: 24px 16px 64px; }
      dl.facts div { grid-template-columns: 1fr; }
      dl.facts dt { padding-bottom: 2px; }
    }
  </style>
</head>
<body>
<div class="layout">
  <aside>
    <div class="brand"><span class="logo">F</span>Formbird demo apps</div>
    <label class="filter">
      ${svg(SEARCH)}
      <input id="q" type="search" placeholder="Filter accounts" autocomplete="off" aria-label="Filter accounts by name, role or email">
      <kbd>/</kbd>
    </label>
    <nav aria-label="Contents">
      <h4>Guide</h4>
      <ul>
        <li><a href="#overview">Overview</a></li>
        <li><a href="#signing-in">Signing in</a></li>
      </ul>
      <h4>Apps</h4>
      <ul>
        ${apps.map((a) => `<li><a href="#${esc(a.basePath)}" data-nav="${esc(a.basePath)}">${esc(shortName(a))}<span class="hits">${a.people.length}</span></a></li>`).join('\n        ')}
      </ul>
      <h4>Development</h4>
      <ul>
        <li><a href="#running">Running the demos</a></li>
        <li><a href="#reseeding">Re-seeding and changes</a></li>
        <li><a href="#proxy">How the proxy works</a></li>
        <li><a href="#components">Components (Storybook)</a></li>
        <li><a href="#troubleshooting">Troubleshooting</a></li>
      </ul>
    </nav>
  </aside>

  <main>
    <section id="overview">
      <h1>Formbird demo apps</h1>
      <p class="subtitle">${apps.length} business apps running on fieldtec-web, built with the SolidJS components from
        <code>solidjs-components</code>, with ${accounts} sample accounts.</p>
      <p>Each app is a set of templates, rulesets and SolidJS custom elements in its own fieldtec-web database, seeded
        with demo data. The data is dated relative to the day it was seeded, so every app has records that are waiting,
        overdue or due soon. Each app runs on its own fieldtec-web server, and nginx serves them all from this host
        under the paths below.</p>

      <div class="table-wrap">
        <table class="overview">
          <thead><tr><th>App</th><th>Path</th><th>Password</th><th>Accounts</th><th>Server</th></tr></thead>
          <tbody>${apps.map((a) => `
            <tr>
              <td><a href="#${esc(a.basePath)}">${esc(a.portal.name)}</a></td>
              <td><a href="${esc(a.basePath)}/">/${esc(a.basePath)}/ ${svg(EXTERNAL, 12)}</a></td>
              <td><code>${esc(a.password)}</code></td>
              <td>${a.people.length}</td>
              <td><code>:${esc(a.port)}</code></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>

    <section id="signing-in">
      <h2><a class="anchor" href="#signing-in">Signing in</a></h2>
      <p>Open an app from its path, then sign in with any of its sample accounts. All accounts in an app share one password,
        listed with the app. Accounts have different roles, and what you can see and approve depends on the role.</p>
      <ul class="plain">
        <li>Each app has its own session, so you can be signed in to several apps in one browser at once, as different people.</li>
        <li>To switch person in an app, sign out from the account menu (top right), then sign in as someone else. A private
          window works too.</li>
        <li>The accounts sign in with a local password only. Single sign-on is turned off for the demos.</li>
      </ul>
      <div class="callout"><p>Changes you make are saved in that app's demo database and everyone sees them. Re-seeding
        the app resets it (see <a href="#reseeding">Re-seeding and changes</a>).</p></div>
    </section>
${apps.map(appSection).join('\n')}

    <section id="running">
      <h2><a class="anchor" href="#running">Running the demos</a></h2>
      <p>Everything runs from the <code>solidjs-components</code> checkout, with <code>fieldtec-web</code> checked out
        beside it. MongoDB (as a replica set), Elasticsearch and Redis must be running at the hosts in
        fieldtec-web's <code>server/config/development.json</code>.</p>
      <h3>First time</h3>
      <p>Build fieldtec-web, then set up each app. <code>db:setup</code> installs, builds and deploys the app's components into
        fieldtec-web, writes its server config, and creates and seeds its database.</p>
      ${code(`cd fieldtec-web && pnpm install && pnpm dist\n\ncd ../solidjs-components/solidjs-components-fleet   # and each other app\npnpm db:setup`)}
      <h3>Start, stop and check</h3>
      <p><code>portal/run.sh</code> builds this page and the nginx config, starts any app server that isn't running, and
        starts nginx on port <code>${esc(port)}</code>.</p>
      ${code(`portal/run.sh up        # start what isn't running, rebuild this page\nportal/run.sh status    # list the URLs\nportal/run.sh restart   # after re-seeding or rebuilding fieldtec-web\nportal/run.sh down      # stop nginx and the app servers`)}
      <p>Each app's server writes its output to <code>&lt;app&gt;/demo/server.log</code>. nginx's logs are in
        <code>portal/dist/logs/</code>. To run a single app without nginx, run <code>pnpm demo:server</code> in its folder
        and open <code>http://localhost:&lt;port&gt;/</code>.</p>
    </section>

    <section id="reseeding">
      <h2><a class="anchor" href="#reseeding">Re-seeding and changes</a></h2>
      <p>Re-seed an app to reset its data and move its story to today. This drops and recreates its database and
        index, rebuilds and redeploys its components, and signs everyone out of that app.</p>
      ${code(`cd solidjs-components-hr\npnpm db:setup --reset\ncd .. && portal/run.sh restart`)}
      <ul class="plain">
        <li><strong>Component changes:</strong> the component documents reference each bundle by content hash, so the
          database and the deployed bundles must come from the same build. Run <code>pnpm db:setup --reset</code> after changing
          components. While working on a component, <code>pnpm dev</code> (in every app except the issue tracker) runs a gallery of the app's elements without fieldtec-web.</li>
        <li><strong>Config only:</strong> after changing fieldtec-web's <code>development.json</code> or an app's backgrounds
          (<code>demo/backgrounds/</code>), run <code>pnpm db:setup --config-only</code>, then restart. The data is not touched.</li>
        <li><strong>Accounts and pages on this page:</strong> they come from each app's seed (<code>demo/lib/build.mjs</code>),
          so this page always matches a fresh seed. App names and descriptions are in each app's <code>demo/app.mjs</code>.</li>
      </ul>
    </section>

    <section id="components">
      <h2><a class="anchor" href="#components">Components (Storybook)</a></h2>
      <p>The Storybook shows every Solid element in the repos on its own, with each app's fixtures on the in-memory
        fieldtec-web host: its variants, its componentDefinition options as controls, and what it writes to the document
        in the Actions panel. Use it to see what an element can do, or to work on one without a running demo.</p>
      ${storybook
        ? `<p><a href="storybook/">Open the Storybook ${svg(EXTERNAL, 12)}</a></p>`
        : '<div class="callout"><p>The Storybook isn\'t built on this server yet. Build it with the commands below, then run <code>portal/run.sh up</code>.</p></div>'}
      ${code(`cd storybook\npnpm install\npnpm build        # static build, served here at /storybook/\npnpm storybook    # or the dev server with live reload, on port 6006`)}
      <p class="note">The stories are in <code>storybook/stories/&lt;app&gt;/</code>. A new element needs a stories file there; see
        the Introduction page in the Storybook.</p>
    </section>

    <section id="proxy">
      <h2><a class="anchor" href="#proxy">How the proxy works</a></h2>
      <p>The ${apps.length} servers share one fieldtec-web checkout, and so one <code>server/public/index.html</code>. They
        can't each have their own <code>urlBase.path</code>, so they all run at <code>/</code> and nginx maps each one to its path:</p>
      <ul class="plain">
        <li>nginx strips <code>/&lt;app&gt;</code> from the request before passing it on.</li>
        <li>It rewrites the page's <code>&lt;base href="/"&gt;</code> to <code>/&lt;app&gt;/</code>. The fieldtec-web client
          takes its API, socket.io and local storage paths from that tag.</li>
        <li>It scopes the session cookie to <code>/&lt;app&gt;/</code>, which is what keeps the apps' sign-ins separate, and
          maps redirects back under the app's path.</li>
        <li>Links stored in the demo data are root-relative (<code>/form/&lt;id&gt;</code>). Inside an app, Angular's router
          resolves them. One opened in a new tab or pasted from the clipboard reaches nginx at the root, and nginx redirects
          it to the app it came from: the Referer's path, or else the <code>demo_app</code> cookie set by the last app visited.</li>
      </ul>
      <p class="note">The nginx config is generated by <code>portal/build.mjs</code> into <code>portal/dist/nginx.conf</code>.
        See <code>portal/README.md</code> for details.</p>
    </section>

    <section id="troubleshooting">
      <h2><a class="anchor" href="#troubleshooting">Troubleshooting</a></h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Problem</th><th>What to do</th></tr></thead>
          <tbody>
            <tr><td>502 Bad Gateway on an app's path</td><td>That app's server isn't running. Run <code>portal/run.sh up</code> and check
              <code>&lt;app&gt;/demo/server.log</code>.</td></tr>
            <tr><td>Signed out, or a page shows old data after a re-seed</td><td>Re-seeding signs everyone out of that app and clears its
              caches. Sign in again and reload the page once more.</td></tr>
            <tr><td>"Database already has documents" from <code>db:setup</code></td><td>Add <code>--reset</code> to replace it, or
              <code>--config-only</code> to leave the data alone.</td></tr>
            <tr><td>A link opened this page instead of a record</td><td>The link was root-relative and nginx couldn't tell which app it
              belongs to. Open the app first, then open the link again.</td></tr>
            <tr><td>Dates look out of place</td><td>The stories are dated from the day the app was seeded. Re-seed it to move them to today.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <footer>Generated by <code>portal/build.mjs</code> on ${esc(built)} from each app's seed. Banner photos from Pexels
      (credits in each app's <code>demo/backgrounds/CREDITS.md</code>).</footer>
  </main>
</div>
<div class="toast" role="status" aria-live="polite">${svg(CHECK)}<span></span></div>

<script>
  const toast = document.querySelector('.toast');
  let toastTimer;
  function say(text) {
    toast.querySelector('span').textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      const area = document.createElement('textarea');
      area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.append(area); area.select();
      const ok = document.execCommand('copy'); area.remove(); return ok;
    }
  }
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('button.copy');
    if (!button) return;
    if (await copy(button.dataset.copy)) {
      button.classList.add('done');
      setTimeout(() => button.classList.remove('done'), 1400);
      say(button.dataset.copy.includes('\\n') ? 'Copied the commands' : 'Copied ' + button.dataset.copy);
    } else say('Copy failed: select the text instead');
  });

  // Filter the account tables
  const input = document.getElementById('q');
  const sections = [...document.querySelectorAll('section.app')];
  function filter() {
    const words = input.value.trim().toLowerCase().split(/\\s+/).filter(Boolean);
    for (const section of sections) {
      let hits = 0;
      for (const row of section.querySelectorAll('tbody tr')) {
        const hit = words.every((w) => row.dataset.search.includes(w));
        row.classList.toggle('miss', !hit);
        if (hit) hits++;
      }
      section.classList.toggle('empty', hits === 0);
      const nav = document.querySelector('[data-nav="' + section.dataset.app + '"] .hits');
      if (nav) nav.textContent = String(hits);
    }
  }
  input.addEventListener('input', filter);
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && document.activeElement !== input) { event.preventDefault(); input.focus(); }
    if (event.key === 'Escape' && document.activeElement === input) { input.value = ''; filter(); }
  });

  // Highlight the section in view: the last one whose top has passed, or the last one at the bottom
  const links = [...document.querySelectorAll('nav a[href^="#"]')]
    .map((a) => [document.getElementById(a.getAttribute('href').slice(1)), a]).filter(([el]) => el);
  function highlight() {
    const atBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
    let current = links[0];
    for (const pair of links) if (pair[0].getBoundingClientRect().top <= 120) current = pair;
    if (atBottom) current = links.at(-1);
    for (const [, a] of links) a.classList.toggle('current', a === current[1]);
  }
  addEventListener('scroll', highlight, { passive: true });
  highlight();
</script>
</body>
</html>
`;
}
