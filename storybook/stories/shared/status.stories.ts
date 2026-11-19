import '../../../solidjs-components-shared/components/status/src/main';
import { fixtures } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Shared/Status', ...elementMeta('solid-status') } satisfies Meta<Args>;

export const Issue: Story = {
  name: 'Issue',
  ...elementStory({
    app: 'shared',
    form: fixtures.issue,
    template: fixtures.issueTemplate,
    definition: fixtures.definitionFor('statusRel'),
    height: 300,
    description: 'An issue in progress: the lozenge offers only the transitions its workflow allows from here.',
  }),
};

export const NewIssue: Story = {
  name: 'New issue',
  ...elementStory({
    app: 'shared',
    form: fixtures.newIssue,
    template: fixtures.issueTemplate,
    definition: fixtures.definitionFor('statusRel'),
    height: 300,
    description: 'A record that has not been saved yet starts in its first status.',
  }),
};
