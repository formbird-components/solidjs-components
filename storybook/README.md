# storybook

A Storybook of every Solid element in the solidjs-components repos: the 15 generic ones in
`solidjs-components-shared` and each app's own (issue tracker, fleet, work health and safety, HR,
procurement), 27 in all.

```sh
pnpm install
pnpm storybook    # dev server with live reload: http://localhost:6006
pnpm build        # static build in dist/ (the portal serves it at /storybook/)
pnpm typecheck    # the stories, and the element sources and fixtures they import
```

It needs the other repos checked out beside it, with their dependencies installed (`pnpm db:setup`
or `pnpm install` in each).

## How it works

- **Elements from source.** Each stories file imports the element's `src/main.tsx`, compiled with the
  same Solid compiler, Solid 2.0 runtime and aliases as the repos' own builds (`solidPlugin` and
  `sharedAliases` from `solidjs-components-shared/packages/tools/vite-config.mjs`).
- **Mounted like fieldtec-web.** `src/story.ts` creates the element and sets its properties
  (`document`, `template`, `componentDefinition`…) the way fieldtec-web's ComponentService does.
- **On the in-memory host.** Every story installs the mock host from `@solidjs-components/testing`
  with one app's fixtures (`src/apps.ts`): the same data as that app's preview and browser test.
  Files the host would serve from `api/getFile` are the fixtures' sample pictures, or stand-ins
  (`src/files.ts`).
- **Controls and docs from the types.** `scripts/elements.mjs` writes `generated/elements.json`
  with every element's options, read from its TypeScript definition interface by
  `scripts/component-options.mjs` (the same source as `COMPONENTS.md`). It runs before `storybook`,
  `build` and `typecheck`.
- **Actions.** What the element writes to the document and asks of the host (notifications,
  navigation, modals, new records, uploads) shows in the Actions panel.
- **Theme.** The toolbar's Theme switches fieldtec-web's `body.dark-theme`, which the elements follow.

## Adding an element

Add `stories/<app>/<element>.stories.ts`:

```ts
import '../../../solidjs-components-fleet/components/meter-reading/src/main';
import { fleet } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Fleet/Meter reading', ...elementMeta('solid-meter-reading') } satisfies Meta<Args>;

export const Reading: Story = {
  name: 'Reading',
  ...elementStory({ app: 'fleet', form: fleet.dailyDriver, template: fleet.template, definition: fleet.definitions.meter }),
};
```

Keep `title` and `name` as literals: Storybook reads them without running the file. A story's
`definition` is best taken from the app's fixtures, so the story, the preview and the browser test
show the same thing.
