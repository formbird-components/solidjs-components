// Building blocks for a demo database: what every Formbird app needs besides its own templates and
// data (platform documents, accounts that can sign in, the configuration document), plus the
// document scaffolding every seed uses. The internal and fleet demos build on this.

import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentDocuments, stableId } from '@solidjs-components/tools/formbird';
import { sharedRoot } from '@solidjs-components/tools/repo';

const coreDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'core');
const core = (file) => JSON.parse(readFileSync(path.join(coreDir, file), 'utf8'));

/** The platform's configuration document id (fixed in every Formbird database). */
export const CONFIG_ID = '5543317d1eb9bd8644d9fc66';

/** Template Editor (sc-document-editor): the template-of-templates for everything a demo creates. */
export const TEMPLATE_EDITOR_ID = '74746c80-8378-11e6-99b1-71ee944cf59f';

/** Platform templates from core/ (see extract-core.mjs). */
export const SYSTEM = {
  account: '387406E0-DF27-4566-A075-CEA76BD02040',
  accountSecurity: '09b44c01-e2d3-8327-6cec-0e218817a3c0',
  accountControl: 'b451f9de-1e01-bed2-906b-f69f6dc626f5',
  passwordReset: 'ebe35d5d-af3b-4195-bff4-282dfbd143c9',
  errorDocument: 'dd982aac-da3e-47e7-a0b5-b3aff507ddb0',
  ruleSet: '224bc62858d73ce57a9cb85e',
  rulesetInclude: '94869c359bf4131553761097',
  componentEditor: '5f6000a0-0828-11e6-9b64-1b27992111e1',
};

/** The Elasticsearch index settings and mappings fieldtec-web expects. */
/**
 * Template of the file reference documents fieldtec-web creates for each upload (the server serves
 * `api/getFile/<fileNo>` only through one). Same id as in fieldtec-web's test database.
 */
export const FILE_REFERENCE_TEMPLATE_ID = '2d5d90f0-9da9-11e7-b329-9f0a52692ed3';

/** How uploads are stored: fieldtec-web reads this as `fileUploader` on the server and the client. */
const FILE_UPLOADER = {
  defaultTemplateId: FILE_REFERENCE_TEMPLATE_ID,
  relatedDocumentField: 'relatedDocument',
  fileUploaderField: 'fileDetails',
  extensionWhitelist: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'tif', 'tiff', 'pdf', 'txt', 'csv', 'docx', 'xlsx'],
};

export const indexTemplate = () => readFileSync(path.join(coreDir, 'es-index-template.json'), 'utf8');

/**
 * Stable ids for one demo's objects, so re-seeding keeps links and bookmarks working.
 * @param {string} namespace - e.g. "demo" (internal) or "fleet"
 * @returns {(kind: string, name: string) => string}
 */
export const idFactory = (namespace) => (kind, name) => stableId(`${namespace}:${kind}:${name}`);

/**
 * A current-version systemHeader.
 * @param {{ systemType: string, templateId: string, summaryName: string, summaryDescription?: string, keyIds?: string[], at: Date, by?: string, excludeGeneralSearch?: boolean }} o
 * @returns {object}
 */
export function header({ systemType, templateId, summaryName, summaryDescription, keyIds = [], at, by, excludeGeneralSearch = false }) {
  const h = {
    systemType,
    templateId,
    createdWith: templateId,
    summaryName,
    keyIds,
    currentVersion: true,
    createdDate: at,
    createdBy: by,
    documentCreatedDate: at,
    documentCreatedBy: by,
    serverCreatedDate: at,
    serverUpdatedDate: at,
    excludeGeneralSearch,
  };
  if (summaryDescription) h.summaryDescription = summaryDescription;
  return h;
}

/**
 * `{ documentId, name, ...picked fields }`: the value shape related-document fields store.
 * @param {object} doc - The related document
 * @param {Record<string, string>} [fields] - Stored key → path on the document
 * @returns {object}
 */
export const related = (doc, fields = {}) => ({
  documentId: doc.documentId,
  name: doc.systemHeader.summaryName,
  ...Object.fromEntries(Object.entries(fields).map(([key, path]) => [key, path.split('.').reduce((o, k) => o?.[k], doc) ?? null])),
});

/** A menu entry for an account's `menu`. */
export const menuItem = (name, address, subMenu = []) => ({ name, description: '', load: '', isFieldtecApp: true, address, icon: '', subMenu });

/** A menu group: opens its first item, lists the rest. */
export const menuGroup = (name, items) => menuItem(name, items[0].address, items);

/**
 * The documents of one demo database, built in order.
 */
export class DocumentSet {
  /**
   * @param {{ at: Date, by: string }} defaults - When and by whom setup documents were created
   */
  constructor(defaults) {
    this.defaults = defaults;
    /** @type {Record<string, any>[]} */
    this.documents = [];
  }

  /** Adds a document and returns it. */
  add(doc) {
    this.documents.push(doc);
    return doc;
  }

  /**
   * A template (form) document.
   * @param {{ id: string, name: string, components: object[], [extra: string]: unknown }} o
   */
  template({ id, name, components, ...extra }) {
    return this.add({
      documentId: id,
      systemHeader: header({ systemType: 'template', templateId: TEMPLATE_EDITOR_ID, summaryName: name, at: this.defaults.at, by: this.defaults.by }),
      name,
      components,
      formNavBar: { hideCameraButton: true },
      ...extra,
    });
  }

  /**
   * A ruleset document, linked to the templates and events that run it.
   * @param {{ id: string, name: string, dsl: string, group: string, linked: { documentId: string, name: string, eventNames: string }[] }} o
   */
  ruleset({ id, name, dsl, group, linked }) {
    return this.add({
      documentId: id,
      systemHeader: header({ systemType: 'ruleset', templateId: SYSTEM.ruleSet, summaryName: name, at: this.defaults.at, by: this.defaults.by }),
      name,
      ruleSetDSL: dsl,
      ruleSetGroup: group,
      vtn: 'system.ruleset',
      appTags: ['system', 'ruleset'],
      rsTimeout: 120,
      loggingPrefix: 'RSLog:',
      linkedTemplatesData: linked,
    });
  }

  /**
   * An account that can sign in: the account itself, its password (accountSecurity) and its access
   * keys (accountControl). Password hashes and access keys are readable only with `adminKey`.
   * @param {{ id: string, securityId: string, controlId: string, first: string, last: string, email: string, title?: string, password: string, adminKey: string, accessKeys?: string[], fields?: Record<string, unknown> }} o
   * @returns {Record<string, any>} The account document
   */
  account({ id, securityId, controlId, first, last, email, title, password, adminKey, accessKeys = [], fields = {} }) {
    const name = `${first} ${last}`;
    const at = this.defaults.at;
    const account = this.add({
      documentId: id,
      systemHeader: header({ systemType: 'account', templateId: SYSTEM.account, summaryName: name, summaryDescription: title, at, by: this.defaults.by }),
      email,
      usersName: { firstName: first, surname: last },
      jobTitle: title,
      inactiveBool: false,
      ...fields,
    });
    const accountRel = [{ documentId: id, name }];
    this.add({
      documentId: securityId,
      systemHeader: header({ systemType: 'accountSecurity', templateId: SYSTEM.accountSecurity, summaryName: `${name} - security`, keyIds: [adminKey], excludeGeneralSearch: true, at, by: this.defaults.by }),
      password: bcrypt.hashSync(password, 10),
      provider: 'local',
      accountRel,
    });
    this.add({
      documentId: controlId,
      systemHeader: header({ systemType: 'accountControl', templateId: SYSTEM.accountControl, summaryName: `${name} - access`, keyIds: [adminKey], excludeGeneralSearch: true, at, by: this.defaults.by }),
      verified: true,
      accessKeys: accessKeys.map((keyId) => ({ keyId, rights: ['Create', 'Read', 'Update', 'Delete'] })),
      attachKeys: [],
      accountRel,
      publicAccount: false,
      accountPublicURL: null,
    });
    return account;
  }

  /**
   * The platform documents every app needs (system templates, standard rulesets and includes, the
   * `sc-*` component documents) and the component documents for these repos' elements. Each
   * platform document's own template must exist in this database, so it points at the editor shipped
   * for its type.
   * @param {string[]} componentRepos - Repos whose elements get component documents (shared + the app)
   * @param {Record<string, any>[]} [extraComponents] - More component documents (e.g. published elements)
   */
  platformDocuments(componentRepos, extraComponents = []) {
    const editorFor = {
      template: TEMPLATE_EDITOR_ID,
      ruleset: SYSTEM.ruleSet,
      rulesetInclude: SYSTEM.rulesetInclude,
      component: SYSTEM.componentEditor,
    };
    for (const doc of [
      ...core('system-templates.json'),
      ...core('rulesets.json'),
      ...core('ruleset-includes.json'),
      ...core('components.json'),
      ...componentRepos.flatMap((root) => componentDocuments(root)),
      ...extraComponents,
    ]) {
      const source = doc.systemHeader;
      this.add({
        ...doc,
        systemHeader: header({
          systemType: source.systemType,
          templateId: editorFor[source.systemType] ?? source.templateId,
          summaryName: source.summaryName ?? doc.name,
          summaryDescription: source.summaryDescription,
          keyIds: source.keyIds ?? [],
          excludeGeneralSearch: source.excludeGeneralSearch ?? false,
          at: this.defaults.at,
          by: this.defaults.by,
        }),
      });
    }
    // Uploads (photos on a record, attachments) need it; see FILE_UPLOADER.
    this.template({
      id: FILE_REFERENCE_TEMPLATE_ID,
      name: 'Document Reference',
      excludeGeneralSearch: true,
      components: [
        { componentName: 'sc-related-document', name: 'relatedDocument', label: 'Attached to', fullWidth: true },
        { componentName: 'solid-photo-capture', name: 'fileDetails', label: 'File', fullWidth: true, mode: 'view' },
      ],
    });
  }

  /**
   * The configuration document. The session secret is new on every seed.
   * @param {{ defaultTemplate: string, urlRoot: string, client?: Record<string, unknown>, server?: Record<string, unknown> }} o
   */
  configuration({ defaultTemplate, urlRoot, client = {}, server = {} }) {
    return this.add({
      documentId: CONFIG_ID,
      systemHeader: header({ systemType: 'configuration', templateId: TEMPLATE_EDITOR_ID, summaryName: 'Configuration', excludeGeneralSearch: true, at: this.defaults.at, by: this.defaults.by }),
      clientConfiguration: {
        defaultTemplate,
        dateFormat: { date: 'dd/MM/yyyy', general: 'dd/MM/yyyy hh:mm a', shortMonth: 'dd/MMM/yyyy hh:mm a', time: 'hh:mm a' },
        minAutoCompleteLength: 1,
        ruleSetIncludeTemplateId: SYSTEM.rulesetInclude,
        ruleSetTemplateId: SYSTEM.ruleSet,
        disableAccountCreation: true,
        cachingAutoEnabled: false,
        fileUploader: FILE_UPLOADER,
        ...client,
      },
      serverConfiguration: {
        accountTemplateId: SYSTEM.account,
        accountSecurityTemplateId: SYSTEM.accountSecurity,
        accountControlTemplateId: SYSTEM.accountControl,
        ruleSetTemplateId: SYSTEM.ruleSet,
        ruleSetIncludeTemplateId: SYSTEM.rulesetInclude,
        errorDocumentTemplate: SYSTEM.errorDocument,
        authentication: { passwordReset: { expiryDurationMinutes: 30, templateId: SYSTEM.passwordReset } },
        authenticationMaxAge: 8 * 60 * 60 * 1000,
        preferCachedData: true,
        // Server settings the platform reads from this document.
        session: { options: { secret: randomBytes(32).toString('hex') } },
        httpsEnabled: false,
        urlRoot,
        maxUploadSize: '10MB',
        maxSessionsNum: 200,
        fileStorage: { path: 'files' },
        fileUploader: FILE_UPLOADER,
        ...server,
      },
    });
  }

  /**
   * Every document needs a unique version id (unique index on currentVersion + versionId).
   * @returns {Record<string, any>[]}
   */
  finish() {
    for (const doc of this.documents) doc.systemHeader.versionId = stableId(`version:${doc.documentId}`);
    return this.documents;
  }
}

/** The component documents this repo family's elements get, from shared and an app repo. */
export const componentRepos = (appRoot) => [sharedRoot, appRoot];
