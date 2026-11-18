import { createMemo, createSignal, onCleanup, Show, untrack } from 'solid-js';
import {
  copyText,
  createDocumentField,
  createFieldBinding,
  documentUrl,
  FieldShell,
  Icon,
  LookupIcon,
  notify,
  renderTemplate,
  toRelatedList,
  uid,
  type BaseDefinition,
  type ElementProps,
  type FormbirdElementProps,
  type IconSet,
} from '@solidjs-components/kit';

export interface RecordKeyDefinition extends BaseDefinition {
  /** Key shown before a bare number ("SDMS" + "482" → "SDMS-482"). Supports Handlebars. */
  prefix?: string;
  /** What the copy button copies: the record's URL (default), the key, or no button. */
  copy?: 'link' | 'key' | 'none';
  /** Related-document field holding the record's type, shown as an icon. Default "typeRel"; "" hides it. */
  typeField?: string;
  /** Icon family for the type: "type" (issue types, default), "asset", "work" or "priority". */
  iconSet?: IconSet;
  /** Shown until the first save assigns the number. Default "New". */
  newText?: string;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<RecordKeyDefinition, unknown>>;

const COPIED_FOR_MS = 1600;

/**
 * `<solid-record-key>`: a record's reference number ("TRK-12", "REQ-0041") with its type icon and a
 * copy button.
 * Display only: the number is assigned on first save by fieldtec-web's ReferenceNoPreprocessor,
 * which runs when the definition has `"type": "Reference No"` (see README).
 * @param props - Formbird element properties
 */
export function RecordKey(props: Props) {
  const field = createFieldBinding<string, RecordKeyDefinition>(props, {
    parse: (raw) => (raw === undefined || raw === null ? '' : String(raw)),
  });
  const labelId = uid('label');
  const typeField = () => field.definition().typeField ?? 'typeRel';
  const recordType = createDocumentField(props, untrack(typeField), toRelatedList);

  const key = createMemo(() => {
    const value = field.value().trim();
    if (!value) return '';
    const prefix = renderTemplate(field.definition().prefix ?? '', field.templateContext()).trim();
    return prefix && !value.toUpperCase().startsWith(`${prefix.toUpperCase()}-`) ? `${prefix}-${value}` : value;
  });

  const copyMode = () => field.definition().copy ?? 'link';
  const [copied, setCopied] = createSignal(false);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(resetTimer));

  const copy = async () => {
    const documentId = props.document?.documentId;
    const text = copyMode() === 'key' || !documentId ? key() : documentUrl(documentId);
    if (!(await copyText(text))) {
      notify('error', 'Could not copy to the clipboard');
      return;
    }
    setCopied(true);
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => setCopied(false), COPIED_FOR_MS);
  };

  const copyLabel = () => (copied() ? 'Copied' : copyMode() === 'key' ? 'Copy key' : 'Copy link');

  return (
    <FieldShell label={field.label()} labelId={labelId} hideLabel={field.definition().hideLabel}>
      <div class="rk" aria-labelledby={labelId}>
        <Show when={typeField() ? recordType()[0] : undefined}>
          {(type) => <LookupIcon set={field.definition().iconSet ?? 'type'} name={type().name} title={type().name} />}
        </Show>
        <Show
          when={key()}
          fallback={
            <span class="rk-pending" title="The number is assigned when the record is first saved">
              {field.definition().newText ?? 'New'}
            </span>
          }
        >
          <span class="rk-key">{key()}</span>
          <Show when={copyMode() !== 'none'}>
            <button
              type="button"
              class={['sj-icon-btn', 'sj-icon-btn--sm', 'rk-copy', copied() && 'rk-copy--done']}
              aria-label={`${copyLabel()} for ${key()}`}
              title={copyLabel()}
              onClick={copy}
            >
              <Icon name={copied() ? 'check' : copyMode() === 'key' ? 'copy' : 'link'} size={14} />
            </button>
          </Show>
          <span class="sj-visually-hidden" role="status">
            {copied() ? 'Copied to clipboard' : ''}
          </span>
        </Show>
      </div>
    </FieldShell>
  );
}
