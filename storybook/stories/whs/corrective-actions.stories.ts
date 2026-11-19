import '../../../solidjs-components-whs/components/corrective-actions/src/main';
import { whs } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Work health and safety/Corrective actions', ...elementMeta('solid-corrective-actions') } satisfies Meta<Args>;

export const Incident: Story = {
  name: 'On an incident',
  ...elementStory({
    app: 'whs',
    form: whs.incident,
    template: whs.template,
    definition: whs.definitions.actions,
    wide: true,
    height: 480,
    description: 'The actions raised against an incident, live, with control level, owner, due date and status, and a quick form to raise one.',
  }),
};

export const NewIncident: Story = {
  name: 'On a new incident',
  ...elementStory({
    app: 'whs',
    form: whs.newIncident,
    template: whs.template,
    definition: whs.definitions.actionsNew,
    wide: true,
    height: 360,
    description: 'Before the incident is saved.',
  }),
};

export const Hazard: Story = {
  name: 'On a hazard',
  ...elementStory({
    app: 'whs',
    form: whs.pedestrianHazard,
    template: whs.template,
    definition: whs.definitions.hazardActions,
    wide: true,
    height: 480,
    description: 'Actions raised against a hazard.',
  }),
};
