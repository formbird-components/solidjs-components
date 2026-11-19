import '../../../solidjs-components-whs/components/root-cause/src/main';
import { whs } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Work health and safety/Root cause', ...elementMeta('solid-root-cause') } satisfies Meta<Args>;

export const Investigation: Story = {
  name: 'Investigation',
  ...elementStory({
    app: 'whs',
    form: whs.incident,
    template: whs.template,
    definition: whs.definitions.rootCause,
    wide: true,
    height: 600,
    description: 'A five-whys tree: the problem, answers to "why?" that can branch, root causes with categories, and what the analysis still needs.',
  }),
};

export const NewInvestigation: Story = {
  name: 'New investigation',
  ...elementStory({
    app: 'whs',
    form: whs.newIncident,
    template: whs.template,
    definition: whs.definitions.rootCauseNew,
    wide: true,
    height: 420,
    description: 'An empty analysis.',
  }),
};
