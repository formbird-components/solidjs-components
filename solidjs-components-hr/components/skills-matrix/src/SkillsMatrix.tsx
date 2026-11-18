import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import {
  Avatar,
  Button,
  createFieldBinding,
  downloadText,
  errorText,
  FieldShell,
  followDocumentLink,
  formatDate,
  getPath,
  getService,
  Icon,
  openNewDocument,
  parseFilter,
  pathValues,
  searchPage,
  Spinner,
  toRelatedDoc,
  uid,
  type BaseDefinition,
  type ElementProps,
  type EsRequest,
  type FormbirdElementProps,
  type SourceDocument,
} from '@solidjs-components/kit';
import { compliance, latestCerts, matrixCell, shortName, type HeldCert, type MatrixCell } from '../../../packages/hr-kit/src/index';

export interface SkillsMatrixDefinition extends BaseDefinition {
  /** Elasticsearch request for the people (rows). Default: active accounts. */
  peopleFilter?: string | Record<string, unknown>;
  /** Elasticsearch request for the certificate types (columns), in order. */
  typesFilter?: string | Record<string, unknown>;
  /** Elasticsearch request for the certificates. Default: the HR app's certificates. */
  filter?: string | Record<string, unknown>;
  /** Paths on a certificate: its person's id, its type's id, expiry and issue dates. */
  personField?: string;
  /** The certificate type's id (default "certTypeRel.documentId"). */
  typeField?: string;
  /** The expiry date (default "expiryDate"). */
  expiryField?: string;
  /** The issue date (default "issuedDate"). */
  issuedField?: string;
  /** Path on a person to the type ids their position requires ("positionRel.requiredCertIds"). */
  requiredField?: string;
  /** Group people by this path ("teamRel.name"), and a second line under each name ("jobTitle"). */
  groupField?: string;
  /** A second line under each name ("jobTitle"). */
  detailField?: string;
  /** Field of a type with its short name for the header ("shortName"). */
  shortField?: string;
  /** Days ahead that count as expiring. Default 30. */
  warnDays?: number;
  /** Template of new certificates: an empty cell starts one for that person and type. */
  templateId?: string;
  /** What a new certificate keeps of its person and type besides documentId and name. */
  personValueFields?: Record<string, string>;
  /** What a new certificate keeps of its type besides documentId and name. */
  typeValueFields?: Record<string, string>;
  /** Show only people with something to fix at first. Default false. */
  gapsOnly?: boolean;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<SkillsMatrixDefinition, unknown>>;

interface Person {
  id: string;
  name: string;
  detail: string;
  group: string;
  required: Set<string>;
  doc: SourceDocument;
}
interface CertType {
  id: string;
  name: string;
  short: string;
  doc: SourceDocument;
}

const DOCUMENT_UPDATED = 'document:updated';
const ACTIVE_ACCOUNTS = {
  sort: [{ 'systemHeader.summaryName': 'asc' }],
  query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'account' } }], must_not: [{ term: { inactiveBool: true } }] } },
};
const CERTIFICATES = { query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'document' } }, { term: { appTags: 'hr' } }, { term: { appTags: 'certificate' } }] } } };
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const first = (doc: unknown, path: string) => pathValues(doc, path)[0];
const monthYear = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });

/**
 * `<solid-skills-matrix>`: people by certificate type. Each cell says whether the person holds the
 * certificate in date, expiring (with the days left), expired, or missing where their position
 * requires it; rows are grouped by team with each person's compliance, columns count what needs
 * fixing, and a click opens the certificate, or starts one where it is missing. It stores nothing.
 * @param props - Formbird element properties
 */
export function SkillsMatrix(props: Props) {
  const field = createFieldBinding<unknown, SkillsMatrixDefinition>(props);
  const def = field.definition;
  const labelId = uid('label');
  const searchId = uid('search');

  const [people, setPeople] = createSignal<Person[]>([]);
  const [types, setTypes] = createSignal<CertType[]>([]);
  const [certs, setCerts] = createSignal<HeldCert[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [reloads, setReloads] = createSignal(0);
  const [now, setNow] = createSignal(Date.now());
  const [query, setQuery] = createSignal('');
  const [gapsOnly, setGapsOnly] = createSignal(untrack(() => def().gapsOnly === true));

  let requestId = 0;
  const load = async () => {
    const id = ++requestId;
    const d = untrack(def);
    const context = untrack(() => field.templateContext());
    let requests: [EsRequest, EsRequest, EsRequest];
    try {
      const typesRequest = parseFilter(d.typesFilter, context);
      if (!typesRequest) throw new Error('The skills matrix needs a typesFilter: the certificate types to show.');
      requests = [parseFilter(d.peopleFilter, context) ?? structuredClone(ACTIVE_ACCOUNTS), typesRequest, parseFilter(d.filter, context) ?? structuredClone(CERTIFICATES)];
    } catch (err) {
      setError((err as Error).message);
      setLoaded(true);
      return;
    }
    setLoading(true);
    try {
      const [p, t, c] = await Promise.all(requests.map((request, i) => searchPage({ request, page: 0, pageSize: i === 2 ? 2000 : 500 })));
      if (id !== requestId) return;
      setPeople(
        p.documents.map((doc) => ({
          id: text(doc.documentId),
          name: text(getPath(doc, 'systemHeader.summaryName')) || 'Unnamed',
          detail: d.detailField ? text(first(doc, d.detailField)) : '',
          group: d.groupField ? text(first(doc, d.groupField)) || 'Others' : '',
          required: new Set(d.requiredField ? pathValues(doc, d.requiredField).map(text) : []),
          doc,
        })),
      );
      setTypes(
        t.documents.map((doc) => {
          const name = text(getPath(doc, 'systemHeader.summaryName'));
          return { id: text(doc.documentId), name, short: shortName(name, d.shortField ? getPath(doc, d.shortField) : undefined), doc };
        }),
      );
      setCerts(
        c.documents.map((doc) => ({
          documentId: text(doc.documentId),
          personId: text(first(doc, d.personField ?? 'personRel.documentId')),
          typeId: text(first(doc, d.typeField ?? 'certTypeRel.documentId')),
          expiryDate: text(first(doc, d.expiryField ?? 'expiryDate')),
          issuedDate: text(first(doc, d.issuedField ?? 'issuedDate')),
        })),
      );
      setNow(Date.now());
      setError(undefined);
    } catch (err) {
      if (id === requestId) setError(errorText(err, 'The matrix could not be loaded.'));
    } finally {
      if (id === requestId) {
        setLoading(false);
        setLoaded(true);
      }
    }
  };
  createEffect(
    () => JSON.stringify([def().peopleFilter ?? null, def().typesFilter ?? null, def().filter ?? null, reloads()]),
    () => void load(),
  );
  let listening = false;
  const updates = getService('BroadcastService')
    ?.on?.<unknown>(DOCUMENT_UPDATED)
    .subscribe(() => listening && setReloads((n) => n + 1));
  queueMicrotask(() => (listening = true));
  onCleanup(() => updates?.unsubscribe());

  // ------------------------------------------------------------------ cells
  const held = createMemo(() => latestCerts(certs()));
  const warnDays = () => Number(def().warnDays) || 30;
  const cellsOf = createMemo(() => {
    const map = new Map<string, MatrixCell[]>();
    for (const person of people()) {
      const mine = held().get(person.id);
      map.set(
        person.id,
        types().map((type) => matrixCell(mine?.get(type.id), person.required.has(type.id), now(), warnDays())),
      );
    }
    return map;
  });
  const needsAttention = (cells: MatrixCell[]) => cells.some((c) => c.kind === 'missing' || c.kind === 'expired' || c.kind === 'expiring');
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const shown = createMemo(() => {
    const q = norm(query().trim());
    return people().filter((p) => (!q || norm(`${p.name} ${p.detail} ${p.group}`).includes(q)) && (!gapsOnly() || needsAttention(cellsOf().get(p.id) ?? [])));
  });
  const groups = createMemo(() => {
    const map = new Map<string, Person[]>();
    for (const p of shown()) map.set(p.group, [...(map.get(p.group) ?? []), p]);
    return [...map.entries()].map(([name, list]) => ({ name, people: list, compliance: compliance(list.flatMap((p) => cellsOf().get(p.id) ?? [])) }));
  });
  const overall = createMemo(() => compliance(people().flatMap((p) => cellsOf().get(p.id) ?? [])));
  const columnIssues = createMemo(() =>
    types().map((_, i) => people().reduce((sum, p) => {
      const kind = cellsOf().get(p.id)?.[i]?.kind;
      return sum + (kind === 'missing' || kind === 'expired' || kind === 'expiring' ? 1 : 0);
    }, 0)),
  );

  const add = (person: Person, type: CertType) => {
    const d = def();
    if (!d.templateId) return;
    openNewDocument(d.templateId, { personRel: [toRelatedDoc(person.doc, d.personValueFields)], certTypeRel: [toRelatedDoc(type.doc, d.typeValueFields)] });
  };

  const cellText = (cell: MatrixCell) => {
    switch (cell.kind) {
      case 'valid':
      case 'held':
        return cell.cert?.expiryDate ? monthYear(cell.cert.expiryDate) : 'Held';
      case 'expiring':
        return `${cell.daysLeft} d`;
      case 'expired':
        return 'Expired';
      case 'missing':
        return 'Missing';
      default:
        return '';
    }
  };
  const cellTitle = (person: Person, type: CertType, cell: MatrixCell) => {
    const what = `${person.name}, ${type.name}`;
    switch (cell.kind) {
      case 'valid':
      case 'held':
        return `${what}: ${cell.cert?.expiryDate ? `valid until ${formatDate(cell.cert.expiryDate)}` : 'held, no expiry'}${cell.required ? '' : ' (not required)'}`;
      case 'expiring':
        return `${what}: expires ${formatDate(cell.cert!.expiryDate)}, in ${cell.daysLeft} ${cell.daysLeft === 1 ? 'day' : 'days'}`;
      case 'expired':
        return `${what}: expired ${formatDate(cell.cert!.expiryDate)}${cell.required ? '' : ' (not required)'}`;
      case 'missing':
        return `${what}: required, not held${def().templateId ? '. Add it' : ''}`;
      default:
        return `${what}: not required${def().templateId ? '. Add one' : ''}`;
    }
  };

  const exportCsv = () => {
    const quote = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : /^[=+\-@]/.test(v) ? `'${v}` : v);
    const lines = [['Person', 'Detail', 'Group', ...types().map((t) => t.name), 'Compliance'].map(quote).join(',')];
    for (const p of shown()) {
      const cells = cellsOf().get(p.id) ?? [];
      const c = compliance(cells);
      lines.push(
        [p.name, p.detail, p.group, ...cells.map((cell) => (cell.kind === 'empty' ? '' : `${cell.kind}${cell.cert?.expiryDate ? ` ${cell.cert.expiryDate.slice(0, 10)}` : ''}`)), c.percent === null ? '' : `${c.percent}%`]
          .map(quote)
          .join(','),
      );
    }
    downloadText(`skills-matrix-${new Date().toISOString().slice(0, 10)}.csv`, `${lines.join('\n')}\n`, 'text/csv;charset=utf-8');
  };

  const Ring = (p: { percent: number | null }) => (
    <span class={['sm-ring', { 'sm-ring--ok': p.percent === 100, 'sm-ring--low': p.percent !== null && p.percent < 80 }]} style={{ '--sm-pct': String(p.percent ?? 0) }} title={p.percent === null ? 'Nothing required' : `${p.percent}% of required certificates held`}>
      <span>{p.percent === null ? '–' : `${p.percent}%`}</span>
    </span>
  );

  return (
    <FieldShell label={field.label()} labelId={labelId} hideLabel={def().hideLabel}>
      <section class="sm" aria-labelledby={def().hideLabel ? undefined : labelId} aria-label={def().hideLabel ? 'Skills matrix' : undefined} aria-busy={loading() ? 'true' : 'false'}>
        <div class="sm-summary">
          <div class="sm-stat sm-stat--main">
            <Ring percent={overall().percent} />
            <div>
              <strong>{overall().percent === null ? '–' : `${overall().percent}%`}</strong>
              <span>of required certificates held</span>
            </div>
          </div>
          <div class={['sm-stat', { 'sm-stat--bad': overall().expired > 0 }]}>
            <strong>{overall().expired}</strong>
            <span>expired</span>
          </div>
          <div class={['sm-stat', { 'sm-stat--warn': overall().expiring > 0 }]}>
            <strong>{overall().expiring}</strong>
            <span>expiring in {warnDays()} days</span>
          </div>
          <div class={['sm-stat', { 'sm-stat--bad': overall().missing > 0 }]}>
            <strong>{overall().missing}</strong>
            <span>missing</span>
          </div>
        </div>

        <div class="sm-toolbar">
          <label class="sm-search" for={searchId}>
            <Icon name="search" size={14} />
            <span class="sj-visually-hidden">Find a person</span>
            <input id={searchId} type="search" placeholder="Find a person, role or team" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
          </label>
          <div class="sj-segmented" role="group" aria-label="Who to show">
            <button type="button" aria-pressed={!gapsOnly() ? 'true' : 'false'} onClick={() => setGapsOnly(false)}>
              Everyone
            </button>
            <button type="button" aria-pressed={gapsOnly() ? 'true' : 'false'} onClick={() => setGapsOnly(true)}>
              Needs attention
            </button>
          </div>
          <span class="sm-spacer" />
          <Show when={loading() && loaded()}>
            <Spinner label="Refreshing" />
          </Show>
          <Button size="sm" variant="subtle" icon="download" onClick={exportCsv} disabled={!shown().length}>
            Export CSV
          </Button>
        </div>

        <Show when={error()}>
          <div class="sj-note sj-note--danger" role="alert">
            <Icon name="alert" size={14} />
            <span>{error()}</span>
          </div>
        </Show>

        <Show when={loaded()} fallback={<div class="sm-loading"><Spinner label="Loading the matrix" /></div>}>
          <div class="sm-scroll">
            <table class="sm-table" onClick={followDocumentLink}>
              <thead>
                <tr>
                  <th scope="col" class="sm-person-head">
                    {shown().length} of {people().length} people
                  </th>
                  <For each={types()}>
                    {(type, i) => (
                      <th scope="col" class="sm-type" title={type.name}>
                        <span class="sm-type__name">{type.short}</span>
                        <Show when={columnIssues()[i()]}>
                          <span class="sm-type__issues" title={`${columnIssues()[i()]} to fix`}>
                            {columnIssues()[i()]}
                          </span>
                        </Show>
                      </th>
                    )}
                  </For>
                  <th scope="col" class="sm-total-head">
                    Held
                  </th>
                </tr>
              </thead>
              <For each={groups()} keyed={(g) => g.name}>
                {(group) => (
                  <tbody>
                    <Show when={group().name}>
                      <tr class="sm-group">
                        <th scope="rowgroup" colspan={types().length + 1}>
                          {group().name}
                          <span class="sm-group__count">{group().people.length}</span>
                        </th>
                        <td class="sm-total">
                          <Ring percent={group().compliance.percent} />
                        </td>
                      </tr>
                    </Show>
                    <For each={group().people} keyed={(p) => p.id}>
                      {(person) => {
                        const cells = () => cellsOf().get(person().id) ?? [];
                        return (
                          <tr class="sm-row">
                            <th scope="row" class="sm-person">
                              <Avatar name={person().name} size="sm" />
                              <span class="sm-person__text">
                                <a class="sm-person__name" href={`/form/${person().id}`}>
                                  {person().name}
                                </a>
                                <Show when={person().detail}>
                                  <span class="sm-person__detail">{person().detail}</span>
                                </Show>
                              </span>
                            </th>
                            <For each={types()}>
                              {(type, i) => {
                                const cell = () => cells()[i()];
                                return (
                                  <td class={['sm-cell', `sm-cell--${cell()?.kind ?? 'empty'}`, { 'sm-cell--required': cell()?.required }]}>
                                    <Show
                                      when={cell()?.cert}
                                      fallback={
                                        <Show when={def().templateId && !field.disabled()} fallback={<span class="sm-chip" title={cell() ? cellTitle(person(), type, cell()!) : ''}>{cell() ? cellText(cell()!) : ''}</span>}>
                                          <button type="button" class="sm-chip" title={cellTitle(person(), type, cell()!)} aria-label={cellTitle(person(), type, cell()!)} onClick={() => add(person(), type)}>
                                            <Show when={cell()?.kind === 'missing'} fallback={<Icon name="plus" size={12} class="sm-add" />}>
                                              <Icon name="plus" size={11} />
                                              Missing
                                            </Show>
                                          </button>
                                        </Show>
                                      }
                                    >
                                      <a class="sm-chip" href={`/form/${cell()!.cert!.documentId}`} title={cellTitle(person(), type, cell()!)} aria-label={cellTitle(person(), type, cell()!)}>
                                        <Show when={cell()!.kind === 'valid' || cell()!.kind === 'held'}>
                                          <Icon name="check" size={11} strokeWidth={2.4} />
                                        </Show>
                                        <Show when={cell()!.kind === 'expiring'}>
                                          <Icon name="clock" size={11} />
                                        </Show>
                                        <Show when={cell()!.kind === 'expired'}>
                                          <Icon name="alert" size={11} />
                                        </Show>
                                        {cellText(cell()!)}
                                      </a>
                                    </Show>
                                  </td>
                                );
                              }}
                            </For>
                            <td class="sm-total">
                              <Ring percent={compliance(cells()).percent} />
                            </td>
                          </tr>
                        );
                      }}
                    </For>
                  </tbody>
                )}
              </For>
            </table>
            <Show when={!shown().length}>
              <p class="sm-empty">{gapsOnly() ? 'Everyone shown holds what they need.' : 'Nobody matches.'}</p>
            </Show>
          </div>
          <ul class="sm-legend" aria-label="Key">
            <li><span class="sm-chip sm-key sm-key--valid"><Icon name="check" size={11} strokeWidth={2.4} />Valid</span> held, until the month shown</li>
            <li><span class="sm-chip sm-key sm-key--expiring"><Icon name="clock" size={11} />12 d</span> expires within {warnDays()} days</li>
            <li><span class="sm-chip sm-key sm-key--expired"><Icon name="alert" size={11} />Expired</span></li>
            <li><span class="sm-chip sm-key sm-key--missing">Missing</span> required by the position</li>
            <li><span class="sm-chip sm-key sm-key--held"><Icon name="check" size={11} strokeWidth={2.4} />Held</span> not required</li>
          </ul>
        </Show>
      </section>
    </FieldShell>
  );
}
