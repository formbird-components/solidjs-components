import '../../../solidjs-components-whs/components/risk-matrix/src/main';
import { whs } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Work health and safety/Risk matrix', ...elementMeta('solid-risk-matrix') } satisfies Meta<Args>;

export const Assess: Story = {
  name: 'Assess a risk',
  ...elementStory({
    app: 'whs',
    form: whs.incident,
    template: whs.template,
    definition: whs.definitions.matrix,
    height: 560,
    description: 'A 5 × 5 likelihood × consequence matrix rating a risk field: rating, score and what the rating asks for.',
  }),
};

export const Residual: Story = {
  name: 'Risk with controls',
  ...elementStory({
    app: 'whs',
    form: whs.pedestrianHazard,
    template: whs.template,
    definition: whs.definitions.residual,
    height: 560,
    description: 'The risk with controls, with the risk before controls as a ghost marker.',
  }),
};

export const Heatmap: Story = {
  name: 'Heatmap',
  ...elementStory({
    app: 'whs',
    form: whs.dashboard,
    template: whs.template,
    definition: whs.definitions.heatmap,
    wide: true,
    height: 600,
    description: 'Records counted per cell, and the records in a cell listed.',
  }),
};
