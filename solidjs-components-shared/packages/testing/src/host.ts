import { matches, pickSource, sortDocs } from './elastic';

type Doc = Record<string, unknown> & { documentId?: string };
type Listener<T> = (value: T) => void;

/** One write a component made through ChangedDocumentService. */
export interface ChangeRecord {
  documentId: string;
  fieldName: string;
  value: unknown;
  controlName?: string;
  source: 'component' | 'external';
}

/** Anything else the host was asked to do: toasts, navigation, modals, new records, uploads. */
export interface HostEvent {
  type: 'notification' | 'navigate' | 'modal' | 'save' | 'insert' | 'upload';
  detail: unknown;
}

export interface MockHostOptions {
  /** Every searchable document. */
  documents: Doc[];
  /** Documents open in the form, by documentId (their field values are the form state). */
  forms?: Doc[];
  /** documentId of the signed-in account (must be in `documents`). */
  currentAccountId?: string;
  /** Simulated search latency in ms (default 0). */
  latencyMs?: number;
  /** The signed-in user's access keys (accountControlDocument.accessKeys). */
  accessKeys?: { keyId: string; rights: string[] }[];
}

export interface MockHost {
  readonly changes: ChangeRecord[];
  /** What components put in fieldtec-web's LocalStorageService (e.g. `initialData:<templateId>`). */
  readonly storage: Record<string, string>;
  readonly searches: Record<string, unknown>[];
  readonly events: HostEvent[];
  /** Current form values of a document. */
  form(documentId: string): Record<string, unknown>;
  /** Simulates a ruleset or another component changing a field. */
  setField(documentId: string, fieldName: string, value: unknown): void;
  /** Simulates a ruleset changing a component definition (setFilter, enable/disable...). */
  updateDefinition(templateId: string, fieldName: string, patch: Record<string, unknown>): void;
  /** Runs fieldtec-web's required / minLength / maxLength checks and broadcasts the result. */
  validate(documentId: string, fieldName: string, definition: Record<string, unknown>): string[];
  /** Simulates saving a form: broadcasts `document:updated` with the document, as fieldtec-web does after a save. */
  saveForm(documentId: string): void;
  /**
   * Makes DataService.insert or FileProviderService.uploadFile fail with a message, as the server
   * does when a rule refuses a new record or a file type isn't allowed (null: succeed again).
   */
  refuse(kind: 'insert' | 'upload', message: string | null): void;
  setLatency(ms: number): void;
  /** Called after every change or host event (preview log panel). */
  subscribe(listener: () => void): () => void;
  uninstall(): void;
}

/** Text fieldtec-web's ClientConstants uses for validation messages. */
const VALIDATORS = [
  { name: 'required', text: 'This field is required' },
  { name: 'minlength', text: 'Must be at least %s characters' },
  { name: 'maxlength', text: 'Must be at most %s characters' },
];

function stream<T>(register: (listener: Listener<T>) => () => void) {
  return {
    subscribe(next: Listener<T>) {
      const off = register(next);
      return { unsubscribe: off };
    },
  };
}

const isEmpty = (value: unknown) =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

/**
 * Installs an in-memory fieldtec-web host on `window.FormbirdServiceInjector`.
 *
 * Mirrors the host where components depend on it: changes are echoed to every watcher of the
 * field (fieldtec-web's `watch` does not filter by control name), BroadcastService replays past
 * events, and search honours `sourceFilter.include` like Elasticsearch, so a component that forgets
 * to request a field it needs fails in tests too.
 * @param options - Documents, open forms, current user and latency
 * @returns A handle for driving and inspecting the host
 */
export function installMockHost(options: MockHostOptions): MockHost {
  const documents = new Map<string, Doc>();
  for (const doc of options.documents) if (doc.documentId) documents.set(doc.documentId, structuredClone(doc));
  const forms = new Map<string, Record<string, unknown>>();
  for (const doc of options.forms ?? []) if (doc.documentId) forms.set(doc.documentId, structuredClone(doc));

  let latency = options.latencyMs ?? 0;
  let nextId = 1;
  const currentAccount = options.currentAccountId ? documents.get(options.currentAccountId) : undefined;
  const changes: ChangeRecord[] = [];
  const searches: Record<string, unknown>[] = [];
  const events: HostEvent[] = [];
  const storage: Record<string, string> = {};
  const fieldWatchers = new Map<string, Set<Listener<unknown>>>();
  const definitionWatchers = new Map<string, Set<Listener<Record<string, unknown>>>>();
  const definitions = new Map<string, Record<string, unknown>>();
  const broadcastLog: { key: string; data: unknown }[] = [];
  const broadcastListeners = new Set<(event: { key: string; data: unknown }) => void>();
  const subscribers = new Set<() => void>();
  const validationCtrlValues: Record<string, Record<string, Record<string, boolean>>> = {};
  const refusals: { insert: string | null; upload: string | null } = { insert: null, upload: null };
  const uploadedFiles = new Map<string, string>();

  const notifySubscribers = () => subscribers.forEach((fn) => fn());
  const watcherSet = <T>(map: Map<string, Set<Listener<T>>>, key: string) => {
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    return set;
  };
  const formOf = (documentId: string) => {
    let form = forms.get(documentId);
    if (!form) forms.set(documentId, (form = { documentId }));
    return form;
  };

  const writeField = (documentId: string, fieldName: string, value: unknown, record: Omit<ChangeRecord, 'documentId' | 'fieldName' | 'value'>) => {
    formOf(documentId)[fieldName] = structuredClone(value);
    changes.push({ documentId, fieldName, value: structuredClone(value), ...record });
    for (const listener of [...(fieldWatchers.get(`${documentId}::${fieldName}`) ?? [])]) listener(structuredClone(value));
    notifySubscribers();
  };

  const broadcast = (key: string, data?: unknown) => {
    const event = { key, data };
    broadcastLog.push(event);
    broadcastListeners.forEach((fn) => fn(event));
  };

  const services: Record<string, unknown> = {
    ChangedDocumentService: {
      notifyValueChanged(documentId: string, fieldName: string, newValue: unknown, _formParameters: unknown, controlName?: string) {
        writeField(documentId, fieldName, newValue, { controlName, source: 'component' });
      },
      valueChanged(component: { document?: Doc; fieldName?: string }, newValue: unknown, controlName?: string) {
        writeField(String(component.document?.documentId), String(component.fieldName), newValue, { controlName, source: 'component' });
      },
      watch(fieldName: string, documentId: string) {
        return stream<unknown>((listener) => {
          const set = watcherSet(fieldWatchers, `${documentId}::${fieldName}`);
          set.add(listener);
          return () => set.delete(listener);
        });
      },
      watchComponentDef(fieldName: string, templateId: string) {
        return stream<Record<string, unknown>>((listener) => {
          const set = watcherSet(definitionWatchers, `${templateId}::${fieldName}`);
          set.add(listener);
          return () => set.delete(listener);
        });
      },
    },
    SearchClientService: {
      async search(request: Record<string, unknown>) {
        searches.push(structuredClone(request));
        if (latency) await new Promise((resolve) => setTimeout(resolve, latency));
        const body = (request.filter ?? {}) as { query?: unknown; sort?: unknown };
        const include = (request.sourceFilter as { include?: string[] } | undefined)?.include;
        // Paging as fieldtec-web's ElasticSearchService computes it: size, then from = page * size.
        const size = Number(request.size ?? request.pageSize ?? 50);
        const from = Number(request.from) || Number(request.page ?? 0) * size;
        const hits = sortDocs([...documents.values()].filter((doc) => matches(doc, body.query)), body.sort);
        // The host's response shape, with the total converted to a number (convertTotalToES2Format).
        return {
          statusCode: 200,
          data: {
            hits: {
              total: hits.length,
              hits: hits.slice(from, from + size).map((doc) => ({ _id: doc.documentId, _source: pickSource(doc, include) })),
            },
          },
        };
      },
    },
    LoggedInUserService: {
      user: {
        account: currentAccount ? structuredClone(currentAccount) : null,
        welcomeMsg: (currentAccount?.systemHeader as { summaryName?: string } | undefined)?.summaryName ?? '',
        accountControlDocument: { accessKeys: options.accessKeys ?? [] },
      },
      getUserId: () => options.currentAccountId,
    },
    LocalStorageService: {
      setItem(key: string, value: string) {
        storage[key] = String(value);
      },
      getItem: (key: string) => storage[key] ?? null,
      removeItem(key: string) {
        delete storage[key];
      },
    },
    OfflineUtilService: {
      getNextId: () => `id-${(nextId++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    },
    ValidationService: {
      validationCtrlValues,
      loadValidators(definition: Record<string, unknown>) {
        return VALIDATORS.map((v) => ({
          name: v.name,
          text: v.text.replace('%s', String(v.name === 'minlength' ? definition.minLength : definition.maxLength)),
        }));
      },
    },
    BroadcastService: {
      broadcast,
      on(key: string) {
        return stream<unknown>((listener) => {
          // ReplaySubject semantics, like fieldtec-web's BroadcastService.
          for (const event of broadcastLog) if (event.key === key) listener(event.data);
          const handler = (event: { key: string; data: unknown }) => event.key === key && listener(event.data);
          broadcastListeners.add(handler);
          return () => broadcastListeners.delete(handler);
        });
      },
    },
    NotificationService: Object.fromEntries(
      ['success', 'error', 'info', 'warning'].map((kind) => [
        kind,
        (message: string) => {
          events.push({ type: 'notification', detail: { kind, message } });
          notifySubscribers();
        },
      ]),
    ),
    RouterService: {
      navigateByUrl(url: string) {
        events.push({ type: 'navigate', detail: url });
        notifySubscribers();
      },
    },
    DocumentModalService: {
      async openDocumentInModal(documentId: string, modalOptions?: unknown) {
        events.push({ type: 'modal', detail: { documentId, options: modalOptions } });
        notifySubscribers();
        return null;
      },
    },
    DataService: {
      // POST /api/document: the saved document becomes searchable, or a rule refuses it with
      // an HttpErrorResponse-like error whose body carries the message.
      async insert(bean: Doc) {
        if (latency) await new Promise((resolve) => setTimeout(resolve, latency));
        if (refusals.insert) throw { status: 400, error: { message: refusals.insert }, message: 'Http failure response: 400 Bad Request' };
        const saved = structuredClone(bean);
        saved.systemHeader = {
          ...(saved.systemHeader as Record<string, unknown>),
          createdDate: new Date().toISOString(),
          createdBy: options.currentAccountId,
          currentVersion: true,
        };
        documents.set(String(saved.documentId), saved);
        events.push({ type: 'insert', detail: structuredClone(saved) });
        notifySubscribers();
        return structuredClone(saved);
      },
      async getDocument(documentId: string) {
        const doc = documents.get(documentId);
        return doc ? structuredClone(doc) : null;
      },
    },
    FileProviderService: {
      // POST /api/uploadFiles, as fieldtec-web's FileProviderService.uploadFile reports it: one
      // HttpResponse event ({ type: 4, body: { fileNo, basePath, fileType } }), then complete.
      uploadFile(config: { fileNo: string; file: File; documentId?: string }) {
        return {
          subscribe(observer: { next?: (value: unknown) => void; error?: (error: unknown) => void; complete?: () => void }) {
            let cancelled = false;
            void (async () => {
              await new Promise((resolve) => setTimeout(resolve, latency || 10));
              if (cancelled) return;
              if (refusals.upload) {
                observer.error?.({ status: 400, error: refusals.upload, message: 'Http failure response: 400 Bad Request' });
                return;
              }
              const fileType = (config.file.name.split('.').pop() ?? '').toLowerCase();
              uploadedFiles.set(config.fileNo, URL.createObjectURL(config.file));
              events.push({ type: 'upload', detail: { fileNo: config.fileNo, fileName: config.file.name, size: config.file.size, type: config.file.type, documentId: config.documentId } });
              notifySubscribers();
              observer.next?.({ type: 4, status: 200, body: { fileNo: config.fileNo, basePath: '20261101', fileType } });
              observer.complete?.();
            })();
            return { unsubscribe: () => (cancelled = true) };
          },
        };
      },
      async getFileResources(file: { fileNo: string }) {
        return { base64strData: null, url: uploadedFiles.get(file.fileNo) ?? `api/getFile/${file.fileNo}` };
      },
    },
  };

  const injector = { ...services, get: (name: string) => services[name], __FORMBIRD_MOCK__: true };
  (globalThis as { FormbirdServiceInjector?: unknown }).FormbirdServiceInjector = injector;

  return {
    changes,
    storage,
    searches,
    events,
    form: (documentId) => structuredClone(formOf(documentId)),
    setField(documentId, fieldName, value) {
      writeField(documentId, fieldName, value, { source: 'external' });
    },
    updateDefinition(templateId, fieldName, patch) {
      const key = `${templateId}::${fieldName}`;
      const next = { ...(definitions.get(key) ?? {}), ...patch };
      definitions.set(key, next);
      for (const listener of [...(definitionWatchers.get(key) ?? [])]) listener(structuredClone(next));
      notifySubscribers();
    },
    validate(documentId, fieldName, definition) {
      const value = formOf(documentId)[fieldName];
      const text = typeof value === 'string' ? value : '';
      const state = {
        required: definition.mandatory === true && isEmpty(value),
        minlength: typeof definition.minLength === 'number' && text.length > 0 && text.length < definition.minLength,
        maxlength: typeof definition.maxLength === 'number' && text.length > definition.maxLength,
      };
      (validationCtrlValues[documentId] ??= {})[fieldName] = state;
      broadcast('document:validateFormFields', { documentId, fieldName });
      notifySubscribers();
      return VALIDATORS.filter((v) => state[v.name as keyof typeof state]).map((v) => v.name);
    },
    saveForm(documentId) {
      broadcast('document:updated', [structuredClone(formOf(documentId))]);
      events.push({ type: 'save', detail: documentId });
      notifySubscribers();
    },
    refuse(kind, message) {
      refusals[kind] = message;
    },
    setLatency(ms) {
      latency = ms;
    },
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    uninstall() {
      delete (globalThis as { FormbirdServiceInjector?: unknown }).FormbirdServiceInjector;
    },
  };
}

/**
 * Creates a component element and sets its properties exactly as fieldtec-web's
 * ComponentService.createComponent does (properties, not attributes; `ft-form-component` class).
 * @param tag - Custom element name
 * @param props - document, template, componentDefinition and key
 * @returns The element (not yet attached)
 */
export function createFormElement(
  tag: string,
  props: { document: Doc; template: Doc; componentDefinition: Record<string, unknown>; key?: number },
): HTMLElement {
  const element = document.createElement(tag) as HTMLElement & Record<string, unknown>;
  const fieldName = String(props.componentDefinition.name ?? '');
  element.componentDefinition = props.componentDefinition;
  element.document = props.document;
  element.className = 'ft-form-component';
  element.template = props.template;
  element.formParameters = { selectedDocumentId: props.document.documentId, unsavedDocumentListId: 'preview' };
  element.key = props.key ?? 0;
  element.account = undefined;
  element.fieldName = fieldName;
  element.fieldValue = props.document[fieldName];
  return element;
}
