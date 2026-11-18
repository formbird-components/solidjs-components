import { createMemo, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import {
  Avatar,
  Button,
  createFieldBinding,
  currentUser,
  formatDateTime,
  getService,
  hasAccessKey,
  Icon,
  Markdown,
  nextEntryId,
  RelativeTime,
  type BaseDefinition,
  type ElementProps,
  type FormbirdElementProps,
} from '@solidjs-components/kit';
import {
  addNote,
  addReply,
  countVotes,
  editNote,
  sortNotes,
  toNotes,
  voteNote,
  voteOf,
  type Note,
  type Order,
  type Reply,
} from './notes';

export interface CommentsDefinition extends BaseDefinition {
  /** "markdown" (default) renders Markdown; any other value shows the text as typed. */
  textEditor?: string;
  /** No replies under comments (sc-note-comment). */
  disableCommentFunction?: boolean;
  /** No thumbs up / down (sc-note-comment). */
  disableVoteFunction?: boolean;
  /** Holders of these access keys with the Update right may edit anyone's comment (sc-note-comment). */
  allowNoteEditingKeys?: string[];
  /** Initial order. Default "newest". */
  order?: Order;
  placeholder?: string;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<CommentsDefinition, unknown>>;

/** What fieldtec-web broadcasts after saving documents (ClientConstants.DOCUMENT_UPDATED). */
const DOCUMENT_UPDATED = 'document:updated';

const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

/** Text box with its buttons; used to write, edit and reply. */
function Editor(props: {
  value: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  label: string;
  placeholder?: string;
  hint: string;
}) {
  return (
    <div class="cm-editor">
      <textarea
        class="cm-textarea"
        ref={(element) => {
          requestAnimationFrame(() => {
            element.focus();
            element.setSelectionRange(element.value.length, element.value.length);
          });
        }}
        value={props.value}
        placeholder={props.placeholder}
        aria-label={props.label}
        rows={3}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            props.onSubmit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            props.onCancel();
          }
        }}
      />
      <div class="cm-editor__bar">
        <span class="cm-hint">{props.hint}</span>
        <Button size="sm" variant="subtle" onClick={() => props.onCancel()}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={!props.value.trim()} onClick={() => props.onSubmit()}>
          {props.submitLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * `<solid-comments>`: the comment thread of a document, stored like sc-note-comment stores it
 * (SDMS `notesCommentsArr`), with replies, edits (history kept) and votes. Changes are saved with the
 * document, as with every other field; new ones are marked until then.
 * @param props - Formbird element properties
 */
export function Comments(props: Props) {
  const field = createFieldBinding<Note[], CommentsDefinition>(props, { parse: toNotes });
  const def = field.definition;
  const me = currentUser();
  const documentId = untrack(() => props.document?.documentId as string | undefined);

  const [order, setOrder] = createSignal<Order>(untrack(() => def().order) === 'oldest' ? 'oldest' : 'newest');
  const [composing, setComposing] = createSignal(false);
  const [draft, setDraft] = createSignal('');
  const [editingId, setEditingId] = createSignal<string>();
  const [editDraft, setEditDraft] = createSignal('');
  const [replyId, setReplyId] = createSignal<string>();
  const [replyDraft, setReplyDraft] = createSignal('');
  // Ids written since the document was last saved. The save broadcast can replay at subscribe time.
  const [unsaved, setUnsaved] = createSignal<ReadonlySet<string>>(new Set(), { ownedWrite: true });

  const broadcast = getService('BroadcastService');
  if (broadcast?.on && documentId) {
    const subscription = broadcast.on<unknown>(DOCUMENT_UPDATED).subscribe((saved) => {
      const docs = Array.isArray(saved) ? saved : [saved];
      if (docs.some((doc) => (doc as { documentId?: unknown } | null)?.documentId === documentId)) setUnsaved(new Set<string>());
    });
    onCleanup(() => subscription.unsubscribe());
  }

  const notes = createMemo(() => sortNotes(field.value(), order()));
  const count = () => field.value().length;
  const markdown = () => String(def().textEditor ?? 'markdown').toLowerCase() === 'markdown';
  const hint = () => `${markdown() ? 'Markdown supported · ' : ''}${MOD_KEY}+Enter to send`;
  const canWrite = () => !field.disabled() && !!me;
  const canEdit = (note: Note) =>
    canWrite() && !!note.dataId && (note.createdBy?.documentId === me?.documentId || hasAccessKey(def().allowNoteEditingKeys, 'Update'));
  const now = () => new Date().toISOString();

  const commit = (next: Note[], touchedId: string) => {
    field.setValue(next);
    setUnsaved((ids) => new Set(ids).add(touchedId));
  };

  const submitNote = () => {
    const text = draft().trim();
    if (!text || !me) return;
    const id = nextEntryId();
    commit(addNote(field.value(), text, me, id, now()), id);
    setDraft('');
    setComposing(false);
  };

  const startEdit = (note: Note) => {
    setReplyId(undefined);
    setEditDraft(note.detail ?? '');
    setEditingId(note.dataId);
  };
  const saveEdit = () => {
    const id = editingId();
    const text = editDraft().trim();
    if (!id || !text || !me) return;
    if (text !== field.value().find((n) => n.dataId === id)?.detail) commit(editNote(field.value(), id, text, me, now()), id);
    setEditingId(undefined);
  };

  const startReply = (note: Note) => {
    setEditingId(undefined);
    setReplyDraft('');
    setReplyId(note.dataId);
  };
  const submitReply = () => {
    const noteId = replyId();
    const text = replyDraft().trim();
    if (!noteId || !text || !me) return;
    const id = nextEntryId();
    commit(addReply(field.value(), noteId, text, me, id, now()), id);
    setReplyId(undefined);
    setReplyDraft('');
  };

  const vote = (note: Note, direction: 1 | -1) => {
    if (!canWrite() || !me) return;
    commit(voteNote(field.value(), note.dataId, me, direction, nextEntryId(), now()), note.dataId);
  };

  const Body = (p: { text: string }) => (
    <Show when={markdown()} fallback={<p class="cm-body cm-plain">{p.text}</p>}>
      <Markdown text={p.text} class="cm-body" />
    </Show>
  );

  const Meta = (p: { entry: Reply | Note }) => (
    <div class="cm-meta">
      <span class="cm-author">{p.entry.createdBy?.name || 'Someone'}</span>
      <RelativeTime value={p.entry.createdDate} class="cm-time" />
      <Show when={(p.entry as Note).modifiedDate}>
        <span
          class="cm-edited"
          title={`Edited ${formatDateTime((p.entry as Note).modifiedDate)}${(p.entry as Note).modifiedBy ? ` by ${(p.entry as Note).modifiedBy!.name}` : ''}`}
        >
          edited
        </span>
      </Show>
      <Show when={unsaved().has(p.entry.dataId)}>
        <span class="cm-unsaved" title="Saved when you save this document">
          Not saved yet
        </span>
      </Show>
    </div>
  );

  const Votes = (p: { note: Note }) => {
    const up = () => p.note.thumbsUp ?? countVotes(p.note, 1);
    const down = () => p.note.thumbsDown ?? countVotes(p.note, -1);
    const mine = () => voteOf(p.note, me?.documentId);
    return (
      <span class="cm-votes">
        <button
          type="button"
          class="cm-vote"
          aria-pressed={mine() === 1 ? 'true' : 'false'}
          aria-label={`Thumbs up${up() ? `, ${up()}` : ''}`}
          title="Thumbs up"
          disabled={!canWrite()}
          onClick={() => vote(p.note, 1)}
        >
          <Icon name="thumbs-up" size={14} />
          <Show when={up()}>
            <span>{up()}</span>
          </Show>
        </button>
        <button
          type="button"
          class="cm-vote"
          aria-pressed={mine() === -1 ? 'true' : 'false'}
          aria-label={`Thumbs down${down() ? `, ${down()}` : ''}`}
          title="Thumbs down"
          disabled={!canWrite()}
          onClick={() => vote(p.note, -1)}
        >
          <Icon name="thumbs-down" size={14} />
          <Show when={down()}>
            <span>{down()}</span>
          </Show>
        </button>
      </span>
    );
  };

  return (
    <section class="cm" aria-label={field.label() || 'Comments'}>
      <header class="cm-head">
        <Show when={!def().hideLabel}>
          <h3 class="cm-title">{field.label() || 'Comments'}</h3>
        </Show>
        <Show when={count()}>
          <span class="sj-count">{count()}</span>
        </Show>
        <Show when={count() > 1}>
          <button type="button" class="cm-order" onClick={() => setOrder((o) => (o === 'newest' ? 'oldest' : 'newest'))}>
            {order() === 'newest' ? 'Newest first' : 'Oldest first'}
            <Icon name={order() === 'newest' ? 'arrow-down' : 'arrow-up'} size={12} strokeWidth={2} />
          </button>
        </Show>
      </header>

      <Show when={canWrite()}>
        <div class="cm-composer">
          <Avatar name={me?.name} />
          <Show
            when={composing()}
            fallback={
              <button type="button" class="cm-prompt" onClick={() => setComposing(true)}>
                {def().placeholder ?? 'Add a comment…'}
              </button>
            }
          >
            <Editor
              value={draft()}
              onInput={setDraft}
              onSubmit={submitNote}
              onCancel={() => {
                setDraft('');
                setComposing(false);
              }}
              submitLabel="Comment"
              label="New comment"
              placeholder={def().placeholder ?? 'Add a comment…'}
              hint={hint()}
            />
          </Show>
        </div>
      </Show>

      <Show
        when={count()}
        fallback={
          <div class="sj-empty cm-empty">
            <Icon name="message" />
            <span>No comments yet.</span>
          </div>
        }
      >
        <ol class="cm-list">
          <For each={notes()}>
            {(note) => (
              <li class="cm-note" id={note.dataId ? `note-${note.dataId}` : undefined}>
                <Avatar name={note.createdBy?.name} />
                <div class="cm-main">
                  <Meta entry={note} />
                  <Show when={editingId() === note.dataId} fallback={<Body text={note.detail ?? ''} />}>
                    <Editor
                      value={editDraft()}
                      onInput={setEditDraft}
                      onSubmit={saveEdit}
                      onCancel={() => setEditingId(undefined)}
                      submitLabel="Save"
                      label="Edit comment"
                      hint={hint()}
                    />
                  </Show>
                  <Show when={editingId() !== note.dataId && note.dataId && (canWrite() || (!def().disableVoteFunction && (note.votes?.length ?? 0) > 0))}>
                    <div class="cm-actions">
                      <Show when={canWrite() && !def().disableCommentFunction}>
                        <button type="button" class="cm-action" onClick={() => startReply(note)}>
                          <Icon name="reply" size={14} />
                          Reply
                        </button>
                      </Show>
                      <Show when={canEdit(note)}>
                        <button type="button" class="cm-action" onClick={() => startEdit(note)}>
                          <Icon name="pencil" size={14} />
                          Edit
                        </button>
                      </Show>
                      <Show when={!def().disableVoteFunction}>
                        <Votes note={note} />
                      </Show>
                    </div>
                  </Show>
                  <Show when={(note.comments?.length ?? 0) > 0 || replyId() === note.dataId}>
                    <ol class="cm-replies">
                      <For each={note.comments ?? []}>
                        {(reply) => (
                          <li class="cm-reply">
                            <Avatar name={reply.createdBy?.name} size="sm" />
                            <div class="cm-main">
                              <Meta entry={reply} />
                              <Body text={reply.detail ?? ''} />
                            </div>
                          </li>
                        )}
                      </For>
                      <Show when={replyId() === note.dataId}>
                        <li class="cm-reply">
                          <Avatar name={me?.name} size="sm" />
                          <Editor
                            value={replyDraft()}
                            onInput={setReplyDraft}
                            onSubmit={submitReply}
                            onCancel={() => setReplyId(undefined)}
                            submitLabel="Reply"
                            label={`Reply to ${note.createdBy?.name ?? 'comment'}`}
                            placeholder="Write a reply…"
                            hint={hint()}
                          />
                        </li>
                      </Show>
                    </ol>
                  </Show>
                </div>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </section>
  );
}
