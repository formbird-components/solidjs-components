import { createEffect, createMemo, createSignal, flush, For, onSettled, Show, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import {
  createFieldBinding,
  currentUser,
  errorText,
  FieldShell,
  fileSource,
  formatDateTime,
  Icon,
  IconButton,
  Spinner,
  uid,
  uploadFile,
  type BaseDefinition,
  type ElementProps,
  type FormbirdElementProps,
} from '@solidjs-components/kit';
import {
  acceptsFile,
  countText,
  extensionOf,
  isImageEntry,
  isPdfEntry,
  isStoredFile,
  newEntry,
  patchEntry,
  removeEntry,
  toEntries,
  type PhotoEntry,
} from './photos';
import { prepareImage } from './resize';

export interface PhotoCaptureDefinition extends BaseDefinition {
  /** "edit" (default) adds, captions and removes photos; "view" only shows them. */
  mode?: 'edit' | 'view';
  /** Most photos (and files) the field takes (default 20). */
  maxPhotos?: number;
  /** What Upload and drag-and-drop take, as `<input accept>` (default "image/*", or anything with `allowFiles`). */
  accept?: string;
  /** Take other files too (PDFs, documents); they show as file tiles. */
  allowFiles?: boolean;
  /** Show and edit captions (default true). */
  captions?: boolean;
  /** Camera for "Take photo": "environment" (default, the back camera), "user" (the front one), or false for none. */
  capture?: 'environment' | 'user' | false | '';
  /** Photos longer than this on either side are scaled down before upload (default 1920; 0 keeps originals). */
  maxDimension?: number;
  /** "grid" (default): photo thumbnails; "list": documents as rows (attachments: quotes, invoices). */
  layout?: 'grid' | 'list';
  /** Document types to choose from for each file ("Quote", "Invoice"), stored as `kind`. */
  kinds?: Array<string | { value: string; label?: string }>;
  /** The type a new file gets (default: the first of `kinds`). */
  defaultKind?: string;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<PhotoCaptureDefinition, unknown>>;

/** A stored file as the grid shows it. */
interface Item {
  key: string;
  entry: PhotoEntry;
  image: boolean;
}

/** A file being uploaded, or one that failed. */
interface Upload {
  key: string;
  name: string;
  preview?: string;
  error?: string;
}

const DEFAULT_MAX = 20;
const DEFAULT_DIMENSION = 1920;
const CAPTION_DELAY = 400;

/** Line glyphs this element needs beyond the kit's icons (16 × 16, stroked like the kit's). */
const GLYPHS = {
  camera: [
    'M2.5 5.6A1.4 1.4 0 0 1 3.9 4.2h1.6l1-1.6h3l1 1.6h1.6a1.4 1.4 0 0 1 1.4 1.4v6.1a1.4 1.4 0 0 1-1.4 1.4H3.9a1.4 1.4 0 0 1-1.4-1.4z',
    'M10.3 8.5a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0z',
  ],
  upload: ['M8 10.2V2.8', 'M4.9 5.9L8 2.8l3.1 3.1', 'M2.8 10.4v1.8a1.3 1.3 0 0 0 1.3 1.3h7.8a1.3 1.3 0 0 0 1.3-1.3v-1.8'],
  file: ['M4.3 2.4h4.9l2.5 2.5v8.7H4.3z', 'M9.1 2.4v2.6h2.6'],
  image: ['M2.6 3.4h10.8v9.2H2.6z', 'M2.6 10.6l3-3 2.4 2.4 1.7-1.7 3.7 3.3', 'M10.7 6.2a1 1 0 1 1-2 0 1 1 0 0 1 2 0z'],
  external: ['M9.2 2.8h4v4', 'M13.2 2.8L7.6 8.4', 'M11.6 9.4v2.9a1.1 1.1 0 0 1-1.1 1.1H3.7a1.1 1.1 0 0 1-1.1-1.1V5.5a1.1 1.1 0 0 1 1.1-1.1h2.9'],
} as const;

function Glyph(props: { name: keyof typeof GLYPHS; size?: number }) {
  return (
    <svg
      class="sj-icon"
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <For each={GLYPHS[props.name] as readonly string[]}>{(d) => <path d={d} />}</For>
    </svg>
  );
}

// Where each stored file is shown from, asked once per file and page (fieldtec-web's offline copy
// when it has one, else api/getFile/<fileNo>). A file just uploaded is shown from the local copy.
const sources = new Map<string, Promise<string>>();
const sourceOf = (entry: PhotoEntry): Promise<string> => {
  let source = sources.get(entry.fileNo);
  if (!source) {
    source = fileSource({ fileNo: entry.fileNo, fileName: entry.fileName });
    sources.set(entry.fileNo, source);
  }
  return source;
};

/** The URL of a stored file, once known. */
function useSource(entry: () => PhotoEntry) {
  const [src, setSrc] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  return {
    src,
    load: () => {
      const wanted = untrack(entry);
      setSrc(undefined);
      void sourceOf(wanted).then((url) => {
        if (untrack(entry).fileNo === wanted.fileNo) setSrc(url);
      });
    },
  };
}

/** A stored image, loaded when it scrolls near the viewport (or straight away when `eager`). */
function FileImage(props: { entry: PhotoEntry; alt: string; class: string; eager?: boolean; onBroken: () => void }) {
  const source = useSource(() => props.entry);
  let frame: HTMLSpanElement | undefined;
  onSettled(() => {
    if (props.eager || typeof IntersectionObserver === 'undefined' || !frame) {
      source.load();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        source.load();
      },
      { rootMargin: '240px' },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  });
  const [loaded, setLoaded] = createSignal(false);
  return (
    <span class={['pc-frame', loaded() && 'pc-frame--loaded']} ref={frame}>
      <Show when={source.src()}>
        {(src) => (
          <img
            class={props.class}
            src={src()}
            alt={props.alt}
            loading={props.eager ? 'eager' : 'lazy'}
            decoding="async"
            onDragStart={(event) => event.preventDefault()}
            onLoad={() => setLoaded(true)}
            onError={() => props.onBroken()}
          />
        )}
      </Show>
    </span>
  );
}

/** A link that downloads a stored file (it has no href until the file's URL is known). */
function DownloadLink(props: { entry: PhotoEntry; class: string; label?: string; children: JSX.Element }) {
  const source = useSource(() => props.entry);
  createEffect(
    () => props.entry.fileNo,
    () => source.load(),
  );
  return (
    <a class={props.class} href={source.src()} download={props.entry.fileName} aria-label={props.label} title={props.label}>
      {props.children}
    </a>
  );
}

/** A PDF in the browser's own viewer, inside the lightbox. */
function PdfFrame(props: { entry: PhotoEntry }) {
  const source = useSource(() => props.entry);
  createEffect(
    () => props.entry.fileNo,
    () => source.load(),
  );
  return (
    <div class="pc-lb__pdf">
      <Show when={source.src()} fallback={<Spinner label="Loading the document" />}>
        {(src) => <iframe class="pc-lb__pdf-frame" src={src()} title={props.entry.fileName} />}
      </Show>
    </div>
  );
}

/**
 * `<solid-photo-capture>`: photos (and, if allowed, other files) on a record: incident photos,
 * evidence that an action was done, before and after. Each file uploads as soon as it is chosen,
 * taken or dropped; the field lists the stored files with captions, when and by whom.
 * @param props - Formbird element properties
 */
export function PhotoCapture(props: Props) {
  const field = createFieldBinding<Record<string, unknown>[], PhotoCaptureDefinition>(props, { parse: toEntries });
  const def = field.definition;
  const labelId = uid('label');
  const titleId = uid('title');
  const hintId = uid('hint');
  const fullId = uid('full');

  const editable = () => def().mode !== 'view' && !field.disabled();
  const maxPhotos = () => (typeof def().maxPhotos === 'number' && def().maxPhotos! > 0 ? Math.floor(def().maxPhotos!) : DEFAULT_MAX);
  const accept = () => (typeof def().accept === 'string' && def().accept!.trim() ? def().accept!.trim() : def().allowFiles ? '' : 'image/*');
  const captions = () => def().captions !== false;
  const captureMode = () => {
    const mode = def().capture;
    return mode === false || mode === '' ? undefined : mode === 'user' ? 'user' : 'environment';
  };
  const maxDimension = () => (typeof def().maxDimension === 'number' && def().maxDimension! >= 0 ? def().maxDimension! : DEFAULT_DIMENSION);
  const list = () => def().layout === 'list';
  // `kinds` takes strings or { value, label } objects: objects keep the template indexable when the
  // same template also has line items, whose `kinds` are objects.
  const kindOptions = () =>
    (Array.isArray(def().kinds) ? def().kinds! : [])
      .map((k) => (typeof k === 'string' ? { value: k, label: k } : k && typeof k.value === 'string' ? { value: k.value, label: k.label || k.value } : null))
      .filter((k): k is { value: string; label: string } => !!k && !!k.value.trim());
  const kinds = () => kindOptions().map((k) => k.value);
  const noun = () => (list() ? 'documents' : def().allowFiles ? 'files' : 'photos');

  const items = createMemo<Item[]>(() => {
    const seen = new Map<string, number>();
    return field
      .value()
      .filter(isStoredFile)
      .map((entry) => {
        const count = (seen.get(entry.fileNo) ?? 0) + 1;
        seen.set(entry.fileNo, count);
        return { key: count > 1 ? `${entry.fileNo}#${count}` : entry.fileNo, entry, image: isImageEntry(entry) };
      });
  });
  const [uploads, setUploads] = createSignal<Upload[]>([], { ownedWrite: true });
  const uploading = () => uploads().filter((u) => !u.error).length;
  const full = () => items().length + uploading() >= maxPhotos();
  const [broken, setBroken] = createSignal<ReadonlySet<string>>(new Set());
  const [dropping, setDropping] = createSignal(false);
  const [notice, setNotice] = createSignal<string>();
  const [announcement, setAnnouncement] = createSignal('');

  let cameraInput: HTMLInputElement | undefined;
  let uploadInput: HTMLInputElement | undefined;
  let firstAddButton: HTMLButtonElement | undefined;
  let grid: HTMLUListElement | undefined;

  let announceTimer: ReturnType<typeof setTimeout> | undefined;
  const announce = (message: string) => {
    setAnnouncement('');
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => setAnnouncement(message), 30);
  };

  /** The value now, including writes made earlier in this event (Solid applies them on flush). */
  const latest = () => {
    flush();
    return untrack(field.value);
  };

  // ------------------------------------------------------------------ uploading

  const limitText = () => `${untrack(maxPhotos)} ${untrack(noun)} is the most this field takes. Remove one to add another.`;

  const uploadOne = async (file: File, key: string) => {
    try {
      const prepared = await prepareImage(file, untrack(maxDimension));
      const owner = untrack(() => ({
        documentId: props.document?.documentId as string | undefined,
        documentName: (props.document as { systemHeader?: { summaryName?: string } } | undefined)?.systemHeader?.summaryName,
      }));
      const stored = await uploadFile(prepared.file, owner);
      // Show it from the local copy instead of downloading what was just sent.
      if (prepared.file.type.startsWith('image/')) sources.set(stored.fileNo, Promise.resolve(URL.createObjectURL(prepared.file)));
      const kind = untrack(() => def().defaultKind || kinds()[0] || '');
      const entry = newEntry(stored, { takenDate: new Date().toISOString(), takenBy: currentUser(), width: prepared.width, height: prepared.height, kind });
      // Append to the value as it is now: another upload, or another user's change, may have
      // landed while this one was on its way.
      field.setValue([...latest(), entry]);
      finishUpload(key);
      announce(`${entry.fileName} added.`);
    } catch (error) {
      const message = errorText(error, `${file.name} could not be uploaded.`);
      setUploads((list) => list.map((u) => (u.key === key ? { ...u, error: message } : u)));
      announce(`${file.name} was not added: ${message}`);
    }
  };

  const finishUpload = (key: string) => {
    const upload = untrack(uploads).find((u) => u.key === key);
    if (upload?.preview) URL.revokeObjectURL(upload.preview);
    setUploads((list) => list.filter((u) => u.key !== key));
  };

  const addFiles = (files: File[]) => {
    if (!untrack(editable) || !files.length) return;
    setNotice(undefined);
    const room = untrack(maxPhotos) - untrack(items).length - untrack(uploading);
    const failed: Upload[] = [];
    const accepted: File[] = [];
    for (const file of files) {
      if (acceptsFile(untrack(accept), file)) accepted.push(file);
      else failed.push({ key: uid('upload'), name: file.name, error: untrack(() => def().allowFiles) ? 'This field does not take this type of file.' : 'Only photos can be added here.' });
    }
    const taken = accepted.slice(0, Math.max(0, room));
    const left = accepted.length - taken.length;
    if (left) setNotice(`${left} ${left === 1 ? 'file was' : 'files were'} not added: ${limitText()}`);
    const started = taken.map((file) => ({
      file,
      upload: { key: uid('upload'), name: file.name, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined } as Upload,
    }));
    setUploads((list) => [...list, ...failed, ...started.map((s) => s.upload)]);
    if (started.length) announce(`Uploading ${started.length === 1 ? started[0].file.name : `${started.length} files`}…`);
    for (const { file, upload } of started) void uploadOne(file, upload.key);
  };

  const pick = (input: HTMLInputElement | undefined) => {
    if (untrack(full)) {
      announce(limitText());
      return;
    }
    input?.click();
  };

  const onPicked = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    addFiles(files);
  };

  const dismissUpload = (key: string) => {
    finishUpload(key);
    flush();
    firstAddButton?.focus();
  };

  // ------------------------------------------------------------------ drag and drop

  const hasFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes('Files');
  const onDragOver = (event: DragEvent) => {
    if (!untrack(editable) || !hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = untrack(full) ? 'none' : 'copy';
    setDropping(true);
  };
  const onDragLeave = (event: DragEvent) => {
    const to = event.relatedTarget as Node | null;
    if (!to || !(event.currentTarget as HTMLElement).contains(to)) setDropping(false);
  };
  const onDrop = (event: DragEvent) => {
    if (!untrack(editable)) return;
    event.preventDefault();
    setDropping(false);
    if (untrack(full)) {
      setNotice(limitText());
      return;
    }
    addFiles([...(event.dataTransfer?.files ?? [])]);
  };

  // ------------------------------------------------------------------ lightbox

  const [viewing, setViewing] = createSignal<number | undefined>(undefined, { ownedWrite: true });
  const [confirming, setConfirming] = createSignal(false, { ownedWrite: true });
  const [captionDraft, setCaptionDraft] = createSignal('', { ownedWrite: true });
  let dialog: HTMLDialogElement | undefined;
  let closeButton: HTMLButtonElement | undefined;
  let cancelDelete: HTMLButtonElement | undefined;
  let returnFocus: HTMLElement | undefined;

  const current = () => {
    const index = viewing();
    const list = items();
    if (index === undefined || !list.length) return undefined;
    return { item: list[Math.min(index, list.length - 1)], index: Math.min(index, list.length - 1), total: list.length };
  };

  let captionTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingCaption: { fileNo: string; caption: string } | undefined;
  const commitCaption = () => {
    clearTimeout(captionTimer);
    const pending = pendingCaption;
    pendingCaption = undefined;
    if (!pending) return;
    const list = latest();
    const next = patchEntry(list, pending.fileNo, { caption: pending.caption });
    if (next.some((entry, i) => entry !== list[i])) field.setValue(next);
  };
  const typeCaption = (fileNo: string, caption: string) => {
    setCaptionDraft(caption);
    pendingCaption = { fileNo, caption };
    clearTimeout(captionTimer);
    captionTimer = setTimeout(commitCaption, CAPTION_DELAY);
  };

  const show = (index: number) => {
    commitCaption();
    const list = untrack(items);
    if (!list.length) return;
    const at = ((index % list.length) + list.length) % list.length;
    setViewing(at);
    setConfirming(false);
    setCaptionDraft(list[at]?.entry.caption ?? '');
  };

  const openLightbox = (index: number, from: HTMLElement) => {
    returnFocus = from;
    show(index);
    flush();
    if (dialog && !dialog.open) dialog.showModal();
    closeButton?.focus();
  };

  const closeLightbox = () => {
    commitCaption();
    const wasOpen = untrack(viewing) !== undefined;
    setViewing(undefined);
    setConfirming(false);
    if (dialog?.open) dialog.close();
    if (!wasOpen) return;
    flush();
    const target = returnFocus?.isConnected ? returnFocus : (grid?.querySelector<HTMLElement>('.pc-thumb') ?? firstAddButton);
    target?.focus();
  };

  // Close when every photo is gone (deleted here or elsewhere).
  createEffect(
    () => viewing() !== undefined && items().length === 0,
    (empty) => {
      if (empty) queueMicrotask(closeLightbox);
    },
  );

  const deleteCurrent = () => {
    const now = untrack(current);
    if (!now) return;
    if (pendingCaption?.fileNo === now.item.entry.fileNo) {
      clearTimeout(captionTimer);
      pendingCaption = undefined;
    }
    field.setValue(removeEntry(latest(), now.item.entry.fileNo));
    announce(`${now.item.entry.caption || now.item.entry.fileName} removed from the record.`);
    flush();
    const left = untrack(items).length;
    if (!left) {
      returnFocus = undefined;
      closeLightbox();
      return;
    }
    returnFocus = undefined;
    show(Math.min(now.index, left - 1));
    flush();
    closeButton?.focus();
  };

  /** Keeps Tab inside the lightbox (the page behind is inert, but Tab could reach the browser's toolbar). */
  const trapTab = (event: KeyboardEvent) => {
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, [tabindex]')].filter(
      (el) => !el.hasAttribute('disabled') && el.tabIndex >= 0 && el.getClientRects().length > 0,
    );
    if (!focusable.length) return;
    const active = (dialog.getRootNode() as Document | ShadowRoot).activeElement;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  const onLightboxKey = (event: KeyboardEvent) => {
    const typing = (event.target as HTMLElement | null)?.matches?.('input, textarea, select');
    if (event.key === 'Escape') {
      event.preventDefault();
      if (untrack(confirming)) {
        setConfirming(false);
        flush();
        closeButton?.focus();
      } else closeLightbox();
    } else if (event.key === 'Tab') trapTab(event);
    else if (!typing && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && untrack(items).length > 1) {
      event.preventDefault();
      show((untrack(viewing) ?? 0) + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  };

  onSettled(() => {
    // Esc reaches the dialog's own `cancel` first in some browsers: close the same way.
    const onCancel = (event: Event) => {
      event.preventDefault();
      closeLightbox();
    };
    dialog?.addEventListener('cancel', onCancel);
    return () => {
      dialog?.removeEventListener('cancel', onCancel);
      commitCaption();
      clearTimeout(announceTimer);
      for (const upload of untrack(uploads)) if (upload.preview) URL.revokeObjectURL(upload.preview);
    };
  });

  // ------------------------------------------------------------------ rendering

  const altOf = (entry: PhotoEntry) => entry.caption?.trim() || entry.fileName || 'Photo';
  const takenText = (entry: PhotoEntry) => {
    const when = formatDateTime(entry.takenDate);
    const who = entry.takenByRel?.[0]?.name;
    if (!when && !who) return '';
    return `Taken${when ? ` ${when}` : ''}${who ? ` by ${who}` : ''}`;
  };
  const markBroken = (key: string) => setBroken((set) => new Set(set).add(key));
  const addedText = (entry: PhotoEntry) => {
    const when = formatDateTime(entry.takenDate);
    const who = entry.takenByRel?.[0]?.name;
    return [when && `Added ${when}`, who && `by ${who}`].filter(Boolean).join(' ');
  };
  const setKind = (fileNo: string, kind: string) => {
    const current = latest();
    const next = patchEntry(current, fileNo, { kind });
    if (next.some((entry, i) => entry !== current[i])) field.setValue(next);
  };

  const FileFace = (p: { entry: PhotoEntry; large?: boolean }) => (
    <span class={['pc-file', p.large && 'pc-file--large']}>
      <Glyph name="file" size={p.large ? 40 : 26} />
      <span class="pc-file__ext">{extensionOf(p.entry.fileName) || 'file'}</span>
    </span>
  );

  return (
    <FieldShell label={field.label()} labelId={labelId} mandatory={field.mandatory()} hideLabel={def().hideLabel} errors={field.errors()}>
      <div
        class={['pc', dropping() && 'pc--dropping', !editable() && 'pc--view']}
        role="group"
        aria-labelledby={labelId}
        aria-describedby={editable() ? hintId : undefined}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div class="pc-head">
          <span class="pc-count">{countText(items().map((i) => i.entry), list())}</span>
          <Show when={uploading()}>
            <span class="pc-busy">
              <Spinner />
              Uploading {uploading()}…
            </span>
          </Show>
          <Show when={editable()}>
            <span class="pc-hint" id={hintId}>
              {full() ? `The most is ${maxPhotos()}.` : list() ? 'Upload, scan or drop documents here.' : `Take, upload or drop ${noun()} here.`}
            </span>
          </Show>
        </div>

        <Show when={list()}>
          <ul class="pc-list" aria-label={field.label() || 'Documents'}>
            <For each={items()} keyed={(item) => item.key}>
              {(item, index) => (
                <li class="pc-row">
                  <button
                    type="button"
                    class="pc-row__open"
                    aria-label={`Open ${item().entry.fileName}, ${index() + 1} of ${items().length}`}
                    aria-haspopup="dialog"
                    onClick={(event) => openLightbox(index(), event.currentTarget)}
                  >
                    <span class={['pc-row__icon', isPdfEntry(item().entry) && 'pc-row__icon--pdf', item().image && 'pc-row__icon--image']} aria-hidden="true">
                      <Glyph name={item().image ? 'image' : 'file'} size={18} />
                      <span class="pc-row__ext">{extensionOf(item().entry.fileName) || 'file'}</span>
                    </span>
                    <span class="pc-row__text">
                      <span class="pc-row__name sj-truncate">{item().entry.caption || item().entry.fileName}</span>
                      <span class="pc-row__meta sj-truncate">
                        {item().entry.caption ? `${item().entry.fileName} · ` : ''}
                        {addedText(item().entry)}
                      </span>
                    </span>
                  </button>
                  <Show when={kinds().length}>
                    <Show when={editable()} fallback={<Show when={item().entry.kind}><span class="pc-kind">{item().entry.kind}</span></Show>}>
                      <select
                        class="sj-input pc-row__kind"
                        aria-label={`Type of ${item().entry.fileName}`}
                        value={item().entry.kind ?? ''}
                        onChange={(event) => setKind(untrack(item).entry.fileNo, event.currentTarget.value)}
                      >
                        <Show when={!item().entry.kind || !kinds().includes(item().entry.kind!)}>
                          <option value={item().entry.kind ?? ''}>{item().entry.kind || 'Type…'}</option>
                        </Show>
                        <For each={kindOptions()}>{(kind) => <option value={kind.value}>{kind.label}</option>}</For>
                      </select>
                    </Show>
                  </Show>
                  <DownloadLink entry={item().entry} class="sj-icon-btn pc-row__download" label={`Download ${item().entry.fileName}`}>
                    <Icon name="download" size={15} />
                  </DownloadLink>
                </li>
              )}
            </For>
            <For each={uploads()} keyed={(upload) => upload.key}>
              {(upload) => (
                <li class={['pc-row', 'pc-row--upload', upload().error && 'pc-row--failed']} role={upload().error ? 'alert' : 'status'}>
                  <span class="pc-row__icon" aria-hidden="true">
                    <Show when={upload().error} fallback={<Spinner />}>
                      <Icon name="alert" size={16} />
                    </Show>
                  </span>
                  <span class="pc-row__text">
                    <span class="pc-row__name sj-truncate">{upload().name}</span>
                    <span class="pc-row__meta">{upload().error ?? 'Uploading…'}</span>
                  </span>
                  <Show when={upload().error}>
                    <IconButton icon="x" size="sm" label={`Dismiss: ${upload().name}`} onClick={() => dismissUpload(untrack(upload).key)} />
                  </Show>
                </li>
              )}
            </For>
          </ul>
          <Show when={editable()}>
            <div class={['pc-list-add', full() && 'pc-add--full']}>
              <button
                type="button"
                class="sj-btn sj-btn--default sj-btn--sm"
                ref={firstAddButton}
                aria-disabled={full() ? 'true' : undefined}
                aria-describedby={full() ? fullId : undefined}
                onClick={() => pick(uploadInput)}
              >
                <Glyph name="upload" size={14} />
                Upload
              </button>
              <button
                type="button"
                class="sj-btn sj-btn--subtle sj-btn--sm"
                aria-disabled={full() ? 'true' : undefined}
                aria-describedby={full() ? fullId : undefined}
                onClick={() => pick(cameraInput)}
              >
                <Glyph name="camera" size={14} />
                Scan with the camera
              </button>
              <Show when={full()}>
                <span class="pc-add__full" id={fullId}>
                  {maxPhotos()} of {maxPhotos()}: remove one to add another.
                </span>
              </Show>
            </div>
          </Show>
        </Show>

        <Show when={!list()}>
        <ul class="pc-grid" aria-label={field.label() || 'Photos'} ref={grid}>
          <For each={items()} keyed={(item) => item.key}>
            {(item, index) => {
              const showImage = () => item().image && !broken().has(item().key);
              return (
                <li class="pc-tile">
                  <button
                    type="button"
                    class="pc-thumb"
                    aria-label={`Open ${altOf(item().entry)}, ${index() + 1} of ${items().length}`}
                    aria-haspopup="dialog"
                    onClick={(event) => openLightbox(index(), event.currentTarget)}
                  >
                    <Show when={showImage()} fallback={<FileFace entry={item().entry} />}>
                      <FileImage entry={item().entry} alt={altOf(item().entry)} class="pc-thumb__img" onBroken={() => markBroken(untrack(item).key)} />
                    </Show>
                  </button>
                  <Show
                    when={item().image}
                    fallback={
                      <DownloadLink entry={item().entry} class="pc-caption pc-caption--file" label={`Download ${item().entry.fileName}`}>
                        <Icon name="download" size={13} />
                        <span class="sj-truncate">{item().entry.caption || item().entry.fileName}</span>
                      </DownloadLink>
                    }
                  >
                    <Show when={captions()}>
                      <span class="pc-caption" title={item().entry.caption}>
                        {item().entry.caption}
                      </span>
                    </Show>
                  </Show>
                </li>
              );
            }}
          </For>

          <For each={uploads()} keyed={(upload) => upload.key}>
            {(upload) => (
              <li class={['pc-tile', 'pc-tile--upload', upload().error && 'pc-tile--failed']}>
                <Show
                  when={upload().error}
                  fallback={
                    <div class="pc-pending" role="status" aria-label={`Uploading ${upload().name}`}>
                      <Show when={upload().preview}>
                        {(src) => <img class="pc-pending__preview" src={src()} alt="" onError={(event) => event.currentTarget.remove()} />}
                      </Show>
                      <span class="pc-pending__body">
                        <Spinner />
                        <span class="pc-pending__name">{upload().name}</span>
                      </span>
                    </div>
                  }
                >
                  <div class="pc-failed" role="alert">
                    <Icon name="alert" size={18} />
                    <span class="pc-failed__name">{upload().name}</span>
                    <span class="pc-failed__message">{upload().error}</span>
                    <IconButton icon="x" size="sm" class="pc-failed__dismiss" label={`Dismiss: ${upload().name}`} onClick={() => dismissUpload(untrack(upload).key)} />
                  </div>
                </Show>
              </li>
            )}
          </For>

          <Show when={editable()}>
            <li class="pc-tile pc-tile--add">
              <div class={['pc-add', full() && 'pc-add--full']}>
                <button
                  type="button"
                  class="pc-add__btn"
                  ref={firstAddButton}
                  aria-disabled={full() ? 'true' : undefined}
                  aria-describedby={full() ? fullId : undefined}
                  onClick={() => pick(cameraInput)}
                >
                  <Glyph name="camera" size={16} />
                  <span>Take photo</span>
                </button>
                <button
                  type="button"
                  class="pc-add__btn"
                  aria-disabled={full() ? 'true' : undefined}
                  aria-describedby={full() ? fullId : undefined}
                  onClick={() => pick(uploadInput)}
                >
                  <Glyph name="upload" size={16} />
                  <span>Upload</span>
                </button>
                <Show when={full()}>
                  <span class="pc-add__full" id={fullId}>
                    {maxPhotos()} of {maxPhotos()}: remove one to add another.
                  </span>
                </Show>
              </div>
            </li>
          </Show>
        </ul>
        </Show>

        <Show when={!items().length && !uploads().length && !editable()}>
          <p class="pc-empty">No {noun()}.</p>
        </Show>

        <Show when={notice()}>
          <div class="sj-note sj-note--warning" role="status">
            <Icon name="info" size={14} />
            <span>{notice()}</span>
            <IconButton icon="x" size="sm" class="pc-notice__close" label="Dismiss" onClick={() => setNotice(undefined)} />
          </div>
        </Show>

        <Show when={editable()}>
          <input
            ref={cameraInput}
            class="pc-input"
            type="file"
            accept="image/*"
            capture={captureMode()}
            tabindex="-1"
            aria-label="Take photo"
            onChange={onPicked}
          />
          <input ref={uploadInput} class="pc-input" type="file" accept={accept() || undefined} multiple tabindex="-1" aria-label={`Upload ${noun()}`} onChange={onPicked} />
        </Show>

        <div class="sj-visually-hidden" role="status" aria-live="polite">
          {announcement()}
        </div>

        <dialog ref={dialog} class="pc-lightbox" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onLightboxKey} onClick={(event) => event.target === dialog && closeLightbox()}>
          <Show when={current()}>
            {(now) => {
              const entry = () => now().item.entry;
              return (
                <div class="pc-lb">
                  <header class="pc-lb__bar">
                    <h2 class="pc-lb__title" id={titleId} aria-live="polite">
                      <span class="pc-lb__counter">
                        {now().index + 1} of {now().total}
                      </span>
                      <span class="pc-lb__name sj-truncate">{entry().caption || entry().fileName}</span>
                    </h2>
                    <DownloadLink entry={entry()} class="sj-icon-btn pc-lb__tool" label={`Download ${entry().fileName}`}>
                      <Icon name="download" size={16} />
                    </DownloadLink>
                    <button type="button" class="sj-icon-btn pc-lb__tool" ref={closeButton} aria-label="Close" title="Close (Esc)" onClick={closeLightbox}>
                      <Icon name="x" size={16} />
                    </button>
                  </header>

                  <div class="pc-lb__stage">
                    <Show when={now().total > 1}>
                      <button type="button" class="pc-lb__nav pc-lb__nav--prev" aria-label="Previous" title="Previous (←)" onClick={() => show(now().index - 1)}>
                        <Icon name="chevron-left" size={20} />
                      </button>
                    </Show>
                    <Show
                      when={now().item.image && !broken().has(now().item.key) ? now().item.key : undefined}
                      keyed
                      fallback={
                        <Show when={isPdfEntry(entry())} fallback={
                        <div class="pc-lb__file">
                          <FileFace entry={entry()} large />
                          <span>{entry().fileName}</span>
                          <span class="pc-lb__muted">{now().item.image ? "This photo can't be shown here." : 'No preview for this file.'}</span>
                          <DownloadLink entry={entry()} class="sj-btn sj-btn--default sj-btn--sm">
                            <Icon name="download" size={14} />
                            Download
                          </DownloadLink>
                        </div>
                        }>
                          <PdfFrame entry={entry()} />
                        </Show>
                      }
                    >
                      {(key) => <FileImage entry={entry()} alt={altOf(entry())} class="pc-lb__img" eager onBroken={() => markBroken(key)} />}
                    </Show>
                    <Show when={now().total > 1}>
                      <button type="button" class="pc-lb__nav pc-lb__nav--next" aria-label="Next" title="Next (→)" onClick={() => show(now().index + 1)}>
                        <Icon name="chevron-right" size={20} />
                      </button>
                    </Show>
                  </div>

                  <footer class="pc-lb__meta">
                    <Show
                      when={editable() && captions()}
                      fallback={
                        <Show when={captions() && entry().caption}>
                          <p class="pc-lb__caption">{entry().caption}</p>
                        </Show>
                      }
                    >
                      <label class="pc-lb__caption-field">
                        <span class="sj-visually-hidden">Caption</span>
                        <input
                          class="sj-input"
                          placeholder="Add a caption"
                          maxlength={300}
                          value={captionDraft()}
                          onInput={(event) => typeCaption(untrack(entry).fileNo, event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitCaption();
                            }
                          }}
                          onBlur={commitCaption}
                        />
                      </label>
                    </Show>
                    <div class="pc-lb__row">
                      <span class="pc-lb__muted">
                        <Show when={entry().kind}>
                          <span class="pc-kind">{entry().kind}</span>{' '}
                        </Show>
                        {list() ? addedText(entry()) : takenText(entry())}
                      </span>
                      <Show when={editable()}>
                        <Show
                          when={confirming()}
                          fallback={
                            <button
                              type="button"
                              class="sj-btn sj-btn--subtle sj-btn--sm pc-lb__delete"
                              onClick={() => {
                                setConfirming(true);
                                flush();
                                cancelDelete?.focus();
                              }}
                            >
                              <Icon name="trash" size={14} />
                              Delete
                            </button>
                          }
                        >
                          <div class="pc-confirm" role="group" aria-label="Delete this photo?" aria-describedby={`${titleId}-confirm`}>
                            <span id={`${titleId}-confirm`}>Remove it from this record? The stored file isn't deleted.</span>
                            <button
                              type="button"
                              class="sj-btn sj-btn--default sj-btn--sm"
                              ref={cancelDelete}
                              onClick={() => {
                                setConfirming(false);
                                flush();
                                closeButton?.focus();
                              }}
                            >
                              Cancel
                            </button>
                            <button type="button" class="sj-btn sj-btn--sm pc-confirm__yes" onClick={deleteCurrent}>
                              Remove
                            </button>
                          </div>
                        </Show>
                      </Show>
                    </div>
                  </footer>
                </div>
              );
            }}
          </Show>
        </dialog>
      </div>
    </FieldShell>
  );
}
