import { createEffect, createMemo, createSignal, For, Show, untrack } from 'solid-js';
import {
  Button,
  createDocumentField,
  createFieldBinding,
  fetchDocuments,
  FieldShell,
  getPath,
  Icon,
  IconButton,
  jsonEqual,
  Lozenge,
  toRelatedList,
  uid,
  type BaseDefinition,
  type ElementProps,
  type FormbirdElementProps,
  checklistOutcome,
  type CheckItem,
} from '@solidjs-components/kit';

/** A check as a check sheet or the definition lists it (before it is answered). */
export interface CheckDefinition {
  key?: string;
  question: string;
  category?: string;
  mandatory?: boolean;
  instruction?: string;
}

/** Where the checks come from when the definition doesn't list them. */
export interface ItemsSource {
  /** Related field of this document: the check sheet itself, or a record that points to one (an asset). */
  field: string;
  /** Field on that record pointing to the check sheet (e.g. "checkSheetRel"); omit when `field` is the sheet. */
  documentField?: string;
  /** Field on the check sheet with the checks (default "checkItems"). */
  itemsField?: string;
}

export interface ChecklistDefinition extends BaseDefinition {
  /** "answer" (default): answer the checks; "define": edit the checks themselves (a check sheet, a service plan's tasks). */
  mode?: 'answer' | 'define';
  items?: CheckDefinition[];
  itemsFrom?: ItemsSource;
  /** A failed check needs a comment (default true). */
  commentOnFail?: boolean;
  /** The sheet's result when a check failed (default "Defects found"; e.g. "Hazards found"). */
  failLabel?: string;
  /** Offer N/A (default true). */
  allowNa?: boolean;
  /** Let people add a one-off check (default false). */
  allowAdd?: boolean;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<ChecklistDefinition, unknown>>;
type Result = 'pass' | 'fail' | 'na';

const RESULTS: { value: Result; label: string }[] = [
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'na', label: 'N/A' },
];

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

/** A key for every check that lacks one (from its question), unique within the list. */
function withKeys<T extends { key?: string; question?: string }>(list: T[]): (T & { key: string })[] {
  const seen = new Set<string>();
  return list.map((item, index) => {
    let key = (typeof item.key === 'string' && item.key) || slug(item.question ?? '') || `check-${index + 1}`;
    while (seen.has(key)) key = `${key}-${index + 1}`;
    seen.add(key);
    return { ...item, key };
  });
}

/** Checks to answer, from whatever a sheet or definition lists. Blank questions are left out. */
function toItems(list: unknown): CheckItem[] {
  if (!Array.isArray(list)) return [];
  return withKeys(list.filter((item): item is CheckDefinition => !!item && typeof (item as CheckDefinition).question === 'string' && !!(item as CheckDefinition).question.trim()))
    .map((item) => ({
      key: item.key,
      question: item.question,
      category: item.category || undefined,
      mandatory: item.mandatory === true || undefined,
      instruction: item.instruction || undefined,
      result: '' as const,
      comment: '',
    }));
}

// Every stored check, keyed: a sheet written by hand or imported may have no keys, and define mode
// writes the whole list back, so dropping them would delete them.
const parseValue = (raw: unknown): CheckItem[] =>
  Array.isArray(raw) ? withKeys((raw as CheckItem[]).filter((i) => !!i && typeof i === 'object' && (typeof i.key === 'string' || typeof i.question === 'string'))) : [];
const answeredAny = (items: CheckItem[]) => items.some((i) => i.result || (i.comment ?? '').trim());
/** The questions of a list, to tell whether two lists are the same checks. */
const signature = (items: CheckItem[]) => items.filter((i) => !i.adhoc).map((i) => `${i.key}|${i.question}`).join('\n');

/**
 * `<solid-checklist>`: a check sheet to answer. Writes the whole list (questions and answers) to its
 * field, so the record keeps the checks as they were asked even if the sheet changes later. In
 * "define" mode it edits the checks of a check sheet instead.
 * @param props - Formbird element properties
 */
export function Checklist(props: Props) {
  const field = createFieldBinding<CheckItem[], ChecklistDefinition>(props, { parse: parseValue });
  return (
    <Show when={untrack(() => field.definition().mode) === 'define'} fallback={<Answer field={field} props={props} />}>
      <Define field={field} />
    </Show>
  );
}

type Binding = ReturnType<typeof createFieldBinding<CheckItem[], ChecklistDefinition>>;

/** Edits the checks of a sheet: question, category, mandatory, instruction; add, remove, reorder. */
function Define(componentProps: { field: Binding }) {
  const field = componentProps.field;
  const labelId = uid('label');
  const listId = uid('categories');
  const items = () => field.value();
  const write = (next: CheckItem[]) => field.setValue(next.map(({ result: _r, comment: _c, ...definition }) => definition));
  const update = (key: string, patch: Partial<CheckItem>) => write(items().map((item) => (item.key === key ? { ...item, ...patch } : item)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...items()];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    write(next);
  };
  const add = () => {
    const keys = new Set(items().map((i) => i.key));
    let n = items().length + 1;
    while (keys.has(`check-${n}`)) n++;
    write([...items(), { key: `check-${n}`, question: '', category: items().at(-1)?.category }]);
  };
  const categories = () => [...new Set(items().map((i) => i.category).filter(Boolean))] as string[];

  return (
    <FieldShell label={field.label()} labelId={labelId} mandatory={field.mandatory()} hideLabel={field.definition().hideLabel} errors={field.errors()}>
      <div class="cl cl--define" role="group" aria-labelledby={labelId}>
        <datalist id={listId}>
          <For each={categories()}>{(category) => <option value={category} />}</For>
        </datalist>
        <Show when={items().length} fallback={<div class="cl-empty">No checks yet.</div>}>
          <ol class="cl-defs">
            <For each={items()}>
              {(item, index) => (
                <li class="cl-def">
                  <span class="cl-def__n">{index() + 1}</span>
                  <input
                    class="sj-input cl-def__question"
                    placeholder="Check question"
                    aria-label={`Check ${index() + 1} question`}
                    value={item.question}
                    disabled={field.disabled()}
                    onChange={(event) => update(item.key, { question: event.currentTarget.value })}
                  />
                  <input
                    class="sj-input cl-def__category"
                    placeholder="Category"
                    aria-label={`Check ${index() + 1} category`}
                    list={listId}
                    value={item.category ?? ''}
                    disabled={field.disabled()}
                    onChange={(event) => update(item.key, { category: event.currentTarget.value || undefined })}
                  />
                  <label class="cl-def__mandatory">
                    <input
                      type="checkbox"
                      checked={!!item.mandatory}
                      disabled={field.disabled()}
                      onChange={(event) => update(item.key, { mandatory: event.currentTarget.checked || undefined })}
                    />
                    Mandatory
                  </label>
                  <Show when={!field.disabled()}>
                    <span class="cl-def__tools">
                      <IconButton icon="arrow-up" size="sm" label="Move up" disabled={index() === 0} onClick={() => move(index(), -1)} />
                      <IconButton icon="arrow-down" size="sm" label="Move down" disabled={index() === items().length - 1} onClick={() => move(index(), 1)} />
                      <IconButton icon="trash" size="sm" label={`Remove ${item.question || 'check'}`} onClick={() => write(items().filter((i) => i.key !== item.key))} />
                    </span>
                  </Show>
                  <input
                    class="sj-input cl-def__instruction"
                    placeholder="Instruction (optional)"
                    aria-label={`Check ${index() + 1} instruction`}
                    value={item.instruction ?? ''}
                    disabled={field.disabled()}
                    onChange={(event) => update(item.key, { instruction: event.currentTarget.value || undefined })}
                  />
                </li>
              )}
            </For>
          </ol>
        </Show>
        <Show when={!field.disabled()}>
          <div>
            <Button size="sm" icon="plus" onClick={add}>
              Add check
            </Button>
          </div>
        </Show>
      </div>
    </FieldShell>
  );
}

/** Answers the checks. */
function Answer(componentProps: { field: Binding; props: Props }) {
  const field = componentProps.field;
  const props = componentProps.props;
  const def = field.definition;
  const labelId = uid('label');
  const source = untrack(() => def().itemsFrom);
  const sourceRef = createDocumentField(props, source?.field ?? '', toRelatedList);
  const [sheet, setSheet] = createSignal<{ name: string; items: CheckItem[] }>();
  const [sheetError, setSheetError] = createSignal<string>();
  const [openInstruction, setOpenInstruction] = createSignal<string>();
  const [draft, setDraft] = createSignal('');

  const items = () => field.value();
  const outcome = createMemo(() => checklistOutcome(items(), { commentOnFail: def().commentOnFail !== false, failLabel: def().failLabel }));

  // Checks listed on the definition: fill an empty list.
  createEffect(
    () => JSON.stringify(def().items ?? null),
    () => {
      const listed = toItems(untrack(() => def().items));
      if (listed.length && !untrack(items).length) field.setValue(listed);
    },
  );

  // Checks from a check sheet the record points to (directly, or through its asset).
  let loadId = 0;
  const loadSheet = async (refId: string) => {
    const id = ++loadId;
    setSheetError(undefined);
    if (!source || !refId) {
      setSheet(undefined);
      return;
    }
    try {
      let sheetRef = { documentId: refId, name: untrack(sourceRef)[0]?.name ?? '' };
      if (source.documentField) {
        const stored = toRelatedList(getPath(untrack(sourceRef)[0], source.documentField))[0];
        const viaRecord = stored ?? toRelatedList(getPath((await fetchDocuments([refId], [source.documentField]))[0], source.documentField))[0];
        if (id !== loadId) return;
        if (!viaRecord) {
          setSheet(undefined);
          setSheetError('No check sheet is set for it.');
          return;
        }
        sheetRef = { documentId: viaRecord.documentId, name: viaRecord.name };
      }
      const itemsField = source.itemsField ?? 'checkItems';
      const [doc] = await fetchDocuments([sheetRef.documentId], [itemsField, 'systemHeader.summaryName']);
      if (id !== loadId) return;
      const loaded = toItems(getPath(doc, itemsField));
      setSheet({ name: String(getPath(doc, 'systemHeader.summaryName') ?? sheetRef.name), items: loaded });
      // Replace the checks only while nothing has been answered.
      const current = untrack(items);
      if (loaded.length && !answeredAny(current) && !jsonEqual(signature(current), signature(loaded))) field.setValue(loaded);
    } catch (error) {
      if (id === loadId) setSheetError((error as Error)?.message || 'The check sheet could not be loaded.');
    }
  };
  createEffect(
    () => sourceRef()[0]?.documentId ?? '',
    (refId) => void loadSheet(refId),
  );

  const update = (key: string, patch: Partial<CheckItem>) => {
    field.setValue(items().map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };
  const answer = (item: CheckItem, result: Result) => update(item.key, { result: item.result === result ? '' : result });
  const passRemaining = () => field.setValue(items().map((item) => (item.result ? item : { ...item, result: 'pass' as const })));
  const reloadFromSheet = () => {
    const loaded = sheet()?.items;
    if (loaded?.length) field.setValue([...loaded, ...items().filter((i) => i.adhoc)]);
  };
  const addCheck = () => {
    const question = draft().trim();
    if (!question) return;
    const keys = new Set(items().map((i) => i.key));
    let key = `adhoc-${slug(question) || 'check'}`;
    for (let n = 2; keys.has(key); n++) key = `adhoc-${slug(question)}-${n}`;
    field.setValue([...items(), { key, question, category: 'Added checks', result: '', comment: '', adhoc: true }]);
    setDraft('');
  };

  const groups = createMemo(() => {
    const map = new Map<string, CheckItem[]>();
    for (const item of items()) {
      const name = item.category || 'Checks';
      map.set(name, [...(map.get(name) ?? []), item]);
    }
    return [...map.entries()].map(([name, list]) => ({ name, list }));
  });

  const resultColor = () => (outcome().result === 'Pass' ? 'var(--sj-success)' : outcome().complete && outcome().failed ? 'var(--sj-danger)' : undefined);
  const sheetChanged = () => {
    const loaded = sheet()?.items ?? [];
    return loaded.length > 0 && answeredAny(items()) && signature(loaded) !== signature(items());
  };

  return (
    <FieldShell label={field.label()} labelId={labelId} mandatory={field.mandatory()} hideLabel={def().hideLabel} errors={field.errors()}>
      <div class="cl" role="group" aria-labelledby={labelId}>
        <Show
          when={items().length}
          fallback={
            <div class="cl-empty">
              <Icon name="list" size={16} />
              <span>
                {sheetError() ??
                  (source && !sourceRef()[0] ? 'Choose the asset first: its check sheet lists the checks.' : sheet() ? `${sheet()!.name} has no checks.` : 'No checks yet.')}
              </span>
            </div>
          }
        >
          <div class="cl-head">
            <div class="cl-progress">
              <div class="cl-progress__text">
                <strong>{outcome().answered}</strong> of {outcome().total} checked
                <Show when={sheet()}>{(s) => <span class="cl-sheet"> · {s().name}</span>}</Show>
              </div>
              <div class="sj-progress" role="progressbar" aria-valuemin={0} aria-valuemax={outcome().total} aria-valuenow={outcome().answered} aria-label="Checks answered">
                <div
                  class="sj-progress__bar"
                  style={{
                    width: `${outcome().total ? (outcome().answered / outcome().total) * 100 : 0}%`,
                    '--sj-progress': outcome().failed ? 'var(--sj-danger)' : 'var(--sj-success)',
                  }}
                />
              </div>
            </div>
            <div class="cl-summary">
              <span class="cl-count cl-count--pass">{outcome().passed} pass</span>
              <span class="cl-count cl-count--fail">{outcome().failed} fail</span>
              <Show when={outcome().na}>
                <span class="cl-count">{outcome().na} N/A</span>
              </Show>
              <Lozenge color={resultColor()}>{outcome().result}</Lozenge>
            </div>
          </div>

          <Show when={!field.disabled() && outcome().answered < outcome().total}>
            <div class="cl-actions">
              <Button size="sm" variant="subtle" icon="check" onClick={passRemaining}>
                Pass the remaining {outcome().total - outcome().answered}
              </Button>
            </div>
          </Show>
          <Show when={!field.disabled() && sheetChanged()}>
            <div class="sj-note">
              <Icon name="info" size={14} />
              <span>
                {sheet()!.name} lists different checks now.{' '}
                <button type="button" class="cl-link" onClick={reloadFromSheet}>
                  Use its checks
                </button>{' '}
                (clears the answers).
              </span>
            </div>
          </Show>

          <For each={groups()}>
            {(group) => (
              <section class="cl-group">
                <h3 class="cl-group__title">
                  {group.name}
                  <span class="cl-group__count">
                    {group.list.filter((i) => i.result).length}/{group.list.length}
                  </span>
                </h3>
                <ul class="cl-items">
                  <For each={group.list}>
                    {(item) => {
                      const needsComment = () => item.result === 'fail' && def().commentOnFail !== false && !(item.comment ?? '').trim();
                      const commentId = `${labelId}-${item.key}`;
                      return (
                        <li class={['cl-item', item.result && `cl-item--${item.result}`, !item.result && item.mandatory && 'cl-item--required']}>
                          <div class="cl-item__main">
                            <div class="cl-item__question">
                              <span>
                                {item.question}
                                <Show when={item.mandatory}>
                                  <span class="sj-field__required" title="Mandatory check">
                                    {' '}
                                    *
                                  </span>
                                </Show>
                              </span>
                              <Show when={item.instruction}>
                                <IconButton
                                  icon="info"
                                  size="sm"
                                  label={openInstruction() === item.key ? 'Hide instruction' : 'Show instruction'}
                                  aria-expanded={openInstruction() === item.key ? 'true' : 'false'}
                                  onClick={() => setOpenInstruction((k) => (k === item.key ? undefined : item.key))}
                                />
                              </Show>
                            </div>
                            <div class="sj-segmented cl-answer" role="group" aria-label={item.question}>
                              <For each={RESULTS.filter((r) => r.value !== 'na' || def().allowNa !== false)}>
                                {(option) => (
                                  <button
                                    type="button"
                                    class={`cl-answer--${option.value}`}
                                    aria-pressed={item.result === option.value ? 'true' : 'false'}
                                    disabled={field.disabled()}
                                    onClick={() => answer(item, option.value)}
                                  >
                                    {option.label}
                                  </button>
                                )}
                              </For>
                            </div>
                          </div>
                          <Show when={openInstruction() === item.key}>
                            <p class="cl-item__instruction">{item.instruction}</p>
                          </Show>
                          <Show when={item.result === 'fail' || (item.comment ?? '').trim()}>
                            <label class="cl-comment" for={commentId}>
                              <span class="sj-visually-hidden">Comment on {item.question}</span>
                              <input
                                id={commentId}
                                class="sj-input"
                                placeholder={item.result === 'fail' ? (def().commentOnFail === false ? 'What is wrong?' : 'What is wrong? (required)') : 'Comment'}
                                value={item.comment ?? ''}
                                aria-invalid={needsComment() ? 'true' : undefined}
                                disabled={field.disabled()}
                                onChange={(event) => update(item.key, { comment: event.currentTarget.value })}
                              />
                            </label>
                          </Show>
                        </li>
                      );
                    }}
                  </For>
                </ul>
              </section>
            )}
          </For>

          <Show when={outcome().missingMandatory.length || outcome().failsWithoutComment.length}>
            <div class="sj-note sj-note--warning" role="status">
              <Icon name="alert" size={14} />
              <div>
                <Show when={outcome().missingMandatory.length}>
                  <div>Mandatory Check Not Completed: {outcome().missingMandatory.join(', ')}</div>
                </Show>
                <Show when={outcome().failsWithoutComment.length}>
                  <div>Say what is wrong with: {outcome().failsWithoutComment.join(', ')}</div>
                </Show>
              </div>
            </div>
          </Show>
        </Show>

        <Show when={def().allowAdd && !field.disabled() && (items().length || !source)}>
          <form
            class="cl-add"
            onSubmit={(event) => {
              event.preventDefault();
              addCheck();
            }}
          >
            <input class="sj-input" placeholder="Add a check…" value={draft()} onInput={(event) => setDraft(event.currentTarget.value)} aria-label="New check" />
            <Button size="sm" icon="plus" type="submit" disabled={!draft().trim()}>
              Add check
            </Button>
          </form>
        </Show>
      </div>
    </FieldShell>
  );
}
