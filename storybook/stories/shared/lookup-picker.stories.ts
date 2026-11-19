import '../../../solidjs-components-shared/components/lookup-picker/src/main';
import { fixtures } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Shared/Lookup picker', ...elementMeta('solid-lookup-picker') } satisfies Meta<Args>;

export const Type: Story = {
  name: 'Single pick (type)',
  ...elementStory({
    app: 'shared',
    form: fixtures.issue,
    template: fixtures.issueTemplate,
    definition: fixtures.definitionFor('typeRel'),
    height: 380,
    description: 'One value from lookup documents, with their icons.',
  }),
};

export const Priority: Story = {
  name: 'Single pick (priority)',
  ...elementStory({
    app: 'shared',
    form: fixtures.issue,
    template: fixtures.issueTemplate,
    definition: fixtures.definitionFor('priorityRel'),
    height: 380,
    description: 'Priority lookups with their icons.',
  }),
};

export const Labels: Story = {
  name: 'Multi pick (labels)',
  ...elementStory({
    app: 'shared',
    form: fixtures.issue,
    template: fixtures.issueTemplate,
    definition: fixtures.definitionFor('tagsRel'),
    height: 380,
    description: 'Several values at once.',
  }),
};
