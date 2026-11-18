import { createMemo, createSignal, flush, For, onCleanup, Show, untrack } from 'solid-js';
import {
  approvalStatus,
  Avatar,
  Button,
  canDecide,
  cloneJson,
  createFieldBinding,
  currentUser,
  EmptyAvatar,
  FieldShell,
  getPath,
  getService,
  Icon,
  jsonEqual,
  RelatedPicker,
  RelativeTime,
  uid,
  type ApprovalChain as Chain,
  type ApprovalPerson,
  type BaseDefinition,
  type ElementProps,
  type FieldBinding,
  type FormbirdElementProps,
  type RelatedDoc,
  type RelatedPickerDefinition,
} from '@solidjs-components/kit';

export interface ApprovalChainDefinition extends BaseDefinition {
  /** What is being approved, in the texts ("Save the request to send your decision"). Default "request". */
  noun?: string;
  /** Elasticsearch request for the people a step can be delegated to. Default: active accounts. */
  people?: string | Record<string, unknown>;
  /** Offer delegation to the current step's approvers. Default true. */
  allowDelegate?: boolean;
  /** A rejection needs a comment. Default true. */
  commentOnReject?: boolean;
  /** Button texts. Default "Approve" and "Reject". */
  approveLabel?: string;
  rejectLabel?: string;
  /** Shown while the chain has no steps. Default "Approvers are chosen when the <noun> is saved." */
  emptyText?: string;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<ApprovalChainDefinition, unknown>>;

/** What fieldtec-web broadcasts after saving documents. */
const DOCUMENT_UPDATED = 'document:updated';
/** Used when the definition has no `people` filter. */
const ACTIVE_ACCOUNTS = {
  sort: [{ 'systemHeader.summaryName': 'asc' }],
  query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'account' } }], must_not: [{ term: { inactiveBool: true } }] } },
};

const asChain = (raw: unknown): Chain => {
  const steps = raw && typeof raw === 'object' && Array.isArray((raw as Chain).steps) ? (raw as Chain).steps : [];
  return { steps: steps.filter((s) => s && typeof s === 'object' && typeof s.id === 'string') };
};
const person = (p: { documentId: string; name: string }): ApprovalPerson => ({ documentId: p.documentId, name: p.name });
const names = (people: ApprovalPerson[]) => {
  const list = people.map((p) => p.name).filter(Boolean);
  return list.length <= 2 ? list.join(' or ') : `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}`;
};

type StepState = 'approved' | 'rejected' | 'current' | 'waiting' | 'skipped';

/**
 * `<solid-approval-chain>`: who must approve this record, in order. The app's rules plan the steps
 * (a line manager, a second approver when a rule asks for one) and check every change against the
 * saved version; this element shows where the chain stands, lets the person whose turn it is approve
 * or reject with a comment, or hand the step to someone else, and keeps the decisions on the record.
 * Decisions are sent when the record is saved.
 * @param props - Formbird element properties
 */
export function ApprovalChain(props: Props) {
  const field = createFieldBinding<Chain, ApprovalChainDefinition>(props, { parse: asChain });
  const def = field.definition;
  const labelId = uid('label');
  const commentId = uid('comment');
  const documentId = untrack(() => String(props.document?.documentId ?? ''));
  const me = currentUser();

  // What was last saved: decisions made since then can be undone here.
  const [baseline, setBaseline] = createSignal<Chain>(cloneJson(untrack(field.value)));
  let listening = false;
  const updates = getService('BroadcastService')
    ?.on?.<unknown>(DOCUMENT_UPDATED)
    .subscribe((data) => {
      if (!listening) return;
      const docs = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];
      const self = docs.find((doc) => doc && doc.documentId === documentId);
      if (self) setBaseline(asChain(getPath(self, field.fieldName)));
    });
  queueMicrotask(() => (listening = true));
  onCleanup(() => updates?.unsubscribe());

  const noun = () => def().noun || 'request';
  const chain = field.value;
  const status = createMemo(() => approvalStatus(chain()));
  const mayDecide = createMemo(() => !field.disabled() && !!me && canDecide(chain(), me.documentId));
  const current = createMemo(() => (status().current > -1 ? chain().steps[status().current] : undefined));
  const isApproverOfCurrent = createMemo(() => !!me && !!current()?.approvers?.some((p) => p.documentId === me.documentId));
  const unsaved = createMemo(() => !jsonEqual(chain(), baseline()));
  /** Decisions this person made since the last save. */
  const myNewDecision = createMemo(() => {
    const before = baseline().steps;
    return chain().steps.find((step) => step.decision && step.decidedBy?.documentId === me?.documentId && !before.find((b) => b.id === step.id)?.decision);
  });

  const stateOf = (index: number): StepState => {
    const step = chain().steps[index];
    if (step.decision === 'approved') return 'approved';
    if (step.decision === 'rejected') return 'rejected';
    if (status().state === 'rejected') return 'skipped';
    return index === status().current ? 'current' : 'waiting';
  };

  // ------------------------------------------------------------------ deciding
  const [comment, setComment] = createSignal('');
  const [problem, setProblem] = createSignal('');
  const [announcement, setAnnouncement] = createSignal('');
  let commentBox: HTMLTextAreaElement | undefined;

  const decide = (decision: 'approved' | 'rejected') => {
    if (!me || !untrack(mayDecide)) return;
    const text = untrack(comment).trim();
    if (decision === 'rejected' && untrack(def).commentOnReject !== false && !text) {
      setProblem('Say why you are rejecting it.');
      flush();
      commentBox?.focus();
      return;
    }
    const next = cloneJson(untrack(chain));
    const step = next.steps[untrack(status).current];
    step.decision = decision;
    step.decidedBy = person(me);
    step.decidedAt = new Date().toISOString();
    step.comment = text;
    field.setValue(next);
    setComment('');
    setProblem('');
    setAnnouncement(`${decision === 'approved' ? 'Approved' : 'Rejected'}. Save the ${untrack(noun)} to send your decision.`);
  };
  const undo = () => {
    field.setValue(cloneJson(untrack(baseline)));
    setAnnouncement('Decision undone.');
  };

  // ------------------------------------------------------------------ delegating
  const [delegating, setDelegating] = createSignal(false);
  const [delegateTo, setDelegateTo] = createSignal<RelatedDoc[]>([]);
  const delegateField: FieldBinding<RelatedDoc[], RelatedPickerDefinition> = {
    fieldName: 'delegate',
    controlName: uid('delegate'),
    definition: () => ({ label: 'Hand it to', singleSelection: true, filter: def().people, showDropDown: false, relatedFields: { email: 'email' } }),
    value: delegateTo,
    setValue: (next) => setDelegateTo(next),
    setOtherField: () => undefined,
    disabled: () => false,
    mandatory: () => true,
    label: () => 'Hand it to',
    errors: () => [],
    templateContext: () => field.templateContext(),
  };
  const delegate = () => {
    const to = untrack(delegateTo)[0];
    if (!me || !to) return;
    const next = cloneJson(untrack(chain));
    const step = next.steps[untrack(status).current];
    if (step.approvers.some((p) => p.documentId === to.documentId)) {
      setProblem(`${to.name} already approves this step.`);
      return;
    }
    step.delegate = person(to);
    step.delegatedBy = person(me);
    step.delegatedAt = new Date().toISOString();
    field.setValue(next);
    setDelegating(false);
    setDelegateTo([]);
    setProblem('');
    setAnnouncement(`Handed to ${to.name}. Save the ${untrack(noun)} to send it.`);
  };
  const takeBack = () => {
    const next = cloneJson(untrack(chain));
    const step = next.steps[untrack(status).current];
    step.delegate = null;
    step.delegatedBy = null;
    step.delegatedAt = null;
    field.setValue(next);
  };

  const headline = () => {
    const s = status();
    if (s.state === 'none') return { tone: 'neutral', icon: 'info' as const, text: def().emptyText || `Approvers are chosen when the ${noun()} is saved.` };
    if (s.state === 'approved') return { tone: 'good', icon: 'check' as const, text: s.total === 1 ? 'Approved' : `Approved by all ${s.total} approvers` };
    if (s.state === 'rejected') {
      const step = chain().steps.find((x) => x.decision === 'rejected');
      return { tone: 'bad', icon: 'x' as const, text: `Rejected${step?.decidedBy ? ` by ${step.decidedBy.name}` : ''}` };
    }
    if (mayDecide()) return { tone: 'warn', icon: 'clock' as const, text: 'Waiting for your decision' };
    return { tone: 'warn', icon: 'clock' as const, text: `Waiting for ${names(s.waitingOn) || 'an approver'}` };
  };

  return (
    <FieldShell label={field.label()} labelId={labelId} hideLabel={def().hideLabel} mandatory={field.mandatory()} errors={field.errors()}>
      <section class="ac" aria-labelledby={def().hideLabel ? undefined : labelId} aria-label={def().hideLabel ? 'Approval' : undefined}>
        <div class={['ac-head', `ac-head--${headline().tone}`]}>
          <span class="ac-head__icon" aria-hidden="true">
            <Icon name={headline().icon} size={14} strokeWidth={2} />
          </span>
          <span class="ac-head__text">{headline().text}</span>
          <Show when={status().total > 1}>
            <span class="ac-head__count">
              {status().approved} of {status().total} approved
            </span>
          </Show>
        </div>

        <Show when={chain().steps.length}>
          <ol class="ac-steps" aria-label="Approval steps">
            <For each={chain().steps} keyed={(step) => step.id}>
              {(step, index) => {
                const state = () => stateOf(index());
                return (
                  <li class={['ac-step', `ac-step--${state()}`]} aria-current={state() === 'current' ? 'step' : undefined}>
                    <span class="ac-marker" aria-hidden="true">
                      <Show when={state() === 'approved'}>
                        <Icon name="check" size={12} strokeWidth={2.4} />
                      </Show>
                      <Show when={state() === 'rejected'}>
                        <Icon name="x" size={12} strokeWidth={2.4} />
                      </Show>
                      <Show when={state() === 'current' || state() === 'waiting' || state() === 'skipped'}>
                        <span class="ac-marker__number">{index() + 1}</span>
                      </Show>
                    </span>
                    <div class="ac-step__body">
                      <div class="ac-step__title">
                        <span class="ac-step__label">{step().label}</span>
                        <span class={['ac-badge', `ac-badge--${state()}`]}>
                          {state() === 'approved' ? 'Approved' : state() === 'rejected' ? 'Rejected' : state() === 'current' ? 'Waiting' : state() === 'skipped' ? 'Not needed' : 'Next'}
                        </span>
                      </div>
                      <Show when={step().reason}>
                        <p class="ac-step__reason">{step().reason}</p>
                      </Show>
                      <Show
                        when={step().decision && step().decidedBy}
                        fallback={
                          <div class="ac-people">
                            <Show when={step().approvers.length} fallback={<span class="ac-person ac-person--none"><EmptyAvatar size="sm" /> Nobody yet</span>}>
                              <For each={step().approvers}>
                                {(p) => (
                                  <span class={['ac-person', { 'ac-person--me': p.documentId === me?.documentId }]}>
                                    <Avatar name={p.name} size="sm" />
                                    <span>{p.documentId === me?.documentId ? `${p.name} (you)` : p.name}</span>
                                  </span>
                                )}
                              </For>
                            </Show>
                            <Show when={step().delegate}>
                              {(d) => (
                                <span class="ac-person ac-person--delegate" title={step().delegatedBy ? `Handed over by ${step().delegatedBy!.name}` : undefined}>
                                  <Icon name="chevron-right" size={12} class="ac-delegate-arrow" />
                                  <Avatar name={d().name} size="sm" />
                                  <span>
                                    {d().documentId === me?.documentId ? `${d().name} (you)` : d().name}
                                    <span class="ac-muted"> · handed over{step().delegatedBy ? ` by ${step().delegatedBy!.name.split(' ')[0]}` : ''}</span>
                                  </span>
                                </span>
                              )}
                            </Show>
                          </div>
                        }
                      >
                        <div class="ac-decision">
                          <Avatar name={step().decidedBy!.name} size="sm" />
                          <span>
                            {step().decision === 'approved' ? 'Approved' : 'Rejected'} by <strong>{step().decidedBy!.name}</strong>
                            <Show when={step().decidedAt}>
                              {' · '}
                              <RelativeTime value={step().decidedAt} class="ac-muted" />
                            </Show>
                            <Show when={myNewDecision()?.id === step().id}>
                              <span class="ac-unsaved"> · not saved yet</span>
                            </Show>
                          </span>
                        </div>
                        <Show when={step().comment}>
                          <blockquote class="ac-comment">{step().comment}</blockquote>
                        </Show>
                      </Show>
                    </div>
                  </li>
                );
              }}
            </For>
          </ol>
        </Show>

        <Show when={myNewDecision()}>
          <div class="sj-note ac-saved-note" role="status">
            <Icon name="info" size={14} />
            <span>
              Save the {noun()} to send your decision.{' '}
              <button type="button" class="ac-link" onClick={undo}>
                Undo
              </button>
            </span>
          </div>
        </Show>

        <Show when={mayDecide() && current()}>
          {(step) => (
            <div class="ac-action" role="group" aria-label={`Your decision: ${step().label}`}>
              <div class="ac-action__head">
                <strong>Your decision</strong>
                <span class="ac-muted">
                  {step().label}
                  {status().total > 1 ? ` · step ${status().current + 1} of ${status().total}` : ''}
                </span>
              </div>
              <label class="sj-visually-hidden" for={commentId}>
                Comment
              </label>
              <textarea
                ref={commentBox}
                id={commentId}
                class="sj-input ac-comment-box"
                rows={2}
                placeholder={def().commentOnReject === false ? 'Comment (optional)' : 'Comment (needed to reject)'}
                value={comment()}
                aria-invalid={problem() ? 'true' : undefined}
                onInput={(event) => {
                  setComment(event.currentTarget.value);
                  if (problem()) setProblem('');
                }}
              />
              <Show when={problem()}>
                <p class="ac-problem" role="alert">
                  {problem()}
                </p>
              </Show>
              <div class="ac-action__buttons">
                <Button variant="primary" size="sm" icon="check" class="ac-approve" onClick={() => decide('approved')}>
                  {def().approveLabel || 'Approve'}
                </Button>
                <Button size="sm" icon="x" class="ac-reject" onClick={() => decide('rejected')}>
                  {def().rejectLabel || 'Reject'}
                </Button>
                <span class="ac-spacer" />
                <Show when={def().allowDelegate !== false && isApproverOfCurrent()}>
                  <Show
                    when={!step().delegate}
                    fallback={
                      <Button size="sm" variant="subtle" onClick={takeBack}>
                        Take it back from {step().delegate!.name.split(' ')[0]}
                      </Button>
                    }
                  >
                    <Button size="sm" variant="subtle" icon="user" aria-expanded={delegating() ? 'true' : 'false'} onClick={() => setDelegating((v) => !v)}>
                      Hand to someone else
                    </Button>
                  </Show>
                </Show>
              </div>
              <Show when={delegating()}>
                <div class="ac-delegate">
                  <RelatedPicker
                    field={delegateField}
                    labelId={uid('delegate-label')}
                    noun="person"
                    searchPlaceholder="Search people"
                    emptyLabel="Choose someone"
                    emptyLeading={() => <EmptyAvatar />}
                    leading={(entry, size) => <Avatar name={entry.name} size={size === 'sm' ? 'sm' : 'md'} />}
                    describe={(option) => {
                      const email = getPath(option.source, 'email');
                      return typeof email === 'string' ? email : undefined;
                    }}
                    defaultFilter={ACTIVE_ACCOUNTS}
                    include={['email']}
                  />
                  <p class="ac-muted ac-delegate__hint">They can then approve or reject this step for you. You can take it back while it is waiting.</p>
                  <div class="ac-action__buttons">
                    <Button size="sm" variant="primary" disabled={!delegateTo().length} onClick={delegate}>
                      Hand it over
                    </Button>
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={() => {
                        setDelegating(false);
                        setDelegateTo([]);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </Show>
            </div>
          )}
        </Show>

        <Show when={unsaved() && !myNewDecision()}>
          <p class="ac-muted ac-pending">Changes to the approval are sent when the {noun()} is saved.</p>
        </Show>
        <div class="sj-visually-hidden" role="status" aria-live="polite">
          {announcement()}
        </div>
      </section>
    </FieldShell>
  );
}

