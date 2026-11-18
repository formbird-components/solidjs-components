import { createMemo, For, Show, untrack, type Accessor } from 'solid-js';
import {
  Button,
  createDocumentField,
  createFieldBinding,
  dueText,
  daysUntil,
  formatNumber,
  getPath,
  Icon,
  LookupIcon,
  Lozenge,
  relativeTime,
  statusAppearance,
  toRelatedList,
  uid,
  type BaseDefinition,
  type ElementProps,
  type FormbirdElementProps,
  type RelatedDoc,
  runAction,
  type RecordAction,
} from '@solidjs-components/kit';
import { serviceRemaining, serviceWarning } from '../../../packages/fleet-kit/src/logic/service';

/** Which fields of the asset the summary reads (defaults are the fleet demo's names). */
export interface AssetSummaryFields {
  id: string;
  make: string;
  model: string;
  year: string;
  registration: string;
  type: string;
  status: string;
  hireStatus: string;
  meter: string;
  unit: string;
  meterDate: string;
  serviceDueDate: string;
  serviceDueMeter: string;
  regDue: string;
  responsible: string;
  location: string;
  /** The service plan, whose `leadWeeks` / `leadMeter` say when a service is "Due Soon". */
  servicePlan: string;
}

export interface AssetSummaryDefinition extends BaseDefinition {
  /** Paths on the asset for what the header shows (ID, make, model, registration, meter, service due…), over the fleet defaults. */
  fields?: Partial<AssetSummaryFields>;
  /** Quick actions; `{ "$asset": { … } }` in `values` puts this asset on the new document (see RecordAction). */
  actions?: RecordAction[];
  /** "Due soon" this many weeks before a due date, when the service plan doesn't say (default 4). */
  leadWeeks?: number;
  /** "Due soon" this far before the due meter, when the service plan doesn't say (default 1,000). */
  leadMeter?: number;
}

type Props = ElementProps<FormbirdElementProps<AssetSummaryDefinition, unknown>>;

const DEFAULT_FIELDS: AssetSummaryFields = {
  id: 'assetId',
  make: 'make',
  model: 'model',
  year: 'yearNum',
  registration: 'registration',
  type: 'assetTypeRel',
  status: 'assetStatusRel',
  hireStatus: 'hireStatusRel',
  meter: 'meterReadingNum',
  unit: 'primaryMeterUnit',
  meterDate: 'meterReadingDate',
  serviceDueDate: 'serviceDueDate',
  serviceDueMeter: 'serviceDueMeterNum',
  regDue: 'regDueDate',
  responsible: 'responsiblePersonRel',
  location: 'locationRel',
  servicePlan: 'servicePlanRel',
};

const WARNING_TONE: Record<string, string> = { Overdue: 'var(--sj-danger)', 'Due Soon': 'var(--sj-warning)', 'Not Due': 'var(--sj-success)' };

/**
 * `<solid-asset-summary>`: an asset at a glance, at the top of its form. Display only; it follows
 * the asset's fields as they change, so a ruleset's updates show straight away.
 * @param props - Formbird element properties
 */
export function AssetSummary(props: Props) {
  const field = createFieldBinding<unknown, AssetSummaryDefinition>(props);
  const def = field.definition;
  const labelId = uid('label');
  const names = untrack(() => ({ ...DEFAULT_FIELDS, ...def().fields }));
  const value = (name: keyof AssetSummaryFields): Accessor<unknown> => createDocumentField(props, names[name]);
  const related = (name: keyof AssetSummaryFields): Accessor<RelatedDoc[]> => createDocumentField(props, names[name], toRelatedList);

  const id = value('id');
  const make = value('make');
  const model = value('model');
  const year = value('year');
  const registration = value('registration');
  const type = related('type');
  const status = related('status');
  const hireStatus = related('hireStatus');
  const meter = value('meter');
  const unitValue = value('unit');
  const meterDate = value('meterDate');
  const serviceDueDate = value('serviceDueDate');
  const serviceDueMeter = value('serviceDueMeter');
  const regDue = value('regDue');
  const responsible = related('responsible');
  const location = related('location');
  const servicePlan = related('servicePlan');

  const unit = () => (unitValue() === 'hours' ? 'hours' : 'km');
  const meterNumber = () => (meter() === null || meter() === undefined || meter() === '' ? null : Number(meter()));
  const dueMeterNumber = () => (serviceDueMeter() === null || serviceDueMeter() === undefined || serviceDueMeter() === '' ? null : Number(serviceDueMeter()));
  // The plan's own leads, as the rules use when they store the asset's service warning.
  const planLead = (key: 'leadWeeks' | 'leadMeter') => {
    const lead = (servicePlan()[0] as Record<string, unknown> | undefined)?.[key];
    return lead === null || lead === undefined || lead === '' || Number.isNaN(Number(lead)) ? undefined : Number(lead);
  };
  const service = createMemo(() => {
    const input = {
      dueDate: serviceDueDate() as string | undefined,
      dueMeter: dueMeterNumber(),
      meter: meterNumber(),
      leadWeeks: planLead('leadWeeks') ?? def().leadWeeks,
      leadMeter: planLead('leadMeter') ?? def().leadMeter,
    };
    return { level: serviceWarning(input), remaining: serviceRemaining(input) };
  });
  const serviceText = () => {
    const { remaining } = service();
    const parts: string[] = [];
    if (remaining.meter !== undefined) {
      parts.push(remaining.meter >= 0 ? `${formatNumber(remaining.meter, 0)} ${unit()}` : `${formatNumber(-remaining.meter, 0)} ${unit()} over`);
    }
    if (serviceDueDate()) parts.push(dueText(serviceDueDate()));
    return parts.join(' or ');
  };
  const regDays = () => daysUntil(regDue());

  const lozenge = (entry: RelatedDoc | undefined) => {
    if (!entry) return undefined;
    const { color } = statusAppearance(entry.name, {}, entry as unknown as Record<string, unknown>);
    return { name: entry.name, color };
  };

  const title = () => [make(), model()].filter(Boolean).join(' ');
  const iconKind = () => (getPath(type()[0], 'iconKind') as string | undefined) || undefined;

  // The asset's current values, for the related value quick actions put on the new document.
  const followed: Record<string, Accessor<unknown>> = {
    [names.id]: id, [names.make]: make, [names.model]: model, [names.registration]: registration, [names.type]: type,
    [names.meter]: meter, [names.unit]: unitValue, [names.location]: location, [names.responsible]: responsible,
  };
  const currentValue = (path: string): unknown => {
    const live = followed[path] ? untrack(followed[path]) : undefined;
    return live === undefined || live === '' ? getPath(props.document, path) : live;
  };

  const run = (action: RecordAction) => {
    const documentId = props.document?.documentId;
    if (!documentId) return;
    runAction(action, { documentId, name: [id(), title(), registration()].filter(Boolean).join(' · '), get: currentValue });
  };

  const isNew = () => !id() && !title();

  return (
    <section class="as sj-card" aria-labelledby={labelId}>
      <div class="as-main">
        <div class="as-icon">
          <Show when={type()[0]} fallback={<span class="as-icon__empty" />}>
            {(t) => <LookupIcon set="asset" name={t().name} override={iconKind() ? { icon: iconKind() } : undefined} title={t().name} />}
          </Show>
        </div>
        <div class="as-heading">
          <h1 class="as-title" id={labelId}>
            <Show when={!isNew()} fallback={<span class="as-new">New asset</span>}>
              <span class="as-id">{String(id() ?? '')}</span> <span class="as-name">{title()}</span>
              <Show when={year()}>
                {' '}
                <span class="as-year">{String(year())}</span>
              </Show>
            </Show>
          </h1>
          <div class="as-tags">
            <Show when={registration()}>
              <span class="as-plate" title="Registration">
                {String(registration())}
              </span>
            </Show>
            <Show when={type()[0]}>{(t) => <span class="as-tag">{t().name}</span>}</Show>
            <Show when={location()[0]}>
              {(l) => (
                <span class="as-tag">
                  <Icon name="map-pin" size={12} /> {l().name}
                </span>
              )}
            </Show>
            <Show when={responsible()[0]}>
              {(r) => (
                <span class="as-tag">
                  <Icon name="user" size={12} /> {r().name}
                </span>
              )}
            </Show>
          </div>
        </div>
        <div class="as-status">
          <Show when={lozenge(status()[0])}>{(s) => <Lozenge color={s().color}>{s().name}</Lozenge>}</Show>
          <Show when={lozenge(hireStatus()[0])}>
            {(s) => (
              <Lozenge color={s().color} dot>
                {s().name}
              </Lozenge>
            )}
          </Show>
        </div>
      </div>

      <div class="as-facts">
        <div class="as-fact">
          <span class="as-fact__label">
            <Icon name="gauge" size={13} /> Meter
          </span>
          <span class="as-fact__value">{meterNumber() === null ? '—' : `${formatNumber(meterNumber(), 0)} ${unit()}`}</span>
          <Show when={meterDate()}>
            <span class="as-fact__hint">{relativeTime(meterDate())}</span>
          </Show>
        </div>
        <div class="as-fact as-fact--service">
          <span class="as-fact__label">
            <Icon name="wrench" size={13} /> Next service
          </span>
          <Show when={service().level} fallback={<span class="as-fact__value as-muted">No schedule</span>}>
            <span class="as-fact__value" style={{ color: WARNING_TONE[service().level] }}>
              {service().level === 'Overdue' ? 'Overdue' : serviceText()}
            </span>
            <span class="as-fact__hint">
              {service().level === 'Overdue' ? serviceText() : service().level}
              <Show when={dueMeterNumber() !== null}> · at {formatNumber(dueMeterNumber(), 0)} {unit()}</Show>
            </span>
          </Show>
        </div>
        <div class="as-fact">
          <span class="as-fact__label">
            <Icon name="calendar" size={13} /> Registration
          </span>
          <Show when={regDue()} fallback={<span class="as-fact__value as-muted">Not registered</span>}>
            <span
              class="as-fact__value"
              style={{ color: (regDays() ?? 99) < 0 ? 'var(--sj-danger)' : (regDays() ?? 99) <= 30 ? 'var(--sj-warning)' : undefined }}
            >
              {(regDays() ?? 99) < 0 ? 'Expired' : `Due ${dueText(regDue())}`}
            </span>
          </Show>
        </div>
      </div>

      <Show when={(def().actions ?? []).length && props.document?.documentId && !isNew()}>
        <div class="as-actions">
          <For each={def().actions}>
            {(action) => (
              <Button size="sm" variant={action.primary ? 'primary' : 'default'} icon={action.icon} onClick={() => run(action)}>
                {action.label}
              </Button>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
