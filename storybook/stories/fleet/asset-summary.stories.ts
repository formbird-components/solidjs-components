import '../../../solidjs-components-fleet/components/asset-summary/src/main';
import { fleet } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Fleet/Asset summary', ...elementMeta('solid-asset-summary') } satisfies Meta<Args>;

export const Asset: Story = {
  name: 'Asset',
  ...elementStory({
    app: 'fleet',
    form: fleet.assets.v101,
    template: fleet.template,
    definition: fleet.definitions.summary,
    wide: true,
    height: 360,
    description: 'The header of an asset: type, ID, registration, lifecycle and hire status, meter, service due and registration warnings, with quick actions.',
  }),
};
