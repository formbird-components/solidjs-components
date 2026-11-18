import { createEffect, createSignal, flush, For, onSettled, Show, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { uid } from '@solidjs-components/kit';
import { cellKey, CONSEQUENCES, LIKELIHOODS, MATRIX, moveCell, RATING_COLORS, type CellPosition, type Rating } from '../../../packages/whs-kit/src/index';

export interface MatrixGridProps {
  /** Id of the element naming the grid (the field label), when it is shown. */
  labelledBy?: string;
  /** Accessible name when there is no visible label. */
  label: string;
  /** The cell holding the value (aria-selected), if any. */
  selected?: CellPosition | null;
  /** Cells take focus (one tab stop, arrows move) and can be picked. */
  interactive: boolean;
  /** Assess mode: rows and columns of a draft that has only one of the two levels. */
  draft?: Partial<CellPosition>;
  /** Picked with a click, Enter or Space. */
  onPick?: (cell: CellPosition, element: HTMLElement) => void;
  /** Any other key on a cell (Delete to clear...). */
  onOtherKey?: (event: KeyboardEvent, cell: CellPosition) => void;
  onHover?: (cell: CellPosition | null) => void;
  onFocusCell?: (cell: CellPosition | null) => void;
  cellLabel: (cell: CellPosition, rating: Rating) => string;
  cellContent: (cell: CellPosition, rating: Rating) => JSX.Element;
  /** Cells that can't be picked (heatmap cells with nothing in them). */
  cellDisabled?: (cell: CellPosition) => boolean;
  /** Heatmap: the cell whose list is open. */
  expanded?: CellPosition | null;
  /** Heatmap: cells open a list. */
  hasPopup?: boolean;
  /** Draws an arrow between two cells (before and after controls). */
  arrow?: { from: CellPosition; to: CellPosition } | null;
  /** Gets each cell's element (to anchor a popover). */
  registerCell?: (key: string, element: HTMLElement) => void;
  /** Describe each cell with the hints of its likelihood and consequence. */
  describeLevels?: boolean;
  /** Heatmap: 0 to 1, how full a cell is compared with the fullest; deepens its tint. */
  cellHeat?: (cell: CellPosition) => number;
}

const ROWS = [...LIKELIHOODS].reverse();
const CENTRE: CellPosition = { likelihood: 3, consequence: 3 };
const same = (a: CellPosition | null | undefined, b: CellPosition | null | undefined) =>
  !!a && !!b && a.likelihood === b.likelihood && a.consequence === b.consequence;

interface Arrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  head: string;
}

/**
 * The 5 × 5 matrix: likelihood rows (Almost certain at the top), consequence columns (Insignificant
 * on the left), cells tinted by rating. A grid with one tab stop: arrows, Home, End, PageUp and
 * PageDown move focus (Ctrl+Home / Ctrl+End to the corners), Enter or Space picks.
 * @param props - Selection, cell content and handlers
 */
export function MatrixGrid(props: MatrixGridProps) {
  const cells = new Map<string, HTMLElement>();
  const hintId = uid('rm-level');
  let grid: HTMLDivElement | undefined;
  const [active, setActive] = createSignal<CellPosition>(untrack(() => props.selected) ?? CENTRE, { ownedWrite: true });
  const [arrow, setArrow] = createSignal<Arrow | null>(null, { ownedWrite: true });
  const [size, setSize] = createSignal(0, { ownedWrite: true });

  // The roving tab stop follows the value when it changes from elsewhere (a select, a ruleset), but
  // not while focus is in the grid.
  const hasFocus = () => {
    const root = grid?.getRootNode() as Document | ShadowRoot | undefined;
    return !!root && !!grid?.contains(root.activeElement);
  };
  createEffect(
    () => props.selected,
    (selected) => {
      if (selected && !hasFocus()) setActive({ likelihood: selected.likelihood, consequence: selected.consequence });
    },
  );

  onSettled(() => {
    if (typeof ResizeObserver === 'undefined' || !grid) return;
    const observer = new ResizeObserver(() => setSize((n) => n + 1));
    observer.observe(grid);
    return () => observer.disconnect();
  });

  // The arrow is measured from the cells, so it follows any layout (wrapping labels, narrow forms).
  const measure = (from: CellPosition, to: CellPosition) => {
    const a = cells.get(cellKey(from.likelihood, from.consequence));
    const b = cells.get(cellKey(to.likelihood, to.consequence));
    if (!grid || !a || !b || same(from, to)) return setArrow(null);
    const box = grid.getBoundingClientRect();
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const ax = ra.left + ra.width / 2 - box.left;
    const ay = ra.top + ra.height / 2 - box.top;
    const bx = rb.left + rb.width / 2 - box.left;
    const by = rb.top + rb.height / 2 - box.top;
    const length = Math.hypot(bx - ax, by - ay);
    const gap = Math.min(ra.width, ra.height) * 0.34;
    if (length < gap * 2.2) return setArrow(null);
    const ux = (bx - ax) / length;
    const uy = (by - ay) / length;
    const x1 = ax + ux * gap;
    const y1 = ay + uy * gap;
    const x2 = bx - ux * gap;
    const y2 = by - uy * gap;
    const head = 7;
    const px = -uy * head * 0.6;
    const py = ux * head * 0.6;
    const base = { x: x2 - ux * head, y: y2 - uy * head };
    setArrow({
      x1,
      y1,
      x2: base.x,
      y2: base.y,
      head: `${x2},${y2} ${base.x + px},${base.y + py} ${base.x - px},${base.y - py}`,
    });
  };
  createEffect(
    () => {
      size();
      const a = props.arrow;
      return a ? { from: { ...a.from }, to: { ...a.to } } : null;
    },
    (pair) => {
      if (!pair) {
        setArrow(null);
        return;
      }
      const frame = requestAnimationFrame(() => measure(pair.from, pair.to));
      return () => cancelAnimationFrame(frame);
    },
  );

  const focusCell = (cell: CellPosition) => {
    setActive(cell);
    flush();
    cells.get(cellKey(cell.likelihood, cell.consequence))?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, cell: CellPosition) => {
    const next = moveCell(cell, event.key, event.ctrlKey || event.metaKey);
    if (next) {
      event.preventDefault();
      focusCell(next);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!props.cellDisabled?.(cell)) props.onPick?.(cell, event.currentTarget as HTMLElement);
      return;
    }
    props.onOtherKey?.(event, cell);
  };

  return (
    <div class="rm-board">
      <span class="rm-axis-title rm-axis-title--x" aria-hidden="true">
        Consequence
      </span>
      <span class="rm-axis-title rm-axis-title--y" aria-hidden="true">
        Likelihood
      </span>
      <div
        ref={grid}
        class="rm-grid"
        role="grid"
        aria-labelledby={props.labelledBy}
        aria-label={props.labelledBy ? undefined : props.label}
        aria-readonly={props.interactive ? undefined : 'true'}
        onPointerLeave={() => props.onHover?.(null)}
        onFocusOut={(event) => {
          if (!grid?.contains(event.relatedTarget as Node | null)) props.onFocusCell?.(null);
        }}
      >
        <div class="rm-row rm-row--head" role="row">
          <span class="rm-corner" role="columnheader">
            <span class="rm-axis-title">Consequence</span>
          </span>
          <For each={CONSEQUENCES}>
            {(level) => (
              <span class="rm-colhead" role="columnheader" title={`${level.name}: ${level.hint}`}>
                <span class="rm-level-num" aria-hidden="true">
                  {level.level}
                </span>
                <span class="rm-level-name">{level.name}</span>
              </span>
            )}
          </For>
        </div>
        <For each={ROWS}>
          {(row) => (
            <div class="rm-row" role="row">
              <span class="rm-rowhead" role="rowheader" title={`${row.name}: ${row.hint}`}>
                <span class="rm-level-name">{row.name}</span>
                <span class="rm-level-num" aria-hidden="true">
                  {row.level}
                </span>
              </span>
              <For each={CONSEQUENCES}>
                {(column) => {
                  const cell: CellPosition = { likelihood: row.level, consequence: column.level };
                  const rating = MATRIX[row.level - 1][column.level - 1];
                  const key = cellKey(row.level, column.level);
                  const isActive = () => same(active(), cell);
                  const isSelected = () => same(props.selected, cell);
                  const disabled = () => !!props.cellDisabled?.(cell);
                  const inDraft = () => props.draft?.likelihood === row.level || props.draft?.consequence === column.level;
                  return (
                    <div
                      ref={(element) => {
                        cells.set(key, element);
                        untrack(() => props.registerCell?.(key, element));
                      }}
                      class={[
                        'rm-cell',
                        `rm-cell--${rating.toLowerCase()}`,
                        { 'rm-cell--interactive': props.interactive && !disabled(), 'rm-cell--draft': inDraft(), 'rm-cell--empty': disabled() },
                      ]}
                      style={{ '--rm-color': RATING_COLORS[rating], '--rm-heat': props.cellHeat ? String(props.cellHeat(cell)) : undefined }}
                      role="gridcell"
                      data-cell={key}
                      tabindex={props.interactive ? (isActive() ? 0 : -1) : undefined}
                      aria-selected={props.selected !== undefined ? (isSelected() ? 'true' : 'false') : undefined}
                      aria-disabled={disabled() ? 'true' : undefined}
                      aria-haspopup={props.hasPopup && !disabled() ? 'dialog' : undefined}
                      aria-expanded={props.hasPopup && !disabled() ? (same(props.expanded, cell) ? 'true' : 'false') : undefined}
                      aria-label={props.cellLabel(cell, rating)}
                      aria-describedby={props.describeLevels ? `${hintId}-l${row.level} ${hintId}-c${column.level}` : undefined}
                      onClick={(event) => {
                        if (!props.interactive || disabled()) return;
                        setActive(cell);
                        props.onPick?.(cell, event.currentTarget);
                      }}
                      onKeyDown={(event) => props.interactive && onKeyDown(event, cell)}
                      onFocus={() => {
                        setActive(cell);
                        props.onFocusCell?.(cell);
                      }}
                      onPointerEnter={() => props.onHover?.(cell)}
                    >
                      {props.cellContent(cell, rating)}
                    </div>
                  );
                }}
              </For>
            </div>
          )}
        </For>
        <Show when={arrow()}>
          {(a) => (
            <svg class="rm-arrow" aria-hidden="true" width="100%" height="100%">
              <line class="rm-arrow__halo" x1={a().x1} y1={a().y1} x2={a().x2} y2={a().y2} />
              <line x1={a().x1} y1={a().y1} x2={a().x2} y2={a().y2} />
              <polygon points={a().head} />
            </svg>
          )}
        </Show>
      </div>
      <Show when={props.describeLevels}>
        <div class="sj-visually-hidden">
          <For each={LIKELIHOODS}>{(level) => <span id={`${hintId}-l${level.level}`}>{level.hint}.</span>}</For>
          <For each={CONSEQUENCES}>{(level) => <span id={`${hintId}-c${level.level}`}>{level.hint}.</span>}</For>
        </div>
      </Show>
    </div>
  );
}
