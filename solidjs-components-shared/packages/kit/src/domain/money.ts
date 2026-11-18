// Lines of costs and their totals: a work order's parts and labour (fleet), a purchase request's
// goods, services and freight (procurement). Shared by <solid-line-items> and the apps' rulesets,
// which carry lineTotals as source text (functionsLib), so it must stay self-contained.

/** One line, as <solid-line-items> stores it. */
export interface LineItem {
  id: string;
  /** The line's kind: "part", "labour" and "other" on a work order; any names a definition lists. */
  kind: string;
  description: string;
  /** For lines picked from a catalogue (materials, supplier items): `[{ documentId, name, partNo }]`. */
  materialRel?: { documentId: string; name: string; partNo?: string }[];
  qty: number | null;
  /** "ea", "L", "h"… */
  unit?: string;
  unitCost: number | null;
}

/** Totals of a list of lines. */
export interface LineTotals {
  /** Amount per kind. */
  byKind: Record<string, number>;
  /** Quantity per kind (hours of labour). */
  qtyByKind: Record<string, number>;
  /** A work order's kinds, kept by name: parts, labour (and its hours) and other. */
  parts: number;
  labour: number;
  other: number;
  labourHours: number;
  subtotal: number;
  tax: number;
  total: number;
}

/**
 * Totals per kind, the subtotal, tax and total, each rounded to cents.
 * @param lines - The lines
 * @param taxRate - Tax on the subtotal (default 0.1, Australian GST)
 * @returns Totals
 */
export function lineTotals(lines: LineItem[] | null | undefined, taxRate = 0.1): LineTotals {
  const round = (value: number) => Math.round(value * 100) / 100;
  const byKind: Record<string, number> = {};
  const qtyByKind: Record<string, number> = {};
  let sum = 0;
  for (const line of Array.isArray(lines) ? lines : []) {
    if (!line) continue;
    const kind = String(line.kind || 'other');
    const qty = Number(line.qty) || 0;
    const amount = qty * (Number(line.unitCost) || 0);
    byKind[kind] = (byKind[kind] || 0) + amount;
    qtyByKind[kind] = (qtyByKind[kind] || 0) + qty;
    sum += amount;
  }
  for (const kind of Object.keys(byKind)) {
    byKind[kind] = round(byKind[kind]);
    qtyByKind[kind] = round(qtyByKind[kind]);
  }
  const subtotal = round(sum);
  const tax = round(subtotal * (Number(taxRate) || 0));
  const named = (kind: string) => byKind[kind] || 0;
  const knownOther = Object.keys(byKind).filter((k) => k !== 'part' && k !== 'labour').reduce((s, k) => s + byKind[k], 0);
  return {
    byKind,
    qtyByKind,
    parts: named('part'),
    labour: named('labour'),
    other: round(knownOther),
    labourHours: qtyByKind.labour || 0,
    subtotal,
    tax,
    total: round(subtotal + tax),
  };
}
