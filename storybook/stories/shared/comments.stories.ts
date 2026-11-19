import '../../../solidjs-components-shared/components/comments/src/main';
import { fixtures } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Shared/Comments', ...elementMeta('solid-comments') } satisfies Meta<Args>;

export const Thread: Story = {
  name: 'Comment thread',
  ...elementStory({
    app: 'shared',
    form: fixtures.issue,
    template: fixtures.issueTemplate,
    definition: fixtures.definitionFor('notesCommentsArr'),
    height: 560,
    description: 'An issue\'s comments with Markdown, replies, edits and votes, stored like sc-note-comment.',
  }),
};
