import { createEffect, createMemo, createSignal, flush, For, onCleanup, Show, untrack } from 'solid-js';
import {
  Avatar,
  createFieldBinding,
  cssColor,
  currentUser,
  errorText,
  FieldShell,
  followDocumentLink,
  getPath,
  getService,
  Icon,
  IconButton,
  parseFilter,
  pathValues,
  searchPage,
  Spinner,
  uid,
  Button,
  type BaseDefinition,
  type ElementProps,
  type EsRequest,
  type FormbirdElementProps,
} from '@solidjs-components/kit';
import { buildOrgTree, reportingLine, searchPeople, type OrgNode, type OrgPerson } from '../../../packages/hr-kit/src/index';

export interface OrgChartDefinition extends BaseDefinition {
  /** Elasticsearch request for the people. Default: active accounts. */
  filter?: string | Record<string, unknown>;
  /** Paths on a person: their manager's id, title, team and the team's colour. */
  managerField?: string;
  /** A person's title (default "jobTitle"). */
  titleField?: string;
  /** A person's team (default "teamRel.name"). */
  teamField?: string;
  /** The team's colour (default "teamRel.color"). */
  colorField?: string;
  /** Elasticsearch request for leave covering today; its people show "On leave". */
  awayFilter?: string | Record<string, unknown>;
  /** Path on a leave record to its person's id. Default "employeeRel.documentId". */
  awayField?: string;
  /** "all" (default): everyone; "document": this person's reporting line and direct reports (on a person's form). Read once. */
  focus?: 'all' | 'document';
  /** Levels open at first. Default 2. */
  expandDepth?: number;
  /** Height of the chart's viewport. Default "70vh" ("auto" on a person's form). */
  height?: string;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<OrgChartDefinition, unknown>>;

const DOCUMENT_UPDATED = 'document:updated';
const ACTIVE_ACCOUNTS = {
  sort: [{ 'systemHeader.summaryName': 'asc' }],
  query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'account' } }], must_not: [{ term: { inactiveBool: true } }] } },
};
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const ZOOMS = [0.5, 0.65, 0.8, 1, 1.15];

/**
 * `<solid-org-chart>`: the organisation as a tree of who reports to whom. Cards show each person's
 * title, team colour, how many report to them and who is on leave today; branches open and close,
 * search opens the reporting line to the person found, and the chart zooms. On a person's form it
 * shows their reporting line and their direct reports. It stores nothing.
 * @param props - Formbird element properties
 */
export function OrgChart(props: Props) {
  const field = createFieldBinding<unknown, OrgChartDefinition>(props);
  const def = field.definition;
  const labelId = uid('label');
  const searchId = uid('search');
  const me = currentUser();
  const { focusId } = untrack(() => ({ focusId: def().focus === 'document' ? String(props.document?.documentId ?? '') : '' }));

  const [people, setPeople] = createSignal<OrgPerson[]>([]);
  const [away, setAway] = createSignal<Set<string>>(new Set());
  const [loading, setLoading] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [reloads, setReloads] = createSignal(0);

  let requestId = 0;
  const load = async () => {
    const id = ++requestId;
    const d = untrack(def);
    const context = untrack(() => field.templateContext());
    let peopleRequest: EsRequest;
    let awayRequest: EsRequest | undefined;
    try {
      peopleRequest = parseFilter(d.filter, context) ?? structuredClone(ACTIVE_ACCOUNTS);
      awayRequest = parseFilter(d.awayFilter, context);
    } catch (err) {
      setError((err as Error).message);
      setLoaded(true);
      return;
    }
    setLoading(true);
    try {
      const [p, a] = await Promise.all([
        searchPage({ request: peopleRequest, page: 0, pageSize: 1000 }),
        awayRequest ? searchPage({ request: awayRequest, page: 0, pageSize: 500 }) : Promise.resolve({ documents: [], total: 0 }),
      ]);
      if (id !== requestId) return;
      setPeople(
        p.documents.map((doc) => ({
          id: text(doc.documentId),
          name: text(getPath(doc, 'systemHeader.summaryName')) || 'Unnamed',
          title: text(pathValues(doc, d.titleField ?? 'jobTitle')[0]),
          team: text(pathValues(doc, d.teamField ?? 'teamRel.name')[0]),
          color: cssColor(pathValues(doc, d.colorField ?? 'teamRel.color')[0]) ?? '',
          managerId: text(pathValues(doc, d.managerField ?? 'managerRel.documentId')[0]),
        })),
      );
      setAway(new Set(a.documents.map((doc) => text(pathValues(doc, d.awayField ?? 'employeeRel.documentId')[0])).filter(Boolean)));
      setError(undefined);
    } catch (err) {
      if (id === requestId) setError(errorText(err, 'The org chart could not be loaded.'));
    } finally {
      if (id === requestId) {
        setLoading(false);
        setLoaded(true);
      }
    }
  };
  createEffect(
    () => JSON.stringify([def().filter ?? null, def().awayFilter ?? null, reloads()]),
    () => void load(),
  );
  let listening = false;
  const updates = getService('BroadcastService')
    ?.on?.<unknown>(DOCUMENT_UPDATED)
    .subscribe(() => listening && setReloads((n) => n + 1));
  queueMicrotask(() => (listening = true));
  onCleanup(() => updates?.unsubscribe());

  // ------------------------------------------------------------------ the tree
  const tree = createMemo(() => buildOrgTree(people()));
  /** On a person's form: their line and direct reports only. */
  const visible = createMemo(() => {
    if (!focusId) return null;
    const { byId } = tree();
    const node = byId.get(focusId);
    if (!node) return new Set<string>();
    return new Set([...reportingLine(focusId, byId), ...node.children.map((c) => c.person.id)]);
  });
  const roots = createMemo(() => {
    const v = visible();
    return v ? tree().roots.filter((r) => v.has(r.person.id)) : tree().roots;
  });
  const childrenOf = (node: OrgNode) => {
    const v = visible();
    return v ? node.children.filter((c) => v.has(c.person.id)) : node.children;
  };

  const [expanded, setExpanded] = createSignal<Set<string>>(new Set());
  let initialised = false;
  createEffect(
    () => tree(),
    (t) => {
      if (initialised || !t.byId.size) return;
      initialised = true;
      const depth = Math.max(1, Number(untrack(def).expandDepth) || 2);
      const open = new Set<string>();
      for (const node of t.byId.values()) if (focusId || node.depth < depth) open.add(node.person.id);
      // Your own line is open too.
      if (me) for (const id of reportingLine(me.documentId, t.byId)) open.add(id);
      setExpanded(open);
    },
  );
  const toggle = (id: string) =>
    setExpanded((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const expandAll = () => setExpanded(new Set(tree().byId.keys()));
  const collapseAll = () => setExpanded(new Set(roots().map((r) => r.person.id)));

  // ------------------------------------------------------------------ search and zoom
  const [query, setQuery] = createSignal('');
  const [hit, setHit] = createSignal(0);
  const [highlight, setHighlight] = createSignal('');
  const matches = createMemo(() => searchPeople(people(), query()).filter((id) => !visible() || visible()!.has(id)));
  let viewport: HTMLDivElement | undefined;
  const reveal = (id: string) => {
    const line = reportingLine(id, tree().byId);
    setExpanded((set) => new Set([...set, ...line.slice(0, -1)]));
    setHighlight(id);
    flush();
    const card = viewport?.querySelector<HTMLElement>(`[data-person="${CSS.escape(id)}"]`);
    card?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    card?.focus({ preventScroll: true });
  };
  const go = (step: number) => {
    const list = matches();
    if (!list.length) return;
    const next = (((hit() + step) % list.length) + list.length) % list.length;
    setHit(next);
    reveal(list[next]);
  };
  const [zoom, setZoom] = createSignal(untrack(() => (focusId ? 1 : 0.8)));
  // On first load the chart zooms out until it fits the width (down to the smallest zoom).
  let canvas: HTMLDivElement | undefined;
  let fitted = !!focusId;
  createEffect(
    () => (loaded() ? roots().length : 0),
    (count) => {
      if (fitted || !count) return;
      fitted = true;
      requestAnimationFrame(() => {
        if (!canvas || !viewport) return;
        // The tree's own width (the canvas stretches to the viewport), unzoomed, with the canvas padding.
        const tree = canvas.querySelector('.oc-tree');
        const natural = ((tree?.getBoundingClientRect().width ?? 0) + 48 * untrack(zoom)) / untrack(zoom);
        const room = viewport.clientWidth - 4;
        setZoom(ZOOMS.filter((z) => z <= 1 && natural * z <= room).at(-1) ?? ZOOMS[0]);
      });
    },
  );
  const zoomBy = (step: number) => {
    const i = ZOOMS.indexOf(zoom());
    setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i === -1 ? 3 : i) + step))]);
  };

  const Node = (p: { node: OrgNode }) => {
    const person = () => p.node.person;
    const kids = () => childrenOf(p.node);
    const open = () => expanded().has(person().id);
    return (
      <li class="oc-node">
        <div
          class={['oc-card', { 'oc-card--me': person().id === me?.documentId, 'oc-card--focus': person().id === focusId, 'oc-card--hit': highlight() === person().id, 'oc-card--match': !!query().trim() && matches().includes(person().id) }]}
          style={{ '--oc-team': person().color || 'var(--sj-border-strong)' }}
          data-person={person().id}
          tabindex="-1"
        >
          <div class="oc-card__top">
            <Avatar name={person().name} size="lg" />
            <Show when={away().has(person().id)}>
              <span class="oc-away" title="On leave today">
                On leave
              </span>
            </Show>
          </div>
          <a class="oc-name" href={`/form/${person().id}`}>
            {person().name}
          </a>
          <span class="oc-title">{person().title || '—'}</span>
          <Show when={person().team}>
            <span class="oc-team">
              <span class="oc-team__dot" aria-hidden="true" />
              {person().team}
            </span>
          </Show>
          <Show when={kids().length}>
            <button
              type="button"
              class="oc-toggle"
              aria-expanded={open() ? 'true' : 'false'}
              aria-label={`${open() ? 'Hide' : 'Show'} the ${p.node.children.length} ${p.node.children.length === 1 ? 'person' : 'people'} reporting to ${person().name}`}
              onClick={() => toggle(person().id)}
            >
              <Icon name={open() ? 'chevron-up' : 'chevron-down'} size={12} />
              {p.node.children.length}
              <Show when={p.node.size > p.node.children.length}>
                <span class="oc-toggle__all"> · {p.node.size}</span>
              </Show>
            </button>
          </Show>
        </div>
        <Show when={open() && kids().length}>
          <ul class="oc-children">
            <For each={kids()} keyed={(child) => child.person.id}>
              {(child) => <Node node={child()} />}
            </For>
          </ul>
        </Show>
      </li>
    );
  };

  return (
    <FieldShell label={field.label()} labelId={labelId} hideLabel={def().hideLabel}>
      <section class="oc" aria-labelledby={def().hideLabel ? undefined : labelId} aria-label={def().hideLabel ? 'Org chart' : undefined} aria-busy={loading() ? 'true' : 'false'}>
        <Show when={!focusId}>
          <div class="oc-toolbar">
            <label class="oc-search" for={searchId}>
              <Icon name="search" size={14} />
              <span class="sj-visually-hidden">Find someone</span>
              <input
                id={searchId}
                type="search"
                placeholder="Find someone"
                value={query()}
                onInput={(event) => {
                  setQuery(event.currentTarget.value);
                  setHit(0);
                  setHighlight('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (highlight() && matches()[hit()] === highlight()) go(event.shiftKey ? -1 : 1);
                    else if (matches().length) reveal(matches()[hit()]);
                  }
                }}
              />
              <Show when={query().trim()}>
                <span class="oc-search__count" aria-live="polite">
                  {matches().length ? `${hit() + 1} of ${matches().length}` : 'None'}
                </span>
              </Show>
            </label>
            <IconButton icon="chevron-up" label="Previous match" disabled={!matches().length} onClick={() => go(-1)} />
            <IconButton icon="chevron-down" label="Next match" disabled={!matches().length} onClick={() => go(1)} />
            <Show when={me && tree().byId.has(me.documentId)}>
              <Button size="sm" variant="subtle" icon="user" onClick={() => reveal(me!.documentId)}>
                Me
              </Button>
            </Show>
            <span class="oc-spacer" />
            <Button size="sm" variant="subtle" onClick={expandAll}>
              Open all
            </Button>
            <Button size="sm" variant="subtle" onClick={collapseAll}>
              Close all
            </Button>
            <div class="oc-zoom" role="group" aria-label="Zoom">
              <button type="button" class="sj-icon-btn oc-zoom__out" aria-label="Zoom out" title="Zoom out" disabled={zoom() === ZOOMS[0]} onClick={() => zoomBy(-1)}>
                <span aria-hidden="true">−</span>
              </button>
              <span class="oc-zoom__value">{Math.round(zoom() * 100)}%</span>
              <IconButton icon="plus" label="Zoom in" disabled={zoom() === ZOOMS[ZOOMS.length - 1]} onClick={() => zoomBy(1)} />
            </div>
            <Show when={loading() && loaded()}>
              <Spinner label="Refreshing" />
            </Show>
          </div>
        </Show>

        <Show when={error()}>
          <div class="sj-note sj-note--danger" role="alert">
            <Icon name="alert" size={14} />
            <span>{error()}</span>
          </div>
        </Show>

        <div ref={viewport} class={['oc-viewport', { 'oc-viewport--focus': !!focusId }]} style={{ height: def().height ?? (focusId ? 'auto' : '70vh') }} onClick={followDocumentLink}>
          <Show when={loaded()} fallback={<div class="oc-loading"><Spinner label="Loading the org chart" /></div>}>
            <Show when={roots().length} fallback={<p class="oc-empty">{focusId ? 'Not on the org chart yet: choose their manager.' : 'Nobody to show.'}</p>}>
              <div ref={canvas} class="oc-canvas" style={{ zoom: String(zoom()) }}>
                <ul class="oc-tree">
                  <For each={roots()} keyed={(root) => root.person.id}>
                    {(root) => <Node node={root()} />}
                  </For>
                </ul>
              </div>
            </Show>
          </Show>
        </div>
        <Show when={!focusId && away().size}>
          <p class="oc-note">
            <span class="oc-away">On leave</span> {away().size} {away().size === 1 ? 'person is' : 'people are'} on leave today.
          </p>
        </Show>
      </section>
    </FieldShell>
  );
}
