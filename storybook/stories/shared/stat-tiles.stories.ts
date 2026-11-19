import '../../../solidjs-components-shared/components/stat-tiles/src/main';
import { fleet, whs } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Shared/Stat tiles', ...elementMeta('solid-stat-tiles') } satisfies Meta<Args>;

export const FleetOverview: Story = {
  name: 'Fleet overview',
  ...elementStory({
    app: 'fleet',
    form: fleet.dashboard,
    template: fleet.template,
    definition: fleet.definitions.tiles,
    wide: true,
    height: 300,
    description: 'Each tile is a live count from its search, with a tone, a hint and a link to the list behind it.',
  }),
};

export const SafetyOverview: Story = {
  name: 'Safety overview',
  ...elementStory({
    app: 'whs',
    form: whs.dashboard,
    template: whs.template,
    definition: whs.definitions.tiles,
    wide: true,
    height: 300,
    description: 'The same element on the safety overview.',
  }),
};
