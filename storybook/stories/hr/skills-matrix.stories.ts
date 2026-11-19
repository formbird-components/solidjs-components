import '../../../solidjs-components-hr/components/skills-matrix/src/main';
import { hr } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'HR/Skills matrix', ...elementMeta('solid-skills-matrix') } satisfies Meta<Args>;

export const Matrix: Story = {
  name: 'Skills matrix',
  ...elementStory({
    app: 'hr',
    form: hr.dashboard,
    template: hr.template,
    definition: hr.definitions.matrix,
    wide: true,
    height: 600,
    description: 'People × certificate types, each cell valid, expiring, expired or missing against what the person\'s position requires, with compliance per person, per type and overall.',
  }),
};
