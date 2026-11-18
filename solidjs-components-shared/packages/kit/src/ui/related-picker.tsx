import { createMemo, createSignal, For, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { FieldBinding } from '../host/field';
import { createSearchOptions } from '../host/options';
import { parseFilter, toRelatedDoc, withTextSearch } from '../host/query';
import type { BaseDefinition, RelatedDoc, SourceDocument } from '../host/types';
import { cloneJson } from '../host/util';
import { Icon } from './icons';
import { PickerPanel, type PickerItem } from './picker';
import { Popover } from './popover';
import { Chip, FieldShell } from './primitives';

/** Definition options shared with sc-related-document, so existing template entries keep working. */
export interface RelatedPickerDefinition extends BaseDefinition {
  /** Single value instead of a list (sc-related-document default is a list). */
  singleSelection?: boolean;
  /** When false, nothing is listed until the user types (large lookups such as accounts). */
  showDropDown?: boolean;
  hideLabel?: boolean;
}

export interface RelatedOption {
  /** What gets stored: `{ documentId, name, ...relatedFields }`. */
  entry: RelatedDoc;
  /** The full search hit, for icons, avatars and descriptions. */
  source: SourceDocument;
}

export interface PickerActions {
  select(entry: RelatedDoc): void;
  clear(): void;
}

export interface RelatedPickerProps<TDef extends RelatedPickerDefinition> {
  field: FieldBinding<RelatedDoc[], TDef>;
  labelId: string;
  /** Accessible fallback name when the field has no label ("value", "person"). */
  noun: string;
  /** Search box placeholder. Default: "Search <label>". */
  searchPlaceholder?: string;
  /** Empty multi-value prompt. Default: "Add <label>". */
  addText?: string;
  /** Text for an empty value ("None", "Unassigned"). */
  emptyLabel: string;
  /** Leading visual for a value or option. `source` is set for search results. */
  leading?: (entry: RelatedDoc, size: 'sm' | 'md', source?: SourceDocument) => JSX.Element;
  /** Leading visual for the empty value and the "None" option. */
  emptyLeading?: () => JSX.Element;
  /** Secondary line under an option. */
  describe?: (option: RelatedOption) => string | undefined;
  /** Items listed above the results ("Assign to me"). */
  quickActions?: (actions: PickerActions) => PickerItem[];
  /** Request used when the definition has no filter. */
  defaultFilter?: Record<string, unknown>;
  /** Source fields to request besides documentId, summary name and relatedFields. */
  include?: string[];
  /** Chip colour for multi values; plain chips when omitted. */
  chipHue?: (entry: RelatedDoc) => number | undefined;
}

/**
 * A related-document field: value display, picker popover, search and single/multi selection.
 * Reads and writes exactly what sc-related-document does, so it can replace it on a template.
 * @param props - The field binding and presentation hooks
 */
export function RelatedPicker<TDef extends RelatedPickerDefinition>(props: RelatedPickerProps<TDef>) {
  const field = props.field;
  const [open, setOpen] = createSignal(false);
  let anchor: HTMLButtonElement | undefined;

  const multiple = () => field.definition().singleSelection !== true;
  const typeToSearch = () => field.definition().showDropDown === false;
  const selectedIds = createMemo(() => new Set(field.value().map((entry) => entry.documentId)));

  const options = createSearchOptions<RelatedOption>({
    request: (query) => {
      const def = field.definition();
      if (typeToSearch() && !query.trim()) return undefined;
      const request = parseFilter(def.filter, field.templateContext()) ?? cloneJson(props.defaultFilter);
      if (!request) return undefined;
      const include = [
        'documentId',
        'systemHeader.summaryName',
        ...Object.values(def.relatedFields ?? {}),
        ...(props.include ?? []),
      ];
      return {
        request: withTextSearch(request, query),
        text: query,
        pageSize: def.queryOptions?.pageSize ?? 50,
        include,
      };
    },
    map: (source) => ({ entry: toRelatedDoc(source, field.definition().relatedFields), source }),
  });

  const actions: PickerActions = {
    select(entry) {
      if (!multiple()) {
        field.setValue([entry]);
        setOpen(false);
        return;
      }
      const current = field.value();
      field.setValue(
        selectedIds().has(entry.documentId)
          ? current.filter((v) => v.documentId !== entry.documentId)
          : [...current, entry],
      );
    },
    clear() {
      field.setValue([]);
      if (!multiple()) setOpen(false);
    },
  };

  const remove = (entry: RelatedDoc) => field.setValue(field.value().filter((v) => v.documentId !== entry.documentId));

  const items = createMemo<PickerItem[]>(() => {
    const quick = props.quickActions?.(actions) ?? [];
    if (!multiple() && !field.mandatory() && field.value().length) {
      quick.push({ key: '__none', label: props.emptyLabel, leading: props.emptyLeading, onSelect: actions.clear });
    }
    const results: PickerItem[] = options.items().map((option) => ({
      key: option.entry.documentId,
      label: option.entry.name,
      description: props.describe?.(option),
      leading: props.leading ? () => props.leading!(option.entry, 'md', option.source) : undefined,
      selected: selectedIds().has(option.entry.documentId),
      onSelect: () => actions.select(option.entry),
    }));
    if (quick.length && results.length) quick[quick.length - 1] = { ...quick[quick.length - 1], separatorAfter: true };
    return [...quick, ...results];
  });

  const waitingForText = () => typeToSearch() && !options.query().trim();
  const emptyText = () => {
    const error = options.error();
    if (error === 'no-filter') return 'No options are configured for this field';
    if (error) return `Couldn't load options: ${error}`;
    return options.loaded() ? 'No matches' : 'Loading…';
  };

  const openPicker = () => {
    if (field.disabled()) return;
    options.setQuery('');
    void options.load();
    setOpen(true);
  };

  const toggle = () => (open() ? setOpen(false) : openPicker());

  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' && !open()) {
      event.preventDefault();
      openPicker();
    }
  };

  const fieldWord = () => (field.label() || props.noun).toLowerCase();
  const searchPlaceholder = () => props.searchPlaceholder ?? `Search ${fieldWord()}`;
  const placeholder = () => {
    const def = field.definition();
    if (def.noHelpDisplay) return '';
    return def.helpDisplayString || (multiple() ? (props.addText ?? `Add ${fieldWord()}`) : props.emptyLabel);
  };

  return (
    <FieldShell
      label={field.label()}
      labelId={props.labelId}
      mandatory={field.mandatory()}
      hideLabel={field.definition().hideLabel}
      errors={field.errors()}
    >
      <Show
        when={multiple()}
        fallback={
          <button
            ref={anchor}
            type="button"
            class="sj-trigger"
            aria-haspopup="listbox"
            aria-expanded={open() ? 'true' : 'false'}
            aria-disabled={field.disabled() ? 'true' : undefined}
            aria-labelledby={field.label() && !field.definition().hideLabel ? props.labelId : undefined}
            aria-label={field.label() && !field.definition().hideLabel ? undefined : field.label() || props.noun}
            onClick={toggle}
            onKeyDown={onTriggerKeyDown}
          >
            <span class="sj-trigger__value">
              <Show
                when={field.value()[0]}
                fallback={
                  <>
                    {props.emptyLeading?.()}
                    <span class="sj-placeholder sj-truncate">{placeholder() || props.emptyLabel}</span>
                  </>
                }
              >
                {(entry) => (
                  <>
                    {props.leading?.(entry(), 'md')}
                    <span class="sj-truncate">{entry().name}</span>
                  </>
                )}
              </Show>
            </span>
            <Show when={!field.disabled()}>
              <Icon name="chevron-down" class="sj-trigger__chevron" />
            </Show>
          </button>
        }
      >
        <div class="sj-chips sj-multi" role="group" aria-labelledby={props.labelId}>
          <For each={field.value()}>
            {(entry) => (
              <Chip
                label={entry.name}
                hue={props.chipHue?.(entry)}
                plain={!props.chipHue}
                leading={props.leading?.(entry, 'sm')}
                onRemove={field.disabled() ? undefined : () => remove(entry)}
              />
            )}
          </For>
          <Show
            when={!field.disabled()}
            fallback={
              <Show when={!field.value().length}>
                <span class="sj-placeholder">{props.emptyLabel}</span>
              </Show>
            }
          >
            <button
              ref={anchor}
              type="button"
              class={['sj-add-btn', !field.value().length && 'sj-add-btn--empty']}
              aria-haspopup="listbox"
              aria-expanded={open() ? 'true' : 'false'}
              aria-label={props.addText ?? `Add ${fieldWord()}`}
              title={props.addText ?? `Add ${fieldWord()}`}
              onClick={toggle}
              onKeyDown={onTriggerKeyDown}
            >
              <Icon name="plus" size={14} />
              <Show when={!field.value().length}>
                <span>{placeholder()}</span>
              </Show>
            </button>
          </Show>
        </div>
      </Show>

      <Popover open={open()} anchor={() => anchor} onDismiss={() => setOpen(false)} matchWidth label={field.label() || props.noun}>
        <PickerPanel
          label={field.label() || props.noun}
          items={items()}
          multiple={multiple()}
          searchable
          query={options.query()}
          onQuery={options.setQuery}
          searchPlaceholder={searchPlaceholder()}
          loading={options.loading()}
          emptyText={emptyText()}
          hint={waitingForText() ? 'Type to search' : undefined}
        />
      </Popover>
    </FieldShell>
  );
}
