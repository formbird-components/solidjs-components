/**
 * @solidjs-components/kit: everything components share.
 * Built once as `solidjs-components-kit.js` (global `SolidJsComponentsKit`) and loaded before
 * any component bundle, so this code ships to the page once however many components are used.
 */
import { version } from '../package.json';

export const KIT_VERSION: string = version;

// Formbird host bindings
export type {
  BaseDefinition,
  ComponentDefinition,
  FormDocument,
  FormParameters,
  FormTemplate,
  FormbirdElementProps,
  RelatedDoc,
  SourceDocument,
  Subscribable,
  Unsubscribable,
} from './host/types';
export { getService, type FormbirdServices } from './host/services';
export { defineFormbirdElement, type ElementOptions, type ElementProps } from './host/element';
export { createFieldBinding, createDocumentField, type FieldBinding, type FieldOptions } from './host/field';
export { createSearchOptions, type SearchOptions, type SearchOptionsConfig } from './host/options';
export { searchDocuments, searchPage, fetchDocuments, clearSearchCache, type SearchParams, type PageParams, type SearchPage } from './host/search';
export {
  parseFilter,
  withTextSearch,
  withRequiredClause,
  searchClause,
  extractHits,
  extractTotal,
  toRelatedDoc,
  toRelatedList,
  documentName,
  type EsRequest,
} from './host/query';
export { renderTemplate } from './host/template';
export {
  currentAccount,
  currentUser,
  nextEntryId,
  hasAccessKey,
  documentPath,
  documentUrl,
  openDocument,
  openNewDocument,
  notify,
  copyText,
  downloadText,
  type OpenMode,
  type UserRef,
} from './host/session';
export { useTheme, type Theme } from './host/theme';
export { actionValues, runAction, type ActionRecord, type RecordAction } from './host/actions';
export { createDocument, uploadFile, fileSource, fileUrl, newDocumentId, errorText, type StoredFile } from './host/records';
export {
  toDate,
  formatDate,
  formatDateTime,
  formatTime,
  formatNumber,
  formatMoney,
  formatDuration,
  relativeTime,
  dueText,
  daysUntil,
} from './host/format';
export {
  MINUTE,
  HOUR,
  DAY,
  startOfDay,
  addDays,
  roundUp,
  roundTo,
  toDateInput,
  toTimeInput,
  fromInputs,
  dayLabel,
  rangeLabel,
} from './host/time';
export { renderMarkdown, escapeHtml, safeUrl } from './host/markdown';
export {
  getPath,
  pathValues,
  jsonEqual,
  cloneJson,
  normalizeText,
  initials,
  hashString,
  debounce,
  uid,
  findByName,
} from './host/util';

// Statuses, workflows and lookup icons
export * from './domain/status';
export * from './domain/lookups';
export * from './domain/checklist';
export * from './domain/range';
export * from './domain/approval';
export * from './domain/money';

// UI
export {
  Icon,
  IssueTypeIcon,
  AssetIcon,
  WorkIcon,
  GlyphTile,
  PriorityIcon,
  LookupIcon,
  Spinner,
  glyphFor,
  glyphSvg,
  type Glyph,
  type IconName,
  type IconOverride,
} from './ui/icons';
export { Avatar, EmptyAvatar, Lozenge, Chip, Button, IconButton, FieldShell, hueOf } from './ui/primitives';
export { RelativeTime, Markdown, followDocumentLink } from './ui/text';
export { Popover, type PopoverProps, type DismissReason } from './ui/popover';
export { PickerPanel, type PickerItem, type PickerPanelProps } from './ui/picker';
export {
  RelatedPicker,
  type RelatedPickerDefinition,
  type RelatedPickerProps,
  type RelatedOption,
  type PickerActions,
} from './ui/related-picker';
