import { createSignal, type Accessor } from 'solid-js';

export type Theme = 'light' | 'dark';

/** fieldtec-web's ThemeService toggles this class on <body> (and on the CDK overlay container). */
const DARK_CLASS = 'dark-theme';

const readTheme = (): Theme => (globalThis.document?.body?.classList.contains(DARK_CLASS) ? 'dark' : 'light');

const [theme, setTheme] = createSignal<Theme>(readTheme());

function watchBody(): void {
  const body = globalThis.document?.body;
  if (!body || typeof MutationObserver === 'undefined') return;
  setTheme(readTheme());
  new MutationObserver(() => setTheme(readTheme())).observe(body, { attributes: true, attributeFilter: ['class'] });
}

// One observer for every component on the page, installed when the kit loads.
if (globalThis.document?.body) watchBody();
else globalThis.document?.addEventListener('DOMContentLoaded', watchBody, { once: true });

/**
 * The host's current colour theme. Shadow DOM can't see `body.dark-theme` through CSS in every
 * browser (`:host-context` is Chromium-only), so elements mirror it into a `data-sj-theme` attribute.
 * @returns Accessor for "light" or "dark"
 */
export function useTheme(): Accessor<Theme> {
  return theme;
}
