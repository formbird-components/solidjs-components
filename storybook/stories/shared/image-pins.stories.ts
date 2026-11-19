import '../../../solidjs-components-shared/components/image-pins/src/main';
import { fixtures, sharedForms } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Shared/Image pins', ...elementMeta('solid-image-pins') } satisfies Meta<Args>;

export const Body: Story = {
  name: 'Body figure',
  ...elementStory({
    app: 'shared',
    form: fixtures.incident,
    template: fixtures.incidentTemplate,
    definition: fixtures.definitionFor('injuryPinsArr', fixtures.incidentTemplate),
    height: 640,
    description: 'Where someone was hurt: numbered pins on the built-in body figure, front and back, each with its region, kind and note.',
  }),
};

export const FloorPlan: Story = {
  name: 'On an image',
  ...elementStory({
    app: 'shared',
    form: fixtures.incident,
    template: fixtures.incidentTemplate,
    definition: { ...fixtures.definitionFor('defectPinsArr', fixtures.incidentTemplate), maxPins: 3 },
    height: 600,
    description: 'Pins on any image (here a floor plan), limited to three with maxPins.',
  }),
};

export const ReadOnly: Story = {
  name: 'Read only',
  ...elementStory({
    app: 'shared',
    form: sharedForms.incidentReadOnly,
    template: fixtures.incidentTemplate,
    definition: { ...fixtures.definitionFor('injuryPinsArr', fixtures.incidentTemplate), readOnly: true },
    height: 640,
    description: 'The same pins shown without letting them change.',
  }),
};
