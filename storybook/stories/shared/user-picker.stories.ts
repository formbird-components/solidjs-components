import '../../../solidjs-components-shared/components/user-picker/src/main';
import { fixtures } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Shared/User picker', ...elementMeta('solid-user-picker') } satisfies Meta<Args>;

export const Assignee: Story = {
  name: 'Assignee',
  ...elementStory({
    app: 'shared',
    form: fixtures.issue,
    template: fixtures.issueTemplate,
    definition: fixtures.definitionFor('assigneeRel'),
    height: 380,
    description: 'One person, with avatars and "Assign to me".',
  }),
};

export const Reporter: Story = {
  name: 'Reporter',
  ...elementStory({
    app: 'shared',
    form: fixtures.issue,
    template: fixtures.issueTemplate,
    definition: fixtures.definitionFor('reporterRel'),
    height: 380,
    description: 'The person who raised it.',
  }),
};

export const Watchers: Story = {
  name: 'Watchers',
  ...elementStory({
    app: 'shared',
    form: fixtures.issue,
    template: fixtures.issueTemplate,
    definition: fixtures.definitionFor('monitoringRel'),
    height: 380,
    description: 'Several people.',
  }),
};
