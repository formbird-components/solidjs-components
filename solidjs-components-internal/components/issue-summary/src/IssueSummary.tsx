import { createEffect, createSignal, flush, Show } from 'solid-js';
import {
  createFieldBinding,
  FieldShell,
  Icon,
  IconButton,
  uid,
  type BaseDefinition,
  type ElementProps,
  type FormbirdElementProps,
} from '@solidjs-components/kit';

export interface SummaryDefinition extends BaseDefinition {
  minLength?: number;
  maxLength?: number;
  /** Shown when the summary is empty. */
  placeholder?: string;
  /** aria-level of the title (default 1: it is the issue's main heading). */
  headingLevel?: number;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<SummaryDefinition, unknown>>;

/** Summaries are one line: newlines and repeated spaces collapse to single spaces. */
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * `<solid-issue-summary>`: the issue title, edited in place.
 * Click, Enter or F2 to edit; Enter saves, Escape cancels, leaving the editor saves when valid.
 * @param props - Formbird element properties
 */
export function IssueSummary(props: Props) {
  const field = createFieldBinding<string, SummaryDefinition>(props, {
    parse: (raw) => (typeof raw === 'string' ? raw : raw === undefined || raw === null ? '' : String(raw)),
  });
  const labelId = uid('label');
  const errorId = uid('error');
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal('');
  const [problem, setProblem] = createSignal<string>();
  let editor: HTMLTextAreaElement | undefined;
  let editButton: HTMLButtonElement | undefined;
  let draftText = '';
  // Synchronous twin of `editing()`: removing the focused textarea fires focusout during the
  // render that closes the editor, and that late focusout must not save the discarded draft.
  let isOpen = false;

  const def = () => field.definition();

  const autosize = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  };

  const startEditing = () => {
    if (field.disabled() || isOpen) return;
    isOpen = true;
    draftText = field.value();
    setDraft(draftText);
    setProblem(undefined);
    setEditing(true);
  };

  createEffect(
    () => editing(),
    (isEditing) => {
      if (!isEditing || !editor) return;
      autosize(editor);
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(editor.value.length, editor.value.length);
    },
  );

  const validate = (text: string): string | undefined => {
    const { minLength, maxLength } = def();
    if (field.mandatory() && !text) return `${field.label() || 'Summary'} is required`;
    if (minLength && text && text.length < minLength) return `Use at least ${minLength} characters`;
    if (maxLength && text.length > maxLength) return `Use at most ${maxLength} characters`;
    return undefined;
  };

  const finish = (restoreFocus: boolean) => {
    isOpen = false;
    setEditing(false);
    setProblem(undefined);
    if (!restoreFocus) return;
    flush(); // render the display (and its edit button) before moving focus to it
    editButton?.focus({ preventScroll: true });
  };

  /** Saves the draft; returns false (and keeps editing) when it is invalid. */
  const save = (restoreFocus: boolean): boolean => {
    const text = normalize(draftText);
    const error = validate(text);
    if (error) {
      setProblem(error);
      editor?.focus();
      return false;
    }
    if (text !== field.value()) field.setValue(text);
    finish(restoreFocus);
    return true;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      save(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finish(true);
    }
  };

  const onFocusOut = (event: FocusEvent) => {
    if (!isOpen) return;
    const next = event.relatedTarget as Node | null;
    if (next && (event.currentTarget as HTMLElement).contains(next)) return;
    // Leaving with an unchanged or valid draft saves; an invalid one is kept with its message.
    if (normalize(draftText) === field.value()) finish(false);
    else save(false);
  };

  const onDisplayKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'F2') {
      event.preventDefault();
      startEditing();
    }
  };

  return (
    <FieldShell
      label={field.label()}
      labelId={labelId}
      mandatory={field.mandatory()}
      hideLabel={def().hideLabel}
      errors={editing() ? [] : field.errors()}
    >
      <Show
        when={editing()}
        fallback={
          <div class={['is-display', field.disabled() && 'is-display--readonly']} onKeyDown={onDisplayKeyDown}>
            <div
              class={['is-title', !field.value() && 'is-title--empty']}
              role="heading"
              aria-level={def().headingLevel ?? 1}
              onClick={startEditing}
            >
              {field.value() || def().placeholder || (field.disabled() ? 'No summary' : 'Add a summary…')}
            </div>
            <Show when={!field.disabled()}>
              <button
                ref={editButton}
                type="button"
                class="sj-icon-btn is-edit"
                aria-label={`Edit ${(field.label() || 'summary').toLowerCase()}`}
                title="Edit (F2)"
                onClick={startEditing}
              >
                <Icon name="pencil" />
              </button>
            </Show>
          </div>
        }
      >
        <div class={['is-editor', problem() && 'is-editor--invalid']} onFocusOut={onFocusOut}>
          <textarea
            ref={editor}
            class="is-input"
            rows={1}
            value={draft()}
            maxlength={def().maxLength}
            aria-labelledby={field.label() && !def().hideLabel ? labelId : undefined}
            aria-label={field.label() && !def().hideLabel ? undefined : 'Summary'}
            aria-invalid={problem() ? 'true' : undefined}
            aria-describedby={problem() ? errorId : undefined}
            onInput={(event) => {
              draftText = event.currentTarget.value;
              setDraft(draftText);
              autosize(event.currentTarget);
              if (problem()) setProblem(undefined);
            }}
            onKeyDown={onKeyDown}
          />
          <div class="is-meta">
            <span id={errorId} class="is-problem" role="alert">
              <Show when={problem()}>
                <Icon name="alert" size={14} />
                {problem()}
              </Show>
            </span>
            <Show when={def().maxLength}>
              <span class={['is-count', draft().length > (def().maxLength ?? 0) * 0.9 && 'is-count--near']}>
                {draft().length}/{def().maxLength}
              </span>
            </Show>
            <div class="is-actions">
              <IconButton icon="check" label="Save" class="is-save" onClick={() => save(true)} />
              <IconButton icon="x" label="Cancel" onClick={() => finish(true)} />
            </div>
          </div>
        </div>
      </Show>
    </FieldShell>
  );
}
