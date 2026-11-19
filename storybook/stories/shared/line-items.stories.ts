import '../../../solidjs-components-shared/components/line-items/src/main';
import { fleet, procurement } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Shared/Line items', ...elementMeta('solid-line-items') } satisfies Meta<Args>;

export const WorkOrder: Story = {
  name: 'Work order (fleet)',
  ...elementStory({
    app: 'fleet',
    form: fleet.workOrder,
    template: fleet.template,
    definition: fleet.definitions.lines,
    wide: true,
    height: 520,
    description: 'A workshop work order\'s parts and labour, with a catalogue to pick from and totals per kind.',
  }),
};

export const PurchaseRequest: Story = {
  name: 'Purchase request (procurement)',
  ...elementStory({
    app: 'procurement',
    form: procurement.draft,
    template: procurement.template,
    definition: procurement.definitions.lines,
    wide: true,
    height: 520,
    description: 'A purchase request\'s goods, services and freight, with subtotal, tax and total.',
  }),
};
