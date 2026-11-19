import '../../../solidjs-components-internal/components/issue-summary/src/main';
import { fixtures } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Issue tracker/Issue summary', ...elementMeta('solid-issue-summary') } satisfies Meta<Args>;

export const Issue: Story = {
  name: 'Issue',
  ...elementStory({
    app: 'shared',
    form: fixtures.issue,
    template: fixtures.issueTemplate,
    definition: fixtures.definitionFor('summary'),
    height: 220,
    description: 'An issue\'s title, edited in place.',
  }),
};

export const NewIssue: Story = {
  name: 'New issue',
  ...elementStory({
    app: 'shared',
    form: fixtures.newIssue,
    template: fixtures.issueTemplate,
    definition: fixtures.definitionFor('summary'),
    height: 220,
    description: 'An empty title on a new issue.',
  }),
};
