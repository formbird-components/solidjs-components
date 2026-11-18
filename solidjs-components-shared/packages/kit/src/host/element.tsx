import { customElement } from '@solidjs/element';
import { createEffect, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import kitCss from '../styles/kit.css?inline';
import { useTheme } from './theme';
import type { FormbirdElementProps } from './types';

/** Properties fieldtec-web sets on a component element (see ComponentService.createComponent). */
const FORMBIRD_PROPS = {
  document: undefined,
  template: undefined,
  componentDefinition: undefined,
  fieldName: '',
  fieldValue: undefined,
  previousFieldValue: undefined,
  formParameters: undefined,
  key: 0,
  account: undefined,
};

export interface ElementOptions {
  /** Written to the `fb-component-version` attribute, like Angular sc-* components. */
  version: string;
  /** Component CSS (imported with `?inline`). Kit styles are always included. */
  styles?: string;
  /** Extra element properties beyond the Formbird ones, with defaults. */
  props?: Record<string, unknown>;
}

/** Props a registered component receives: the Formbird properties plus its host element. */
export type ElementProps<P> = P & { host: HTMLElement };

type HostElement = HTMLElement & { renderRoot: ShadowRoot | HTMLElement };

const supportsAdoptedSheets =
  typeof ShadowRoot !== 'undefined' &&
  'adoptedStyleSheets' in ShadowRoot.prototype &&
  typeof CSSStyleSheet !== 'undefined' &&
  'replaceSync' in CSSStyleSheet.prototype;

// One parsed stylesheet per id, shared by every instance of every element on the page.
const sheets = new Map<string, CSSStyleSheet>();
function sharedSheet(id: string, css: string): CSSStyleSheet {
  let sheet = sheets.get(id);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    sheets.set(id, sheet);
  }
  return sheet;
}

/**
 * Registers a Solid component as a Formbird custom element.
 *
 * Each element renders in its own shadow root (isolated from the host's Angular Material styles)
 * that adopts the kit stylesheet and the component's own stylesheet, both parsed once per page.
 * It also sets `fb-component-version` and mirrors the host theme into `data-sj-theme`.
 * @param tag - Custom element name; must match the component document's `name`
 * @param Component - The Solid component
 * @param options - Version, styles and extra properties
 * @example
 * ```tsx
 * defineFormbirdElement('solid-issue-status', IssueStatus, { version, styles });
 * ```
 */
export function defineFormbirdElement<P extends FormbirdElementProps<any, any>>(
  tag: string,
  Component: (props: ElementProps<P>) => JSX.Element,
  options: ElementOptions,
): void {
  if (typeof customElements === 'undefined') return;
  if (customElements.get(tag)) {
    console.warn(`[solidjs-components] <${tag}> is already defined; keeping the first definition.`);
    return;
  }

  const propDefinition = { ...FORMBIRD_PROPS, ...options.props } as unknown as Parameters<typeof customElement<P>>[1];

  customElement<P>(tag, propDefinition, (props, { element }) => {
    const host = element as unknown as HostElement;
    const root = host.renderRoot;
    host.setAttribute('fb-component-version', options.version);

    const theme = useTheme();
    host.setAttribute('data-sj-theme', untrack(theme));
    createEffect(
      () => theme(),
      (value) => host.setAttribute('data-sj-theme', value),
    );

    let inlineCss: string | undefined;
    if (supportsAdoptedSheets && root instanceof ShadowRoot) {
      root.adoptedStyleSheets = options.styles
        ? [sharedSheet('kit', kitCss), sharedSheet(tag, options.styles)]
        : [sharedSheet('kit', kitCss)];
    } else {
      inlineCss = kitCss + (options.styles ?? '');
    }

    return (
      <>
        {inlineCss && <style>{inlineCss}</style>}
        <Component {...(props as P)} host={host} />
      </>
    );
  });
}
