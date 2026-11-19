import '../../../solidjs-components-procurement/components/budget-check/src/main';
import { procurement } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Procurement/Budget check', ...elementMeta('solid-budget-check') } satisfies Meta<Args>;

export const Request: Story = {
  name: 'On a request',
  ...elementStory({
    app: 'procurement',
    form: procurement.draft,
    template: procurement.template,
    definition: procurement.definitions.budget,
    height: 360,
    description: 'Whether the request fits its cost centre\'s budget: spent, committed, waiting for approval and what is left.',
  }),
};

export const OverBudget: Story = {
  name: 'Over budget',
  ...elementStory({
    app: 'procurement',
    form: procurement.itRequest,
    template: procurement.template,
    definition: procurement.definitions.budgetOver,
    height: 380,
    description: 'A request that doesn\'t fit, and the finance override it needs.',
  }),
};

export const AllCostCentres: Story = {
  name: 'Every cost centre',
  ...elementStory({
    app: 'procurement',
    form: procurement.dashboard,
    template: procurement.template,
    definition: procurement.definitions.budgets,
    wide: true,
    height: 360,
    description: 'On a page: every cost centre against how far through the year it is.',
  }),
};

export const NoCostCentres: Story = {
  name: 'No cost centres',
  ...elementStory({
    app: 'procurement',
    form: procurement.dashboard,
    template: procurement.template,
    definition: procurement.definitions.budgetsNone,
    height: 240,
    description: 'The empty text when the search finds no cost centre.',
  }),
};
