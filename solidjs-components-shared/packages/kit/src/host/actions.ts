// Quick actions ("Book", "Report a hazard here"): start a new document with the record they are on
// already filled in. Used by <solid-map> popups and app elements such as fleet's
// <solid-asset-summary>.

import type { IconName } from '../ui/icons';
import { openNewDocument } from './session';

/** A quick action as component definitions write it. */
export interface RecordAction {
  label: string;
  icon?: IconName;
  /** Template of the new document. */
  templateId: string;
  /**
   * Values for the new document. `{ "$record": { "assetId": "assetId", … } }` (or `"$asset"`) puts the
   * record there as a related value, `[{ documentId, name, …picked fields }]`; anything else is copied.
   */
  values?: Record<string, unknown>;
  primary?: boolean;
}

/** The record an action runs on. */
export interface ActionRecord {
  documentId: string;
  /** Name stored in the related value. */
  name: string;
  /** Reads a field of the record (dot path). */
  get: (path: string) => unknown;
}

/**
 * Values for the new document an action starts.
 * @param action - The action
 * @param record - The record it runs on
 * @returns Field values
 */
export function actionValues(action: RecordAction, record: ActionRecord): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(action.values ?? {})) {
    const picks =
      spec && typeof spec === 'object' && ('$record' in spec || '$asset' in spec)
        ? ((spec as { $record?: Record<string, string>; $asset?: Record<string, string> }).$record ??
          (spec as { $asset?: Record<string, string> }).$asset ??
          {})
        : undefined;
    values[key] = picks
      ? [{ documentId: record.documentId, name: record.name, ...Object.fromEntries(Object.entries(picks).map(([to, path]) => [to, record.get(path) ?? null])) }]
      : spec;
  }
  return values;
}

/**
 * Runs an action: opens the new document with its values.
 * @param action - The action
 * @param record - The record it runs on
 */
export function runAction(action: RecordAction, record: ActionRecord): void {
  openNewDocument(action.templateId, actionValues(action, record));
}
