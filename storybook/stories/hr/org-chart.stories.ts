import '../../../solidjs-components-hr/components/org-chart/src/main';
import { hr } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'HR/Org chart', ...elementMeta('solid-org-chart') } satisfies Meta<Args>;

export const Organisation: Story = {
  name: 'Organisation',
  ...elementStory({
    app: 'hr',
    form: hr.dashboard,
    template: hr.template,
    definition: hr.definitions.org,
    wide: true,
    height: 640,
    description: 'People by whom they report to, with team colour, title, reports and who is on leave today; expand, collapse, search and zoom.',
  }),
};

export const Person: Story = {
  name: 'On a person',
  ...elementStory({
    app: 'hr',
    form: hr.sarahProfile,
    template: hr.template,
    definition: hr.definitions.orgFocus,
    wide: true,
    height: 520,
    description: 'On a person\'s form: their reporting line and direct reports.',
  }),
};
