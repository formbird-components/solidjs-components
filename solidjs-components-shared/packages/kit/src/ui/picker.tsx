import { createEffect, createSignal, For, onSettled, Show, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { uid } from '../host/util';
import { Icon, Spinner } from './icons';

export interface PickerItem {
  /** Stable key (documentId, or a fixed id for actions). */
  key: string;
  label: string;
  description?: string;
  /** Creates the leading visual (icon, avatar). A function, so each render gets fresh nodes. */
  leading?: () => JSX.Element;
  /** Replaces the label/description body (e.g. a status lozenge); `label` stays the accessible name. */
  content?: () => JSX.Element;
  selected?: boolean;
  disabled?: boolean;
  /** Styles the item as an action ("Assign to me"). */
  action?: boolean;
  /** Draws a divider after the item, between quick actions and results. */
  separatorAfter?: boolean;
  onSelect: () => void;
}

export interface PickerPanelProps {
  /** Accessible name of the list. */
  label: string;
  items: PickerItem[];
  searchable?: boolean;
  query?: string;
  onQuery?: (query: string) => void;
  searchPlaceholder?: string;
  loading?: boolean;
  /** Message when there are no items (no matches, error...). */
  emptyText?: string;
  /** Message shown after the items, even when there are some (e.g. "Type to search"). */
  hint?: string;
  header?: JSX.Element;
  footer?: JSX.Element;
  /** Multi-select: show check marks on selected items. */
  multiple?: boolean;
}

/**
 * Search box plus a keyboard-navigable listbox (WAI-ARIA combobox pattern).
 * Arrow keys / Home / End move, Enter picks, Escape is handled by the surrounding Popover.
 * Focus stays in the search box while the mouse picks options.
 * @param props - items, search state and texts
 */
export function PickerPanel(props: PickerPanelProps) {
  const listId = uid('listbox');
  const [active, setActive] = createSignal(-1);
  let input: HTMLInputElement | undefined;
  let list: HTMLUListElement | undefined;
  const optionElements = new Map<string, HTMLElement>();

  const enabledIndexes = () =>
    props.items.flatMap((item, index) => (item.disabled ? [] : [index]));

  // Re-pick the active option when the options change, but not when only `selected` flags change
  // (toggling in a multi-select keeps the keyboard position).
  createEffect(
    () => props.items.map((item) => item.key).join('\u0000'),
    () =>
      untrack(() => {
        const selected = props.items.findIndex((item) => item.selected && !item.disabled);
        setActive(selected >= 0 ? selected : (enabledIndexes()[0] ?? -1));
      }),
  );
  createEffect(
    () => props.items[active()]?.key,
    (key) => {
      if (key !== undefined) optionElements.get(key)?.scrollIntoView({ block: 'nearest' });
    },
  );

  const move = (delta: number) => {
    const enabled = enabledIndexes();
    if (!enabled.length) return;
    const position = enabled.indexOf(active());
    const next =
      position < 0 ? (delta > 0 ? 0 : enabled.length - 1) : (position + delta + enabled.length) % enabled.length;
    setActive(enabled[next]);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const enabled = enabledIndexes();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
      case 'End':
        if (props.searchable && event.target === input) return; // caret movement in the search box
        event.preventDefault();
        setActive((event.key === 'Home' ? enabled[0] : enabled[enabled.length - 1]) ?? -1);
        break;
      case 'Enter': {
        const item = props.items[active()];
        if (item && !item.disabled) {
          event.preventDefault();
          item.onSelect();
        }
        break;
      }
    }
  };

  // The popover becomes visible in the same frame; focus once it is.
  onSettled(() => {
    requestAnimationFrame(() => (props.searchable ? input : list)?.focus({ preventScroll: true }));
  });

  const activeId = () => (active() >= 0 ? `${listId}-${active()}` : undefined);

  return (
    <div class="sj-picker" onKeyDown={onKeyDown}>
      {props.header}
      <Show when={props.searchable}>
        <div class="sj-search">
          <Icon name="search" />
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId()}
            aria-label={props.searchPlaceholder ?? 'Search'}
            placeholder={props.searchPlaceholder ?? 'Search'}
            value={props.query ?? ''}
            autocomplete="off"
            spellcheck={false}
            onInput={(event) => props.onQuery?.(event.currentTarget.value)}
          />
          <Show when={props.loading}>
            <Spinner label="Loading" />
          </Show>
        </div>
      </Show>
      <ul
        ref={list}
        id={listId}
        class="sj-listbox"
        role="listbox"
        aria-label={props.label}
        aria-multiselectable={props.multiple ? 'true' : undefined}
        aria-activedescendant={props.searchable ? undefined : activeId()}
        tabindex={props.searchable ? -1 : 0}
      >
        <For each={props.items}>
          {(item, index) => (
            <>
              <li
                ref={(element) => {
                  optionElements.set(item.key, element);
                }}
                id={`${listId}-${index()}`}
                role="option"
                aria-label={item.content ? item.label : undefined}
                class={['sj-option', item.action && 'sj-option--action']}
                aria-selected={item.selected ? 'true' : 'false'}
                aria-disabled={item.disabled ? 'true' : undefined}
                data-active={active() === index() ? '' : undefined}
                data-key={item.key}
                onPointerMove={() => !item.disabled && setActive(index())}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => !item.disabled && item.onSelect()}
              >
                {item.leading?.()}
                <Show
                  when={item.content}
                  fallback={
                    <span class="sj-option__body">
                      <span class="sj-option__label">{item.label}</span>
                      <Show when={item.description}>
                        <span class="sj-option__description">{item.description}</span>
                      </Show>
                    </span>
                  }
                >
                  <span class="sj-option__body sj-option__body--custom">
                    {item.content!()}
                    <Show when={item.description}>
                      <span class="sj-option__hint">{item.description}</span>
                    </Show>
                  </span>
                </Show>
                <Show when={props.multiple && !item.action}>
                  <Icon name="check" class="sj-option__check" />
                </Show>
              </li>
              <Show when={item.separatorAfter}>
                <li class="sj-listbox__separator" role="separator" />
              </Show>
            </>
          )}
        </For>
        <Show when={!props.items.length || props.hint}>
          <li class="sj-listbox__status" role="presentation">
            <Show when={props.loading && !props.searchable}>
              <Spinner />
            </Show>
            {props.hint ?? props.emptyText ?? 'No matches'}
          </li>
        </Show>
      </ul>
      {props.footer}
    </div>
  );
}
