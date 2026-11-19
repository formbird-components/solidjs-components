import '../../../solidjs-components-fleet/components/meter-reading/src/main';
import { fleet } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Fleet/Meter reading', ...elementMeta('solid-meter-reading') } satisfies Meta<Args>;

export const Reading: Story = {
  name: 'Reading',
  ...elementStory({
    app: 'fleet',
    form: fleet.dailyDriver,
    template: fleet.template,
    definition: fleet.definitions.meter,
    height: 300,
    description: 'An odometer or engine hours reading checked against the asset\'s current meter, with the change since its last reading.',
  }),
};
