import { createEffect, createMemo, createSignal, onCleanup, untrack, type Accessor } from 'solid-js';
import { getService } from './services';
import type { BaseDefinition, FormbirdElementProps, Unsubscribable } from './types';
import { jsonEqual, uid } from './util';

/** Broadcast fieldtec-web's ValidationService sends after validating a field. */
const VALIDATE_EVENT = 'document:validateFormFields';

export interface FieldBinding<TValue, TDef extends BaseDefinition> {
  /** Field this element is bound to (`componentDefinition.name`). */
  readonly fieldName: string;
  /** Unique per element instance; identifies this control as the source of its changes. */
  readonly controlName: string;
  /** The component definition, including changes rulesets make at runtime (setFilter, enable/disable). */
  definition: Accessor<TDef>;
  /** Current field value. */
  value: Accessor<TValue>;
  /** Updates the field locally and in the host's document state. */
  setValue(next: TValue): void;
  /** Writes another field of the same document (e.g. a resolution alongside a status). */
  setOtherField(fieldName: string, value: unknown): void;
  disabled: Accessor<boolean>;
  mandatory: Accessor<boolean>;
  label: Accessor<string>;
  /** Validation messages the host has flagged for this field. */
  errors: Accessor<string[]>;
  /** Handlebars context for filters: document, template, account, componentDefinition. */
  templateContext(): Record<string, unknown>;
}

export interface FieldOptions<TValue> {
  /** Converts a raw document value into the shape the component works with. */
  parse?: (raw: unknown) => TValue;
}

/**
 * Binds a component to its document field: the value, writes back to the host, external changes
 * (rulesets, other components on the same field), live component-definition changes and validation.
 * Every component in this repo goes through this, so host behaviour is handled in one place.
 * @param props - The element's Formbird properties
 * @param options - Value parsing
 * @returns The binding
 */
export function createFieldBinding<TValue, TDef extends BaseDefinition = BaseDefinition>(
  props: FormbirdElementProps<TDef>,
  options: FieldOptions<TValue> = {},
): FieldBinding<TValue, TDef> {
  const parse = options.parse ?? ((raw: unknown) => raw as TValue);
  const changes = getService('ChangedDocumentService');

  // Identity of the binding is fixed for the element's lifetime.
  const { fieldName, documentId, templateId, key } = untrack(() => ({
    fieldName: props.fieldName || props.componentDefinition?.name || '',
    documentId: props.document?.documentId as string | undefined,
    templateId: props.template?.documentId as string | undefined,
    key: props.key,
  }));
  const controlName = uid(`${fieldName || 'field'}-${key ?? 0}`);
  const subscriptions: Unsubscribable[] = [];
  onCleanup(() => subscriptions.forEach((s) => s.unsubscribe()));

  // Component definition: the template's, overlaid with what rulesets change at runtime.
  const [ruleDefinition, setRuleDefinition] = createSignal<Partial<TDef> | undefined>(undefined, { ownedWrite: true });
  const definition = createMemo(() => ({ ...(props.componentDefinition ?? {}), ...(ruleDefinition() ?? {}) }) as TDef);
  if (fieldName && changes?.watchComponentDef) {
    subscriptions.push(
      changes.watchComponentDef(fieldName, templateId, key).subscribe((def) => {
        if (def) setRuleDefinition(() => ({ ...def }) as Partial<TDef>);
      }),
    );
  }

  // Value. `latest` is read synchronously by the echo check: Solid 2 stages signal writes, so the
  // signal itself can still hold the previous value inside the same callback.
  let latest = parse(untrack(() => props.fieldValue));
  const [value, setLocal] = createSignal<TValue>(latest as Exclude<TValue, Function>, {
    equals: jsonEqual,
    ownedWrite: true,
  });
  const receive = (raw: unknown) => {
    const next = parse(raw);
    if (jsonEqual(next, latest)) return; // our own change coming back, or a no-op
    latest = next;
    setLocal(() => next);
  };
  createEffect(
    () => props.fieldValue,
    (raw) => receive(raw),
  );
  if (fieldName && changes?.watch) {
    // The host echoes a change back to its own control as well; `receive` ignores equal values.
    subscriptions.push(changes.watch(fieldName, documentId, controlName).subscribe(receive));
  }

  const write = (name: string, next: unknown) => {
    if (!changes) return;
    if (changes.notifyValueChanged) {
      changes.notifyValueChanged(documentId, name, next, untrack(() => props.formParameters), controlName);
    } else if (changes.valueChanged) {
      const component = untrack(() => ({
        document: props.document,
        template: props.template,
        componentDefinition: definition(),
        fieldName: name,
        fieldValue: next,
        formParameters: props.formParameters,
        key: props.key,
      }));
      changes.valueChanged(component, next, controlName);
    }
  };

  // Validation, mirroring fieldtec-web's <ft-validation-display>.
  const validation = getService('ValidationService');
  const [validationTick, setValidationTick] = createSignal(0, { ownedWrite: true });
  const broadcast = getService('BroadcastService');
  if (broadcast?.on && fieldName) {
    subscriptions.push(
      broadcast.on<{ documentId?: string; fieldName?: string }>(VALIDATE_EVENT).subscribe((event) => {
        if (event?.documentId === documentId && event?.fieldName === fieldName) setValidationTick((t) => t + 1);
      }),
    );
  }
  const errors = createMemo(() => {
    validationTick();
    if (!validation || !documentId || !fieldName) return [];
    const state = validation.validationCtrlValues?.[documentId]?.[fieldName];
    if (!state) return [];
    const validators = validation.loadValidators?.(definition(), fieldName) ?? [];
    return validators.filter((v) => state[v.name] === true).map((v) => v.text);
  });

  return {
    fieldName,
    controlName,
    definition,
    value,
    setValue(next) {
      latest = next;
      setLocal(() => next);
      write(fieldName, next);
    },
    setOtherField(name, next) {
      write(name, next);
    },
    disabled: () => definition().enabled === false || definition().readOnly === true,
    mandatory: () => definition().mandatory === true,
    label: () => definition().label ?? '',
    errors,
    templateContext: () =>
      untrack(() => ({
        document: props.document,
        doc: props.document,
        template: props.template,
        tpl: props.template,
        componentDefinition: definition(),
        account: getService('LoggedInUserService')?.user?.account,
      })),
  };
}

/**
 * Read-only view of another field of the same document, kept current as rulesets or other
 * components change it (e.g. the issue type next to the key, the resolution next to the status).
 * @param props - The element's Formbird properties
 * @param fieldName - Field to follow
 * @param parse - Converts the raw value
 * @returns Accessor for the field's current value
 */
export function createDocumentField<T>(
  props: FormbirdElementProps<BaseDefinition>,
  fieldName: string,
  parse: (raw: unknown) => T = (raw) => raw as T,
): Accessor<T> {
  const documentId = untrack(() => props.document?.documentId as string | undefined);
  const initial = parse(untrack(() => (props.document as Record<string, unknown> | undefined)?.[fieldName]));
  const [value, setValue] = createSignal<T>(initial as Exclude<T, Function>, { equals: jsonEqual, ownedWrite: true });
  const changes = getService('ChangedDocumentService');
  if (fieldName && changes?.watch) {
    const subscription = changes.watch(fieldName, documentId).subscribe((raw) => setValue(() => parse(raw)));
    onCleanup(() => subscription.unsubscribe());
  }
  return value;
}
