// What an app's end-to-end rules test needs: sign in as demo people in a real browser, save documents
// through fieldtec-web's API (so the PreSaveServer and PostSave rules run), read the results from
// MongoDB, and report checks. Used by the fleet and safety demos' demo/test/e2e.mjs.
//
// fieldtec-web answers a refused update (PUT) with a generic error; only a refused insert carries
// the rule's message. So `pnpm demo:server` copies the server's output to demo/server.log, and a
// refused PUT's text here includes the log written while it ran.

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { developmentConfig } from './fieldtec.mjs';
import { serviceUrls } from './services.mjs';

const require = createRequire(import.meta.url);

/**
 * Connects to a running demo and its database.
 * @param {{ base: string, db: string, app: string, password: string, serverLog: URL | string }} o - The demo's URL, database, app tag
 *   (appTags[0]), everyone's password, and the server log `pnpm demo:server` writes
 * @returns {Promise<ReturnType<typeof harness>>}
 */
export async function connectDemo(o) {
  const up = await fetch(`${o.base}/`).then((r) => r.ok, () => false);
  if (!up || !existsSync(o.serverLog)) {
    console.error(`The demo isn't running at ${o.base} (or ${o.serverLog} is missing). Start it with: pnpm demo:server`);
    process.exit(1);
  }
  const { MongoClient } = require('mongodb');
  const mongo = new MongoClient(serviceUrls(developmentConfig()).mongo);
  await mongo.connect();
  // Playwright comes with the tools package (the browser tests use it), beside this one.
  const { chromium } = createRequire(new URL('../tools/package.json', import.meta.url))('playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  return harness({ ...o, mongo, browser });
}

function harness({ base, db, app, password, serverLog, mongo, browser }) {
  const docs = mongo.db(db).collection('documents');
  const logSize = () => statSync(serverLog).size;
  const logSince = (from) => readFileSync(serverLog).subarray(from).toString();
  const results = [];
  const sessions = {};

  /** The current version of a document. */
  const get = (documentId) => docs.findOne({ documentId, 'systemHeader.currentVersion': true });
  /** The current document of a kind with a summary name. */
  const named = (kind, name) => docs.findOne({ appTags: kind, 'systemHeader.summaryName': name, 'systemHeader.currentVersion': true });
  /** A related value of a document: documentId, name and picked fields (dot paths). */
  const pick = (doc, fields = {}) => ({
    documentId: doc.documentId,
    name: doc.systemHeader.summaryName,
    ...Object.fromEntries(Object.entries(fields).map(([k, p]) => [k, p.split('.').reduce((v, s) => v?.[s], doc) ?? null])),
  });

  /**
   * Signs in as a demo person (by the start of their email, "hannah") in their own browser context.
   * @param {string} key
   */
  async function as(key) {
    if (sessions[key]) return sessions[key];
    const person = await docs.findOne({ 'systemHeader.systemType': 'account', email: new RegExp(`^${key}\\.`), 'systemHeader.currentVersion': true });
    if (!person) throw new Error(`No demo account for ${key}`);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.fill('#user-tf', person.email);
    await page.fill('#pass-tf', password);
    await page.click('button.lf--submit');
    await page.waitForURL(/\/form\//, { timeout: 30000 });
    const send = async (method, url, data) => {
      const from = logSize();
      const response = await page.request.fetch(`${base}${url}`, { method, data, headers: { 'content-type': 'application/json' } });
      let text = await response.text();
      if (!response.ok() && method === 'PUT') {
        await new Promise((r) => setTimeout(r, 300));
        text += `\n[server log] ${logSince(from)}`;
      }
      let json;
      try {
        json = JSON.parse(text);
      } catch {}
      return { status: response.status(), ok: response.ok(), text, json };
    };
    sessions[key] = {
      page,
      person: { documentId: person.documentId, name: person.systemHeader.summaryName, email: person.email, accountType: person.accountType },
      /** POST a new document of the app (appTags [app, kind]); a refusal's text is the rule's message. */
      insert: (templateId, kind, fields) => send('POST', '/api/document', { documentId: randomUUID(), systemHeader: { templateId, systemType: 'document' }, appTags: [app, kind], ...fields }),
      /** PUT changes to a document; a refusal's text includes the server log. */
      update: (documentId, fields) => send('PUT', `/api/document/${documentId}`, fields),
    };
    return sessions[key];
  }

  return {
    docs,
    get,
    named,
    pick,
    as,
    /** The refusal text of a response ('' when it succeeded). */
    errorOf: (res) => (res.ok ? '' : res.text),
    /** fieldtec-web stores *Date fields as dates; a date sent as a string loses its milliseconds. */
    sameSecond: (a, b) => !!a && !!b && Math.floor(new Date(a).getTime() / 1000) === Math.floor(new Date(b).getTime() / 1000),
    /** Polls until `fn` returns something truthy (PostSave rules run after the response). */
    async waitFor(fn, ms = 10000) {
      const until = Date.now() + ms;
      for (;;) {
        const value = await fn();
        if (value || Date.now() > until) return value;
        await new Promise((r) => setTimeout(r, 400));
      }
    },
    check(name, ok, detail = '') {
      results.push(!!ok);
      console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : `\n      ${String(detail).slice(0, 600)}`}`);
    },
    section: (title) => console.log(title),
    /** Prints the total, closes the browser and the database, and sets the exit code. */
    async finish() {
      await browser.close();
      await mongo.close();
      const passed = results.filter(Boolean).length;
      console.log(`\n${passed}/${results.length} checks passed`);
      process.exitCode = passed === results.length ? 0 : 1;
    },
  };
}
