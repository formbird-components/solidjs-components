import { describe, expect, it } from 'vitest';
import { lineTotals } from '../src/domain/money';

describe('lineTotals', () => {
  it('totals a work order: parts, labour (and its hours), other, GST', () => {
    const totals = lineTotals([
      { id: '1', kind: 'part', description: 'Oil filter', qty: 2, unitCost: 18.5 },
      { id: '2', kind: 'part', description: 'Engine oil', qty: 6.5, unitCost: 8 },
      { id: '3', kind: 'labour', description: 'Labour', qty: 1.5, unitCost: 120 },
      { id: '4', kind: 'other', description: 'Disposal', qty: 1, unitCost: 8 },
    ]);
    expect(totals).toMatchObject({ parts: 89, labour: 180, other: 8, subtotal: 277, tax: 27.7, total: 304.7, labourHours: 1.5 });
    expect(lineTotals(null).total).toBe(0);
  });

  it('totals any kinds a definition lists, per kind', () => {
    const totals = lineTotals(
      [
        { id: '1', kind: 'goods', description: 'Hi-vis vests', qty: 40, unitCost: 12.95 },
        { id: '2', kind: 'service', description: 'Embroidery', qty: 40, unitCost: 4 },
        { id: '3', kind: 'freight', description: 'Delivery', qty: 1, unitCost: 35 },
        { id: '4', kind: 'goods', description: 'Bad line', qty: null, unitCost: 10 },
      ],
      0.1,
    );
    expect(totals.byKind).toEqual({ goods: 518, service: 160, freight: 35 });
    expect(totals.qtyByKind.goods).toBe(40);
    expect([totals.subtotal, totals.tax, totals.total]).toEqual([713, 71.3, 784.3]);
    expect(totals.other).toBe(713);
    expect(lineTotals([{ id: '1', kind: 'goods', description: '', qty: 3, unitCost: 0.1 }], 0).total).toBe(0.3);
  });

  it('is self-contained, so a ruleset can carry its source', () => {
    // eslint-disable-next-line no-new-func
    const copy = new Function(`return (${String(lineTotals)})`)();
    expect(copy([{ id: '1', kind: 'labour', qty: 2, unitCost: 100 }]).labourHours).toBe(2);
  });
});
