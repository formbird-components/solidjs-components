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
  type PickerItem,
} from '@solidjs-components/kit';
import { lineTotals, type LineItem } from '../../../packages/fleet-kit/src/logic/money';

export interface LineItemsDefinition extends BaseDefinition {
  /** ISO currency (default AUD). */
  currency?: string;
  /** Tax on the subtotal (default 0.1). */
  taxRate?: number;
  /** Default "GST". */
  taxLabel?: string;
  /** Hourly rate new labour lines start at (default: none, the cost is left to fill in). */
  labourRate?: number;
  /** Materials to pick parts from (any related-document filter). */
  materialFilter?: string | Record<string, unknown>;
  /** Fields on material documents (defaults: partNo, unitCost, unit, qtyAvailable). */
  materialFields?: { partNo?: string; unitCost?: string; unit?: string; stock?: string };
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

const KINDS: { value: LineItem['kind']; label: string }[] = [
  { value: 'part', label: 'Part' },
  { value: 'labour', label: 'Labour' },
  { value: 'other', label: 'Other' },
];

const parseLines = (raw: unknown): LineItem[] => (Array.isArray(raw) ? (raw as LineItem[]).filter((l) => l && typeof l.id === 'string') : []);
const num = (text: string): number | null => {
  const cleaned = text.replace(/[,\s$]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

/**
 * `<solid-line-items>`: the cost of a job, line by line. Parts come from the materials list with
 * their part number and unit cost; totals use the same function as the work order ruleset, which
 * stores them on save.
 * @param props - Formbird element properties
 */
export function LineItems(props: Props) {
  const field = createFieldBinding<LineItem[], LineItemsDefinition>(props, { parse: parseLines });
  const def = field.definition;
  const labelId = uid('label');
  const [picking, setPicking] = createSignal(false);
  let addPartButton: HTMLButtonElement | undefined;

  const lines = () => field.value();
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
        kind: 'part',
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
                  Unit cost
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
                      No parts or labour yet.
                    </td>
                  </tr>
                }
              >
                <For each={lines()}>
                  {(line) => (
                    <tr class={`li-row li-row--${line.kind}`}>
                      <td class="li-kind">
                        <Show when={!field.disabled()} fallback={<span class="li-tag">{KINDS.find((k) => k.value === line.kind)?.label}</span>}>
                          <select
                            class="sj-input li-select"
                            aria-label="Line type"
                            value={line.kind}
                            onChange={(event) => update(line.id, { kind: event.currentTarget.value as LineItem['kind'] })}
                          >
                            <For each={KINDS}>{(kind) => <option value={kind.value}>{kind.label}</option>}</For>
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
                            <span class="li-unit">{line.unit ?? (line.kind === 'labour' ? 'h' : 'ea')}</span>
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
                  Add part
                </Button>
              </Show>
              <Button
                size="sm"
                icon="plus"
                onClick={() => add({ kind: 'labour', description: 'Labour', qty: 1, unit: 'h', unitCost: def().labourRate ?? null })}
              >
                Add labour
              </Button>
              <Button size="sm" variant="subtle" icon="plus" onClick={() => add({ kind: 'other', description: '', qty: 1, unit: 'ea', unitCost: null })}>
                Other
              </Button>
            </div>
          </Show>
          <dl class="li-totals">
            <div>
              <dt>Parts</dt>
              <dd>{money(totals().parts)}</dd>
            </div>
            <div>
              <dt>Labour{totals().labourHours ? ` (${formatNumber(totals().labourHours, 2)} h)` : ''}</dt>
              <dd>{money(totals().labour)}</dd>
            </div>
            <Show when={totals().other}>
              <div>
                <dt>Other</dt>
                <dd>{money(totals().other)}</dd>
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

        <Popover open={picking()} anchor={() => addPartButton} onDismiss={() => setPicking(false)} minWidth={320} label="Materials">
          <PickerPanel
            label="Materials"
            items={materialItems()}
            searchable
            query={materials.query()}
            onQuery={materials.setQuery}
            searchPlaceholder="Search parts…"
            loading={materials.loading()}
            emptyText={materials.error() ? `Couldn't load materials: ${materials.error()}` : materials.loaded() ? 'No matching parts' : 'Loading…'}
          />
        </Popover>
        <Show when={totals().total > 0 && !field.disabled()}>
          <p class="li-note">
            <Icon name="info" size={13} /> Totals are stored with the work order when it is saved.
          </p>
        </Show>
      </div>
    </FieldShell>
  );
}
