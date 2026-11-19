import '../../../solidjs-components-shared/components/table/src/main';
import { fixtures } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Shared/Table', ...elementMeta('solid-table') } satisfies Meta<Args>;

export const AllIssues: Story = {
  name: 'All issues',
  ...elementStory({
    app: 'shared',
    form: fixtures.listPage,
    template: fixtures.listTemplate,
    definition: fixtures.definitionFor('allItemsDt', fixtures.listTemplate),
    wide: true,
    height: 560,
    description: 'Documents from a search with typed columns, server-side sorting and paging, search and CSV export.',
  }),
};

export const AssignedToMe: Story = {
  name: 'Assigned to me',
  ...elementStory({
    app: 'shared',
    form: fixtures.listPage,
    template: fixtures.listTemplate,
    definition: fixtures.definitionFor('assignedToMeDt', fixtures.listTemplate),
    wide: true,
    height: 460,
    description: 'A filter on the signed-in person.',
  }),
};

export const People: Story = {
  name: 'People',
  ...elementStory({
    app: 'shared',
    form: fixtures.listPage,
    template: fixtures.listTemplate,
    definition: fixtures.definitionFor('peopleDt', fixtures.listTemplate),
    wide: true,
    height: 460,
    description: 'A table of accounts.',
  }),
};
