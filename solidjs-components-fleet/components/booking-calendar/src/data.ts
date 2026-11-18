// Loading what the calendar shows: assets (rows), bookings and workshop block-outs (bars).

import {
  getPath,
  parseFilter,
  searchPage,
  statusAppearance,
  toDate,
  toRelatedList,
  withRequiredClause,
  type EsRequest,
  type RelatedDoc,
  type SourceDocument,
} from '@solidjs-components/kit';
import { blockedUntil, type TimeWindow } from '../../../packages/fleet-kit/src/calendar';

/** Fields on asset documents (defaults are the fleet demo's). */
export interface AssetFields {
  id: string;
  type: string;
  location: string;
  hireStatus: string;
  /** Asset type's icon kind (car, van…), when the type value carries it. */
  iconKind: string;
}

/** Fields on booking documents. */
export interface BookingFields {
  asset: string;
  start: string;
  end: string;
  status: string;
  ref: string;
  person: string;
  closed: string;
}

/** Fields on block-out documents (workshop requests). */
export interface BlockFields {
  asset: string;
  start: string;
  end: string;
  ref: string;
  status: string;
}

export interface CalendarSources {
  assetFilter?: string | Record<string, unknown>;
  assetFields?: Partial<AssetFields>;
  /** Fields copied into a booking's asset value (as the booking's asset picker stores it). */
  assetValueFields?: Record<string, string>;
  bookingFilter?: string | Record<string, unknown>;
  bookingFields?: Partial<BookingFields>;
  blockFilter?: string | Record<string, unknown>;
  blockFields?: Partial<BlockFields>;
  /** A booking in this status past its end is "Hire Overdue" (default "Hire Commenced"). */
  overdueStatus?: string;
}

export const ASSET_FIELDS: AssetFields = {
  id: 'assetId',
  type: 'assetTypeRel',
  location: 'locationRel',
  hireStatus: 'hireStatusRel',
  iconKind: 'assetTypeRel.0.iconKind',
};
export const BOOKING_FIELDS: BookingFields = {
  asset: 'assetRel',
  start: 'startDate',
  end: 'endDate',
  status: 'bookingStatusRel',
  ref: 'bookingRef',
  person: 'requestedByRel',
  closed: 'closedDate',
};
export const BLOCK_FIELDS: BlockFields = {
  asset: 'assetRel',
  start: 'expectedStartDate',
  end: 'expectedCompletionDate',
  ref: 'requestRef',
  status: 'requestStatusRel',
};

/** A row of the calendar. */
export interface CalendarAsset {
  documentId: string;
  /** Fleet ID ("V-104"). */
  id: string;
  /** Summary name ("V-104 · Toyota HiAce · CX45LM"). */
  label: string;
  typeName: string;
  typeId: string;
  iconKind?: string;
  location: string;
  hireStatus?: { name: string; color: string };
  /** Unavailable For Hire: can't be booked now. */
  unavailable: boolean;
  /** What a booking's asset field stores for this asset. */
  value: RelatedDoc;
}

/** A bar on a row. */
export interface CalendarItem {
  /** documentId of the booking or request. */
  id: string;
  kind: 'booking' | 'block';
  assetId: string;
  start: number;
  end: number;
  /** Where the bar is drawn to: the end, or now for a hire still out past its end. */
  drawEnd: number;
  /** Blocks the asset until then (blockedUntil: an unreturned hire, an early return). */
  until: number;
  ref: string;
  person: string;
  status: string;
  color: string;
  overdue: boolean;
}

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));

/**
 * The calendar's assets.
 * @param sources - Filters and field names from the definition
 * @param context - Handlebars context for the filters
 * @returns Assets sorted by location, then fleet ID
 */
export async function loadAssets(sources: CalendarSources, context: Record<string, unknown>): Promise<CalendarAsset[]> {
  const request = parseFilter(sources.assetFilter, context);
  if (!request) throw new Error('No asset filter');
  const f = { ...ASSET_FIELDS, ...sources.assetFields };
  const valueFields = sources.assetValueFields ?? {};
  const { documents } = await searchPage({
    request,
    page: 0,
    pageSize: 300,
    include: ['documentId', 'systemHeader.summaryName', f.id, f.type, f.location, f.hireStatus, f.iconKind.split('.0.')[0], ...Object.values(valueFields)],
  });
  return documents
    .map((doc) => toAsset(doc, f, valueFields))
    .sort((a, b) => a.location.localeCompare(b.location) || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function toAsset(doc: SourceDocument, f: AssetFields, valueFields: Record<string, string>): CalendarAsset {
  const label = text(getPath(doc, 'systemHeader.summaryName'));
  const type = toRelatedList(getPath(doc, f.type))[0];
  const hire = toRelatedList(getPath(doc, f.hireStatus))[0];
  return {
    documentId: text(doc.documentId),
    id: text(getPath(doc, f.id)) || label,
    label,
    typeName: type?.name ?? '',
    typeId: type?.documentId ?? '',
    iconKind: text(getPath(doc, f.iconKind)) || undefined,
    location: toRelatedList(getPath(doc, f.location))[0]?.name ?? 'No location',
    hireStatus: hire ? { name: hire.name, color: statusAppearance(hire.name, {}, hire as unknown as SourceDocument).color } : undefined,
    unavailable: /unavailable/i.test(hire?.name ?? ''),
    value: {
      documentId: text(doc.documentId),
      name: label,
      ...Object.fromEntries(Object.entries(valueFields).map(([key, path]) => [key, getPath(doc, path) ?? null])),
    },
  };
}

const iso = (time: number) => new Date(time).toISOString();

/**
 * Bookings and block-outs of some assets that touch a window, plus hires still out past their end.
 * @param sources - Filters and field names from the definition
 * @param context - Handlebars context for the filters
 * @param assetIds - Assets on screen
 * @param window - Visible window
 * @returns Items, bookings first
 */
export async function loadItems(
  sources: CalendarSources,
  context: Record<string, unknown>,
  assetIds: string[],
  window: TimeWindow,
): Promise<CalendarItem[]> {
  if (!assetIds.length) return [];
  const now = Date.now();
  const b = { ...BOOKING_FIELDS, ...sources.bookingFields };
  const k = { ...BLOCK_FIELDS, ...sources.blockFields };
  const overdueStatus = sources.overdueStatus ?? 'Hire Commenced';
  const jobs: Promise<CalendarItem[]>[] = [];

  const bookingRequest = parseFilter(sources.bookingFilter, context);
  if (bookingRequest) {
    const request = within(bookingRequest, b.asset, assetIds, b.start, b.end, window, { [`${b.status}.name`]: overdueStatus });
    jobs.push(
      searchPage({
        request,
        page: 0,
        pageSize: 500,
        include: ['documentId', b.asset, b.start, b.end, b.status, b.ref, b.person, b.closed],
      }).then(({ documents }) =>
        documents.flatMap((doc) => {
          const start = toDate(getPath(doc, b.start))?.getTime();
          const end = toDate(getPath(doc, b.end))?.getTime();
          if (start === undefined || end === undefined) return [];
          const status = toRelatedList(getPath(doc, b.status))[0];
          const closed = toDate(getPath(doc, b.closed))?.getTime();
          const overdue = !!status && status.name === overdueStatus && end < now && closed === undefined;
          return toRelatedList(getPath(doc, b.asset)).map((asset) => ({
            id: text(doc.documentId),
            kind: 'booking' as const,
            assetId: asset.documentId,
            start,
            end,
            drawEnd: overdue ? now : end,
            until: blockedUntil({ end, overdue, closed, now }),
            ref: text(getPath(doc, b.ref)) || 'Booking',
            person: toRelatedList(getPath(doc, b.person))[0]?.name ?? '',
            status: status?.name ?? '',
            color: status ? statusAppearance(status.name, {}, status as unknown as SourceDocument).color : 'var(--sj-accent)',
            overdue,
          }));
        }),
      ),
    );
  }

  const blockRequest = parseFilter(sources.blockFilter, context);
  if (blockRequest) {
    const request = within(blockRequest, k.asset, assetIds, k.start, k.end, window);
    jobs.push(
      searchPage({ request, page: 0, pageSize: 200, include: ['documentId', k.asset, k.start, k.end, k.ref, k.status] }).then(({ documents }) =>
        documents.flatMap((doc) => {
          const start = toDate(getPath(doc, k.start))?.getTime();
          const end = toDate(getPath(doc, k.end))?.getTime();
          if (start === undefined || end === undefined) return [];
          const status = toRelatedList(getPath(doc, k.status))[0]?.name ?? '';
          return toRelatedList(getPath(doc, k.asset)).map((asset) => ({
            id: text(doc.documentId),
            kind: 'block' as const,
            assetId: asset.documentId,
            start,
            end,
            drawEnd: end,
            until: end,
            ref: text(getPath(doc, k.ref)) || 'Workshop',
            person: '',
            status,
            color: 'var(--sj-warning)',
            overdue: false,
          }));
        }),
      ),
    );
  }
  return (await Promise.all(jobs)).flat();
}

/** The filter, narrowed to these assets and to items overlapping the window (or matching `alsoWhen`). */
function within(
  base: EsRequest,
  assetField: string,
  assetIds: string[],
  startField: string,
  endField: string,
  window: TimeWindow,
  alsoWhen?: Record<string, string>,
): EsRequest {
  const request = structuredClone(base);
  withRequiredClause(request, { terms: { [`${assetField}.documentId`]: assetIds } });
  withRequiredClause(request, { range: { [startField]: { lt: iso(window.end) } } });
  const endsAfter = { range: { [endField]: { gt: iso(window.start) } } };
  withRequiredClause(
    request,
    alsoWhen ? { bool: { should: [endsAfter, { term: alsoWhen }], minimum_should_match: 1 } } : endsAfter,
  );
  return request;
}
