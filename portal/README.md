# portal

One port for every demo: a home page with a card per app (its start pages and sample accounts),
and nginx in front of each app's fieldtec-web server, under its own path.

| Path | App | fieldtec-web |
|---|---|---|
| `/` | this home page | |
| `/issues/` | Issue tracker (internal) | :3000 |
| `/fleet/` | Fleet | :3001 |
| `/safety/` | Work health and safety | :3002 |
| `/hr/` | HR | :3004 |
| `/procurement/` | Procurement | :3005 |

```sh
portal/run.sh up        # build the page and nginx config, start what isn't running
portal/run.sh status    # the URLs (in a Coder workspace, the forwarded https URL)
portal/run.sh restart   # after pnpm db:setup or a fieldtec-web rebuild
portal/run.sh down
```

Every app must have been set up once with `pnpm db:setup`. nginx listens on `PORTAL_PORT` (default
8080) and runs as you, with its pid, logs and temp files in `portal/dist/`.

## How it fits together

- Each app's `demo/app.mjs` holds its port, config, `basePath` and how the home page describes it.
  `setup-db.mjs` and `build.mjs` both read it.
- `build.mjs` calls each app's `buildDemo()`, the function its seed uses, so the accounts,
  password and start pages on the page match the database. It writes `dist/index.html`,
  `dist/_home/` (the card pictures, each app's first sign-in background) and `dist/nginx.conf`.
- The five servers share one fieldtec-web checkout and so one `server/public/index.html`, so they
  can't each run under their own `urlBase.path`. They run at `/`, and nginx:
  - strips `/<app>` before proxying;
  - rewrites the page's `<base href="/">` to `/<app>/`. fieldtec-web's client takes its API,
    socket.io and storage paths from that tag;
  - scopes the session cookie to `/<app>/`, so every app keeps its own sign-in;
  - puts redirects back under `/<app>/`.
- Links stored in the demo data and in the Solid elements are root-relative (`/form/<id>`). In the
  app, Angular's router resolves them against the base href. A link opened in a new tab or copied
  lands on the root, and nginx sends it back under the app it came from: the Referer's first path
  segment, or else the `demo_app` cookie each app's responses set. Anything else goes to the home page.
- Every link on the home page is relative (`fleet/`), so it works under any host, including
  Coder's port forwarding.
