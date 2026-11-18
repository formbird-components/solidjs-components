// Meter readings (odometer km or engine hours) and fuel receipts: what to flag.
// Shared by <solid-meter-reading> and the fleet rulesets (see booking.ts for the rules on this folder).

/** A new reading against what is known about the asset. */
export interface MeterInput {
  reading: number | null | undefined;
  /** The asset's current meter. */
  assetMeter?: number | null;
  /** A reading this one must not be below (e.g. the booking's start meter). */
  minimum?: number | null;
  /** Largest believable increase since the asset's meter (e.g. a day's driving); 0 = no limit. */
  maxIncrease?: number | null;
  /** "km" or "hours". */
  unit?: string;
}

/**
 * Problems with a meter reading, in Formbird FLEET's words where it has them ("Primary Meter <
 * Asset Meter"). A flagged reading is kept but doesn't update the asset.
 * @param input - The reading and what it is checked against
 * @returns Messages (empty when fine)
 */
export function meterProblems(input: MeterInput): string[] {
  const problems: string[] = [];
  const reading = input.reading === null || input.reading === undefined || (input.reading as unknown) === '' ? NaN : Number(input.reading);
  if (Number.isNaN(reading)) return problems;
  const unit = input.unit === 'hours' ? 'hours' : 'km';
  if (reading < 0) problems.push('A meter reading cannot be negative.');
  const minimum = input.minimum === null || input.minimum === undefined ? NaN : Number(input.minimum);
  if (Number.isFinite(minimum) && reading < minimum) problems.push(`Lower than the start reading (${minimum.toLocaleString()} ${unit}).`);
  const asset = input.assetMeter === null || input.assetMeter === undefined ? NaN : Number(input.assetMeter);
  if (Number.isFinite(asset)) {
    if (reading < asset) problems.push(`Primary Meter < Asset Meter (${asset.toLocaleString()} ${unit}).`);
    const maxIncrease = Number(input.maxIncrease) || 0;
    if (maxIncrease && reading - asset > maxIncrease) problems.push(`More than ${maxIncrease.toLocaleString()} ${unit} above the asset meter: check the reading (Range Error).`);
  }
  return problems;
}

/** A fuel receipt against the asset's tank, range and previous fill. */
export interface FuelInput {
  litres: number | null | undefined;
  /** Meter at this fill. */
  meter?: number | null;
  /** Meter at the previous fill. */
  previousMeter?: number | null;
  tankCapacity?: number | null;
  /** Expected range on a tank in km (1,500 assumed when unknown, as FLEET's import does). */
  rangeKm?: number | null;
}

/**
 * Checks a fuel receipt the way FLEET's fuel import does, and works out consumption.
 * @param input - Litres, meters and the asset's tank
 * @returns Flags ("Tank Capacity Exceeded", "Expected Range Exceeded", "Meter Not Increasing") and L/100 km
 */
export function fuelCheck(input: FuelInput): { flags: string[]; distance?: number; litresPer100km?: number } {
  const flags: string[] = [];
  const litres = Number(input.litres) || 0;
  const tank = Number(input.tankCapacity) || 0;
  if (tank && litres > tank) flags.push('Tank Capacity Exceeded');
  const meter = input.meter === null || input.meter === undefined ? NaN : Number(input.meter);
  const previous = input.previousMeter === null || input.previousMeter === undefined ? NaN : Number(input.previousMeter);
  if (!Number.isFinite(meter) || !Number.isFinite(previous)) return { flags };
  const distance = meter - previous;
  if (distance <= 0) {
    flags.push('Meter Not Increasing');
    return { flags, distance };
  }
  const range = Number(input.rangeKm) || 1500;
  if (distance > range) flags.push('Expected Range Exceeded');
  return { flags, distance, litresPer100km: litres ? Math.round((litres / distance) * 1000) / 10 : undefined };
}
