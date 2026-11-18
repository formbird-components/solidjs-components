// What <solid-skills-matrix> needs: each person's certificate of each type (the latest), what each
// cell shows, and how compliant a person, a type and everyone are. Element-only.

import { certState } from './logic/certs';

/** A certificate as the matrix reads it. */
export interface HeldCert {
  documentId: string;
  personId: string;
  typeId: string;
  expiryDate: string;
  issuedDate: string;
}

/** What one cell shows. */
export type CellKind = 'valid' | 'expiring' | 'expired' | 'missing' | 'held' | 'empty';

export interface MatrixCell {
  kind: CellKind;
  /** Required by the person's position. */
  required: boolean;
  cert?: HeldCert;
  daysLeft: number | null;
}

/**
 * The latest certificate of each type for each person (by expiry, then issue date): a renewal
 * replaces the old one in the matrix.
 * @param certs - Certificates
 * @returns personId → typeId → certificate
 */
export function latestCerts(certs: HeldCert[]): Map<string, Map<string, HeldCert>> {
  const map = new Map<string, Map<string, HeldCert>>();
  const later = (a: HeldCert, b: HeldCert) => (a.expiryDate || '9999') > (b.expiryDate || '9999') || ((a.expiryDate || '9999') === (b.expiryDate || '9999') && a.issuedDate > b.issuedDate);
  for (const cert of certs) {
    if (!cert.personId || !cert.typeId) continue;
    const byType = map.get(cert.personId) ?? new Map<string, HeldCert>();
    const current = byType.get(cert.typeId);
    if (!current || later(cert, current)) byType.set(cert.typeId, cert);
    map.set(cert.personId, byType);
  }
  return map;
}

/**
 * What a cell shows: for a required type, valid, expiring, expired or missing; for another type, the
 * certificate held (its state if it lapses) or nothing.
 * @param cert - The person's latest certificate of the type
 * @param required - Whether their position requires it
 * @param now - Now (ms)
 * @param warnDays - Days ahead that count as expiring
 * @returns The cell
 */
export function matrixCell(cert: HeldCert | undefined, required: boolean, now: number, warnDays = 30): MatrixCell {
  if (!cert) return { kind: required ? 'missing' : 'empty', required, daysLeft: null };
  const state = certState(cert.expiryDate, now, warnDays);
  const kind: CellKind = state.state === 'none' ? (required ? 'valid' : 'held') : state.state === 'valid' && !required ? 'held' : state.state;
  return { kind, required, cert, daysLeft: state.daysLeft };
}

/** How compliant a set of cells is: required ones held in date. */
export interface Compliance {
  required: number;
  ok: number;
  expiring: number;
  expired: number;
  missing: number;
  /** 0–100, or null when nothing is required. */
  percent: number | null;
}

/**
 * Sums up cells: a required certificate that is valid or expiring counts as held.
 * @param cells - Cells of a person, a type or everyone
 * @returns Counts and the percentage held
 */
export function compliance(cells: MatrixCell[]): Compliance {
  const c: Compliance = { required: 0, ok: 0, expiring: 0, expired: 0, missing: 0, percent: null };
  for (const cell of cells) {
    if (cell.kind === 'expiring') c.expiring++;
    if (cell.kind === 'expired') c.expired++;
    if (!cell.required) continue;
    c.required++;
    if (cell.kind === 'valid' || cell.kind === 'expiring') c.ok++;
    if (cell.kind === 'missing') c.missing++;
  }
  c.percent = c.required ? Math.round((c.ok / c.required) * 100) : null;
  return c;
}

/** A short name for a column header: the type's own `short`, else initials of long names ("Working with Children Check" → "WWCC"). */
export function shortName(name: string, short?: unknown): string {
  if (typeof short === 'string' && short.trim()) return short.trim();
  if (name.length <= 12) return name;
  return name
    .split(/[\s/-]+/)
    .filter((w) => w && /[A-Za-z]/.test(w[0]))
    .map((w) => w[0].toUpperCase())
    .join('');
}
