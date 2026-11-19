import '../../../solidjs-components-shared/components/approval-chain/src/main';
import { hr } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Shared/Approval chain', ...elementMeta('solid-approval-chain') } satisfies Meta<Args>;

export const Pending: Story = {
  name: 'Waiting for a decision',
  ...elementStory({
    app: 'hr',
    form: hr.meiLeave,
    template: hr.template,
    definition: hr.definitions.approval,
    height: 460,
    description: 'A leave request on its way through its approvers: who decides, in order, and who is next. Here the signed-in person can approve or reject it with a comment.',
  }),
};

export const Decided: Story = {
  name: 'Decided',
  ...elementStory({
    app: 'hr',
    form: hr.decidedLeave,
    template: hr.template,
    definition: hr.definitions.decided,
    height: 420,
    description: 'A request every approver has decided, with their decisions and comments.',
  }),
};
