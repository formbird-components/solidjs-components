import { For, Show, omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { hashString, initials } from '../host/util';
import { Icon, type IconName } from './icons';

type ClassValue = JSX.ClassValue;

type AvatarSize = 'sm' | 'md' | 'lg';

/** Hue (0–359) derived from a name, so a person keeps the same colour everywhere. */
export const hueOf = (name: string | undefined): number => hashString((name ?? '').toLowerCase()) % 360;

/**
 * Circular avatar: a photo when `src` is given, otherwise initials on a colour from the name.
 * @param props - name, optional photo URL and size
 */
export function Avatar(props: { name?: string; src?: string; size?: AvatarSize; title?: string }) {
  return (
    <span
      class={['sj-avatar', props.size && props.size !== 'md' && `sj-avatar--${props.size}`]}
      style={{ '--sj-avatar-hue': String(hueOf(props.name)) }}
      title={props.title ?? props.name}
      aria-hidden="true"
    >
      <Show when={props.src} fallback={initials(props.name)}>
        <img src={props.src} alt="" loading="lazy" />
      </Show>
    </span>
  );
}

/** Placeholder avatar for "Unassigned". */
export function EmptyAvatar(props: { size?: AvatarSize }) {
  return (
    <span class={['sj-avatar', 'sj-avatar--empty', props.size && props.size !== 'md' && `sj-avatar--${props.size}`]} aria-hidden="true">
      <Icon name="user" size={props.size === 'lg' ? 18 : props.size === 'sm' ? 12 : 14} />
    </span>
  );
}

/**
 * Status pill tinted from a colour (works in light and dark themes).
 * @param props - colour, optional leading dot, and the text
 */
export function Lozenge(props: { color?: string; dot?: boolean; title?: string; children: JSX.Element }) {
  return (
    <span class="sj-lozenge sj-tint sj-caps" style={props.color ? { '--sj-lozenge': props.color } : undefined} title={props.title}>
      <Show when={props.dot}>
        <span class="sj-lozenge__dot" aria-hidden="true" />
      </Show>
      <span class="sj-lozenge__text">{props.children}</span>
    </span>
  );
}

/**
 * Value chip with an optional remove button.
 * @param props - label, colour hue (or plain), leading visual and remove handler
 */
export function Chip(props: {
  label: string;
  hue?: number;
  plain?: boolean;
  leading?: JSX.Element;
  onRemove?: () => void;
}) {
  return (
    <span
      class={['sj-chip', props.plain && 'sj-chip--plain', !props.onRemove && 'sj-chip--static']}
      style={props.hue === undefined ? undefined : { '--sj-chip-hue': String(props.hue) }}
      title={props.label}
    >
      {props.leading}
      <span class="sj-chip__label">{props.label}</span>
      <Show when={props.onRemove}>
        <button
          type="button"
          class="sj-chip__remove"
          aria-label={`Remove ${props.label}`}
          onClick={(event) => {
            event.stopPropagation();
            props.onRemove?.();
          }}
        >
          <Icon name="x" size={12} strokeWidth={2} />
        </button>
      </Show>
    </span>
  );
}

type ButtonVariant = 'primary' | 'default' | 'subtle';

/**
 * Text button.
 * @param props - variant, size, optional leading icon, and native button attributes
 */
export function Button(
  props: {
    variant?: ButtonVariant;
    size?: 'sm' | 'md';
    icon?: IconName;
    class?: ClassValue;
    children?: JSX.Element;
  } & Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'children'>,
) {
  const native = omit(props, 'variant', 'size', 'icon', 'class', 'children');
  return (
    <button
      type="button"
      {...native}
      class={['sj-btn', `sj-btn--${props.variant ?? 'default'}`, props.size === 'sm' && 'sj-btn--sm', props.class]}
    >
      <Show when={props.icon}>{(name) => <Icon name={name()} size={14} />}</Show>
      {props.children}
    </button>
  );
}

/**
 * Square icon-only button; `label` is its accessible name and tooltip.
 * @param props - icon, label, size and native button attributes
 */
export function IconButton(
  props: { icon: IconName; label: string; size?: 'sm' | 'md'; class?: ClassValue } & Omit<
    JSX.ButtonHTMLAttributes<HTMLButtonElement>,
    'class' | 'children'
  >,
) {
  const native = omit(props, 'icon', 'label', 'size', 'class');
  return (
    <button
      type="button"
      {...native}
      class={['sj-icon-btn', props.size === 'sm' && 'sj-icon-btn--sm', props.class]}
      aria-label={props.label}
      title={props.label}
    >
      <Icon name={props.icon} size={props.size === 'sm' ? 14 : 16} />
    </button>
  );
}

/**
 * Label, control and validation messages, laid out the same way for every field.
 * @param props - label (with id for aria-labelledby), mandatory marker, errors and the control
 */
export function FieldShell(props: {
  label?: string;
  labelId: string;
  mandatory?: boolean;
  hideLabel?: boolean;
  errors?: string[];
  class?: ClassValue;
  children: JSX.Element;
}) {
  return (
    <div class={['sj-field', props.errors?.length && 'sj-field--invalid', props.class]}>
      <Show when={props.label && !props.hideLabel}>
        <span class="sj-field__label" id={props.labelId}>
          {props.label}
          <Show when={props.mandatory}>
            <span class="sj-field__required" aria-hidden="true">
              *
            </span>
          </Show>
        </span>
      </Show>
      {props.children}
      <Show when={props.errors?.length}>
        <div class="sj-field__errors" role="alert">
          <For each={props.errors}>
            {(message) => (
              <p>
                <Icon name="alert" size={14} />
                {message}
              </p>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
