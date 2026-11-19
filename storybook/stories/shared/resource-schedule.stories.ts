import '../../../solidjs-components-shared/components/resource-schedule/src/main';
import { hr } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Shared/Resource schedule', ...elementMeta('solid-resource-schedule') } satisfies Meta<Args>;

export const LeaveCalendar: Story = {
  name: 'Leave calendar (HR)',
  ...elementStory({
    app: 'hr',
    form: hr.dashboard,
    template: hr.template,
    definition: hr.definitions.calendar,
    wide: true,
    height: 620,
    description: 'People by day, grouped by team, with how many are left on each day against the team\'s minimum, public holidays shaded and leave balances per row. Drag across free days to start a request.',
  }),
};
