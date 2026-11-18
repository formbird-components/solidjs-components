// Work order costs: parts and labour lines and their totals.
// Shared by <solid-line-items> and the fleet rulesets (see booking.ts for the rules on this folder).

/** One line on a work order, as <solid-line-items> stores it. */
export interface LineItem {
  id: string;
  kind: 'part' | 'labour' | 'other';
  description: string;
  /** For parts picked from the materials list: `[{ documentId, name, partNo }]`. */
  materialRel?: { documentId: string; name: string; partNo?: string }[];
  qty: number | null;
  /** "ea", "L", "h"… */
  unit?: string;
  unitCost: number | null;
}

/** Totals of a work order's lines. */
export interface LineTotals {
  parts: number;
  labour: number;
  other: number;
  subtotal: number;
  tax: number;
  total: number;
  /** Labour hours (quantity of labour lines). */
  labourHours: number;
}

/**
 * Totals by kind, tax and grand total, each rounded to cents.
 * @param lines - Work order lines
 * @param taxRate - Tax on the subtotal (default 0.1, Australian GST)
 * @returns Totals
 */
export function lineTotals(lines: LineItem[] | null | undefined, taxRate = 0.1): LineTotals {
  const round = (value: number) => Math.round(value * 100) / 100;
  const totals = { parts: 0, labour: 0, other: 0, labourHours: 0 };
  for (const line of Array.isArray(lines) ? lines : []) {
    const qty = Number(line.qty) || 0;
    const amount = qty * (Number(line.unitCost) || 0);
    if (line.kind === 'part') totals.parts += amount;
    else if (line.kind === 'labour') {
      totals.labour += amount;
      totals.labourHours += qty;
    } else totals.other += amount;
  }
  const subtotal = round(totals.parts + totals.labour + totals.other);
  const tax = round(subtotal * taxRate);
  return {
    parts: round(totals.parts),
    labour: round(totals.labour),
    other: round(totals.other),
    subtotal,
    tax,
    total: round(subtotal + tax),
    labourHours: Math.round(totals.labourHours * 100) / 100,
  };
}
