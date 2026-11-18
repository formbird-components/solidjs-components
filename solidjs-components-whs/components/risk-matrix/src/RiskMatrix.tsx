import { createMemo, createSignal, For, Show, untrack } from 'solid-js';
import {
  Button,
  createDocumentField,
  createFieldBinding,
  FieldShell,
  Icon,
  Lozenge,
  uid,
  type BaseDefinition,
  type ElementProps,
  type FieldBinding,
  type FormbirdElementProps,
} from '@solidjs-components/kit';
import {
  CONSEQUENCES,
  LIKELIHOODS,
  parseRisk,
  RATING_COLORS,
  residualProblem,
  responseSummary,
  riskValue,
  type CellPosition,
  type RiskCell,
} from '../../../packages/whs-kit/src/index';
import { Heatmap } from './Heatmap';
import { MatrixGrid } from './MatrixGrid';

export interface RiskMatrixDefinition extends BaseDefinition {
  /** "assess" (default): rate this field's risk. "heatmap": count records per cell (a page element). Read once. */
  mode?: 'assess' | 'heatmap';
  /** Assess: another risk field of this document, shown as a ghost marker (e.g. "inherentRisk" on the residual risk). Read once. */
  compareField?: string;
  /** Assess: what the ghost marker is. Default "Before controls". */
  compareLabel?: string;
  /** Assess: show what the rating asks for (due dates, investigation, who is told). Default true. */
  showResponse?: boolean;
  /** Heatmap: path of the risk value in each record (e.g. "residualRisk"). */
  riskField?: string;
  /** Heatmap: what a record is called in the cell lists. Default "systemHeader.summaryName". */
  titleField?: string;
  /** Heatmap: most records counted. Default 500. */
  limit?: number;
  /** Heatmap: what the records are ("hazard"), for counts. Default "record". */
  noun?: string;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<RiskMatrixDefinition, unknown>>;
export type Binding = FieldBinding<RiskCell | null, RiskMatrixDefinition>;

const likelihoodOf = (level: number | undefined) => LIKELIHOODS.find((l) => l.level === level);
const consequenceOf = (level: number | undefined) => CONSEQUENCES.find((c) => c.level === level);
const levelsText = (cell: CellPosition) => `${likelihoodOf(cell.likelihood)?.name} × ${consequenceOf(cell.consequence)?.name}`;

/**
 * `<solid-risk-matrix>`: a likelihood × consequence matrix. Assess mode rates the field's risk;
 * heatmap mode (a page element) counts records per cell.
 * @param props - Formbird element properties
 */
export function RiskMatrix(props: Props) {
  const field = createFieldBinding<RiskCell | null, RiskMatrixDefinition>(props, { parse: parseRisk });
  return (
    <Show when={untrack(() => field.definition().mode) === 'heatmap'} fallback={<Assess field={field} props={props} />}>
      <Heatmap field={field} />
    </Show>
  );
}

/** Rates a risk: the grid, two selects, the result and what it asks for. */
function Assess(componentProps: { field: Binding; props: Props }) {
  const field = componentProps.field;
  const def = field.definition;
  const labelId = uid('label');
  const likelihoodHintId = uid('lhint');
  const consequenceHintId = uid('chint');
  const compareName = untrack(() => def().compareField);
  const compare = compareName ? createDocumentField(componentProps.props, compareName, parseRisk) : () => null;

  // One level chosen in a select but not the other yet: kept here until both are known.
  const [draft, setDraft] = createSignal<Partial<CellPosition>>({});
  const [hover, setHover] = createSignal<CellPosition | null>(null);
  const [focused, setFocused] = createSignal<CellPosition | null>(null);

  const value = () => field.value();
  const editable = () => !field.disabled();
  const compareLabel = () => def().compareLabel || 'Before controls';
  const chosen = (axis: keyof CellPosition) => value()?.[axis] ?? draft()[axis];

  const write = (next: RiskCell | null) => {
    setDraft({});
    field.setValue(next);
  };
  const pick = (cell: CellPosition) => {
    if (editable()) write(riskValue(cell.likelihood, cell.consequence));
  };
  const choose = (axis: keyof CellPosition, level: number) => {
    const next = { likelihood: chosen('likelihood'), consequence: chosen('consequence'), [axis]: level };
    const complete = riskValue(next.likelihood, next.consequence);
    if (complete) write(complete);
    else setDraft(next);
  };
  const canClear = () => editable() && !field.mandatory() && (!!value() || draft().likelihood !== undefined || draft().consequence !== undefined);

  const problem = createMemo(() => residualProblem(compare(), value()));
  const hintCell = () => hover() ?? focused() ?? value();

  const cellLabel = (cell: CellPosition, rating: string) => {
    const before = compare();
    const ghost = before && before.likelihood === cell.likelihood && before.consequence === cell.consequence ? `; ${compareLabel()}` : '';
    return `${levelsText(cell)}: ${rating}, score ${cell.likelihood * cell.consequence}${ghost}`;
  };

  return (
    <FieldShell label={field.label()} labelId={labelId} mandatory={field.mandatory()} hideLabel={def().hideLabel} errors={field.errors()}>
      <div class={['rm', { 'rm--readonly': !editable() }]}>
        <MatrixGrid
          labelledBy={field.label() && !def().hideLabel ? labelId : undefined}
          label={field.label() || 'Risk matrix'}
          selected={value() ? { likelihood: value()!.likelihood, consequence: value()!.consequence } : null}
          interactive={editable()}
          draft={draft()}
          onPick={pick}
          onOtherKey={(event) => {
            if ((event.key === 'Delete' || event.key === 'Backspace') && canClear()) {
              event.preventDefault();
              write(null);
            }
          }}
          onHover={setHover}
          onFocusCell={setFocused}
          describeLevels
          arrow={compare() && value() ? { from: compare()!, to: value()! } : null}
          cellLabel={cellLabel}
          cellContent={(cell, rating) => {
            const isValue = () => value()?.likelihood === cell.likelihood && value()?.consequence === cell.consequence;
            const isBefore = () => compare()?.likelihood === cell.likelihood && compare()?.consequence === cell.consequence;
            return (
              <>
                <Show when={isBefore()}>
                  <span class="rm-ghost" title={compareLabel()} />
                </Show>
                <span class="rm-cell__rating">{rating}</span>
                <span class="rm-cell__score">{cell.likelihood * cell.consequence}</span>
                <Show when={isValue()}>
                  <span class="rm-cell__mark">
                    <Icon name="check" size={12} strokeWidth={2.4} />
                  </span>
                </Show>
              </>
            );
          }}
        />

        <p class="rm-hint" aria-hidden="true">
          <Show
            when={hintCell()}
            fallback={
              <span class="rm-hint__empty">
                {editable() ? 'Pick how likely it is (rows) and how bad it would be (columns).' : 'Not assessed.'}
              </span>
            }
          >
            {(cell) => (
              <>
                <strong>
                  {levelsText(cell())}: {riskValue(cell().likelihood, cell().consequence)?.rating} ({cell().likelihood * cell().consequence})
                </strong>
                <span>
                  {likelihoodOf(cell().likelihood)?.name}: {likelihoodOf(cell().likelihood)?.hint}
                </span>
                <span>
                  {consequenceOf(cell().consequence)?.name}: {consequenceOf(cell().consequence)?.hint}
                </span>
              </>
            )}
          </Show>
        </p>

        <Show when={editable()}>
          <div class="rm-controls">
            <label class="rm-select">
              <span class="rm-select__label">Likelihood</span>
              <select
                class="sj-input"
                aria-describedby={chosen('likelihood') ? likelihoodHintId : undefined}
                onChange={(event) => choose('likelihood', Number(event.currentTarget.value))}
              >
                <Show when={chosen('likelihood') === undefined}>
                  <option value="" selected disabled>
                    Choose…
                  </option>
                </Show>
                <For each={LIKELIHOODS}>
                  {(level) => (
                    <option value={level.level} selected={chosen('likelihood') === level.level}>
                      {level.level} · {level.name}
                    </option>
                  )}
                </For>
              </select>
              <span class="sj-visually-hidden" id={likelihoodHintId}>
                {likelihoodOf(chosen('likelihood'))?.hint}
              </span>
            </label>
            <label class="rm-select">
              <span class="rm-select__label">Consequence</span>
              <select
                class="sj-input"
                aria-describedby={chosen('consequence') ? consequenceHintId : undefined}
                onChange={(event) => choose('consequence', Number(event.currentTarget.value))}
              >
                <Show when={chosen('consequence') === undefined}>
                  <option value="" selected disabled>
                    Choose…
                  </option>
                </Show>
                <For each={CONSEQUENCES}>
                  {(level) => (
                    <option value={level.level} selected={chosen('consequence') === level.level}>
                      {level.level} · {level.name}
                    </option>
                  )}
                </For>
              </select>
              <span class="sj-visually-hidden" id={consequenceHintId}>
                {consequenceOf(chosen('consequence'))?.hint}
              </span>
            </label>
            <Show when={canClear()}>
              <Button class="rm-clear" size="sm" variant="subtle" icon="x" onClick={() => write(null)}>
                Clear
              </Button>
            </Show>
          </div>
        </Show>

        <div class="rm-result" role="status">
          <Show when={value()} fallback={<span class="sj-placeholder">{editable() ? 'Not rated yet' : 'Not assessed'}</span>}>
            {(risk) => (
              <>
                <div class="rm-result__line">
                  <Lozenge color={RATING_COLORS[risk().rating]} dot>
                    {risk().rating}
                  </Lozenge>
                  <span class="rm-result__score">Score {risk().score}</span>
                  <span class="rm-result__levels">{levelsText(risk())}</span>
                </div>
                <Show when={def().showResponse !== false}>
                  <p class="rm-response">{responseSummary(risk().rating)}</p>
                </Show>
              </>
            )}
          </Show>
        </div>

        <Show when={compare()}>
          {(before) => (
            <p class="rm-compare">
              <span class="rm-compare__key" aria-hidden="true" />
              <span>
                {compareLabel()}: {levelsText(before())} · {before().rating} {before().score}
              </span>
            </p>
          )}
        </Show>
        <Show when={problem()}>
          <div class="sj-note sj-note--warning rm-problem" role="alert">
            <Icon name="alert" size={14} />
            <span>{problem()}</span>
          </div>
        </Show>
      </div>
    </FieldShell>
  );
}
