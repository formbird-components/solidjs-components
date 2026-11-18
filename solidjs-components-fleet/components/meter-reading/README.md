# `<solid-meter-reading>`

An odometer (km) or engine-hours reading, shown next to the asset's current meter. The element loads
the asset the record points to and shows its meter, when it was read, and how much the new reading
adds. A **Use 48,210** button copies the asset's meter into an empty field. Readings that look wrong
are flagged, using Formbird FLEET's wording where FLEET has one ("Primary Meter < Asset Meter").

| Option | Default | |
|---|---|---|
| `assetField` | `"assetRel"` | Related-document field of this document holding the asset. Its first entry is used. |
| `assetMeterField` | `"meterReadingNum"` | Field on the asset with its current reading. |
| `assetUnitField` | `"primaryMeterUnit"` | Field on the asset with `"km"` or `"hours"`. |
| `assetMeterDateField` | `"meterReadingDate"` | Field on the asset with when the meter was read, shown as "3 days ago". |
| `unit` | `"km"` | Unit used when the asset gives neither `km` nor `hours`. |
| `minimumField` | none | Another field of this document that the reading must not be below, e.g. a booking's `"startMeterNum"`. |
| `maxIncrease` | `0` (no check) | Largest believable increase over the asset's meter. A bigger increase is flagged as a likely typo. |
| `placeholder` | the asset's meter | |
| `hideLabel` | `false` | |

`assetField` and `minimumField` are read once, when the element starts. The asset is loaded again
whenever a different asset is picked.

**Stored value.** A number, or `null` when empty. Commas and spaces typed in are dropped, and text
that isn't a number clears the field. The value is shown with thousands separators and at most one
decimal.

**Checks.** The element uses `meterProblems` from fleet-kit (`logic/meter.ts`) and shows the results
as a warning. It doesn't block saving. The checks are:
- the reading is negative;
- the reading is below `minimumField` ("Lower than the start reading");
- the reading is below the asset's meter ("Primary Meter < Asset Meter");
- the reading is more than `maxIncrease` above the asset's meter ("Range Error").

The increase is measured from `minimumField` when it is set, otherwise from the asset's meter.

The rulesets run the same `meterProblems`:
- `Fleet Daily Driver - PreSaveServer` checks `meterReadingNum` against the asset's current meter. It
  uses `maxIncrease: 2000`, written into the rule rather than read from the definition. A flagged
  reading is still saved, with `meterExcludedBool` and `meterExcludedReason` set, and the PostSave
  rule doesn't copy it to the asset.
- On bookings, `validateBooking` (the client PreSave rule and `Fleet Booking - PreSaveServer`)
  checks `endMeterNum` against `startMeterNum` when the booking is Closed, and refuses the save if
  there is a problem. It doesn't compare the reading with the asset's meter.

No rule runs `meterProblems` on fuel receipts or work orders. Fuel receipts are checked with
`fuelCheck` instead.

**Read-only.** When the field is disabled, the input is disabled and the **Use** button is hidden.

**Example** (booking, meter at the end of the hire):

```json
{
  "componentName": "solid-meter-reading",
  "name": "endMeterNum",
  "label": "Meter at end",
  "minimumField": "startMeterNum",
  "maxIncrease": 3000
}
```
