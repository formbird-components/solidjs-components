import '../../../solidjs-components-hr/components/leave-balance/src/main';
import { hr } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'HR/Leave balance', ...elementMeta('solid-leave-balance') } satisfies Meta<Args>;

export const Request: Story = {
  name: 'On a leave request',
  ...elementStory({
    app: 'hr',
    form: hr.newLeave,
    template: hr.template,
    definition: hr.definitions.balance,
    height: 360,
    description: 'What is available on the first day, this request, and what is left after.',
  }),
};

export const Unpaid: Story = {
  name: 'Unpaid leave',
  ...elementStory({
    app: 'hr',
    form: hr.unpaidLeave,
    template: hr.template,
    definition: hr.definitions.unpaidBalance,
    height: 300,
    description: 'A leave type without a balance.',
  }),
};

export const MyBalances: Story = {
  name: 'My balances',
  ...elementStory({
    app: 'hr',
    form: hr.dashboard,
    template: hr.template,
    definition: hr.definitions.balances,
    wide: true,
    height: 320,
    description: 'On a page: the signed-in person\'s balances as cards.',
  }),
};
