import { getPath } from './util';

interface HandlebarsLike {
  compile(source: string): (context: unknown) => string;
}

const compiled = new Map<string, (context: unknown) => string>();

/**
 * Renders `{{ }}` expressions in a string, the way Formbird component filters are written.
 *
 * Uses the page's global Handlebars (fieldtec-web loads one, with its helpers registered), so
 * filters behave exactly as they do in sc-related-document. When no Handlebars is loaded (preview,
 * tests), falls back to plain `{{path.to.value}}` interpolation.
 * @param source - Template string
 * @param context - Values available to the template
 * @returns The rendered string
 */
export function renderTemplate(source: string, context: Record<string, unknown>): string {
  if (!source.includes('{{')) return source;
  const handlebars = (globalThis as { Handlebars?: HandlebarsLike }).Handlebars;
  if (handlebars?.compile) {
    let render = compiled.get(source);
    if (!render) {
      render = handlebars.compile(source);
      compiled.set(source, render);
    }
    return render(context);
  }
  return source.replace(/\{\{\{?\s*([\w$.[\]-]+)\s*\}?\}\}/g, (_, path: string) => {
    // Handlebars writes literal segments as `items.[1]`; accept `items[1]` too.
    const value = getPath(context, path.replace(/\.?\[([^\]]+)\]/g, '.$1'));
    return value === undefined || value === null ? '' : String(value);
  });
}
