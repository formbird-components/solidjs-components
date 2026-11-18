import {
  Avatar,
  createFieldBinding,
  currentAccount,
  EmptyAvatar,
  getPath,
  RelatedPicker,
  toRelatedList,
  uid,
  type ElementProps,
  type FormbirdElementProps,
  type PickerItem,
  type RelatedDoc,
  type RelatedPickerDefinition,
  type SourceDocument,
} from '@solidjs-components/kit';

export interface UserDefinition extends RelatedPickerDefinition {
  /** Account field shown under each name. Default "email". */
  emailField?: string;
  /** Account field holding a photo URL; initials are shown without one. */
  avatarField?: string;
  /** Offer "Assign to me" / "Add me". Default true. */
  showAssignToMe?: boolean;
  /** Text for an empty single value. Default "Unassigned". */
  emptyLabel?: string;
}

type Props = ElementProps<FormbirdElementProps<UserDefinition, unknown>>;

/** Used when the definition has no filter yet (SDMS sets it from a ruleset on load). */
const ACTIVE_ACCOUNTS = {
  sort: [{ 'systemHeader.summaryName': 'asc' }],
  query: {
    bool: {
      filter: [{ term: { 'systemHeader.systemType': 'account' } }],
      must_not: [{ term: { inactiveBool: true } }],
    },
  },
};

/**
 * `<solid-user-picker>`: assignee, reporter or watchers, with avatars and "Assign to me".
 * Accepts sc-related-document definitions unchanged.
 * @param props - Formbird element properties
 */
export function UserPicker(props: Props) {
  const field = createFieldBinding<RelatedDoc[], UserDefinition>(props, { parse: toRelatedList });
  const def = field.definition;
  const labelId = uid('label');
  const single = () => def().singleSelection === true;

  const emailOf = (entry: RelatedDoc, source?: SourceDocument) => {
    const path = def().emailField ?? 'email';
    const email = getPath(source ?? entry, path) ?? entry[path];
    return typeof email === 'string' ? email : undefined;
  };
  const photoOf = (entry: RelatedDoc, source?: SourceDocument) => {
    const path = def().avatarField;
    const url = path ? (getPath(source ?? entry, path) ?? entry[path]) : undefined;
    return typeof url === 'string' && url ? url : undefined;
  };

  const quickActions = ({ select }: { select: (entry: RelatedDoc) => void }): PickerItem[] => {
    if (def().showAssignToMe === false) return [];
    const me = currentAccount(def().relatedFields);
    if (!me || field.value().some((v) => v.documentId === me.documentId)) return [];
    return [
      {
        key: '__me',
        label: single() ? 'Assign to me' : 'Add me',
        action: true,
        leading: () => <Avatar name={me.name} src={photoOf(me)} />,
        onSelect: () => select(me),
      },
    ];
  };

  return (
    <RelatedPicker
      field={field}
      labelId={labelId}
      noun="person"
      searchPlaceholder="Search people"
      addText={`Add ${(field.label() || 'people').toLowerCase()}`}
      emptyLabel={def().emptyLabel ?? (single() ? 'Unassigned' : 'None')}
      emptyLeading={() => <EmptyAvatar />}
      leading={(entry, size, source) => (
        <Avatar name={entry.name} src={photoOf(entry, source)} size={size === 'sm' ? 'sm' : 'md'} />
      )}
      describe={(option) => emailOf(option.entry, option.source)}
      quickActions={quickActions}
      defaultFilter={ACTIVE_ACCOUNTS}
      include={[def().emailField ?? 'email', ...(def().avatarField ? [def().avatarField!] : [])]}
    />
  );
}
