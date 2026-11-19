import '../../../solidjs-components-shared/components/record-key/src/main';
import { fixtures } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Shared/Record key', ...elementMeta('solid-record-key') } satisfies Meta<Args>;

export const Issue: Story = {
  name: 'Issue',
  ...elementStory({
    app: 'shared',
    form: fixtures.issue,
    template: fixtures.issueTemplate,
    definition: fixtures.definitionFor('itemRef'),
    height: 200,
    description: 'A record\'s reference number with its type icon and a copy-link button.',
  }),
};

export const NewIssue: Story = {
  name: 'New issue',
  ...elementStory({
    app: 'shared',
    form: fixtures.newIssue,
    template: fixtures.issueTemplate,
    definition: fixtures.definitionFor('itemRef'),
    height: 200,
    description: 'Before the first save: the server assigns the number.',
  }),
};
