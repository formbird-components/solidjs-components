import { createMemo } from 'solid-js';
import {
  createFieldBinding,
  cssColor,
  findByName,
  getPath,
  hueOf,
  iconSetForField,
  LookupIcon,
  RelatedPicker,
  toRelatedList,
  uid,
  type ElementProps,
  type FormbirdElementProps,
  type IconOverride,
  type IconSet,
  type RelatedDoc,
  type RelatedPickerDefinition,
  type SourceDocument,
} from '@solidjs-components/kit';

export interface LookupDefinition extends RelatedPickerDefinition {
  /** Icons next to values: issue-type tiles, priority arrows, or none. Default: guessed from the field name. */
  iconSet?: IconSet | 'auto';
  /** Per-value icon or colour, by name: `{ "Bug": { "icon": "bug", "color": "#e5484d" } }`. */
  icons?: Record<string, IconOverride>;
  /** Field on lookup documents holding a CSS colour (also add it to relatedFields to colour stored values). */
  colorField?: string;
  /**
   * Field on the documents naming each value's icon kind ("van", "forklift"…), when names don't say
   * it (asset "U-301 · Toyota HiLux" is a ute). Add it to relatedFields so stored values keep it.
   */
  iconKindField?: string;
  /** Text for an empty single value. Default "None". */
  emptyLabel?: string;
}

type Props = ElementProps<FormbirdElementProps<LookupDefinition, unknown>>;

/**
 * `<solid-lookup-picker>`: picks from lookup documents (type, priority, severity, labels...).
 * Accepts sc-related-document definitions unchanged; adds icons and coloured label chips.
 * @param props - Formbird element properties
 */
export function LookupPicker(props: Props) {
  const field = createFieldBinding<RelatedDoc[], LookupDefinition>(props, { parse: toRelatedList });
  const def = field.definition;
  const labelId = uid('label');

  const iconSet = createMemo<IconSet>(() => {
    const configured = def().iconSet;
    return !configured || configured === 'auto' ? iconSetForField(field.fieldName) : configured;
  });

  const colorOf = (entry: RelatedDoc, source?: SourceDocument) => {
    const path = def().colorField;
    return path ? cssColor(getPath(source ?? entry, path) ?? entry[path]) : undefined;
  };

  const kindOf = (entry: RelatedDoc, source?: SourceDocument): IconOverride | undefined => {
    const path = def().iconKindField;
    const kind = path ? (getPath(source ?? entry, path) ?? entry[path]) : undefined;
    const override = findByName(def().icons, entry.name);
    return typeof kind === 'string' && kind ? { ...override, icon: override?.icon ?? kind } : override;
  };

  const hasLeading = () => iconSet() !== 'none' || !!def().colorField || !!def().icons;

  return (
    <RelatedPicker
      field={field}
      labelId={labelId}
      noun="value"
      emptyLabel={def().emptyLabel ?? 'None'}
      include={[def().colorField, def().iconKindField].filter((f): f is string => !!f)}
      leading={
        hasLeading()
          ? (entry, _size, source) => (
              <LookupIcon set={iconSet()} name={entry.name} override={kindOf(entry, source)} color={colorOf(entry, source)} />
            )
          : undefined
      }
      emptyLeading={hasLeading() ? () => <span class="sj-icon-slot" aria-hidden="true" /> : undefined}
      chipHue={hasLeading() ? undefined : (entry) => hueOf(entry.name)}
    />
  );
}
