import { createMemo, createSignal, flush, For, onCleanup, onSettled, Show, untrack } from 'solid-js';
import {
  Button,
  createFieldBinding,
  FieldShell,
  Icon,
  IconButton,
  jsonEqual,
  nextEntryId,
  Popover,
  uid,
  type BaseDefinition,
  type ElementProps,
  type FormbirdElementProps,
} from '@solidjs-components/kit';
import { BODY_VIEWS, regionAt, regionCentre, regionNames, type FigureView } from './body';
import { pathData } from './geometry';
import { describePin, fraction, freeSpot, INJURY_KINDS, kindColor, parsePins, readableText, tidyPin, toKinds, type Pin, type PinKind } from './pins';

/** One image of a custom figure (`views`). */
export interface PinViewDefinition {
  name: string;
  label?: string;
  /** URL of the image (relative to the app, e.g. `api/getFile/<fileNo>`, or absolute). */
  image: string;
}

export interface ImagePinsDefinition extends BaseDefinition {
  /** Built-in figure: "body" (front and back views with named regions). The default without `image` or `views`. */
  figure?: 'body';
  /** A custom image instead of a figure. */
  image?: string;
  /** Several custom images, side by side. */
  views?: PinViewDefinition[];
  /** Pin categories: `[{ name, color }]` or names. Default: injury kinds for the body figure, none otherwise. */
  kinds?: (PinKind | string)[];
  /** Most pins the field takes (default 30). */
  maxPins?: number;
  readOnly?: boolean;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<ImagePinsDefinition, unknown>>;

/** A view as the element shows it: a built-in figure view or a custom image. */
interface ViewModel {
  name: string;
  label: string;
  figure?: FigureView;
  image?: string;
}

/** Fractions of a view, and where the pointer is on its stage in pixels. */
interface StagePoint {
  x: number;
  y: number;
  left: number;
  top: number;
}

const DEFAULT_MAX = 30;
const NOTE_DELAY = 400;
const UNDO_FOR = 15_000;

/** The views a definition asks for: custom images, else the body figure. */
function resolveViews(def: ImagePinsDefinition): ViewModel[] {
  if (Array.isArray(def.views)) {
    const custom = def.views
      .filter((v) => v && typeof v.image === 'string' && v.image.trim())
      .map((v, i) => ({ name: String(v.name || `view-${i + 1}`), label: String(v.label ?? v.name ?? ''), image: v.image }));
    if (custom.length) return custom;
  }
  if (typeof def.image === 'string' && def.image.trim()) return [{ name: 'image', label: '', image: def.image }];
  return BODY_VIEWS.map((figure) => ({ name: figure.name, label: figure.label, figure }));
}

/** Path data for each region of the built-in views, made once. */
const PATHS = new Map<string, string>(BODY_VIEWS.flatMap((view) => view.regions.map((region) => [`${view.name}|${region.name}`, pathData(region.polygons)] as const)));

/**
 * `<solid-image-pins>`: numbered pins on a body figure (where someone was hurt) or on any image
 * (a floor plan, a drawing). Each pin stores where it is as fractions of its view, the region of the
 * figure under it, a kind (its colour) and a note.
 * @param props - Formbird element properties
 */
export function ImagePins(props: Props) {
  const firstView = untrack(() => resolveViews(props.componentDefinition ?? {})[0]?.name ?? 'front');
  const field = createFieldBinding<Pin[], ImagePinsDefinition>(props, { parse: (raw) => parsePins(raw, firstView) });
  const def = field.definition;
  const labelId = uid('label');
  const helpId = uid('help');
  const pinHelpId = uid('pin-help');

  const views = createMemo(() => resolveViews(def()));
  const viewByName = (name: string) => untrack(views).find((v) => v.name === name) ?? untrack(views)[0];
  const isBody = () => !!views()[0]?.figure;
  const kinds = createMemo(() => toKinds(def().kinds, isBody() ? INJURY_KINDS : []));
  const maxPins = () => (typeof def().maxPins === 'number' && def().maxPins! > 0 ? Math.floor(def().maxPins!) : DEFAULT_MAX);
  const readOnly = () => field.disabled();
  const pins = () => field.value();
  const atLimit = () => pins().length >= maxPins();
  const viewLabel = (name: string) => (views().length > 1 ? views().find((v) => v.name === name)?.label || name : undefined);

  const [selectedId, setSelectedId] = createSignal<string>();
  const [drag, setDrag] = createSignal<{ id: string; x: number; y: number; region?: string }>();
  const [hover, setHover] = createSignal<{ view: string; region: string; left: number; top: number }>();
  const [noteDraft, setNoteDraft] = createSignal('');
  const [undo, setUndo] = createSignal<{ pin: Pin; index: number }>();
  const [announcement, setAnnouncement] = createSignal('');
  const [notice, setNotice] = createSignal<string>();
  const [imageState, setImageState] = createSignal<Record<string, { width: number; height: number } | 'error'>>({});
  const [addView, setAddView] = createSignal(firstView);
  const [addRegion, setAddRegion] = createSignal('');

  const pinButtons = new Map<string, HTMLElement>();
  const stages = new Map<string, HTMLElement>();
  let regionSelect: HTMLSelectElement | undefined;
  let addButton: HTMLButtonElement | undefined;

  const selectedPin = createMemo(() => pins().find((p) => p.id === selectedId()));
  const numberOf = (id: string) => untrack(pins).findIndex((p) => p.id === id) + 1;
  const regionFor = (view: ViewModel | undefined, x: number, y: number) => (view?.figure ? regionAt(view.figure, x, y) : undefined);

  // ------------------------------------------------------------------ writing

  /** The value now, including writes made earlier in this event (Solid applies them on flush). */
  const latest = () => {
    flush();
    return untrack(field.value);
  };
  const write = (next: Pin[]) => field.setValue(next.map(tidyPin));

  let announceTimer: ReturnType<typeof setTimeout> | undefined;
  const announce = (message: string) => {
    // Clear first so the same message is read again.
    setAnnouncement('');
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => setAnnouncement(message), 30);
  };

  const updatePin = (id: string, patch: Partial<Pin>) => {
    const list = latest();
    const index = list.findIndex((p) => p.id === id);
    if (index < 0) return;
    const pin = tidyPin({ ...list[index], ...patch });
    if (jsonEqual(pin, list[index])) return;
    write(list.map((p, i) => (i === index ? pin : p)));
  };

  // A note is written 400 ms after typing stops, and straight away when the box loses focus.
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingNote: { id: string; note: string } | undefined;
  const commitNote = () => {
    clearTimeout(noteTimer);
    const pending = pendingNote;
    pendingNote = undefined;
    if (pending) updatePin(pending.id, { note: pending.note });
  };
  const typeNote = (id: string, note: string) => {
    setNoteDraft(note);
    pendingNote = { id, note };
    clearTimeout(noteTimer);
    noteTimer = setTimeout(commitNote, NOTE_DELAY);
  };

  let undoTimer: ReturnType<typeof setTimeout> | undefined;
  onSettled(() => () => {
    commitNote();
    clearTimeout(undoTimer);
    clearTimeout(announceTimer);
  });

  // The pin the editor is attached to; kept after it closes, so focus can go back to it.
  let anchorId: string | undefined;
  const select = (id: string | undefined) => {
    commitNote();
    const pin = id ? untrack(pins).find((p) => p.id === id) : undefined;
    if (pin) anchorId = pin.id;
    setNoteDraft(pin?.note ?? '');
    setSelectedId(pin?.id);
    if (pin) pinButtons.get(pin.id)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };

  const focusPin = (id: string | undefined) => {
    flush();
    const target = (id && pinButtons.get(id)) || addButton;
    target?.focus({ preventScroll: false });
  };

  const addPin = (pin: Omit<Pin, 'id'>) => {
    if (latest().length >= untrack(maxPins)) {
      announce(limitText());
      return;
    }
    const added = tidyPin({ id: nextEntryId(), ...pin });
    write([...latest(), added]);
    setUndo(undefined);
    setNotice(undefined);
    flush();
    select(added.id);
    announce(`${describePin(added, numberOf(added.id), untrack(() => viewLabel(added.view)))} added.`);
  };

  const removePin = (id: string) => {
    if (pendingNote?.id === id) {
      clearTimeout(noteTimer);
      pendingNote = undefined;
    } else commitNote();
    const list = latest();
    const index = list.findIndex((p) => p.id === id);
    if (index < 0) return;
    const pin = list[index];
    write(list.filter((p) => p.id !== id));
    if (anchorId === id) anchorId = undefined;
    setSelectedId(undefined);
    setUndo({ pin, index });
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => setUndo(undefined), UNDO_FOR);
    announce(`Pin ${index + 1} removed. Undo is below the list.`);
    const rest = latest();
    focusPin((rest[index] ?? rest[index - 1])?.id);
  };

  const undoRemove = () => {
    const removed = untrack(undo);
    setUndo(undefined);
    clearTimeout(undoTimer);
    if (!removed) return;
    const list = latest();
    if (list.some((p) => p.id === removed.pin.id)) return;
    const next = [...list];
    next.splice(Math.min(removed.index, next.length), 0, removed.pin);
    write(next);
    announce(`Pin ${Math.min(removed.index, list.length) + 1} is back.`);
    focusPin(removed.pin.id);
  };

  /** Moves a pin; on a figure the pin must stay on it, and its region follows. */
  const movePin = (pin: Pin, x: number, y: number): boolean => {
    const view = viewByName(pin.view);
    const region = regionFor(view, x, y);
    if (view?.figure && !region) return false;
    updatePin(pin.id, { x, y, ...(view?.figure ? { region } : {}) });
    if (region && region !== pin.region) announce(`Pin ${numberOf(pin.id)}: ${region}`);
    return true;
  };

  const limitText = () => `${untrack(maxPins)} pins is the most this field takes. Remove one to add another.`;

  // ------------------------------------------------------------------ pointer

  const stagePoint = (viewName: string, event: { clientX: number; clientY: number }): StagePoint | undefined => {
    const stage = stages.get(viewName);
    const rect = stage?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return undefined;
    const left = event.clientX - rect.left;
    const top = event.clientY - rect.top;
    return { x: left / rect.width, y: top / rect.height, left, top };
  };

  const onStageClick = (view: ViewModel, event: MouseEvent) => {
    if (untrack(readOnly) || (event.target as Element | null)?.closest?.('.ip-pin')) return;
    const point = stagePoint(view.name, event);
    if (!point || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return;
    if (untrack(atLimit)) {
      setNotice(limitText());
      announce(limitText());
      return;
    }
    const region = regionFor(view, point.x, point.y);
    if (view.figure && !region) {
      setNotice('Click on the figure itself to add a pin there.');
      return;
    }
    addPin({ view: view.name, x: point.x, y: point.y, region });
  };

  const onStageMove = (view: ViewModel, event: PointerEvent) => {
    if (dragging) return;
    if ((event.target as Element | null)?.closest?.('.ip-pin')) {
      setHover(undefined);
      return;
    }
    const point = stagePoint(view.name, event);
    const region = point && regionFor(view, point.x, point.y);
    setHover(point && region ? { view: view.name, region, left: point.left, top: point.top } : undefined);
  };

  let dragging: { id: string; view: string; pointerId: number; startX: number; startY: number; moved: boolean; last?: { x: number; y: number; region?: string } } | undefined;
  let suppressClick = false;

  const onPinPointerDown = (pin: Pin, event: PointerEvent) => {
    suppressClick = false;
    if (untrack(readOnly) || event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    dragging = { id: pin.id, view: pin.view, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
  };
  const onPinPointerMove = (event: PointerEvent) => {
    const d = dragging;
    if (!d || d.pointerId !== event.pointerId) return;
    if (!d.moved && Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < 4) return;
    if (!d.moved) {
      d.moved = true;
      if (untrack(selectedId)) select(undefined);
    }
    const point = stagePoint(d.view, event);
    if (!point) return;
    const x = fraction(point.x);
    const y = fraction(point.y);
    const region = regionFor(viewByName(d.view), x, y);
    d.last = { x, y, region };
    setDrag({ id: d.id, x, y, region });
    setHover(region ? { view: d.view, region, left: point.left, top: point.top } : undefined);
  };
  const endDrag = (event: PointerEvent, cancelled: boolean) => {
    const d = dragging;
    if (!d || d.pointerId !== event.pointerId) return;
    dragging = undefined;
    setDrag(undefined);
    setHover(undefined);
    if (!d.moved) return;
    suppressClick = true;
    const pin = untrack(pins).find((p) => p.id === d.id);
    if (cancelled || !pin || !d.last) return;
    if (!movePin(pin, d.last.x, d.last.y)) announce('Pins go on the figure, so the pin went back.');
  };

  const onPinKeyDown = (pin: Pin, event: KeyboardEvent) => {
    if (event.key === 'Escape' && untrack(selectedId) === pin.id) {
      event.preventDefault();
      select(undefined);
      return;
    }
    if (untrack(readOnly)) return;
    const step = event.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      if (!movePin(pin, fraction(pin.x + move[0]), fraction(pin.y + move[1]))) announce('That is the edge of the figure.');
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removePin(pin.id);
    }
  };

  // ------------------------------------------------------------------ keyboard "Add pin"

  const addViewModel = () => views().find((v) => v.name === addView()) ?? views()[0];
  const addFromControl = () => {
    const view = untrack(addViewModel);
    if (!view) return;
    const taken = untrack(pins).filter((p) => p.view === view.name);
    if (view.figure) {
      const region = untrack(addRegion);
      const centre = region ? regionCentre(view.figure, region) : undefined;
      if (!centre) {
        announce('Choose a region first.');
        regionSelect?.focus();
        return;
      }
      const spot = freeSpot(centre, taken, (x, y) => regionAt(view.figure!, x, y) === region);
      addPin({ view: view.name, ...spot, region });
    } else {
      addPin({ view: view.name, ...freeSpot({ x: 0.5, y: 0.5 }, taken, () => true) });
    }
  };

  // ------------------------------------------------------------------ rendering

  /** Colour of each region that has a pin (its first pin's kind), to show hurt areas at a glance. */
  const tints = createMemo(() => {
    const map = new Map<string, string>();
    for (const pin of pins()) {
      const key = `${pin.view}|${pin.region}`;
      if (pin.region && !map.has(key)) map.set(key, kindColor(kinds(), pin.kind));
    }
    return map;
  });

  const RegionOptions = (p: { figure: FigureView; selected?: string }) => (
    <For each={p.figure.groups}>
      {(group) => (
        <optgroup label={group.label}>
          <For each={group.regions}>
            {(name) => (
              <option value={name} selected={name === p.selected}>
                {name}
              </option>
            )}
          </For>
        </optgroup>
      )}
    </For>
  );

  const Stage = (p: { view: ViewModel }) => {
    const view = p.view;
    const image = () => imageState()[view.name];
    const imageSize = () => {
      const state = image();
      return typeof state === 'object' ? state : undefined;
    };
    return (
      <figure class={['ip-view', view.figure ? 'ip-view--figure' : 'ip-view--image']}>
        <Show when={view.label}>
          <figcaption class="ip-view__label">{view.label}</figcaption>
        </Show>
        <div
          class={['ip-stage', !readOnly() && !atLimit() && 'ip-stage--add']}
          ref={(el) => {
            stages.set(view.name, el);
          }}
          style={{
            'aspect-ratio': view.figure ? `${view.figure.width} / ${view.figure.height}` : imageSize() ? `${imageSize()!.width} / ${imageSize()!.height}` : '4 / 3',
          }}
          onClick={(event) => onStageClick(view, event)}
          onPointerMove={(event) => onStageMove(view, event)}
          onPointerLeave={() => !dragging && setHover(undefined)}
        >
          <Show
            when={view.figure}
            fallback={
              <>
                <img
                  class="ip-image"
                  src={view.image}
                  alt={view.label || field.label() || 'Image'}
                  onDragStart={(event) => event.preventDefault()}
                  onLoad={(event) => {
                    const img = event.currentTarget;
                    setImageState((state) => ({ ...state, [view.name]: { width: img.naturalWidth || 4, height: img.naturalHeight || 3 } }));
                  }}
                  onError={() => setImageState((state) => ({ ...state, [view.name]: 'error' }))}
                />
                <Show when={!image()}>
                  <div class="ip-image-status">
                    <span class="sj-spinner" role="status" aria-label="Loading the image" />
                  </div>
                </Show>
                <Show when={image() === 'error'}>
                  <div class="ip-image-status" role="alert">
                    <Icon name="alert" size={14} />
                    The image couldn't be loaded.
                  </div>
                </Show>
              </>
            }
          >
            {(figure) => (
              <svg class="ip-figure" viewBox={`0 0 ${figure().width} ${figure().height}`} aria-hidden="true">
                <For each={figure().regions}>
                  {(region) => {
                    const key = `${view.name}|${region.name}`;
                    return (
                      <path
                        class="ip-region"
                        d={PATHS.get(key)}
                        data-region={region.name}
                        data-hover={hover()?.view === view.name && hover()?.region === region.name ? '' : undefined}
                        data-pinned={tints().has(key) ? '' : undefined}
                        style={tints().has(key) ? { '--ip-tint': tints().get(key) } : undefined}
                      />
                    );
                  }}
                </For>
                <text class="ip-side" x="8" y="18">
                  {figure().personLeftOn === 'left' ? 'L' : 'R'}
                </text>
                <text class="ip-side" x={figure().width - 8} y="18" text-anchor="end">
                  {figure().personLeftOn === 'left' ? 'R' : 'L'}
                </text>
              </svg>
            )}
          </Show>

          <For each={pins().filter((pin) => pin.view === view.name)} keyed={(pin) => pin.id}>
            {(pin) => {
              const number = () => pins().findIndex((p) => p.id === pin().id) + 1;
              const position = () => (drag()?.id === pin().id ? drag()! : pin());
              const color = () => kindColor(kinds(), pin().kind);
              const label = () => describePin(pin(), number(), viewLabel(pin().view));
              const style = () => ({
                left: `${position().x * 100}%`,
                top: `${position().y * 100}%`,
                '--ip-pin': color(),
                '--ip-pin-text': readableText(color()),
              });
              const id = untrack(pin).id;
              onCleanup(() => pinButtons.delete(id));
              return (
                <Show
                  when={!readOnly()}
                  fallback={
                    <span class="ip-pin ip-pin--static" style={style()} title={label()} aria-hidden="true">
                      {number()}
                    </span>
                  }
                >
                  <button
                    type="button"
                    class={['ip-pin', drag()?.id === pin().id && 'ip-pin--dragging']}
                    ref={(el) => {
                      pinButtons.set(id, el);
                    }}
                    data-pin={pin().id}
                    style={style()}
                    title={label()}
                    aria-label={label()}
                    aria-describedby={pinHelpId}
                    aria-haspopup="dialog"
                    aria-expanded={selectedId() === pin().id ? 'true' : 'false'}
                    onPointerDown={(event) => onPinPointerDown(untrack(pin), event)}
                    onPointerMove={onPinPointerMove}
                    onPointerUp={(event) => endDrag(event, false)}
                    onPointerCancel={(event) => endDrag(event, true)}
                    onClick={() => {
                      if (suppressClick) {
                        suppressClick = false;
                        return;
                      }
                      select(untrack(selectedId) === untrack(pin).id ? undefined : untrack(pin).id);
                    }}
                    onKeyDown={(event) => onPinKeyDown(untrack(pin), event)}
                  >
                    {number()}
                  </button>
                </Show>
              );
            }}
          </For>

          <Show when={hover()?.view === view.name ? hover() : undefined}>
            {(h) => (
              <div class="ip-hover" style={{ left: `${h().left}px`, top: `${h().top}px` }} aria-hidden="true">
                {h().region}
              </div>
            )}
          </Show>
        </div>
      </figure>
    );
  };

  const Editor = (p: { pin: Pin }) => {
    const view = () => viewByName(p.pin.view);
    const number = () => numberOf(p.pin.id);
    const regionId = uid('region');
    const noteId = uid('note');
    return (
      <div class="ip-editor">
        <div class="ip-editor__head">
          <span class="ip-num" style={{ '--ip-pin': kindColor(kinds(), p.pin.kind), '--ip-pin-text': readableText(kindColor(kinds(), p.pin.kind)) }} aria-hidden="true">
            {number()}
          </span>
          <div class="ip-editor__title">
            <strong>Pin {number()}</strong>
            <span>{[p.pin.region, viewLabel(p.pin.view)].filter(Boolean).join(' · ') || 'No region'}</span>
          </div>
          <IconButton icon="x" size="sm" label="Close" onClick={() => select(undefined)} />
        </div>

        <Show when={kinds().length}>
          <div class="ip-editor__section">
            <span class="ip-editor__label" id={`${regionId}-kinds`}>
              Kind
            </span>
            <div class="ip-kinds" role="group" aria-labelledby={`${regionId}-kinds`}>
              <For each={kinds()}>
                {(kind, index) => (
                  <button
                    type="button"
                    class="ip-kind"
                    style={{ '--ip-kind': kindColor(kinds(), kind.name) }}
                    aria-pressed={p.pin.kind?.toLowerCase() === kind.name.toLowerCase() ? 'true' : 'false'}
                    ref={(el) => {
                      if (untrack(index) === 0) requestAnimationFrame(() => el.isConnected && el.focus({ preventScroll: true }));
                    }}
                    onClick={() => updatePin(p.pin.id, { kind: p.pin.kind?.toLowerCase() === kind.name.toLowerCase() ? undefined : kind.name })}
                  >
                    <span class="ip-kind__dot" aria-hidden="true" />
                    {kind.name}
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        <div class="ip-editor__section">
          <label class="ip-editor__label" for={regionId}>
            {view()?.figure ? 'Region' : 'Where'}
          </label>
          <Show
            when={view()?.figure}
            fallback={
              <input
                id={regionId}
                class="sj-input"
                placeholder="e.g. Level 2, plant room"
                value={p.pin.region ?? ''}
                ref={(el) => {
                  if (!untrack(kinds).length) requestAnimationFrame(() => el.isConnected && el.focus({ preventScroll: true }));
                }}
                onChange={(event) => updatePin(p.pin.id, { region: event.currentTarget.value })}
              />
            }
          >
            {(figure) => (
              <select
                id={regionId}
                class="sj-input ip-select"
                ref={(el) => {
                  if (!untrack(kinds).length) requestAnimationFrame(() => el.isConnected && el.focus({ preventScroll: true }));
                }}
                onChange={(event) => {
                  const region = event.currentTarget.value;
                  // The pin moves to the region chosen, so where it is and what it says agree.
                  const inside = regionAt(figure(), p.pin.x, p.pin.y) === region;
                  const centre = inside ? undefined : regionCentre(figure(), region);
                  const spot = centre && freeSpot(centre, untrack(pins).filter((q) => q.view === p.pin.view && q.id !== p.pin.id), (x, y) => regionAt(figure(), x, y) === region);
                  updatePin(p.pin.id, { region, ...(spot ?? {}) });
                  announce(`Pin ${number()}: ${region}`);
                }}
              >
                <Show when={!p.pin.region || !regionNames(figure()).includes(p.pin.region)}>
                  <option value={p.pin.region ?? ''} selected>
                    {p.pin.region || 'Choose a region…'}
                  </option>
                </Show>
                <RegionOptions figure={figure()} selected={p.pin.region} />
              </select>
            )}
          </Show>
        </div>

        <div class="ip-editor__section">
          <label class="ip-editor__label" for={noteId}>
            Note
          </label>
          <textarea
            id={noteId}
            class="sj-input ip-note"
            rows={3}
            placeholder={isBody() ? 'What happened to this part?' : 'Note'}
            value={noteDraft()}
            onInput={(event) => typeNote(p.pin.id, event.currentTarget.value)}
            onBlur={commitNote}
          />
        </div>

        <div class="ip-editor__foot">
          <Button size="sm" variant="subtle" icon="trash" class="ip-delete" onClick={() => removePin(p.pin.id)}>
            Delete pin
          </Button>
          <Button size="sm" variant="primary" onClick={() => select(undefined)}>
            Done
          </Button>
        </div>
      </div>
    );
  };

  return (
    <FieldShell label={field.label()} labelId={labelId} mandatory={field.mandatory()} hideLabel={def().hideLabel} errors={field.errors()}>
      <div class={['ip', readOnly() && 'ip--readonly']} role="group" aria-labelledby={labelId} aria-describedby={helpId}>
        <p class="sj-visually-hidden" id={helpId}>
          {readOnly()
            ? `${pins().length} pin${pins().length === 1 ? '' : 's'}, listed below the ${isBody() ? 'figure' : 'image'}.`
            : `Click the ${isBody() ? 'figure' : 'image'} to add a pin there, or use Add pin below.`}
        </p>
        <p class="sj-visually-hidden" id={pinHelpId}>
          Enter opens it. Arrow keys move it, Shift for bigger steps. Delete removes it.
        </p>

        <div class={['ip-views', isBody() && 'ip-views--body']}>
          <For each={views()}>{(view) => <Stage view={view} />}</For>
        </div>
        <Show when={isBody()}>
          <p class="ip-sides">R and L are the person's right and left.</p>
        </Show>

        <Show when={notice()}>
          <div class="sj-note" role="status">
            <Icon name="info" size={14} />
            <span>{notice()}</span>
          </div>
        </Show>

        <Show when={!readOnly()}>
          <div class="ip-add" role="group" aria-label="Add a pin">
            <Show when={views().length > 1}>
              <label class="ip-add__field">
                <span>View</span>
                <select
                  class="sj-input ip-select"
                  onChange={(event) => {
                    setAddView(event.currentTarget.value);
                    const view = views().find((v) => v.name === event.currentTarget.value);
                    if (view?.figure && !regionNames(view.figure).includes(untrack(addRegion))) setAddRegion('');
                  }}
                >
                  <For each={views()}>
                    {(view) => (
                      <option value={view.name} selected={view.name === addView()}>
                        {view.label || view.name}
                      </option>
                    )}
                  </For>
                </select>
              </label>
            </Show>
            <Show when={addViewModel()?.figure}>
              {(figure) => (
                <label class="ip-add__field ip-add__field--grow">
                  <span>Region</span>
                  <select
                    class="sj-input ip-select"
                    ref={(el) => {
                      regionSelect = el;
                    }}
                    onChange={(event) => setAddRegion(event.currentTarget.value)}
                  >
                    <option value="" selected={!addRegion()}>
                      Choose a region…
                    </option>
                    <RegionOptions figure={figure()} selected={addRegion()} />
                  </select>
                </label>
              )}
            </Show>
            <button
              type="button"
              class="sj-btn sj-btn--default sj-btn--sm ip-add__button"
              disabled={atLimit()}
              ref={(el) => {
                addButton = el;
              }}
              onClick={addFromControl}
            >
              <Icon name="plus" size={14} />
              Add pin
            </button>
          </div>
        </Show>
        <Show when={!readOnly() && atLimit()}>
          <div class="sj-note sj-note--warning">
            <Icon name="info" size={14} />
            <span>{limitText()}</span>
          </div>
        </Show>

        <Show
          when={pins().length}
          fallback={<p class="ip-empty">{readOnly() ? 'No pins.' : `No pins yet. Click the ${isBody() ? 'figure where the injury is' : 'image'} to add one.`}</p>}
        >
          <ol class="ip-list" aria-label="Pins">
            <For each={pins()} keyed={(pin) => pin.id}>
              {(pin, index) => {
                const color = () => kindColor(kinds(), pin().kind);
                const content = () => (
                  <>
                    <span class="ip-num" style={{ '--ip-pin': color(), '--ip-pin-text': readableText(color()) }} aria-hidden="true">
                      {index() + 1}
                    </span>
                    <span class="ip-item__text">
                      <span class="ip-item__line">
                        <span class="ip-item__region">{pin().region || 'No region'}</span>
                        <Show when={viewLabel(pin().view)}>
                          <span class="ip-item__view">{viewLabel(pin().view)}</span>
                        </Show>
                        <Show when={pin().kind}>
                          <span class="ip-item__kind" style={{ '--ip-kind': color() }}>
                            {pin().kind}
                          </span>
                        </Show>
                      </span>
                      <Show when={pin().note}>
                        <span class="ip-item__note">{pin().note}</span>
                      </Show>
                    </span>
                  </>
                );
                return (
                  <li>
                    <Show when={!readOnly()} fallback={<div class="ip-item ip-item--static">{content()}</div>}>
                      <button
                        type="button"
                        class={['ip-item', selectedId() === pin().id && 'ip-item--selected']}
                        aria-label={`${describePin(pin(), index() + 1, viewLabel(pin().view))}${pin().note ? `. ${pin().note}` : ''}. Edit`}
                        onClick={() => select(untrack(pin).id)}
                      >
                        {content()}
                      </button>
                    </Show>
                  </li>
                );
              }}
            </For>
          </ol>
        </Show>

        <Show when={undo()}>
          {(removed) => (
            <div class="sj-note ip-undo">
              <Icon name="trash" size={14} />
              <span>
                Pin {removed().index + 1}
                {removed().pin.region ? ` (${removed().pin.region})` : ''} removed.
              </span>
              <button type="button" class="ip-link" onClick={undoRemove}>
                Undo
              </button>
            </div>
          )}
        </Show>

        <div class="sj-visually-hidden" role="status" aria-live="polite">
          {announcement()}
        </div>

        <Popover
          open={!!selectedPin() && !readOnly()}
          anchor={() => pinButtons.get(selectedId() ?? anchorId ?? '')}
          onDismiss={() => select(undefined)}
          label={selectedPin() ? `Pin ${numberOf(selectedPin()!.id)}` : 'Pin'}
          minWidth={280}
        >
          <Show when={selectedPin()}>{(pin) => <Editor pin={pin()} />}</Show>
        </Popover>
      </div>
    </FieldShell>
  );
}
