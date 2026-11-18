import { createEffect, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import {
  createFieldBinding,
  daysUntil,
  followDocumentLink,
  formatDate,
  formatNumber,
  getPath,
  getService,
  Icon,
  IconButton,
  LookupIcon,
  parseFilter,
  searchPage,
  uid,
  type BaseDefinition,
  type ElementProps,
  type FormbirdElementProps,
  type IconName,
  type IconSet,
} from '@solidjs-components/kit';

/** How a tile's number is coloured. */
export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'accent';

export interface StatTile {
  /** "On hire", "Urgent defects"… */
  label: string;
  /** Elasticsearch request counted (`query` only; Handlebars allowed, e.g. `{{account.documentId}}`). */
  filter: string | Record<string, unknown>;
  /**
   * "count" (default): how many documents match. "daysSince": whole days since the latest matching
   * document's `dateField` ("days since the last lost time injury"); its date is the hint.
   */
  measure?: 'count' | 'daysSince';
  /** For "daysSince": the date field to look at (e.g. "occurredDate"). */
  dateField?: string;
  tone?: Tone;
  /** Tone when the number is 0 (e.g. "good" for "nothing overdue", "bad" for "0 days since"). */
  zeroTone?: Tone;
  /** Tone once the number reaches this (e.g. "good" from 30 days without a lost time injury). */
  goodFrom?: number;
  /** CSS colour, instead of a tone. */
  color?: string;
  /**
   * A line icon ("clock"), or a tile from an icon set as "set:name" ("asset:Panel Van", "work:Repair").
   * Always a string: Formbird indexes template definitions, and a field can't be both text and object.
   */
  icon?: string;
  /** Document (page or template) the tile opens: its documentId. */
  link?: string;
  /** Small text under the number. */
  hint?: string;
}

export interface StatTilesDefinition extends BaseDefinition {
  tiles?: StatTile[];
  /** Count again every N seconds (0: only on load, on save and on refresh). */
  refreshSeconds?: number;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<StatTilesDefinition, unknown>>;

interface Count {
  value?: number;
  error?: string;
  /** daysSince: the latest date found, or none matched. */
  since?: string;
  none?: boolean;
}

const ICON_SETS: IconSet[] = ['type', 'asset', 'work', 'priority'];

/** A tile's icon: a line icon by name, or "set:name" for a tile from an icon set. */
function TileIcon(props: { icon: string }) {
  const tile = () => {
    const [set, ...rest] = props.icon.split(':');
    return rest.length && ICON_SETS.includes(set as IconSet) ? { set: set as IconSet, name: rest.join(':') } : undefined;
  };
  return (
    <Show when={tile()} fallback={<Icon name={props.icon as IconName} size={14} />}>
      {(t) => <LookupIcon set={t().set} name={t().name} />}
    </Show>
  );
}

/**
 * `<solid-stat-tiles>`: a row of live counts for a dashboard. Each tile counts its own filter
 * (exact totals), recounts after any save in the app and on refresh, and opens its list.
 * @param props - Formbird element properties
 */
export function StatTiles(props: Props) {
  const field = createFieldBinding<unknown, StatTilesDefinition>(props);
  const def = field.definition;
  const labelId = uid('label');
  const [counts, setCounts] = createSignal<Count[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [reloads, setReloads] = createSignal(0);

  const tiles = () => (def().tiles ?? []).filter((t) => t && typeof t.label === 'string');

  let requestId = 0;
  const load = async () => {
    const id = ++requestId;
    const list = untrack(tiles);
    const context = untrack(() => field.templateContext());
    setLoading(true);
    const results = await Promise.all(
      list.map(async (tile): Promise<Count> => {
        try {
          const request = parseFilter(tile.filter, context);
          if (!request) return { error: 'No filter' };
          if (tile.measure === 'daysSince') {
            if (!tile.dateField) return { error: 'No dateField' };
            // The latest match only. Formbird's search takes the sort inside the request.
            const latest = { ...request, sort: [{ [tile.dateField]: { order: 'desc', unmapped_type: 'date' } }] };
            const { documents } = await searchPage({ request: latest, page: 0, pageSize: 1, include: ['documentId', tile.dateField] });
            const since = documents[0] ? getPath(documents[0], tile.dateField) : undefined;
            const days = daysUntil(since);
            return days === undefined ? { none: true } : { value: Math.max(0, -days), since: String(since) };
          }
          const { total } = await searchPage({ request, page: 0, pageSize: 1, include: ['documentId'], trackTotal: true });
          return { value: total };
        } catch (error) {
          return { error: (error as Error)?.message || 'Count failed' };
        }
      }),
    );
    if (id !== requestId) return;
    setCounts(results);
    setLoading(false);
  };

  createEffect(
    () => JSON.stringify([def().tiles ?? null, reloads()]),
    () => void load(),
  );

  // Recount after any save in the app (a booking closed, a request opened…) and on a timer.
  // The broadcast replays the last save to new subscribers, synchronously: skip that one.
  let listening = false;
  const saved = getService('BroadcastService')
    ?.on?.('document:updated')
    .subscribe(() => listening && setReloads((n) => n + 1));
  queueMicrotask(() => (listening = true));
  onCleanup(() => saved?.unsubscribe());
  createEffect(
    () => Math.max(0, Number(def().refreshSeconds) || 0),
    (seconds) => {
      if (!seconds) return;
      const timer = setInterval(() => setReloads((n) => n + 1), seconds * 1000);
      return () => clearInterval(timer);
    },
  );

  const toneOf = (tile: StatTile, count: Count): Tone => {
    if (count.value === 0 && tile.zeroTone) return tile.zeroTone;
    if (count.none && tile.goodFrom !== undefined) return 'good';
    if (count.value !== undefined && tile.goodFrom !== undefined && count.value >= tile.goodFrom) return 'good';
    return tile.tone ?? 'neutral';
  };
  const hintOf = (tile: StatTile, count: Count) => {
    if (tile.measure !== 'daysSince') return tile.hint;
    if (count.none) return tile.hint ? `${tile.hint} · none recorded` : 'None recorded';
    if (count.since) return tile.hint ? `${tile.hint} · last ${formatDate(count.since)}` : `Last: ${formatDate(count.since)}`;
    return tile.hint;
  };

  return (
    <section class="st" aria-labelledby={field.label() && !def().hideLabel ? labelId : undefined} onClick={followDocumentLink}>
      <Show when={field.label() && !def().hideLabel}>
        <header class="st-head">
          <h2 class="st-title" id={labelId}>
            {field.label()}
          </h2>
          <IconButton icon="refresh" size="sm" label="Count again" onClick={() => setReloads((n) => n + 1)} />
        </header>
      </Show>
      <ul class="st-grid" aria-busy={loading() ? 'true' : 'false'}>
        <For each={tiles()}>
          {(tile, index) => {
            const count = () => counts()[index()] ?? {};
            const body = () => (
              <>
                <span class="st-label">
                  <Show when={tile.icon}>{(icon) => <TileIcon icon={icon()} />}</Show>
                  {tile.label}
                </span>
                <span class="st-value">
                  <Show when={!loading() || count().value !== undefined} fallback={<span class="sj-skeleton st-skeleton" />}>
                    <Show when={count().error === undefined} fallback={<span class="st-error" title={count().error}>–</span>}>
                      <Show when={!count().none} fallback={<span class="st-none">–</span>}>
                        {formatNumber(count().value ?? 0, 0)}
                      </Show>
                    </Show>
                  </Show>
                </span>
                <Show when={hintOf(tile, count())}>{(hint) => <span class="st-hint">{hint()}</span>}</Show>
              </>
            );
            return (
              <li class={['st-tile', `st-tile--${tile.color ? 'custom' : toneOf(tile, count())}`]} style={tile.color ? { '--st-tone': tile.color } : undefined}>
                <Show when={tile.link} fallback={<div class="st-body">{body()}</div>}>
                  <a class="st-body st-link" href={`/form/${tile.link}`} aria-label={`${tile.label}: ${count().none ? 'none recorded' : count().value ?? '…'}`}>
                    {body()}
                    <Icon name="chevron-right" size={14} class="st-go" />
                  </a>
                </Show>
              </li>
            );
          }}
        </For>
      </ul>
    </section>
  );
}
