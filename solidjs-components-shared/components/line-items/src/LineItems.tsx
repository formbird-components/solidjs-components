import { createMemo, createSignal, For, Show } from 'solid-js';
import {
  Button,
  createFieldBinding,
  createSearchOptions,
  FieldShell,
  formatMoney,
  formatNumber,
  getPath,
  Icon,
  IconButton,
  nextEntryId,
  parseFilter,
  PickerPanel,
  Popover,
  uid,
  withTextSearch,
  type BaseDefinition,
  type ElementProps,
  type FormbirdElementProps,
  lineTotals,
  type LineItem,
  type PickerItem,
} from '@solidjs-components/kit';

/** A kind of line: a work order's part, labour and other; a purchase's goods, services, freight. */
export interface LineKind {
  value: string;
  /** In the Type column. */
  label: string;
  /** Its row in the totals ("Parts"). Default: the label. */
  total?: string;
  /** Show its total even when it is zero (default: only when it isn't). */
  alwaysTotal?: boolean;
  /** Unit of a new line ("h"); hours are shown in the total when it is "h". Default "ea". */
  unit?: string;
  /** Unit cost a new line starts at. */
  rate?: number;
  /** Text of the button that adds an empty line of this kind ("Add labour"). Without it, no button. */
  add?: string;
  /** The button is subtle rather than outlined. */
  subtle?: boolean;
}

export interface LineItemsDefinition extends BaseDefinition {
  /** ISO currency (default AUD). */
  currency?: string;
  /** Tax on the subtotal (default 0.1). */
  taxRate?: number;
  /** Default "GST". */
  taxLabel?: string;
  /** Hourly rate new labour lines start at (default: none, the cost is left to fill in). Work order kinds only. */
  labourRate?: number;
  /** The kinds of line. Default: a work order's part, labour and other. */
  kinds?: LineKind[];
  /** A catalogue to pick lines from (materials, supplier items): any related-document filter. */
  materialFilter?: string | Record<string, unknown>;
  /** Fields on catalogue documents (defaults: partNo, unitCost, unit, qtyAvailable). */
  materialFields?: { partNo?: string; unitCost?: string; unit?: string; stock?: string };
  /** The kind a picked catalogue line gets (default "part"), and the pick button's text (default "Add part"). */
  catalogKind?: string;
  /** Text of the button that picks from the catalogue (default "Add part"). */
  catalogLabel?: string;
  /** What the catalogue holds, in its search ("parts"; "items"). */
  catalogNoun?: string;
  /** Column heading of the unit cost (default "Unit cost"). */
  costLabel?: string;
  /** Shown while there are no lines (default "No parts or labour yet."). */
  emptyText?: string;
  /** Under the totals while editing (default "Totals are stored with the work order when it is saved."). */
  noteText?: string;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<LineItemsDefinition, unknown>>;

interface Material {
  documentId: string;
  name: string;
  partNo: string;
  unitCost: number | null;
  unit: string;
  stock: number | null;
}

/** A work order's kinds: the default. */
const WORK_ORDER_KINDS: LineKind[] = [
  { value: 'part', label: 'Part', total: 'Parts', alwaysTotal: true },
  { value: 'labour', label: 'Labour', alwaysTotal: true, unit: 'h', add: 'Add labour' },
  { value: 'other', label: 'Other', add: 'Other', subtle: true },
];

const parseLines = (raw: unknown): LineItem[] => (Array.isArray(raw) ? (raw as LineItem[]).filter((l) => l && typeof l.id === 'string') : []);
const num = (text: string): number | null => {
  const cleaned = text.replace(/[,\s$]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

/**
 * `<solid-line-items>`: costs, line by line: a work order's parts and labour, a purchase's goods,
 * services and freight. Lines can come from a catalogue with their part number and unit cost; totals
 * use the kit's lineTotals, the same function the apps' rulesets run on save.
 * @param props - Formbird element properties
 */
export function LineItems(props: Props) {
  const field = createFieldBinding<LineItem[], LineItemsDefinition>(props, { parse: parseLines });
  const def = field.definition;
  const labelId = uid('label');
  const [picking, setPicking] = createSignal(false);
  let addPartButton: HTMLButtonElement | undefined;

  const lines = () => field.value();
  const kinds = createMemo<LineKind[]>(() => {
    const listed = (def().kinds ?? []).filter((k) => k && typeof k.value === 'string' && k.value);
    if (listed.length) return listed;
    return WORK_ORDER_KINDS.map((k) => (k.value === 'labour' ? { ...k, rate: def().labourRate } : k));
  });
  const kindOf = (value: string) => kinds().find((k) => k.value === value);
  const catalogKind = () => def().catalogKind ?? 'part';
  const currency = () => def().currency ?? 'AUD';
  const totals = createMemo(() => lineTotals(lines(), def().taxRate ?? 0.1));
  const money = (value: number | null | undefined) => formatMoney(value ?? 0, currency());

  const fields = () => ({ partNo: 'partNo', unitCost: 'unitCost', unit: 'unit', stock: 'qtyAvailable', ...def().materialFields });
  const materials = createSearchOptions<Material>({
    request: (query) => {
      const request = parseFilter(def().materialFilter, field.templateContext());
      if (!request) return undefined;
      const f = fields();
      return {
        request: withTextSearch(request, query),
        text: query,
        pageSize: 30,
        include: ['documentId', 'systemHeader.summaryName', f.partNo, f.unitCost, f.unit, f.stock],
      };
    },
    map: (doc) => {
      const f = fields();
      const value = (path: string) => getPath(doc, path);
      const toNum = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
      return {
        documentId: String(doc.documentId),
        name: String(getPath(doc, 'systemHeader.summaryName') ?? ''),
        partNo: String(value(f.partNo) ?? ''),
        unitCost: toNum(value(f.unitCost)),
        unit: String(value(f.unit) ?? 'ea'),
        stock: toNum(value(f.stock)),
      };
    },
  });

  const write = (next: LineItem[]) => field.setValue(next);
  const update = (id: string, patch: Partial<LineItem>) => write(lines().map((line) => (line.id === id ? { ...line, ...patch } : line)));
  const remove = (id: string) => write(lines().filter((line) => line.id !== id));
  const add = (line: Omit<LineItem, 'id'>) => write([...lines(), { id: nextEntryId(), ...line }]);

  const addMaterial = (material: Material) => {
    const existing = lines().find((line) => line.materialRel?.[0]?.documentId === material.documentId);
    if (existing) update(existing.id, { qty: (Number(existing.qty) || 0) + 1 });
    else
      add({
        kind: catalogKind(),
        description: material.name,
        materialRel: [{ documentId: material.documentId, name: material.name, partNo: material.partNo }],
        qty: 1,
        unit: material.unit,
        unitCost: material.unitCost,
      });
    setPicking(false);
  };

  const materialItems = createMemo<PickerItem[]>(() =>
    materials.items().map((material) => ({
      key: material.documentId,
      label: material.name,
      description: [
        material.partNo,
        material.unitCost !== null ? `${money(material.unitCost)} / ${material.unit}` : '',
        material.stock !== null ? `${formatNumber(material.stock, 0)} in stock` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      onSelect: () => addMaterial(material),
    })),
  );

  const openPicker = () => {
    setPicking(true);
    materials.setQuery('');
    void materials.load();
  };

  return (
    <FieldShell label={field.label()} labelId={labelId} mandatory={field.mandatory()} hideLabel={def().hideLabel} errors={field.errors()}>
      <div class="li" role="group" aria-labelledby={labelId}>
        <div class="li-scroll">
          <table class="li-table">
            <thead>
              <tr>
                <th scope="col" class="li-kind">
                  Type
                </th>
                <th scope="col">Description</th>
                <th scope="col" class="li-num">
                  Qty
                </th>
                <th scope="col" class="li-num">
                  {def().costLabel ?? 'Unit cost'}
                </th>
                <th scope="col" class="li-num">
                  Amount
                </th>
                <Show when={!field.disabled()}>
                  <th scope="col" class="li-actions">
                    <span class="sj-visually-hidden">Remove</span>
                  </th>
                </Show>
              </tr>
            </thead>
            <tbody>
              <Show
                when={lines().length}
                fallback={
                  <tr>
                    <td colspan={6} class="li-empty">
                      {def().emptyText ?? 'No parts or labour yet.'}
                    </td>
                  </tr>
                }
              >
                <For each={lines()}>
                  {(line) => (
                    <tr class={`li-row li-row--${line.kind}`}>
                      <td class="li-kind">
                        <Show when={!field.disabled()} fallback={<span class="li-tag">{kindOf(line.kind)?.label ?? line.kind}</span>}>
                          <select
                            class="sj-input li-select"
                            aria-label="Line type"
                            value={line.kind}
                            onChange={(event) => update(line.id, { kind: event.currentTarget.value })}
                          >
                            <Show when={!kindOf(line.kind)}>
                              <option value={line.kind}>{line.kind}</option>
                            </Show>
                            <For each={kinds()}>{(kind) => <option value={kind.value}>{kind.label}</option>}</For>
                          </select>
                        </Show>
                      </td>
                      <td>
                        <Show when={!field.disabled()} fallback={<span>{line.description}</span>}>
                          <input
                            class="sj-input"
                            aria-label="Description"
                            value={line.description}
                            onChange={(event) => update(line.id, { description: event.currentTarget.value })}
                          />
                        </Show>
                        <Show when={line.materialRel?.[0]?.partNo}>
                          <span class="li-part">{line.materialRel![0].partNo}</span>
                        </Show>
                      </td>
                      <td class="li-num">
                        <Show when={!field.disabled()} fallback={<span>{formatNumber(line.qty, 2)} {line.unit}</span>}>
                          <div class="li-qty">
                            <input
                              class="sj-input"
                              inputmode="decimal"
                              aria-label="Quantity"
                              value={line.qty === null ? '' : String(line.qty)}
                              onChange={(event) => update(line.id, { qty: num(event.currentTarget.value) })}
                            />
                            <span class="li-unit">{line.unit ?? kindOf(line.kind)?.unit ?? 'ea'}</span>
                          </div>
                        </Show>
                      </td>
                      <td class="li-num">
                        <Show when={!field.disabled()} fallback={<span>{money(line.unitCost)}</span>}>
                          <input
                            class="sj-input"
                            inputmode="decimal"
                            aria-label="Unit cost"
                            value={line.unitCost === null ? '' : String(line.unitCost)}
                            onChange={(event) => update(line.id, { unitCost: num(event.currentTarget.value) })}
                          />
                        </Show>
                      </td>
                      <td class="li-num li-amount">{money((Number(line.qty) || 0) * (Number(line.unitCost) || 0))}</td>
                      <Show when={!field.disabled()}>
                        <td class="li-actions">
                          <IconButton icon="trash" size="sm" label={`Remove ${line.description || 'line'}`} onClick={() => remove(line.id)} />
                        </td>
                      </Show>
                    </tr>
                  )}
                </For>
              </Show>
            </tbody>
          </table>
        </div>

        <div class="li-foot">
          <Show when={!field.disabled()}>
            <div class="li-add">
              <Show when={def().materialFilter}>
                <Button ref={addPartButton} size="sm" icon="plus" aria-haspopup="listbox" aria-expanded={picking() ? 'true' : 'false'} onClick={openPicker}>
                  {def().catalogLabel ?? 'Add part'}
                </Button>
              </Show>
              <For each={kinds().filter((k) => k.add)}>
                {(kind) => (
                  <Button
                    size="sm"
                    variant={kind.subtle ? 'subtle' : 'default'}
                    icon="plus"
                    onClick={() => add({ kind: kind.value, description: kind.value === 'labour' ? 'Labour' : '', qty: 1, unit: kind.unit ?? 'ea', unitCost: kind.rate ?? null })}
                  >
                    {kind.add}
                  </Button>
                )}
              </For>
            </div>
          </Show>
          <dl class="li-totals">
            <For each={kinds().filter((k) => k.alwaysTotal || totals().byKind[k.value])}>
              {(kind) => (
                <div>
                  <dt>
                    {kind.total ?? kind.label}
                    {kind.unit === 'h' && totals().qtyByKind[kind.value] ? ` (${formatNumber(totals().qtyByKind[kind.value], 2)} h)` : ''}
                  </dt>
                  <dd>{money(totals().byKind[kind.value] ?? 0)}</dd>
                </div>
              )}
            </For>
            <Show when={Object.keys(totals().byKind).some((k) => !kindOf(k))}>
              <div>
                <dt>Other</dt>
                <dd>{money(Object.entries(totals().byKind).filter(([k]) => !kindOf(k)).reduce((sum, [, v]) => sum + v, 0))}</dd>
              </div>
            </Show>
            <Show when={kinds().length > 1 || totals().tax}>
              <div class="li-subtotal">
                <dt>Subtotal</dt>
                <dd>{money(totals().subtotal)}</dd>
              </div>
            </Show>
            <div>
              <dt>{def().taxLabel ?? 'GST'}</dt>
              <dd>{money(totals().tax)}</dd>
            </div>
            <div class="li-total">
              <dt>Total</dt>
              <dd>{money(totals().total)}</dd>
            </div>
          </dl>
        </div>

        <Popover open={picking()} anchor={() => addPartButton} onDismiss={() => setPicking(false)} minWidth={320} label={def().catalogLabel ?? 'Materials'}>
          <PickerPanel
            label={def().catalogLabel ?? 'Materials'}
            items={materialItems()}
            searchable
            query={materials.query()}
            onQuery={materials.setQuery}
            searchPlaceholder={`Search ${def().catalogNoun ?? 'parts'}…`}
            loading={materials.loading()}
            emptyText={materials.error() ? `Couldn't load the ${def().catalogNoun ?? 'materials'}: ${materials.error()}` : materials.loaded() ? `No matching ${def().catalogNoun ?? 'parts'}` : 'Loading…'}
          />
        </Popover>
        <Show when={totals().total > 0 && !field.disabled()}>
          <p class="li-note">
            <Icon name="info" size={13} /> {def().noteText ?? 'Totals are stored with the work order when it is saved.'}
          </p>
        </Show>
      </div>
    </FieldShell>
  );
}
