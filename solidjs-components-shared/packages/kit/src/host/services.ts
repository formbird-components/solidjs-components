import type { ComponentDefinition, FormParameters, Subscribable, Unsubscribable } from './types';

/**
 * Typed access to fieldtec-web's `window.FormbirdServiceInjector`
 * (fieldtec-web/client/app/services/injector/formbird-injector.service.ts).
 * Only the members these components call are typed.
 */

export interface ChangedDocumentServiceLike {
  notifyValueChanged?(
    documentId: string | undefined,
    fieldName: string,
    newValue: unknown,
    formParameters: FormParameters | undefined,
    controlName?: string,
  ): void;
  valueChanged?(component: Record<string, unknown>, newValue: unknown, controlName?: string): void;
  watch?(fieldName: string, documentId: string | undefined, controlName?: string): Subscribable<unknown>;
  watchComponentDef?(
    fieldName: string,
    templateId: string | undefined,
    key?: number,
  ): Subscribable<ComponentDefinition | undefined>;
}

export interface SearchClientServiceLike {
  search(options: Record<string, unknown>): Promise<unknown>;
}

export interface LoggedInUserServiceLike {
  user?: {
    account?: Record<string, unknown> | null;
    /** The account's summary name, as fieldtec-web shows it in the toolbar. */
    welcomeMsg?: string;
    /** Access keys and their rights: `{ accessKeys: [{ keyId, rights: ['Read', 'Update'...] }] }`. */
    accountControlDocument?: { accessKeys?: { keyId?: string; rights?: string[] }[] } | null;
  };
  getUserId?(): string | undefined;
}

export interface OfflineUtilServiceLike {
  /** A new unique id (fieldtec-web uses it for entries inside documents, such as note dataIds). */
  getNextId?(): string;
}

export interface ValidationServiceLike {
  loadValidators?(definition: ComponentDefinition, fieldName: string): { name: string; text: string }[];
  validationCtrlValues?: Record<string, Record<string, Record<string, boolean>> | undefined>;
}

export interface BroadcastServiceLike {
  on?<T>(key: string): Subscribable<T>;
  broadcast?(key: string, data?: unknown): void;
}

export interface NotificationServiceLike {
  success?(message: string, options?: unknown): void;
  error?(message: string, options?: unknown): void;
  info?(message: string, options?: unknown): void;
}

export interface RouterServiceLike {
  navigateByUrl?(url: string, target?: string): void;
}

export interface DocumentModalServiceLike {
  openDocumentInModal?(documentIdOrTemplateId: string, options?: Record<string, unknown>): Promise<unknown>;
}

/** An RxJS-style stream that also reports errors and completion (fieldtec-web's HTTP observables). */
export interface ObservableLike<T> {
  subscribe(observer: { next?: (value: T) => void; error?: (error: unknown) => void; complete?: () => void }): Unsubscribable;
}

export interface DataServiceLike {
  /** Saves a new document (POST /api/document); the server's rules run and may refuse it. */
  insert?(bean: Record<string, unknown>, cachingRequired?: boolean): Promise<unknown>;
  getDocument?(documentId: string): Promise<unknown>;
}

export interface FileProviderServiceLike {
  /**
   * Uploads a file (POST /api/uploadFiles). The server stores it and creates the file reference
   * document `api/getFile/<fileNo>` serves it from. Emits HTTP events; the response body is
   * `{ fileNo, basePath, fileType }`.
   */
  uploadFile?(config: { fileNo: string; file: File; documentId?: string; documentName?: string }): ObservableLike<unknown>;
  /** Where to show a stored file from: its URL, or base64 data when the file is cached offline. */
  getFileResources?(file: { fileNo: string; fileName?: string }): Promise<{ url?: string; base64strData?: string | null }>;
}

export interface LocalStorageServiceLike {
  /** fieldtec-web prefixes keys with the app's base path. */
  setItem?(key: string, value: string): void;
  getItem?(key: string): string | null;
}

export interface FormbirdServices {
  ChangedDocumentService: ChangedDocumentServiceLike;
  LocalStorageService: LocalStorageServiceLike;
  SearchClientService: SearchClientServiceLike;
  LoggedInUserService: LoggedInUserServiceLike;
  ValidationService: ValidationServiceLike;
  BroadcastService: BroadcastServiceLike;
  NotificationService: NotificationServiceLike;
  RouterService: RouterServiceLike;
  DocumentModalService: DocumentModalServiceLike;
  OfflineUtilService: OfflineUtilServiceLike;
  DataService: DataServiceLike;
  FileProviderService: FileProviderServiceLike;
}

interface Injector {
  get?(name: string): unknown;
  [name: string]: unknown;
}

const warned = new Set<string>();

/**
 * Returns a host service, or `undefined` (with a single console warning per name) when the page
 * does not provide it, so a missing optional service degrades a feature instead of breaking the form.
 * @param name - Service name as registered on FormbirdServiceInjector
 * @returns The service, or undefined
 */
export function getService<K extends keyof FormbirdServices>(name: K): FormbirdServices[K] | undefined {
  const injector = (globalThis as { FormbirdServiceInjector?: Injector }).FormbirdServiceInjector;
  const service = (injector?.get ? injector.get(name) : injector?.[name]) as FormbirdServices[K] | undefined;
  if (!service && !warned.has(name)) {
    warned.add(name);
    console.warn(`[solidjs-components] FormbirdServiceInjector has no ${name}; related features are disabled.`);
  }
  return service;
}
