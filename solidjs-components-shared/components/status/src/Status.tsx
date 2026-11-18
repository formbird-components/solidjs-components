import { createEffect, createMemo, createSignal, Show, untrack } from 'solid-js';
import {
  allowedTransitions,
  createDocumentField,
  createFieldBinding,
  createSearchOptions,
  FieldShell,
  getPath,
  findByName,
  hasAccessKey,
  Icon,
  IconButton,
  Lozenge,
  needsResolution,
  parseFilter,
  PickerPanel,
  Popover,
  statusAppearance,
  toRelatedDoc,
  toRelatedList,
  uid,
  withTextSearch,
  type BaseDefinition,
  type ElementProps,
  type FormbirdElementProps,
  type PickerItem,
  type RelatedDoc,
  type StatusAppearanceOptions,
  type StatusCategory,
} from '@solidjs-components/kit';

/** Optional second step when moving into a "done" status. */
export interface ResolutionStep {
  /** Field the resolution is written to (SDMS: resolutionRel). */
  fieldName: string;
  /** Filter listing resolution documents (same syntax as any related-document filter). */
  filter: string | Record<string, unknown>;
  relatedFields?: Record<string, string>;
  /** Status names and/or categories that need a resolution. Default ["done"]. */
  requiredFor?: string[];
  label?: string;
  /** Clear the resolution when the record moves to a status that doesn't need one. Default true. */
  clearOnReopen?: boolean;
}

/** Also takes `colors`, `categories`, `colorField` and `categoryField` ({@link StatusAppearanceOptions}). */
export interface StatusDefinition extends BaseDefinition, StatusAppearanceOptions {
  /** Allowed moves by status name: `{ "New": ["In Progress"], "*": [...] }`. Default: any status. */
  transitions?: Record<string, string[]>;
  /** Field on status documents listing the next statuses (`[{ documentId, name }]`); overrides `transitions`. */
  transitionsField?: string;
  /**
   * Moves only some people may make: target status name → access key id(s) the user needs (with the
   * Update right), e.g. `{ "Closed": ["<supervisor key>"] }`. Others don't see those targets. Enforce
   * the same rule in a PreSaveServer ruleset: this only shapes the picker.
   */
  transitionKeys?: Record<string, string | string[]>;
  resolution?: ResolutionStep;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<StatusDefinition, unknown>>;

interface StatusOption {
  documentId: string;
  name: string;
  /** Value stored when this status is chosen. */
  entry: RelatedDoc;
  color: string;
  category: StatusCategory;
  /** Next statuses listed on the status document itself, when `transitionsField` is set. */
  next?: RelatedDoc[];
}

const CATEGORY_LABELS: Record<StatusCategory, string> = {
  todo: 'To do',
  inprogress: 'In progress',
  done: 'Done',
};

/**
 * `<solid-status>`: a record's workflow status as a coloured button, opening the allowed transitions.
 * @param props - Formbird element properties
 */
export function Status(props: Props) {
  const field = createFieldBinding<RelatedDoc[], StatusDefinition>(props, { parse: toRelatedList });
  const def = field.definition;
  const labelId = uid('label');
  const [open, setOpen] = createSignal(false);
  const [pending, setPending] = createSignal<StatusOption>();
  let trigger: HTMLButtonElement | undefined;


  const statuses = createSearchOptions<StatusOption>({
    request: () => {
      const d = def();
      const request = parseFilter(d.filter, field.templateContext());
      if (!request) return undefined;
      return {
        request,
        pageSize: d.queryOptions?.pageSize ?? 100,
        include: [
          'documentId',
          'systemHeader.summaryName',
          d.colorField ?? 'color',
          d.categoryField ?? 'statusCategory',
          ...(d.transitionsField ? [d.transitionsField] : []),
          ...Object.values(d.relatedFields ?? {}),
        ],
      };
    },
    map: (source) => {
      const entry = toRelatedDoc(source, def().relatedFields);
      const transitionsField = def().transitionsField;
      return {
        documentId: entry.documentId,
        name: entry.name,
        entry,
        ...statusAppearance(entry.name, def(), source),
        next: transitionsField ? toRelatedList(getPath(source, transitionsField)) : undefined,
      };
    },
  });

  // Statuses are few and the colours are needed before the picker opens: load now, and again
  // whenever a ruleset changes the filter (ntf.scope.setFilter).
  createEffect(
    () => JSON.stringify(def().filter ?? null),
    () => void statuses.load(),
  );

  const current = () => field.value()[0];
  const currentOption = createMemo<StatusOption | undefined>(() => {
    const value = current();
    if (!value) return undefined;
    const loaded = statuses.items().find((s) => s.documentId === value.documentId);
    if (loaded) return loaded;
    return { documentId: value.documentId, name: value.name, entry: value, ...statusAppearance(value.name, def()) };
  });

  const targets = createMemo(() =>
    allowedTransitions(current(), statuses.items(), def().transitions, currentOption()?.next).filter((target) => {
      const keys = findByName(def().transitionKeys, target.name);
      return keys === undefined || hasAccessKey(Array.isArray(keys) ? keys : [keys], 'Update');
    }),
  );

  // Resolution step
  const resolutionField = untrack(() => def().resolution?.fieldName ?? '');
  const resolution = createDocumentField(props, resolutionField, toRelatedList);
  const resolutions = createSearchOptions<RelatedDoc>({
    request: (query) => {
      const step = def().resolution;
      const request = step && parseFilter(step.filter, field.templateContext());
      if (!request) return undefined;
      return {
        request: withTextSearch(request, query),
        text: query,
        pageSize: 50,
        include: ['documentId', 'systemHeader.summaryName', ...Object.values(step.relatedFields ?? {})],
      };
    },
    map: (source) => toRelatedDoc(source, def().resolution?.relatedFields),
  });

  const apply = (target: StatusOption, chosenResolution?: RelatedDoc) => {
    field.setValue([target.entry]);
    const step = def().resolution;
    if (step?.fieldName) {
      if (chosenResolution) field.setOtherField(step.fieldName, [chosenResolution]);
      else if (step.clearOnReopen !== false && resolution().length) field.setOtherField(step.fieldName, []);
    }
    setPending(undefined);
    setOpen(false);
  };

  const choose = (target: StatusOption) => {
    const step = def().resolution;
    if (step?.fieldName && needsResolution(target, target.category, step.requiredFor)) {
      setPending(target);
      resolutions.setQuery('');
      void resolutions.load();
      return;
    }
    apply(target);
  };

  const statusItems = createMemo<PickerItem[]>(() =>
    targets().map((target) => ({
      key: target.documentId,
      label: target.name,
      description: CATEGORY_LABELS[target.category],
      content: () => <Lozenge color={target.color}>{target.name}</Lozenge>,
      onSelect: () => choose(target),
    })),
  );

  const resolutionItems = createMemo<PickerItem[]>(() =>
    resolutions.items().map((item) => ({
      key: item.documentId,
      label: item.name,
      onSelect: () => apply(pending()!, item),
    })),
  );

  const statusEmptyText = () => {
    const error = statuses.error();
    if (error === 'no-filter') return 'No statuses are configured for this field';
    if (error) return `Couldn't load statuses: ${error}`;
    if (!statuses.loaded()) return 'Loading…';
    return current() ? `No transitions from ${current()!.name}` : 'No statuses available';
  };

  const openPicker = () => {
    if (field.disabled()) return;
    setPending(undefined);
    void statuses.load();
    setOpen(true);
  };

  return (
    <FieldShell
      label={field.label()}
      labelId={labelId}
      mandatory={field.mandatory()}
      hideLabel={def().hideLabel}
      errors={field.errors()}
    >
      <div class="st">
        <button
          ref={trigger}
          type="button"
          class={['st-button', currentOption() ? 'sj-tint sj-tint--interactive sj-caps' : 'st-button--empty']}
          style={currentOption() ? { '--sj-lozenge': currentOption()!.color } : undefined}
          aria-haspopup="listbox"
          aria-expanded={open() ? 'true' : 'false'}
          aria-disabled={field.disabled() ? 'true' : undefined}
          aria-labelledby={field.label() && !def().hideLabel ? `${labelId} ${labelId}-value` : undefined}
          aria-label={field.label() && !def().hideLabel ? undefined : `Status: ${currentOption()?.name ?? 'none'}`}
          onClick={() => (open() ? setOpen(false) : openPicker())}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && !open()) {
              event.preventDefault();
              openPicker();
            }
          }}
        >
          <Show when={currentOption()}>
            <span class="sj-lozenge__dot" aria-hidden="true" />
          </Show>
          <span id={`${labelId}-value`} class="st-text">
            {currentOption()?.name ?? (field.disabled() ? 'No status' : 'Set status')}
          </span>
          <Show when={!field.disabled()}>
            <Icon name="chevron-down" size={14} class="st-chevron" strokeWidth={2} />
          </Show>
        </button>
      </div>

      <Popover open={open()} anchor={() => trigger} onDismiss={() => setOpen(false)} minWidth={260} label="Change status">
        <Show
          when={pending()}
          fallback={
            <PickerPanel
              label="Statuses"
              items={statusItems()}
              searchable={statusItems().length > 8}
              loading={statuses.loading()}
              emptyText={statusEmptyText()}
              header={
                <div class="sj-picker__header">
                  <span>Move to</span>
                </div>
              }
            />
          }
        >
          {(target) => (
            <PickerPanel
              label={def().resolution?.label ?? 'Resolution'}
              items={resolutionItems()}
              searchable
              query={resolutions.query()}
              onQuery={resolutions.setQuery}
              searchPlaceholder={`Search ${(def().resolution?.label ?? 'resolution').toLowerCase()}`}
              loading={resolutions.loading()}
              emptyText={
                resolutions.error() ? "Couldn't load resolutions" : resolutions.loaded() ? 'No matches' : 'Loading…'
              }
              header={
                <div class="sj-picker__header st-step">
                  <IconButton icon="arrow-left" label="Back to statuses" size="sm" onClick={() => setPending(undefined)} />
                  <span>{def().resolution?.label ?? 'Resolution'} for</span>
                  <Lozenge color={target().color}>{target().name}</Lozenge>
                </div>
              }
            />
          )}
        </Show>
      </Popover>
    </FieldShell>
  );
}
