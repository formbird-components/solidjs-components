import '../../../solidjs-components-shared/components/map/src/main';
import { fleet } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Shared/Map', ...elementMeta('solid-map') } satisfies Meta<Args>;

export const Layers: Story = {
  name: 'Layers (fleet map)',
  ...elementStory({
    app: 'fleet',
    form: fleet.dashboard,
    template: fleet.template,
    definition: fleet.definitions.map,
    wide: true,
    height: 600,
    description: 'Live searches as layers: assets by type and hire status, and sites with their boundaries, with popups and actions. Map tiles come from OpenStreetMap.',
  }),
};

export const Location: Story = {
  name: 'Point (asset location)',
  ...elementStory({
    app: 'fleet',
    form: fleet.assets.v101,
    template: fleet.template,
    definition: fleet.definitions.location,
    height: 520,
    description: 'Editing one document\'s location.',
  }),
};
