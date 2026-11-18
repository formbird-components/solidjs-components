import { createEffect, createMemo, createSignal, flush, For, onCleanup, Show, untrack, type Accessor } from 'solid-js';
import {
  Button,
  createDocumentField,
  createFieldBinding,
  FieldShell,
  Icon,
  IconButton,
  jsonEqual,
  nextEntryId,
  uid,
  type BaseDefinition,
  type ElementProps,
  type FormbirdElementProps,
} from '@solidjs-components/kit';
import {
  addChild,
  addSibling,
  CAUSE_CATEGORIES,
  causeProblems,
  causeSummary,
  countDescendants,
  findNode,
  flattenTree,
  parseCauseTree,
  removeNode,
  updateNode,
  type CauseNode,
  type EditableTree,
} from '../../../packages/whs-kit/src/index';

export interface RootCauseDefinition extends BaseDefinition {
  /** Field of this document the problem starts from while the tree has none. Default "title". Read once. */
  problemField?: string;
  /** Root cause categories, as names (or `{ name }`). Default People, Procedure, Plant and equipment, Environment, Organisation. */
  categories?: (string | { name?: string })[];
  /** Whys a root cause needs above it, itself included. Default 3. */
  minDepth?: number;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<RootCauseDefinition, unknown>>;

/** Typing reaches the field this long after the last key (or on leaving the answer). */
const TYPING_DELAY_MS = 400;
const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** The browser sizes textareas to their text itself (CSS field-sizing). */
const NATIVE_SIZING = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('field-sizing', 'content');

/** Grows a textarea to fit its text, where the browser doesn't. */
function grow(element: HTMLTextAreaElement) {
  if (NATIVE_SIZING) return;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight + 2}px`;
}

/** What every node of the tree shares. */
interface Editor {
  editable: Accessor<boolean>;
  categories: Accessor<string[]>;
  collapsed: Accessor<ReadonlySet<string>>;
  confirming: Accessor<string | undefined>;
  problem: Accessor<string>;
  register(id: string, element: HTMLTextAreaElement | undefined): void;
  type(id: string, text: string): void;
  commitTyping(): void;
  askWhy(id: string): void;
  addCause(id: string): void;
  toggleRoot(id: string): void;
  setCategory(id: string, category: string): void;
  remove(id: string): void;
  confirm(id: string | undefined): void;
  toggleCollapsed(id: string): void;
}

/**
 * `<solid-root-cause>`: a five-whys tree. Each answer to "why?" can be asked why again, or have
 * other causes beside it; answers where asking again stops helping are marked as root causes with a
 * category. Below the tree: what it comes to, and what it still needs (causeProblems, the same
 * check the rules run).
 * @param props - Formbird element properties
 */
export function RootCause(props: Props) {
  const field = createFieldBinding<EditableTree, RootCauseDefinition>(props, { parse: parseCauseTree });
  const def = field.definition;
  const labelId = uid('label');
  const problemId = uid('problem');
  const problemField = untrack(() => def().problemField || 'title');
  const suggestion = createDocumentField(props, problemField, (raw) => (typeof raw === 'string' ? raw.trim() : ''));

  // The editor's working copy. Typing changes it at once and reaches the field TYPING_DELAY_MS later
  // (or when the answer loses focus); adding, removing and marking reach the field at once.
  const [tree, setTree] = createSignal<EditableTree>(untrack(field.value), { equals: jsonEqual, ownedWrite: true });
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(new Set(), { ownedWrite: true });
  const [confirming, setConfirming] = createSignal<string>();
  const inputs = new Map<string, HTMLTextAreaElement>();
  let problemInput: HTMLTextAreaElement | undefined;
  let startButton: HTMLButtonElement | undefined;
  let typingTimer: ReturnType<typeof setTimeout> | undefined;

  const cancelTyping = () => {
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = undefined;
  };
  onCleanup(() => {
    // Leaving the form mid-sentence still keeps the text.
    if (typingTimer) commitTyping();
  });

  // A change from elsewhere (a ruleset, another element on the field) replaces the working copy.
  createEffect(
    () => field.value(),
    (stored) => {
      if (jsonEqual(stored, untrack(tree))) return;
      cancelTyping();
      setTree(stored);
    },
  );

  // A narrower form wraps the answers onto more lines.
  if (!NATIVE_SIZING && typeof ResizeObserver !== 'undefined') {
    const host = untrack(() => props.host);
    let width = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (Math.abs(entry.contentRect.width - width) < 1) return;
      width = entry.contentRect.width;
      inputs.forEach(grow);
      if (problemInput) grow(problemInput);
    });
    if (host) observer.observe(host);
    onCleanup(() => observer.disconnect());
  }

  const editable = () => !field.disabled();
  const minDepth = () => Math.max(1, Math.floor(Number(def().minDepth)) || 3);
  const categories = createMemo(() => {
    const list = (def().categories ?? CAUSE_CATEGORIES)
      .map((c) => (typeof c === 'string' ? c : String(c?.name ?? '')))
      .filter(Boolean);
    return list.length ? list : CAUSE_CATEGORIES;
  });

  const save = (next: EditableTree) => {
    cancelTyping();
    setTree(next);
    field.setValue(next);
  };
  /** Nodes changed: the problem comes from `problemField` if it is still empty. */
  const withNodes = (nodes: CauseNode[]): EditableTree => {
    const current = untrack(tree);
    return { problem: current.problem.trim() ? current.problem : untrack(suggestion), nodes };
  };
  const nodes = () => untrack(tree).nodes;
  function commitTyping() {
    if (!typingTimer) return;
    cancelTyping();
    field.setValue(untrack(tree));
  }
  const typeLater = (next: EditableTree) => {
    setTree(next);
    cancelTyping();
    typingTimer = setTimeout(() => {
      typingTimer = undefined;
      field.setValue(untrack(tree));
    }, TYPING_DELAY_MS);
  };

  const focusNode = (id: string) => {
    flush();
    const input = inputs.get(id);
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  };
  const newNode = (): CauseNode => ({ id: nextEntryId(), text: '', children: [] });
  const expand = (id: string) => {
    if (!untrack(collapsed).has(id)) return;
    const next = new Set(untrack(collapsed));
    next.delete(id);
    setCollapsed(next);
  };

  const editor: Editor = {
    editable,
    categories,
    collapsed,
    confirming,
    problem: () => tree().problem || suggestion(),
    register(id, element) {
      if (element) inputs.set(id, element);
      else inputs.delete(id);
    },
    type(id, text) {
      const current = untrack(tree);
      const changed = updateNode(current.nodes, id, { text });
      typeLater(current.problem.trim() ? { ...current, nodes: changed } : withNodes(changed));
    },
    commitTyping,
    askWhy(id) {
      const child = newNode();
      expand(id);
      save(withNodes(addChild(nodes(), id, child)));
      focusNode(child.id);
    },
    addCause(id) {
      const sibling = newNode();
      save(withNodes(addSibling(nodes(), id, sibling)));
      focusNode(sibling.id);
    },
    toggleRoot(id) {
      const place = findNode(nodes(), id);
      if (!place) return;
      save(withNodes(updateNode(nodes(), id, place.node.root ? { root: undefined, category: undefined } : { root: true })));
    },
    setCategory(id, category) {
      save(withNodes(updateNode(nodes(), id, { category })));
    },
    remove(id) {
      const order = flattenTree(nodes());
      const index = order.findIndex((entry) => entry.node.id === id);
      if (index < 0) return;
      const after = order[index + 1 + countDescendants(order[index].node)];
      const target = order[index - 1]?.node.id ?? after?.node.id;
      setConfirming(undefined);
      save({ ...untrack(tree), nodes: removeNode(nodes(), id) });
      if (target) focusNode(target);
      else {
        flush();
        startButton?.focus();
      }
    },
    confirm(id) {
      setConfirming(id);
    },
    toggleCollapsed(id) {
      const next = new Set(untrack(collapsed));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setCollapsed(next);
    },
  };

  const askFirstWhy = () => {
    const child = newNode();
    save(withNodes(addChild(nodes(), null, child)));
    focusNode(child.id);
  };

  const summary = createMemo(() => causeSummary(tree()));
  const problems = createMemo(() => causeProblems(tree(), { minDepth: minDepth() }));

  return (
    <FieldShell label={field.label()} labelId={labelId} mandatory={field.mandatory()} hideLabel={def().hideLabel} errors={field.errors()}>
      <div class={['rc', { 'rc--readonly': !editable() }]} role="group" aria-labelledby={field.label() && !def().hideLabel ? labelId : undefined} aria-label={field.label() && !def().hideLabel ? undefined : 'Root cause analysis'}>
        <div class="rc-problem">
          <label class="rc-problem__label" for={problemId}>
            Problem
          </label>
          <Show when={editable()} fallback={<p class="rc-problem__text">{tree().problem || <span class="sj-placeholder">No problem stated</span>}</p>}>
            <textarea
              ref={(element) => {
                problemInput = element;
                requestAnimationFrame(() => grow(element));
              }}
              id={problemId}
              class="sj-input rc-textarea rc-problem__input"
              rows={1}
              value={tree().problem}
              placeholder="What happened?"
              onInput={(event) => {
                grow(event.currentTarget);
                typeLater({ ...untrack(tree), problem: event.currentTarget.value });
              }}
              onBlur={commitTyping}
            />
            <Show when={!tree().problem.trim() && suggestion()}>
              <button
                type="button"
                class="rc-suggest"
                onClick={() => {
                  save({ ...untrack(tree), problem: untrack(suggestion) });
                  flush();
                  if (problemInput) grow(problemInput);
                }}
              >
                <Icon name="pencil" size={13} />
                <span>
                  Use “<span class="rc-suggest__text">{suggestion()}</span>”
                </span>
              </button>
            </Show>
          </Show>
        </div>

        <Show
          when={tree().nodes.length}
          fallback={
            <div class="rc-empty">
              <p>{editable() ? 'Ask why it happened. Then ask why again about each answer, until you reach causes worth fixing.' : 'No whys recorded.'}</p>
              <Show when={editable()}>
                <Button ref={startButton} size="sm" icon="arrow-down" onClick={askFirstWhy}>
                  Ask why
                </Button>
              </Show>
            </div>
          }
        >
          <Branch nodes={tree().nodes} depth={1} parentText={editor.problem()} editor={editor} />
          <Show when={editable()}>
            <div class="rc-more">
              <Button ref={startButton} size="sm" variant="subtle" icon="plus" onClick={askFirstWhy}>
                Another cause of the problem
              </Button>
            </div>
          </Show>
        </Show>

        <section class="rc-summary" aria-label="Analysis summary">
          <p class="rc-summary__counts">
            <strong>{plural(summary().whys, 'why', 'whys')}</strong>
            <span aria-hidden="true">·</span>
            <span>{summary().depth} deep</span>
            <span aria-hidden="true">·</span>
            <span>{plural(summary().roots.length, 'root cause')}</span>
          </p>
          <Show when={summary().roots.length}>
            <ul class="rc-roots" aria-label="Root causes">
              <For each={summary().roots}>
                {(root) => (
                  <li class="rc-roots__item">
                    <Icon name="crosshair" size={14} class="rc-roots__icon" />
                    <span class="rc-roots__text">{root.text}</span>
                    <span class={['rc-tag', { 'rc-tag--missing': !root.category }]}>{root.category || 'No category'}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <Show
            when={problems().length}
            fallback={
              <div class="sj-note sj-note--success rc-ready" role="status">
                <Icon name="check" size={14} />
                <span>
                  <strong>Ready.</strong> Every root cause has a category and at least {minDepth()} whys behind it.
                </span>
              </div>
            }
          >
            <ul class="rc-problems" aria-label="Still needed" role="status">
              <For each={problems()}>
                {(problem) => (
                  <li class="rc-problems__item">
                    <span class="rc-problems__box" aria-hidden="true" />
                    {problem}
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
      </div>
    </FieldShell>
  );
}

/** One level of answers, with the lines that join them to the answer above. */
function Branch(props: { nodes: CauseNode[]; depth: number; parentText: string; editor: Editor }) {
  return (
    <ol class={['rc-branch', { 'rc-branch--top': props.depth === 1 }]}>
      <For each={props.nodes} keyed={(node) => node.id}>
        {(node) => <NodeView node={node()} depth={props.depth} parentText={props.parentText} editor={props.editor} />}
      </For>
    </ol>
  );
}

/** One answer to "why?": its text, its actions, its category when it is a root cause, and the answers under it. */
function NodeView(props: { node: CauseNode; depth: number; parentText: string; editor: Editor }) {
  const editor = props.editor;
  const id = untrack(() => props.node.id);
  const questionId = uid('question');
  const categoryLabelId = uid('category');
  let input: HTMLTextAreaElement | undefined;
  let keepButton: HTMLButtonElement | undefined;
  onCleanup(() => editor.register(id, undefined));

  const children = () => props.node.children ?? [];
  const isCollapsed = () => editor.collapsed().has(id);
  const hidden = () => countDescendants(props.node);

  // Text set from elsewhere (a ruleset, another tab's save) can need more or fewer lines.
  createEffect(
    () => props.node.text,
    (text) => {
      if (input && input.value === text) requestAnimationFrame(() => input && grow(input));
    },
  );

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      editor.askWhy(id);
    } else if (!event.shiftKey && !event.altKey) {
      event.preventDefault();
      if ((event.currentTarget as HTMLTextAreaElement).value.trim()) editor.addCause(id);
    }
  };

  const askRemove = () => {
    if (!children().length) {
      editor.remove(id);
      return;
    }
    editor.confirm(id);
    flush();
    keepButton?.focus();
  };

  return (
    <li class={['rc-node', { 'rc-node--root': !!props.node.root }]} data-node={id}>
      <div class="rc-card">
        <div class="rc-card__head">
          <span class="rc-depth">Why {props.depth}</span>
          <Show when={props.node.root}>
            <span class="rc-badge">
              <Icon name="crosshair" size={12} /> Root cause
            </span>
          </Show>
          <span class="rc-keys" aria-hidden="true">
            <Show when={editor.editable()}>{MOD_KEY}+Enter: ask why · Enter: another cause · Shift+Enter: new line</Show>
          </span>
          <Show when={children().length}>
            <IconButton
              icon={isCollapsed() ? 'chevron-right' : 'chevron-down'}
              size="sm"
              label={isCollapsed() ? `Show the ${plural(hidden(), 'why', 'whys')} under this` : 'Hide the whys under this'}
              aria-expanded={isCollapsed() ? 'false' : 'true'}
              onClick={() => editor.toggleCollapsed(id)}
            />
          </Show>
        </div>
        <span class="sj-visually-hidden" id={questionId}>
          Answers why: {props.parentText || 'the problem'}
        </span>
        <Show
          when={editor.editable()}
          fallback={
            <p class="rc-text" aria-describedby={questionId}>
              {props.node.text || <span class="sj-placeholder">No answer</span>}
            </p>
          }
        >
          <textarea
            ref={(element) => {
              input = element;
              editor.register(id, element);
              requestAnimationFrame(() => grow(element));
            }}
            class="sj-input rc-textarea"
            rows={1}
            value={props.node.text}
            placeholder={props.depth === 1 ? 'Why did it happen?' : 'Why?'}
            aria-label={`Why ${props.depth}`}
            aria-describedby={questionId}
            aria-keyshortcuts="Control+Enter Enter"
            onInput={(event) => {
              grow(event.currentTarget);
              editor.type(id, event.currentTarget.value);
            }}
            onBlur={() => editor.commitTyping()}
            onKeyDown={onKeyDown}
          />
        </Show>

        <Show when={props.node.root}>
          <div class="rc-category">
            <span class="rc-category__label" id={categoryLabelId}>
              Category
            </span>
            <Show
              when={editor.editable()}
              fallback={<span class={['rc-tag', { 'rc-tag--missing': !props.node.category }]}>{props.node.category || 'No category'}</span>}
            >
              <div class="rc-chips" role="group" aria-labelledby={categoryLabelId}>
                <For each={editor.categories()}>
                  {(category) => (
                    <button
                      type="button"
                      class="rc-chip"
                      aria-pressed={props.node.category === category ? 'true' : 'false'}
                      onClick={() => editor.setCategory(id, category)}
                    >
                      <Show when={props.node.category === category}>
                        <Icon name="check" size={12} strokeWidth={2.2} />
                      </Show>
                      {category}
                    </button>
                  )}
                </For>
              </div>
              <Show when={!props.node.category}>
                <span class="rc-category__needed">Choose one</span>
              </Show>
            </Show>
          </div>
        </Show>

        <Show when={editor.editable()}>
          <Show
            when={editor.confirming() === id}
            fallback={
              <div class="rc-actions">
                <Button size="sm" variant="subtle" icon="arrow-down" title={`${MOD_KEY}+Enter`} onClick={() => editor.askWhy(id)}>
                  Ask why
                </Button>
                <Button size="sm" variant="subtle" icon="plus" onClick={() => editor.addCause(id)}>
                  Add another cause
                </Button>
                <button
                  type="button"
                  class="rc-toggle"
                  aria-pressed={props.node.root ? 'true' : 'false'}
                  onClick={() => editor.toggleRoot(id)}
                >
                  <span class="rc-toggle__box" aria-hidden="true">
                    <Show when={props.node.root}>
                      <Icon name="check" size={11} strokeWidth={2.4} />
                    </Show>
                  </span>
                  Root cause
                </button>
                <span class="rc-card__spacer" />
                <IconButton icon="trash" size="sm" label={`Remove why ${props.depth}${props.node.text ? `: ${props.node.text}` : ''}`} onClick={askRemove} />
              </div>
            }
          >
            <div
              class="rc-confirm"
              role="alertdialog"
              aria-label="Remove this why"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  editor.confirm(undefined);
                  flush();
                  input?.focus();
                }
              }}
            >
              <span class="rc-confirm__text">
                Remove this why and the {plural(hidden(), 'answer', 'answers')} under it?
              </span>
              <Button size="sm" variant="primary" class="rc-confirm__remove" onClick={() => editor.remove(id)}>
                Remove
              </Button>
              <Button
                ref={keepButton}
                size="sm"
                onClick={() => {
                  editor.confirm(undefined);
                  flush();
                  input?.focus();
                }}
              >
                Keep
              </Button>
            </div>
          </Show>
        </Show>
      </div>

      <Show when={children().length}>
        <Show
          when={!isCollapsed()}
          fallback={
            <button type="button" class="rc-hidden" onClick={() => editor.toggleCollapsed(id)}>
              <Icon name="chevron-right" size={12} />
              {plural(hidden(), 'why', 'whys')} hidden
            </button>
          }
        >
          <Branch nodes={children()} depth={props.depth + 1} parentText={props.node.text} editor={editor} />
        </Show>
      </Show>
    </li>
  );
}
