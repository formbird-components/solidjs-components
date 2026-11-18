import { For, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import {
  Avatar,
  Chip,
  cssColor,
  daysUntil,
  documentPath,
  dueText,
  EmptyAvatar,
  formatDate,
  formatDateTime,
  formatMoney,
  hueOf,
  Icon,
  IssueTypeIcon,
  issueTypeKind,
  LookupIcon,
  Lozenge,
  pathValues,
  PriorityIcon,
  priorityLevel,
  RelativeTime,
  renderTemplate,
  safeUrl,
  statusAppearance,
  type IconSet,
  type SourceDocument,
  type StatusAppearanceOptions,
} from '@solidjs-components/kit';

/** How a column shows its value. sc-datatables' `url`, `date`, `numeric` and `boolean` keep their meaning. */
export type ColumnType =
  | 'text'
  | 'url'
  | 'key'
  | 'status'
  | 'priority'
  | 'issueType'
  | 'user'
  | 'labels'
  | 'date'
  | 'datetime'
  | 'numeric'
  | 'boolean'
  | 'color'
  | 'email'
  | 'icon'
  | 'money'
  | 'due';

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg';
export type SortDirection = 'asc' | 'desc';

/**
 * One column. The sc-datatables keys (`displayName`, `field`, `type`, `href`, `sort`, `visible`,
 * `responsive`) work unchanged; status columns also take `colors`, `categories`, `colorField`.
 */
export interface TableColumn extends StatusAppearanceOptions {
  /** Header text. Default: from the field name. */
  displayName?: string;
  /** Dot path into the document; arrays are read through (`tagsRel.name`). Related fields can be given as `statusRel`. */
  field: string;
  type?: ColumnType | (string & {});
  /** Link target for `url`/`key`/`link` columns, Handlebars against the row. Default `/form/{{{documentId}}}`. */
  href?: string;
  /** Show a text column as a link to the row's document. */
  link?: boolean;
  /** Elasticsearch field to sort by. Default: chosen from the type (see README). */
  sortField?: string;
  /** `false` turns sorting off for this column. */
  sortable?: boolean;
  /** Initial sort (sc-datatables): lowest `precedence` first. */
  sort?: { direction?: SortDirection; precedence?: number };
  /** `false` hides the column (and leaves it out of exports). */
  visible?: boolean;
  /** Bootstrap-style widths by table width; 0 hides the column at that size (sc-datatables). */
  responsive?: Partial<Record<Breakpoint, number>>;
  /** CSS width, e.g. "110px" or "40%". */
  width?: string;
  /** Shown when the field is empty, e.g. "Unassigned". */
  emptyText?: string;
  /** Issue type and icon columns: the icon alone, with the name as its tooltip. */
  iconOnly?: boolean;
  /** Icon columns: the icon family ("type", "asset", "work", "priority"; default "type"). */
  iconSet?: IconSet;
  /** Icon columns: a field of the row naming the icon kind ("van"), when the value's name doesn't say it. */
  iconKindField?: string;
  /** Money columns: ISO currency (default AUD). */
  currency?: string;
  /** Numeric columns: unit after the number ("km"). */
  suffix?: string;
  /** Due columns: amber this many days before the date (default 30); red once it has passed. */
  warnDays?: number;
}

/** What cells need from the table beyond their row. */
export interface CellContext {
  /** Status document by lower-case name, once the table's `statusFilter` has loaded. */
  statusSource(name: string): SourceDocument | undefined;
}

const SUFFIXES = /(Rel|Arr|Bool|Num|Str|Dt)$/;

/**
 * A column's header text.
 * @param column - Column definition
 * @returns `displayName`, or a readable name made from the field (`storyPointsNum` → "Story points")
 */
export function headerText(column: TableColumn): string {
  if (typeof column.displayName === 'string') return column.displayName;
  const segment = column.field.split('.').filter((s) => !['name', 'lcase', 'keyword'].includes(s)).pop() ?? column.field;
  const words = segment.replace(SUFFIXES, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The related field behind `statusRel` or `statusRel.name`. */
const relatedField = (field: string) => field.replace(/\.name$/, '');

/** Formbird names related-document fields `...Rel`; anything else holds plain values. */
const isRelated = (field: string) => /Rel$/.test(relatedField(field).split('.').pop() ?? '');

/** Display names of a field's values: entries of a related field, or plain values. */
export function names(row: SourceDocument, field: string): string[] {
  return pathValues(row, field)
    .map((value) => (value && typeof value === 'object' ? (value as { name?: unknown }).name : value))
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map(String);
}

/** Entries of a related field as objects (plain values become `{ name }`). */
function entriesOf(row: SourceDocument, column: TableColumn): (SourceDocument & { name: string })[] {
  return pathValues(row, relatedField(column.field))
    .map((value) => (value && typeof value === 'object' ? (value as SourceDocument) : { name: value }))
    .filter((entry) => entry.name !== undefined && entry.name !== null && entry.name !== '')
    .map((entry) => ({ ...entry, name: String(entry.name) }));
}

/**
 * The Elasticsearch field a column sorts by. Strings are keywords with a lower-cased `.lcase`
 * sub-field in Formbird's index template, so text sorts case-insensitively. Related fields
 * (`...Rel`) sort by their entries: statuses and priorities by `indexNum` (workflow order), people,
 * types and labels by name.
 * @param column - Column definition
 * @returns The field, or undefined when the column can't be sorted
 */
export function sortFieldOf(column: TableColumn): string | undefined {
  if (column.sortable === false) return undefined;
  if (column.sortField) return column.sortField;
  const type = column.type ?? 'text';
  const lcase = /\.(lcase|keyword)$/.test(column.field) ? column.field : `${column.field}.lcase`;
  switch (type) {
    case 'date':
    case 'datetime':
    case 'numeric':
    case 'boolean':
    case 'money':
    case 'due':
      return column.field;
    case 'status':
    case 'priority':
      return isRelated(column.field) ? `${relatedField(column.field)}.indexNum` : lcase;
    case 'issueType':
    case 'icon':
    case 'user':
    case 'labels':
      return isRelated(column.field) ? `${relatedField(column.field)}.name.lcase` : lcase;
    default:
      return lcase;
  }
}

const UNMAPPED_TYPES: Record<string, string> = {
  date: 'date',
  datetime: 'date',
  numeric: 'float',
  money: 'float',
  due: 'date',
  boolean: 'boolean',
  status: 'float',
  priority: 'float',
};

/**
 * An Elasticsearch sort clause for a column. `unmapped_type` keeps the query valid while no
 * document has the field yet (a new index, or a field nobody has filled in).
 * @param column - Column definition
 * @param direction - Sort direction
 * @returns The clause, or undefined when the column can't be sorted
 */
export function sortClause(column: TableColumn, direction: SortDirection): Record<string, unknown> | undefined {
  const field = sortFieldOf(column);
  if (!field) return undefined;
  const unmapped = /\.(lcase|keyword)$/.test(field) ? 'keyword' : (UNMAPPED_TYPES[column.type ?? 'text'] ?? 'keyword');
  return { [field]: { order: direction, unmapped_type: unmapped } };
}

/** Direction a column sorts in when first clicked: newest dates first, everything else A–Z. */
export function firstDirection(column: TableColumn): SortDirection {
  return column.type === 'date' || column.type === 'datetime' ? 'desc' : 'asc';
}

const isTrue = (value: unknown) => value === true || value === 'true';

/**
 * A cell as text, for CSV export and tooltips.
 * @param column - Column definition
 * @param row - The document
 * @returns What the cell shows, as plain text
 */
export function cellText(column: TableColumn, row: SourceDocument): string {
  switch (column.type ?? 'text') {
    case 'date':
      return pathValues(row, column.field).map((value) => formatDate(value)).filter(Boolean).join(', ');
    case 'datetime':
      return pathValues(row, column.field).map(formatDateTime).filter(Boolean).join(', ');
    case 'due':
      return pathValues(row, column.field).map((value) => formatDate(value)).filter(Boolean).join(', ');
    case 'money': {
      const value = pathValues(row, column.field)[0];
      return value === undefined ? '' : formatMoney(value, column.currency ?? 'AUD');
    }
    case 'boolean': {
      const values = pathValues(row, column.field);
      return values.length ? (values.some(isTrue) ? 'Yes' : 'No') : '';
    }
    default:
      return names(row, column.field).join(', ');
  }
}

/** Where a linked cell points, or undefined when the rendered URL isn't safe to link to. */
function hrefOf(column: TableColumn, row: SourceDocument): string | undefined {
  if (!column.href) return row.documentId ? documentPath(String(row.documentId)) : undefined;
  return safeUrl(renderTemplate(column.href, row));
}

const muted = (text?: string): JSX.Element =>
  text ? <span class="tb-muted">{text}</span> : <span class="tb-muted" aria-label="None">–</span>;

/**
 * Renders one cell. Called inside the cell's JSX, so values that load later (status colours)
 * update the cell.
 * @param column - Column definition
 * @param row - The document
 * @param context - Table-wide data
 * @returns The cell content
 */
export function renderCell(column: TableColumn, row: SourceDocument, context: CellContext): JSX.Element {
  const type = column.type ?? 'text';
  switch (type) {
    case 'url':
    case 'key': {
      const text = names(row, column.field).join(', ');
      if (!text) return muted(column.emptyText);
      const href = hrefOf(column, row);
      return href ? (
        <a class={['sj-link', type === 'key' ? 'tb-key' : 'tb-strong']} href={href}>
          {text}
        </a>
      ) : (
        <span class="tb-text">{text}</span>
      );
    }
    case 'status': {
      const entries = entriesOf(row, column);
      if (!entries.length) return muted(column.emptyText);
      return (
        <span class="tb-stack">
          <For each={entries}>
            {(entry) => <Lozenge color={statusAppearance(entry.name, column, context.statusSource(entry.name) ?? entry).color}>{entry.name}</Lozenge>}
          </For>
        </span>
      );
    }
    case 'priority': {
      const name = names(row, column.field)[0];
      if (!name) return muted(column.emptyText);
      return (
        <span class="tb-inline">
          <PriorityIcon level={priorityLevel(name)} />
          <span class="tb-truncate">{name}</span>
        </span>
      );
    }
    case 'issueType': {
      const name = names(row, column.field)[0];
      if (!name) return muted(column.emptyText);
      return (
        <span class="tb-inline" title={column.iconOnly ? name : undefined}>
          <IssueTypeIcon kind={issueTypeKind(name)} title={column.iconOnly ? name : undefined} />
          <Show when={!column.iconOnly}>
            <span class="tb-truncate">{name}</span>
          </Show>
        </span>
      );
    }
    case 'icon': {
      const name = names(row, column.field)[0];
      if (!name) return muted(column.emptyText);
      const kind = column.iconKindField ? pathValues(row, column.iconKindField)[0] : undefined;
      return (
        <span class="tb-inline" title={column.iconOnly ? name : undefined}>
          <LookupIcon
            set={column.iconSet ?? 'type'}
            name={name}
            override={typeof kind === 'string' && kind ? { icon: kind } : undefined}
            title={column.iconOnly ? name : undefined}
          />
          <Show when={!column.iconOnly}>
            <span class="tb-truncate">{name}</span>
          </Show>
        </span>
      );
    }
    case 'money': {
      const value = pathValues(row, column.field)[0];
      if (value === undefined || value === null || value === '') return muted(column.emptyText);
      return <span class="tb-num">{formatMoney(value, column.currency ?? 'AUD')}</span>;
    }
    case 'due': {
      const value = pathValues(row, column.field)[0];
      if (value === undefined) return muted(column.emptyText);
      const days = daysUntil(value) ?? 0;
      const tone = days < 0 ? 'tb-due--over' : days <= (column.warnDays ?? 30) ? 'tb-due--soon' : '';
      return (
        <span class={['tb-nowrap', 'tb-due', tone]} title={formatDate(value)}>
          {dueText(value)}
        </span>
      );
    }
    case 'user': {
      const people = entriesOf(row, column);
      if (!people.length) {
        return (
          <span class="tb-inline tb-muted">
            <EmptyAvatar size="sm" />
            {column.emptyText ?? 'Unassigned'}
          </span>
        );
      }
      return (
        <span class="tb-inline" title={people.map((p) => p.name).join(', ')}>
          <Avatar name={people[0].name} size="sm" title="" />
          <span class="tb-truncate">{people[0].name}</span>
          <Show when={people.length > 1}>
            <span class="tb-more">+{people.length - 1}</span>
          </Show>
        </span>
      );
    }
    case 'labels': {
      const labels = names(row, column.field);
      if (!labels.length) return muted(column.emptyText);
      return (
        <span class="tb-chips">
          <For each={labels}>{(label) => <Chip label={label} hue={hueOf(label)} />}</For>
        </span>
      );
    }
    case 'date':
    case 'datetime': {
      const value = pathValues(row, column.field)[0];
      if (value === undefined) return muted(column.emptyText);
      return type === 'date' ? <RelativeTime value={value} class="tb-nowrap" /> : <span class="tb-nowrap">{formatDateTime(value)}</span>;
    }
    case 'numeric': {
      const values = pathValues(row, column.field);
      if (!values.length) return muted(column.emptyText);
      return (
        <span class="tb-num">
          {values.map((v) => (Number.isFinite(Number(v)) ? new Intl.NumberFormat().format(Number(v)) : String(v))).join(', ')}
          {column.suffix ? ` ${column.suffix}` : ''}
        </span>
      );
    }
    case 'boolean':
      return pathValues(row, column.field).some(isTrue) ? (
        <span class="tb-check" role="img" aria-label="Yes">
          <Icon name="check" size={16} strokeWidth={2} />
        </span>
      ) : (
        muted(column.emptyText)
      );
    case 'color': {
      const value = names(row, column.field)[0];
      if (!value) return muted(column.emptyText);
      return (
        <span class="tb-inline">
          <span class="tb-swatch" style={{ background: cssColor(value) ?? 'transparent' }} aria-hidden="true" />
          <span class="tb-truncate">{value}</span>
        </span>
      );
    }
    case 'email': {
      const value = names(row, column.field)[0];
      if (!value) return muted(column.emptyText);
      return (
        <a class="sj-link tb-truncate" href={`mailto:${value}`}>
          {value}
        </a>
      );
    }
    default: {
      const text = names(row, column.field).join(', ');
      if (!text) return muted(column.emptyText);
      const href = column.link ? hrefOf(column, row) : undefined;
      return href ? (
        <a class="sj-link tb-strong tb-clamp" href={href} title={text}>
          {text}
        </a>
      ) : (
        <span class="tb-clamp" title={text}>
          {text}
        </span>
      );
    }
  }
}
