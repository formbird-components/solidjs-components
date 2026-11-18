import type { ComponentDefinition, FormDocument, FormParameters, FormTemplate } from '@formbird/types';

export type { ComponentDefinition, FormDocument, FormParameters, FormTemplate };

/**
 * One entry of a related-document field, the shape `sc-related-document` stores:
 * `[{ documentId, name, ...relatedFields }]`.
 */
export interface RelatedDoc {
  documentId: string;
  name: string;
  [field: string]: unknown;
}

/** A document as returned by a search hit `_source`. */
export type SourceDocument = Record<string, unknown> & { documentId?: string };

/**
 * Properties fieldtec-web sets on every custom element it renders
 * (`ComponentService.createComponent` in fieldtec-web/projects/services).
 */
export interface FormbirdElementProps<TDef extends ComponentDefinition = ComponentDefinition, TValue = unknown> {
  document?: FormDocument;
  template?: FormTemplate;
  componentDefinition?: TDef;
  fieldName?: string;
  fieldValue?: TValue;
  formParameters?: FormParameters;
  key?: number;
  account?: unknown;
}

/** The subset of an rxjs Subscription the host's streams return. */
export interface Unsubscribable {
  unsubscribe(): void;
}

/** The subset of an rxjs Observable the host's streams provide. */
export interface Subscribable<T> {
  subscribe(next: (value: T) => void): Unsubscribable;
}

/** Fields shared by the component definitions in this repo, on top of Formbird's own. */
export interface BaseDefinition extends ComponentDefinition {
  /** Elasticsearch request (string with single quotes and Handlebars, or an object set by a ruleset). */
  filter?: string | Record<string, unknown>;
  /** Extra fields copied from the selected document into the stored value: `{ storedKey: 'source.path' }`. */
  relatedFields?: Record<string, string>;
  queryOptions?: { pageSize?: number };
  /** Placeholder shown when empty (sc-related-document name). */
  helpDisplayString?: string;
  noHelpDisplay?: boolean;
}
