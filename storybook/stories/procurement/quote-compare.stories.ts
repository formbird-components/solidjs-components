import '../../../solidjs-components-procurement/components/quote-compare/src/main';
import { procurement } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Procurement/Quote compare', ...elementMeta('solid-quote-compare') } satisfies Meta<Args>;

export const Quotes: Story = {
  name: 'Quotes',
  ...elementStory({
    app: 'procurement',
    form: procurement.draft,
    template: procurement.template,
    definition: procurement.definitions.quotes,
    wide: true,
    height: 520,
    description: 'Supplier quotes side by side: amount against the cheapest, lead time, validity, approved supplier and the quote document; how many quotes the amount needs; choose one or add one.',
  }),
};
