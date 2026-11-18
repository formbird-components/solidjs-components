// Preventive maintenance: when the next service falls due, and how close an asset is to it.
// Shared by the elements and the fleet rulesets (see booking.ts for the rules on this folder).

/** A service just done, and the plan it follows. */
export interface ServiceDoneInput {
  /** When the service was done. */
  serviceDate: string | number | Date;
  /** Meter reading at the service (km or hours). */
  serviceMeter?: number | null;
  /** When it was due, if a due date was set. */
  dueDate?: string | number | Date | null;
  /** Meter reading it was due at, if set. */
  dueMeter?: number | null;
  /** Plan interval in weeks (0 or empty: no time interval). */
  intervalWeeks?: number | null;
  /** Plan interval on the meter (0 or empty: no meter interval). */
  intervalMeter?: number | null;
}

/**
 * The next due date and meter after a service, as Formbird FLEET adjusts them: a service done
 * late is due again one interval after it was *scheduled* (the schedule doesn't drift), a service
 * done early or on time is due one interval after it was *done*.
 * @param input - The service and the plan
 * @returns ISO due date and/or due meter (absent when the plan has no such interval)
 */
export function nextServiceDue(input: ServiceDoneInput): { dueDate?: string; dueMeter?: number } {
  const result: { dueDate?: string; dueMeter?: number } = {};
  const weeks = Number(input.intervalWeeks) || 0;
  const meterInterval = Number(input.intervalMeter) || 0;
  const done = new Date(input.serviceDate).getTime();
  if (weeks && !Number.isNaN(done)) {
    const scheduled = input.dueDate ? new Date(input.dueDate).getTime() : NaN;
    const base = !Number.isNaN(scheduled) && done > scheduled ? scheduled : done;
    result.dueDate = new Date(base + weeks * 7 * 86_400_000).toISOString();
  }
  const meter = Number(input.serviceMeter);
  if (meterInterval && Number.isFinite(meter) && input.serviceMeter !== null && input.serviceMeter !== undefined) {
    const scheduledMeter = Number(input.dueMeter);
    const late = Number.isFinite(scheduledMeter) && input.dueMeter !== null && input.dueMeter !== undefined && meter > scheduledMeter;
    result.dueMeter = Math.round((late ? scheduledMeter : meter) + meterInterval);
  }
  return result;
}

/** Where an asset stands against its next service. */
export interface ServiceStateInput {
  dueDate?: string | number | Date | null;
  dueMeter?: number | null;
  /** Current meter reading. */
  meter?: number | null;
  /** Reference time (default now). */
  now?: number;
  /** "Due soon" this many weeks before the due date (default 4). */
  leadWeeks?: number | null;
  /** "Due soon" this far before the due meter (default 1,000). */
  leadMeter?: number | null;
}

/**
 * "Overdue", "Due Soon" or "Not Due" (the Asset Warnings levels), whichever threshold, date or
 * meter, is reached first. Empty when there is nothing to compare.
 * @param input - Due values, current meter and lead
 * @returns The warning level
 */
export function serviceWarning(input: ServiceStateInput): 'Overdue' | 'Due Soon' | 'Not Due' | '' {
  const now = input.now ?? Date.now();
  const dueTime = input.dueDate ? new Date(input.dueDate).getTime() : NaN;
  const dueMeter = input.dueMeter === null || input.dueMeter === undefined ? NaN : Number(input.dueMeter);
  const meter = input.meter === null || input.meter === undefined ? NaN : Number(input.meter);
  const hasDate = !Number.isNaN(dueTime);
  const hasMeter = Number.isFinite(dueMeter) && Number.isFinite(meter);
  if (!hasDate && !hasMeter) return '';
  const leadMs = (input.leadWeeks ?? 4) * 7 * 86_400_000;
  const leadMeter = input.leadMeter ?? 1000;
  if ((hasDate && now >= dueTime) || (hasMeter && meter >= dueMeter)) return 'Overdue';
  if ((hasDate && now >= dueTime - leadMs) || (hasMeter && meter >= dueMeter - leadMeter)) return 'Due Soon';
  return 'Not Due';
}

/**
 * How far until the next service, for display: the remaining meter and days (negative = overdue).
 * @param input - Due values, current meter and reference time
 * @returns Remaining meter and whole days, when known
 */
export function serviceRemaining(input: ServiceStateInput): { meter?: number; days?: number } {
  const now = input.now ?? Date.now();
  const result: { meter?: number; days?: number } = {};
  if (input.dueMeter !== null && input.dueMeter !== undefined && input.meter !== null && input.meter !== undefined) {
    result.meter = Math.round(Number(input.dueMeter) - Number(input.meter));
  }
  if (input.dueDate) {
    const due = new Date(input.dueDate).getTime();
    if (!Number.isNaN(due)) result.days = Math.floor((due - now) / 86_400_000);
  }
  return result;
}
