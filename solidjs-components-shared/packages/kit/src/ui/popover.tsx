import { createEffect, onCleanup, Show, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';

export type DismissReason = 'escape' | 'outside' | 'focus';

export interface PopoverProps {
  open: boolean;
  /** Element the popover is attached to (usually the trigger button). */
  anchor: () => HTMLElement | undefined;
  onDismiss: (reason: DismissReason) => void;
  /** Align the popover's start or end edge with the anchor. */
  align?: 'start' | 'end';
  /** Make the popover at least as wide as the anchor. */
  matchWidth?: boolean;
  minWidth?: number;
  label?: string;
  children: JSX.Element;
}

const GAP = 6;
const VIEWPORT_MARGIN = 8;

const supportsPopoverApi =
  typeof HTMLElement !== 'undefined' && typeof (HTMLElement.prototype as { showPopover?: unknown }).showPopover === 'function';

/**
 * A floating panel anchored to an element.
 *
 * Renders in the browser's top layer (Popover API), so Formbird panels with `overflow: hidden` or
 * stacking contexts can't clip it; positions itself below the anchor and flips above when there is
 * more room there. Closes on outside pointer-down, Escape and focus leaving; returns focus to the
 * anchor unless the user clicked elsewhere.
 * @param props - open state, anchor, dismiss handler and content
 */
export function Popover(props: PopoverProps) {
  let panel: HTMLDivElement | undefined;
  let returnFocus = true;

  // Reads props on purpose from effects and DOM events; positioning is imperative, not tracked.
  const position = () => untrack(placePanel);
  const anchorElement = () => untrack(() => props.anchor());

  const placePanel = () => {
    const anchor = props.anchor();
    if (!panel || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;

    const minWidth = Math.max(props.minWidth ?? 240, props.matchWidth ? rect.width : 0);
    panel.style.minWidth = `${Math.min(minWidth, viewportWidth - VIEWPORT_MARGIN * 2)}px`;

    const spaceBelow = viewportHeight - rect.bottom - GAP - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - GAP - VIEWPORT_MARGIN;
    panel.style.maxHeight = '';
    const naturalHeight = panel.offsetHeight;
    const above = naturalHeight > spaceBelow && spaceAbove > spaceBelow;
    const available = Math.max(160, above ? spaceAbove : spaceBelow);
    panel.style.maxHeight = `${available}px`;
    const height = Math.min(naturalHeight, available);

    const width = panel.offsetWidth;
    let left = props.align === 'end' ? rect.right - width : rect.left;
    left = Math.min(Math.max(VIEWPORT_MARGIN, left), viewportWidth - VIEWPORT_MARGIN - width);
    const top = above ? rect.top - GAP - height : rect.bottom + GAP;

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(Math.max(VIEWPORT_MARGIN, top))}px`;
    panel.dataset.side = above ? 'top' : 'bottom';
  };

  const show = () => {
    if (!panel) return;
    panel.setAttribute('data-open', '');
    if (supportsPopoverApi && !panel.matches(':popover-open')) panel.showPopover();
  };

  const hide = () => {
    if (!panel) return;
    panel.removeAttribute('data-open');
    if (supportsPopoverApi && panel.matches(':popover-open')) panel.hidePopover();
  };

  createEffect(
    () => props.open,
    (open) => {
      if (!panel) return;
      if (!open) {
        const wasOpen = panel.hasAttribute('data-open');
        hide();
        if (wasOpen && returnFocus) anchorElement()?.focus({ preventScroll: true });
        return;
      }

      returnFocus = true;
      show();
      position();

      const onPointerDown = (event: PointerEvent) => {
        const path = event.composedPath();
        const anchor = anchorElement();
        if (path.includes(panel!) || (anchor && path.includes(anchor))) return;
        returnFocus = false;
        props.onDismiss('outside');
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        event.preventDefault();
        props.onDismiss('escape');
      };
      const onFocusOut = (event: FocusEvent) => {
        const next = event.relatedTarget as Node | null;
        const anchor = anchorElement();
        if (!next || panel!.contains(next) || anchor?.contains(next)) return;
        returnFocus = false;
        props.onDismiss('focus');
      };
      const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => position());
      observer?.observe(panel);

      document.addEventListener('pointerdown', onPointerDown, true);
      panel.addEventListener('keydown', onKeyDown);
      panel.addEventListener('focusout', onFocusOut);
      window.addEventListener('scroll', position, true);
      window.addEventListener('resize', position);

      return () => {
        observer?.disconnect();
        document.removeEventListener('pointerdown', onPointerDown, true);
        panel?.removeEventListener('keydown', onKeyDown);
        panel?.removeEventListener('focusout', onFocusOut);
        window.removeEventListener('scroll', position, true);
        window.removeEventListener('resize', position);
      };
    },
  );

  onCleanup(hide);

  return (
    <div
      ref={panel}
      class="sj-popover"
      popover={supportsPopoverApi ? 'manual' : undefined}
      role="dialog"
      aria-label={props.label}
    >
      <Show when={props.open}>{props.children}</Show>
    </div>
  );
}
