import { createEffect, createMemo, createSignal, For, Show, untrack } from 'solid-js';
import {
  createDocumentField,
  createFieldBinding,
  fetchDocuments,
  FieldShell,
  formatNumber,
  getPath,
  Icon,
  relativeTime,
  toRelatedList,
  uid,
  type BaseDefinition,
  type ElementProps,
  type FormbirdElementProps,
  type SourceDocument,
} from '@solidjs-components/kit';
import { meterProblems } from '../../../packages/fleet-kit/src/logic/meter';

export interface MeterReadingDefinition extends BaseDefinition {
  /** Related field holding the asset (default "assetRel"); its current meter is loaded for comparison. */
  assetField?: string;
  /** Field on asset documents with the current reading (default "meterReadingNum"). */
  assetMeterField?: string;
  /** Field on asset documents with "km" or "hours" (default "primaryMeterUnit"). */
  assetUnitField?: string;
  /** Field on asset documents with when the reading was taken (default "meterReadingDate"). */
  assetMeterDateField?: string;
  /** Unit when the asset doesn't say: "km" (default) or "hours". */
  unit?: 'km' | 'hours';
  /** Another field of this document the reading must not be below (e.g. a booking's "startMeterNum"). */
  minimumField?: string;
  /** Largest believable increase over the asset's meter (flags typos); 0 = no check. */
  maxIncrease?: number;
  placeholder?: string;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<MeterReadingDefinition, unknown>>;

const toNumber = (raw: unknown): number | null => {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

/**
 * `<solid-meter-reading>`: a meter reading with the asset's current meter beside it. A reading below
 * the asset's meter (or the start reading) is flagged the way Formbird FLEET flags it; the
 * rulesets keep such readings but don't update the asset from them.
 * @param props - Formbird element properties
 */
export function MeterReading(props: Props) {
  const field = createFieldBinding<number | null, MeterReadingDefinition>(props, { parse: toNumber });
  const def = field.definition;
  const labelId = uid('label');
  const inputId = uid('meter');
  const hintId = uid('hint');
  const asset = createDocumentField(props, untrack(() => def().assetField ?? 'assetRel'), toRelatedList);
  const minimum = createDocumentField(props, untrack(() => def().minimumField ?? ''), toNumber);
  const [assetDoc, setAssetDoc] = createSignal<SourceDocument>();

  const meterField = () => def().assetMeterField ?? 'meterReadingNum';
  const unitField = () => def().assetUnitField ?? 'primaryMeterUnit';
  const dateField = () => def().assetMeterDateField ?? 'meterReadingDate';

  createEffect(
    () => asset()[0]?.documentId,
    (assetId) => {
      setAssetDoc(undefined);
      if (!assetId) return;
      fetchDocuments([assetId], untrack(() => [meterField(), unitField(), dateField(), 'systemHeader.summaryName']))
        .then((docs) => setAssetDoc(() => docs[0]))
        .catch(() => undefined);
    },
  );

  const assetMeter = () => toNumber(assetDoc() && getPath(assetDoc(), meterField()));
  const unit = (): 'km' | 'hours' => {
    const fromAsset = getPath(assetDoc(), unitField());
    if (fromAsset === 'hours' || fromAsset === 'km') return fromAsset;
    return def().unit === 'hours' ? 'hours' : 'km';
  };
  const problems = createMemo(() =>
    meterProblems({ reading: field.value(), assetMeter: assetMeter(), minimum: minimum(), maxIncrease: def().maxIncrease, unit: unit() }),
  );
  const delta = () => {
    const reading = field.value();
    const base = minimum() ?? assetMeter();
    return reading !== null && base !== null && reading >= base ? reading - base : undefined;
  };

  const commit = (text: string) => {
    const cleaned = text.replace(/[,\s]/g, '');
    field.setValue(cleaned === '' ? null : toNumber(cleaned));
  };

  return (
    <FieldShell label={field.label()} labelId={labelId} mandatory={field.mandatory()} hideLabel={def().hideLabel} errors={field.errors()}>
      <div class="mr">
        <div class="sj-input-group">
          <input
            id={inputId}
            class="sj-input mr-input"
            inputmode="decimal"
            aria-labelledby={labelId}
            aria-describedby={hintId}
            aria-invalid={problems().length ? 'true' : undefined}
            placeholder={def().placeholder ?? (assetMeter() !== null ? formatNumber(assetMeter(), 0) : '')}
            value={field.value() === null ? '' : formatNumber(field.value(), 1)}
            disabled={field.disabled()}
            onChange={(event) => commit(event.currentTarget.value)}
          />
          <span class="sj-input-group__unit">{unit()}</span>
        </div>
        <div class="mr-hint" id={hintId}>
          <Show when={assetDoc()} fallback={<span>{asset()[0] ? 'Loading the asset’s meter…' : 'Choose the asset to compare with its meter.'}</span>}>
            <span class="mr-asset">
              <Icon name="gauge" size={13} />
              Asset meter {assetMeter() === null ? 'not recorded' : `${formatNumber(assetMeter(), 0)} ${unit()}`}
              <Show when={getPath(assetDoc(), dateField())}>{(date) => <span class="mr-when"> · {relativeTime(date())}</span>}</Show>
            </span>
            <Show when={delta() !== undefined && delta()! > 0}>
              <span class="mr-delta">
                +{formatNumber(delta(), 1)} {unit()}
              </span>
            </Show>
            <Show when={field.value() === null && assetMeter() !== null && !field.disabled()}>
              <button type="button" class="mr-use" onClick={() => field.setValue(assetMeter())}>
                Use {formatNumber(assetMeter(), 0)}
              </button>
            </Show>
          </Show>
        </div>
        <Show when={problems().length}>
          <div class="sj-note sj-note--warning" role="status">
            <Icon name="alert" size={14} />
            <div>
              <For each={problems()}>{(problem) => <div>{problem}</div>}</For>
            </div>
          </div>
        </Show>
      </div>
    </FieldShell>
  );
}
