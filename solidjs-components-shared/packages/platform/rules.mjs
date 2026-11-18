// Scaffolding for an app's rulesets, in the structure SDMS and the demos use
// ({ #include "JayRule Ruleset Overlay JS", ruleset: { name, lib, ruleX… } }).
//
// - `lib` holds plain helper functions (JayRule only runs keys starting with "rule"). COMMON_LIB has
//   the ones every app needs; `functionsLib` carries the app's own logic functions as their source,
//   so the browser elements and the server rules run one implementation.
// - Server rules reach other documents through ntf.scope.findDocumentsByElastic / updateDocument /
//   createDocumentFromTemplate, with a callback. A throw inside such a callback would reject a
//   promise nobody handles, and fieldtec-web shuts down on that, so `rulesetDsl` routes every async
//   rule's callback through lib.once, and lib.guard wraps callbacks from the server: an error fails
//   that one save instead.
// - Status moves are detected against `lastStatus`, which lib.transition keeps on the record (a
//   PreSaveServer rule has no previous version), and handed to PostSave rules as `transition`.

const json = (value) => JSON.stringify(value);

/** Helpers every app's rulesets carry (plain functions; `ntf` passed in). */
export const COMMON_LIB = `
    statusName : function (list) { return list && list[0] ? list[0].name : ''; },
    first : function (list) { return list && list.length ? list[0] : null; },
    hasKey : function (ntf, keyId) {
      var control = ntf.context.accountControl || {};
      return (control.accessKeys || []).some(function (k) { return k.keyId === keyId && (k.rights || []).indexOf('Update') > -1; });
    },
    me : function (ntf) {
      var user = ntf.context.user || {};
      return { documentId: ntf.userId, name: user.systemHeader ? user.systemHeader.summaryName : '' };
    },
    once : function (ntf, cb) {
      var called = false;
      ntf.done = function () { if (!called) { called = true; cb(); } };
      return ntf.done;
    },
    fail : function (ntf, error) {
      ntf.logger.error('Ruleset error: ' + ((error && error.stack) || error));
      if (!ntf.errorMessage) ntf.errorMessage = 'The ' + ntf.ruleset.name + ' ruleset failed: ' + ((error && error.message) || error);
      if (ntf.done) ntf.done();
    },
    guard : function (ntf, fn) {
      var self = this;
      return function () {
        try { return fn.apply(null, arguments); } catch (e) { self.fail(ntf, e); }
      };
    },
    search : function (ntf, query, cb) {
      ntf.scope.findDocumentsByElastic(query, ntf.userId, this.guard(ntf, function (err, result) {
        var hits = (result && result.data && result.data.hits && result.data.hits.hits) || [];
        cb(err, hits.map(function (h) { return h._source; }));
      }));
    },
    byId : function (ntf, documentId, cb) {
      this.search(ntf, { query: { bool: { filter: [{ term: { documentId: documentId } }] } } }, function (err, docs) { cb(err, docs && docs[0]); });
    },
    update : function (ntf, documentId, change, cb) {
      ntf.scope.updateDocument(documentId, change, ntf.userId, {}, this.guard(ntf, function (err) {
        if (err) ntf.logger.error('Updating ' + documentId + ' failed: ' + (err.message || err));
        cb();
      }));
    },
    create : function (ntf, values, templateId, cb) {
      ntf.scope.createDocumentFromTemplate(values, templateId, ntf.userId, this.guard(ntf, function (err, created) {
        if (err) ntf.logger.error('Creating a document from ' + templateId + ' failed: ' + (err.message || err));
        cb(err, created);
      }));
    },
    empty : function (value) { return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0); },
    // Records the save's status move: { from, to } on the record for the PostSave rule, or null.
    transition : function (ntf, field) {
      var from = ntf.document.lastStatus || '';
      var to = this.statusName(ntf.document[field]);
      ntf.document.transition = from !== to ? { from: from, to: to, at: new Date().toISOString() } : null;
      ntf.document.lastStatus = to;
      return ntf.document.transition;
    },
    authorship : function (ntf) {
      var now = new Date().toISOString();
      if (!ntf.document.createdDate) ntf.document.createdDate = now;
      if (!(ntf.document.createdByRel && ntf.document.createdByRel.length)) ntf.document.createdByRel = [this.me(ntf)];
      ntf.document.updatedDate = now;
      ntf.document.updatedByRel = [this.me(ntf)];
    },
    // Moves between statuses; a new record (no lastStatus) is checked by the app's own validators.
    allowedMove : function (moves, from, to) {
      return !from || from === to || (moves[from] || []).indexOf(to) > -1;
    }`;

/**
 * `when`: a date as people in the company read it ("Thu 5 Nov, 2:30 pm"), in its time zone.
 * @param {string} timeZone - IANA zone, e.g. "Australia/Sydney"
 * @returns {string} A lib section
 */
export const whenLib = (timeZone) => `
    when : function (value) {
      var d = new Date(value);
      return d.toLocaleString('en-AU', { timeZone: ${json(timeZone)}, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    }`;

/**
 * Functions carried as their own source (TypeScript files are type-stripped by Node when imported),
 * so a ruleset runs exactly what the elements run. Each must be self-contained: no imports, no
 * calls to other module functions except through `this` (the lib).
 * @param {Function[]} fns
 * @returns {string} A lib section
 */
export const functionsLib = (fns) => `\n${fns.map((fn) => `    ${fn.name} : ${String(fn).replace(/\n/g, '\n    ')}`).join(',\n')}`;

/**
 * A ruleset document's DSL. Async rule actions (`ruleAction : function (ntf, callback) {`) get their
 * callback wrapped by lib.once, so lib.fail can complete them when something throws.
 * @param {string} name - The ruleset's name (shown in its error messages)
 * @param {{ lib: string[], rules: string }} o - Lib sections (each starting with a new line) and the rules
 * @returns {string}
 */
export function rulesetDsl(name, { lib, rules }) {
  const guarded = rules.replace(/ruleAction : function \(ntf, callback\) \{\n/g, 'ruleAction : function (ntf, callback) {\n      callback = ntf.ruleset.lib.once(ntf, callback);\n');
  return `{
#include "JayRule Ruleset Overlay JS",
ruleset : {
  name : ${json(name)},

  lib : {${lib.join(',')}
  },
${guarded}
}
}`;
}

/**
 * Client PreSave: the server's validation, run in the browser first, so people see the reason in a
 * notification (fieldtec-web answers a refused update with a generic error). `ntf.who` must be set
 * by the ruleset's initialise rule.
 * @param {string} validator - Name of a lib function `(document, who) => message | ''`
 */
export const clientPreSave = (validator) => `
  rulePreSave : {
    ruleCondition : function (ntf) { return ntf.context.eventName === 'PreSave'; },
    ruleAction : function (ntf) {
      var message = ntf.lib.${validator}(ntf.document, ntf.who);
      if (!message) return;
      ntf.scope.showNotification(message, 'error');
      ntf.errorMessage = '(no-display)';
    }
  },`;
