// Builds an element's stories: the docs and controls from generated/elements.json (the options of its
// TypeScript definition interface), and a render that mounts the element the way fieldtec-web's
// ComponentService does (properties, not attributes) on an app's in-memory host.
import type { ArgTypes, Meta, StoryObj } from '@storybook/html-vite';
import { action } from 'storybook/actions';
import { createFormElement, type MockHost } from '@solidjs-components/testing';
import elements from '../generated/elements.json';
import { installApp, type AppKey, type ComponentDef, type Doc } from './apps';

type Option = { name: string; type: string; optional: boolean; doc: string; common: boolean };
type Element = { tag: string; app: string; repo: string; source: string; version: string; description: string; options: Option[] };
const ELEMENTS = elements as Record<string, Element>;

export type Args = ComponentDef;
export type Story = StoryObj<Args>;

/** Options that pick the element or are fieldtec-web's form layout: not useful as controls. */
const NO_CONTROL = new Set(['componentName', 'type', 'layout', 'skipRendering']);

function controlFor(option: Option): ArgTypes[string]['control'] {
  if (NO_CONTROL.has(option.name)) return false;
  const type = option.type.replace(/\s*\|\s*undefined$/, '');
  if (type === 'boolean') return 'boolean';
  if (type === 'number') return 'number';
  if (type === 'string') return 'text';
  if (/^'[^']*'(\s*\|\s*'[^']*')+$/.test(type)) return 'select';
  return 'object';
}

function argTypesOf(element: Element): Partial<ArgTypes<Args>> {
  const argTypes: Partial<ArgTypes<Args>> = {};
  for (const option of element.options) {
    const control = controlFor(option);
    const literals = control === 'select' ? [...option.type.matchAll(/'([^']*)'/g)].map((m) => m[1]) : undefined;
    argTypes[option.name] = {
      description: option.doc,
      type: { name: 'other', value: option.type, required: !option.optional },
      table: { type: { summary: option.type }, category: option.common ? 'Common options' : `<${element.tag}> options` },
      control: control === 'select' ? { type: 'select' } : control,
      ...(literals ? { options: literals } : {}),
    };
  }
  return argTypes;
}

/**
 * The default export of an element's stories file, apart from its title.
 * @param tag - The element, e.g. "solid-status"
 */
export function elementMeta(tag: string): Omit<Meta<Args>, 'title'> {
  const element = ELEMENTS[tag];
  if (!element) throw new Error(`${tag} isn't in generated/elements.json: run pnpm elements.`);
  const own = element.options.filter((o) => !o.common).length;
  return {
    argTypes: argTypesOf(element),
    parameters: {
      docs: {
        description: {
          component: [
            `\`<${tag}>\` · ${element.app} · version ${element.version} · source \`${element.source}\``,
            '',
            element.description,
            '',
            `Each story mounts the element as fieldtec-web does, on the in-memory host with an app's fixtures. ` +
              `Its controls are the componentDefinition (${own} options of its own, and the common ones); ` +
              `what it writes to the document and asks of the host shows in the Actions panel.`,
          ].join('\n'),
        },
      },
    },
  };
}

let key = 0;
let current: { host: MockHost; off: () => void } | null = null;

/** Sends the host's new changes and events to the Actions panel as they happen. */
function report(host: MockHost): () => void {
  let changes = 0;
  let events = 0;
  return host.subscribe(() => {
    for (const change of host.changes.slice(changes)) action(`${change.fieldName} changed`)(change.value);
    for (const event of host.events.slice(events)) action(`host: ${event.type}`)(event.detail);
    changes = host.changes.length;
    events = host.events.length;
  });
}

/**
 * One story: an element with a componentDefinition (its args) on a document open in an app.
 * @param o.app - Whose fixtures the host holds
 * @param o.form - The document open in the form
 * @param o.definition - The componentDefinition; the story's controls start from it
 * @param o.template - The template the element sits on (a stand-in when it doesn't matter)
 * @param o.wide - Full width, for calendars, tables and maps
 * @param o.height - Height of the story's frame on the docs page
 * @param o.description - What this story shows
 */
export function elementStory(o: {
  app: AppKey;
  form: Doc;
  definition: ComponentDef;
  template?: Record<string, unknown>;
  wide?: boolean;
  height?: number;
  description?: string;
}): Story {
  return {
    args: structuredClone(o.definition),
    parameters: {
      docs: {
        ...(o.description ? { description: { story: o.description } } : {}),
        story: { inline: false, iframeHeight: o.height ?? 420 },
      },
    },
    render: (args) => {
      current?.off();
      current?.host.uninstall();
      const host = installApp(o.app);
      current = { host, off: report(host) };
      const element = createFormElement(String(args.componentName), {
        document: Object.assign(host.form(o.form.documentId), { documentId: o.form.documentId, systemHeader: o.form.systemHeader }),
        template: (o.template ?? { documentId: 'template-story', components: [] }) as Doc,
        componentDefinition: structuredClone(args),
        key: key++,
      });
      const wrapper = document.createElement('div');
      wrapper.className = o.wide ? 'sb-element sb-element--wide' : 'sb-element';
      wrapper.append(element);
      return wrapper;
    },
  };
}
