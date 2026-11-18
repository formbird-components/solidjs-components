import { createEffect, createMemo, createSignal, flush, For, onCleanup, Show, untrack } from 'solid-js';
import {
  Avatar,
  Button,
  createDocument,
  createDocumentField,
  createFieldBinding,
  currentAccount,
  dueText,
  EmptyAvatar,
  errorText,
  FieldShell,
  findByName,
  followDocumentLink,
  formatDate,
  getPath,
  getService,
  Icon,
  Lozenge,
  openDocument,
  parseFilter,
  RelatedPicker,
  searchPage,
  Spinner,
  uid,
  type BaseDefinition,
  type ElementProps,
  type EsRequest,
  type FieldBinding,
  type FormbirdElementProps,
  type OpenMode,
  type PickerItem,
  type RelatedDoc,
  type RelatedPickerDefinition,
} from '@solidjs-components/kit';
import {
  actionDueDate,
  actionState,
  actionsSummary,
  CONTROL_LEVELS,
  controlRank,
  dueDateFromInput,
  dueDateInput,
  dueHint,
  firstRating,
  isSavedRecord,
  newActionValues,
  riskResponse,
  sortActions,
  toActionItem,
  type ActionItem,
  type ActionState,
} from '../../../packages/whs-kit/src/index';

export interface CorrectiveActionsDefinition extends BaseDefinition {
  /** Template of new corrective actions. Without it there is no Add button. */
  templateId?: string;
  /** What this record is: "incident", "hazard" or "inspection" (stored in sourceRel.kind). Default "incident". */
  sourceKind?: string;
  /** Field of this record with its reference (e.g. "incidentRef"), stored in sourceRel.ref. */
  refField?: string;
  /** Field(s) with the record's rating (e.g. "riskRating", or ["residualRating", "inherentRating"]); the first with a rating wins. */
  ratingField?: string | string[];
  /** Elasticsearch request for the actions. Default: whs actions whose sourceRel is this record, by due date. */
  filter?: string | Record<string, unknown>;
  /** Action status values by name; a new action gets `[statusValues.Open]`. */
  statusValues?: Record<string, RelatedDoc>;
  /** Control level values to choose from (`{ documentId, name, rank }`), most effective first. */
  controlLevels?: RelatedDoc[];
  /** Elasticsearch request for owners (accounts). Default: active accounts. */
  people?: string | Record<string, unknown>;
  /** Offer the Add form. Default true. */
  canAdd?: boolean;
  /** Default "Add action". */
  addLabel?: string;
  /** Show cancelled actions at first. Default false (a toggle shows them). */
  showCancelled?: boolean;
  /** Where an action opens: "route" (default), "modal" or "newTab". */
  openIn?: OpenMode;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<CorrectiveActionsDefinition, unknown>>;

interface LevelOption {
  value: RelatedDoc;
  name: string;
  rank: number;
  hint: string;
}

/** Fields read from each action. */
const ACTION_FIELDS = ['documentId', 'systemHeader.summaryName', 'actionRef', 'title', 'actionStatusRel', 'controlLevelRel', 'ownerRel', 'dueDate', 'completedDate'];
/** What fieldtec-web broadcasts after saving documents. */
const DOCUMENT_UPDATED = 'document:updated';
/** Search finds a new record about a second after it is saved: look again after this long. */
const RESEARCH_MS = 1500;
/** Used when the definition has no `people` filter. */
const ACTIVE_ACCOUNTS = {
  sort: [{ 'systemHeader.summaryName': 'asc' }],
  query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'account' } }], must_not: [{ term: { inactiveBool: true } }] } },
};
/** What an owner value keeps besides documentId and name. */
const OWNER_FIELDS = { email: 'email', accountType: 'accountType' };

const controlName = (rank: number) => CONTROL_LEVELS.find((level) => level.rank === rank)?.name ?? '';

/**
 * The default search: this record's actions, by due date.
 * @param documentId - The record
 * @returns The request
 */
function actionsRequest(documentId: string): EsRequest {
  return {
    sort: [{ dueDate: { order: 'asc', unmapped_type: 'date' } }, { 'systemHeader.summaryName': { order: 'asc', unmapped_type: 'keyword' } }],
    query: {
      bool: {
        filter: [{ term: { appTags: 'whs' } }, { term: { appTags: 'action' } }, { term: { 'sourceRel.documentId': documentId } }],
      },
    },
  };
}

/** Six bars, as many lit as the control is strong: Eliminate lights all six, PPE one. */
function Strength(props: { rank: number }) {
  return (
    <span class="ca-strength" data-rank={props.rank} aria-hidden="true">
      <For each={[1, 2, 3, 4, 5, 6]}>{(bar) => <span class={['ca-strength__bar', { 'ca-strength__bar--on': bar <= 7 - props.rank }]} />}</For>
    </span>
  );
}

/**
 * `<solid-corrective-actions>`: the actions raised against this record (an incident, a hazard, an
 * inspection), found by search and kept current, with where they stand and a quick form to raise
 * one. It stores nothing in its own field: actions are records of their own.
 * @param props - Formbird element properties
 */
export function CorrectiveActions(props: Props) {
  const field = createFieldBinding<unknown, CorrectiveActionsDefinition>(props);
  const def = field.definition;
  const labelId = uid('label');
  const { documentId, initialName, initiallySaved, refName, ratingNames } = untrack(() => {
    const ratingField = def().ratingField;
    return {
      documentId: String(props.document?.documentId ?? ''),
      initialName: String(getPath(props.document, 'systemHeader.summaryName') ?? ''),
      initiallySaved: isSavedRecord(props.document),
      refName: def().refField ?? '',
      ratingNames: (Array.isArray(ratingField) ? ratingField : ratingField ? [ratingField] : []).filter((name) => typeof name === 'string' && name),
    };
  });
  const refValue = createDocumentField(props, refName, (raw) => (typeof raw === 'string' ? raw : ''));
  const titleValue = createDocumentField(props, 'title', (raw) => (typeof raw === 'string' ? raw : ''));
  const ratingValues = ratingNames.map((name) => createDocumentField(props, name));
  const rating = createMemo(() => firstRating(ratingValues.map((value) => value())));

  const [savedHere, setSavedHere] = createSignal(initiallySaved);
  const [sourceName, setSourceName] = createSignal(initialName);
  const [results, setResults] = createSignal<ActionItem[]>([]);
  const [created, setCreated] = createSignal<ActionItem[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [reloads, setReloads] = createSignal(0);
  const [now, setNow] = createSignal(Date.now());
  const [showCancelled, setShowCancelled] = createSignal(untrack(() => def().showCancelled === true));
  const [announcement, setAnnouncement] = createSignal('');
  const rowLinks = new Map<string, HTMLAnchorElement>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  onCleanup(() => timers.forEach(clearTimeout));
  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, ms);
    timers.add(timer);
  };

  const kind = () => def().sourceKind || 'record';
  const canAdd = () => def().canAdd !== false && !!def().templateId && !field.disabled();

  // ------------------------------------------------------------------ the actions
  let requestId = 0;
  const load = async () => {
    const id = ++requestId;
    if (!untrack(savedHere) || !documentId) {
      setLoaded(true);
      return;
    }
    let request: EsRequest | undefined;
    try {
      const filter = untrack(() => def().filter);
      request = filter ? parseFilter(filter, untrack(() => field.templateContext())) : actionsRequest(documentId);
    } catch (err) {
      setError((err as Error).message);
      setLoaded(true);
      return;
    }
    if (!request) {
      setError('The actions filter is empty.');
      setLoaded(true);
      return;
    }
    setLoading(true);
    try {
      const { documents } = await searchPage({ request, page: 0, pageSize: 200, include: ACTION_FIELDS });
      if (id !== requestId) return;
      const found = documents.map((doc) => toActionItem(doc));
      const ids = new Set(found.map((item) => item.documentId));
      setResults(found);
      // Actions saved here stay until the search finds them.
      setCreated((list) => list.filter((item) => !ids.has(item.documentId)));
      setNow(Date.now());
      setError(undefined);
    } catch (err) {
      if (id === requestId) setError(errorText(err, 'The actions could not be loaded.'));
    } finally {
      if (id === requestId) {
        setLoading(false);
        setLoaded(true);
      }
    }
  };
  createEffect(
    () => JSON.stringify([def().filter ?? null, reloads(), savedHere()]),
    () => void load(),
  );

  // Look again after any save in the app (an action closed in another tab, this record saved).
  // The broadcast replays the last save to new subscribers, synchronously: skip that one.
  let listening = false;
  const updates = getService('BroadcastService')
    ?.on?.<unknown>(DOCUMENT_UPDATED)
    .subscribe((data) => {
      if (!listening) return;
      const docs = (Array.isArray(data) ? data : [data]) as { documentId?: unknown; systemHeader?: { summaryName?: unknown } }[];
      const self = docs.find((doc) => doc && doc.documentId === documentId);
      if (self) {
        if (typeof self.systemHeader?.summaryName === 'string' && self.systemHeader.summaryName) setSourceName(self.systemHeader.summaryName);
        setSavedHere(true);
      }
      setReloads((n) => n + 1);
    });
  queueMicrotask(() => (listening = true));
  onCleanup(() => updates?.unsubscribe());

  const all = createMemo(() => {
    const found = results();
    const ids = new Set(found.map((item) => item.documentId));
    return sortActions([...found, ...created().filter((item) => !ids.has(item.documentId))]);
  });
  const stateOf = (item: ActionItem): ActionState => actionState({ status: item.status?.name, dueDate: item.dueDate }, now());
  const summary = createMemo(() =>
    actionsSummary(
      all().map((item) => ({ status: item.status?.name, dueDate: item.dueDate, controlLevel: item.level?.name })),
      now(),
    ),
  );
  // The strongest control actually in place (Completed or Verified), as the hazard rules judge it.
  const inPlaceRank = createMemo(
    () =>
      actionsSummary(
        all()
          .filter((item) => item.status?.name === 'Completed' || item.status?.name === 'Verified')
          .map((item) => ({ status: item.status?.name, dueDate: item.dueDate, controlLevel: item.level?.name })),
        now(),
      ).strongestRank,
  );
  const shown = () => (showCancelled() ? all() : all().filter((item) => stateOf(item) !== 'cancelled'));

  const open = (event: MouseEvent, item: ActionItem) => {
    const mode = def().openIn ?? 'route';
    if (event.ctrlKey || event.metaKey || event.shiftKey || mode === 'route') return; // the link (followDocumentLink) handles it
    event.preventDefault();
    openDocument(item.documentId, mode);
  };

  // ------------------------------------------------------------------ the add form
  const [adding, setAdding] = createSignal(false);
  const [title, setTitle] = createSignal('');
  // Set by the first Save: from then on, missing fields say so.
  const [attempted, setAttempted] = createSignal(false);
  const [level, setLevel] = createSignal<RelatedDoc | null>(null);
  const [hintLevel, setHintLevel] = createSignal<LevelOption | null>(null);
  const [owner, setOwner] = createSignal<RelatedDoc[]>([]);
  const [due, setDue] = createSignal('');
  const [dueEdited, setDueEdited] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [formError, setFormError] = createSignal<string>();
  const formId = uid('form');
  const titleErrorId = uid('title-error');
  const dueHintId = uid('due-hint');
  const dueErrorId = uid('due-error');
  let form: HTMLFormElement | undefined;
  let titleInput: HTMLInputElement | undefined;
  let dueInput: HTMLInputElement | undefined;
  let addButton: HTMLButtonElement | undefined;

  const levels = createMemo<LevelOption[]>(() =>
    (def().controlLevels ?? [])
      .filter((value): value is RelatedDoc => !!value && typeof value.documentId === 'string' && typeof value.name === 'string')
      .map((value) => {
        const rank = Number(value.rank);
        const known = CONTROL_LEVELS.find((l) => l.name.toLowerCase() === value.name.toLowerCase());
        return {
          value,
          name: value.name,
          rank: Number.isInteger(rank) && rank > 0 ? rank : controlRank(value.name),
          hint: known?.hint ?? String(value.description ?? ''),
        };
      })
      .sort((a, b) => a.rank - b.rank),
  );
  // What a new action needs, as the action rules (Safety Action - PreSaveServer) refuse it without:
  // checked here first, so every missing field shows at once instead of one refusal at a time.
  const missing = createMemo(() => ({
    title: !title().trim() ? 'Say what will be done.' : '',
    level: levels().length && !level() ? 'Choose the control level.' : '',
    owner: !owner().length ? 'Choose who owns the action.' : '',
    due: !dueDateFromInput(due()) ? 'Choose when it is due.' : '',
  }));
  const problem = (key: keyof ReturnType<typeof missing>) => (attempted() ? missing()[key] : '');

  const defaultDue = (recordRating: string) => {
    const response = riskResponse(recordRating);
    return response ? dueDateInput(actionDueDate(Date.now(), response.actionDays)) : '';
  };
  // The due date follows the record's rating until someone picks one.
  createEffect(
    () => [rating(), adding()] as const,
    ([recordRating, isAdding]) => {
      if (isAdding && !untrack(dueEdited)) setDue(defaultDue(recordRating));
    },
  );

  const startAdding = () => {
    setAdding(true);
    setFormError(undefined);
    flush();
    titleInput?.focus();
  };
  const resetForm = () => {
    setTitle('');
    setAttempted(false);
    setLevel(null);
    setOwner([]);
    setDueEdited(false);
    setDue('');
    setFormError(undefined);
  };
  const cancel = () => {
    if (untrack(saving)) return;
    resetForm();
    setAdding(false);
    flush();
    addButton?.focus();
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    // Enter in the owner search box submits the form implicitly: that Enter belongs to the picker.
    if (untrack(saving) || (event.currentTarget as HTMLFormElement).querySelector('.sj-popover[data-open]')) return;
    const text = untrack(title).trim();
    const gaps = untrack(missing);
    if (gaps.title || gaps.level || gaps.owner || gaps.due) {
      setAttempted(true);
      flush();
      const first = gaps.title
        ? titleInput
        : gaps.level
          ? form?.querySelector<HTMLElement>('.ca-levels input')
          : gaps.owner
            ? form?.querySelector<HTMLElement>('.ca-owner-field .sj-trigger')
            : dueInput;
      first?.focus();
      return;
    }
    const templateId = untrack(def).templateId;
    if (!templateId) return;
    setSaving(true);
    setFormError(undefined);
    const values = untrack(() =>
      newActionValues({
        title: text,
        level: level(),
        owner: owner()[0] ?? null,
        dueDate: dueDateFromInput(due()),
        raisedDate: new Date().toISOString(),
        status: findByName(def().statusValues, 'Open') ?? null,
        source: {
          documentId,
          name: sourceName() || [refValue(), titleValue()].filter(Boolean).join(': '),
          ref: refValue(),
          kind: kind(),
          riskRating: rating(),
        },
      }),
    );
    try {
      const saved = await createDocument(templateId, values);
      // Search won't find it for about a second: show what the server returned straight away.
      const item = toActionItem({ ...values, ...saved });
      setCreated((list) => [...list.filter((i) => i.documentId !== item.documentId), item]);
      setNow(Date.now());
      resetForm();
      setAdding(false);
      setAnnouncement(`Action added: ${item.title}`);
      flush();
      rowLinks.get(item.documentId)?.focus();
      later(() => setReloads((n) => n + 1), RESEARCH_MS);
    } catch (err) {
      setFormError(errorText(err, 'The action could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const ownerField: FieldBinding<RelatedDoc[], RelatedPickerDefinition> = {
    fieldName: 'ownerRel',
    controlName: uid('owner'),
    definition: () => ({ label: 'Owner', singleSelection: true, filter: def().people, relatedFields: OWNER_FIELDS, showDropDown: true }),
    value: owner,
    setValue: (next) => setOwner(next),
    setOtherField: () => undefined,
    disabled: saving,
    mandatory: () => true,
    label: () => 'Owner',
    errors: () => (problem('owner') ? [problem('owner')] : []),
    templateContext: () => field.templateContext(),
  };
  const ownerQuickActions = ({ select }: { select: (entry: RelatedDoc) => void }): PickerItem[] => {
    const me = currentAccount(OWNER_FIELDS);
    if (!me || owner().some((entry) => entry.documentId === me.documentId)) return [];
    return [{ key: '__me', label: 'Assign to me', action: true, leading: () => <Avatar name={me.name} />, onSelect: () => select(me) }];
  };

  const label = () => (def().hideLabel ? '' : field.label());

  return (
    <FieldShell label={field.label()} labelId={labelId} hideLabel={def().hideLabel}>
      <section class="ca" aria-labelledby={label() ? labelId : undefined} aria-label={label() ? undefined : 'Corrective actions'} aria-busy={loading() ? 'true' : 'false'}>
        <Show
          when={savedHere()}
          fallback={
            <div class="sj-note ca-unsaved">
              <Icon name="info" size={14} />
              <span>
                Save the {kind()} first, then add its actions.
              </span>
            </div>
          }
        >
          <Show when={summary().total || summary().cancelled}>
            <div class="ca-head">
              <div class="ca-progress">
                <div class="ca-progress__text">
                  <strong>{summary().done}</strong> of {summary().total} done
                </div>
                <div
                  class="sj-progress"
                  role="progressbar"
                  aria-label="Actions done"
                  aria-valuemin={0}
                  aria-valuemax={summary().total}
                  aria-valuenow={summary().done}
                >
                  <div
                    class="sj-progress__bar"
                    style={{
                      width: `${summary().total ? (summary().done / summary().total) * 100 : 0}%`,
                      '--sj-progress': summary().total && summary().done === summary().total ? 'var(--sj-success)' : 'var(--sj-accent)',
                    }}
                  />
                </div>
              </div>
              <div class="ca-facts">
                <Show when={summary().overdue}>
                  <span class="ca-overdue">
                    <Lozenge color="var(--sj-danger)" dot>
                      {summary().overdue} overdue
                    </Lozenge>
                  </span>
                </Show>
                <Show when={summary().total > 0}>
                  <span class="ca-strongest" title={CONTROL_LEVELS.find((l) => l.rank === inPlaceRank())?.hint ?? 'No control is done yet'}>
                    <Show when={inPlaceRank() < 99} fallback={<>Strongest control in place: <strong>none yet</strong></>}>
                      <Strength rank={inPlaceRank()} />
                      Strongest control in place: <strong>{controlName(inPlaceRank())}</strong>
                    </Show>
                  </span>
                </Show>
              </div>
            </div>
          </Show>

          <Show when={error()}>
            <div class="sj-note sj-note--danger" role="alert">
              <Icon name="alert" size={14} />
              <span>{error()}</span>
              <Button size="sm" variant="subtle" icon="refresh" onClick={() => setReloads((n) => n + 1)}>
                Try again
              </Button>
            </div>
          </Show>

          <Show
            when={shown().length}
            fallback={
              <Show when={loaded() && !error()} fallback={<div class="ca-loading"><Spinner label="Loading actions" /></div>}>
                <div class="ca-empty">
                  <Show when={all().length} fallback={<p class="ca-empty__title">No actions yet.</p>}>
                    <p class="ca-empty__title">Only cancelled actions.</p>
                  </Show>
                  <p class="ca-empty__hint">
                    Controls go from most effective (Eliminate) to least (PPE): remove the hazard, substitute something safer, isolate people
                    from it, engineer it out, and only then rely on procedures and protective equipment.
                  </p>
                </div>
              </Show>
            }
          >
            <ul class="ca-list" aria-label="Actions" onClick={followDocumentLink}>
              <For each={shown()} keyed={(item) => item.documentId}>
                {(item) => <Row item={item()} state={stateOf(item())} onOpen={open} register={(id, el) => rowLinks.set(id, el)} />}
              </For>
            </ul>
          </Show>

          <div class="ca-tools">
            <Show when={canAdd() && !adding()}>
              <Button ref={addButton} size="sm" icon="plus" onClick={startAdding}>
                {def().addLabel || 'Add action'}
              </Button>
            </Show>
            <span class="ca-tools__spacer" />
            <Show when={summary().cancelled}>
              <button type="button" class="ca-toggle" aria-pressed={showCancelled() ? 'true' : 'false'} onClick={() => setShowCancelled((v) => !v)}>
                <span class="ca-toggle__box" aria-hidden="true">
                  <Show when={showCancelled()}>
                    <Icon name="check" size={11} strokeWidth={2.4} />
                  </Show>
                </span>
                Show {summary().cancelled} cancelled
              </button>
            </Show>
            <Show when={loading() && loaded()}>
              <Spinner label="Refreshing" />
            </Show>
          </div>

          <Show when={canAdd() && adding()}>
            <form
              ref={form}
              id={formId}
              class="ca-form"
              aria-label="New corrective action"
              novalidate
              onSubmit={submit}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && !event.defaultPrevented) {
                  event.preventDefault();
                  cancel();
                }
              }}
            >
              <label class="ca-field">
                <span class="ca-field__label">
                  Action <span class="sj-field__required" aria-hidden="true">*</span>
                </span>
                <input
                  ref={titleInput}
                  class="sj-input"
                  name="title"
                  value={title()}
                  placeholder="What will be done?"
                  required
                  aria-required="true"
                  aria-invalid={problem('title') ? 'true' : undefined}
                  aria-describedby={problem('title') ? titleErrorId : undefined}
                  disabled={saving()}
                  onInput={(event) => setTitle(event.currentTarget.value)}
                />
                <Show when={problem('title')}>
                  <span class="ca-field__error" id={titleErrorId}>
                    {problem('title')}
                  </span>
                </Show>
              </label>

              <Show when={levels().length}>
                <ControlLevels
                  levels={levels()}
                  value={level()}
                  hint={hintLevel()}
                  disabled={saving()}
                  error={problem('level')}
                  onChange={setLevel}
                  onHint={setHintLevel}
                />
              </Show>

              <div class="ca-form__row">
                <div class="ca-owner-field">
                  <RelatedPicker
                    field={ownerField}
                    labelId={uid('owner-label')}
                    noun="owner"
                    searchPlaceholder="Search people"
                    emptyLabel="No owner yet"
                    emptyLeading={() => <EmptyAvatar />}
                    leading={(entry, size) => <Avatar name={entry.name} size={size === 'sm' ? 'sm' : 'md'} />}
                    describe={(option) => {
                      const email = getPath(option.source, 'email');
                      return typeof email === 'string' ? email : undefined;
                    }}
                    quickActions={ownerQuickActions}
                    defaultFilter={ACTIVE_ACCOUNTS}
                    include={['email', 'accountType']}
                  />
                </div>
                <label class="ca-field ca-due-field">
                  <span class="ca-field__label">
                    Due <span class="sj-field__required" aria-hidden="true">*</span>
                  </span>
                  <input
                    ref={dueInput}
                    class="sj-input"
                    type="date"
                    name="dueDate"
                    value={due()}
                    required
                    aria-required="true"
                    aria-invalid={problem('due') ? 'true' : undefined}
                    aria-describedby={problem('due') ? `${dueErrorId} ${dueHintId}` : dueHintId}
                    disabled={saving()}
                    onInput={(event) => {
                      setDue(event.currentTarget.value);
                      setDueEdited(true);
                    }}
                  />
                  <Show when={problem('due')}>
                    <span class="ca-field__error" id={dueErrorId}>
                      {problem('due')}
                    </span>
                  </Show>
                  <span class="ca-field__hint" id={dueHintId}>
                    {dueHint(rating()) || `No risk rating on this ${kind()} yet: choose when it is due.`}
                  </span>
                </label>
              </div>

              <Show when={formError()}>
                <div class="sj-note sj-note--danger ca-form__error" role="alert">
                  <Icon name="alert" size={14} />
                  <span>{formError()}</span>
                </div>
              </Show>

              <div class="ca-form__buttons">
                <Button type="submit" size="sm" variant="primary" disabled={saving()}>
                  <Show when={saving()}>
                    <Spinner />
                  </Show>
                  {saving() ? 'Saving…' : 'Save action'}
                </Button>
                <Button size="sm" variant="subtle" disabled={saving()} onClick={cancel}>
                  Cancel
                </Button>
              </div>
            </form>
          </Show>
        </Show>
        <div class="sj-visually-hidden" role="status" aria-live="polite">
          {announcement()}
        </div>
      </section>
    </FieldShell>
  );
}

/** One action: control level, reference and title (a link), owner, due date and status. */
function Row(props: { item: ActionItem; state: ActionState; onOpen: (event: MouseEvent, item: ActionItem) => void; register: (id: string, el: HTMLAnchorElement) => void }) {
  const dueLine = () => {
    const item = props.item;
    switch (props.state) {
      case 'done':
        return item.completedDate ? `Done ${formatDate(item.completedDate)}` : 'Done';
      case 'cancelled':
        return 'Cancelled';
      case 'overdue':
        return `Overdue · ${dueText(item.dueDate)}`;
      default:
        return item.dueDate ? `Due ${dueText(item.dueDate)}` : 'No due date';
    }
  };
  return (
    <li class={['ca-row', `ca-row--${props.state}`]}>
      <span
        class="ca-level"
        title={props.item.level ? `${props.item.level.name} (${props.item.level.rank} of 6): ${CONTROL_LEVELS.find((l) => l.rank === props.item.level!.rank)?.hint ?? ''}` : 'No control level'}
      >
        <Show when={props.item.level} fallback={<span class="ca-level__none">No level</span>}>
          {(level) => (
            <>
              <Strength rank={level().rank} />
              <span class="ca-level__name">{level().name}</span>
            </>
          )}
        </Show>
      </span>
      <a
        ref={(element) => {
          untrack(() => props.register(props.item.documentId, element));
        }}
        class="ca-row__link"
        href={`/form/${props.item.documentId}`}
        onClick={(event) => props.onOpen(event, props.item)}
      >
        <span class="ca-ref">{props.item.ref || 'New'}</span>
        <span class="ca-title">{props.item.title || 'Untitled action'}</span>
      </a>
      <span class="ca-owner">
        <Show when={props.item.owner} fallback={<EmptyAvatar size="sm" />}>
          {(owner) => <Avatar name={owner().name} size="sm" />}
        </Show>
        <span class="ca-owner__name">{props.item.owner?.name ?? 'No owner'}</span>
      </span>
      <span class={['ca-due', `ca-due--${props.state}`]} title={props.item.dueDate ? formatDate(props.item.dueDate) : undefined}>
        <Show when={props.state === 'overdue'}>
          <Icon name="alert" size={13} />
        </Show>
        <Show when={props.state === 'done'}>
          <Icon name="check" size={13} />
        </Show>
        <span class="ca-due__date">{props.item.dueDate ? formatDate(props.item.dueDate) : ''}</span>
        <span class="ca-due__text">{dueLine()}</span>
      </span>
      <span class="ca-status">
        <Show when={props.item.status} fallback={<span class="sj-placeholder">No status</span>}>
          {(status) => <Lozenge color={status().color || undefined}>{status().name}</Lozenge>}
        </Show>
      </span>
    </li>
  );
}

/** The hierarchy of controls as radio buttons, most effective first, with the hint of each. */
function ControlLevels(props: {
  levels: LevelOption[];
  value: RelatedDoc | null;
  hint: LevelOption | null;
  disabled: boolean;
  /** Why the form can't be saved yet, if it is the level. */
  error?: string;
  onChange: (value: RelatedDoc) => void;
  onHint: (level: LevelOption | null) => void;
}) {
  const name = uid('level');
  const legendId = uid('legend');
  const errorId = uid('level-error');
  const shownHint = () => props.hint ?? props.levels.find((l) => l.value.documentId === props.value?.documentId) ?? null;
  return (
    <fieldset class="ca-levels" disabled={props.disabled} aria-describedby={props.error ? `${errorId} ${legendId}` : legendId}>
      <legend class="ca-field__label">
        Control level <span class="sj-field__required" aria-hidden="true">*</span>
      </legend>
      <div class="ca-levels__options" onPointerLeave={() => props.onHint(null)}>
        <For each={props.levels}>
          {(level) => {
            const hintId = uid('level-hint');
            const checked = () => props.value?.documentId === level.value.documentId;
            return (
              <label class={['ca-levels__option', { 'ca-levels__option--checked': checked() }]} onPointerEnter={() => props.onHint(level)}>
                <input
                  type="radio"
                  name={name}
                  value={level.value.documentId}
                  checked={checked()}
                  aria-describedby={hintId}
                  onChange={() => props.onChange(level.value)}
                  onFocus={() => props.onHint(level)}
                  onBlur={() => props.onHint(null)}
                />
                <Strength rank={level.rank} />
                <span class="ca-levels__name">{level.name}</span>
                <span class="sj-visually-hidden" id={hintId}>
                  {level.hint}
                </span>
              </label>
            );
          }}
        </For>
      </div>
      <p class="ca-levels__hint" id={legendId}>
        <Show when={shownHint()} fallback="Most effective first. Choose the strongest control that is reasonably practicable.">
          {(level) => (
            <>
              <strong>{level().name}:</strong> {level().hint}
            </>
          )}
        </Show>
      </p>
      <Show when={props.error}>
        <span class="ca-field__error" id={errorId}>
          {props.error}
        </span>
      </Show>
    </fieldset>
  );
}

