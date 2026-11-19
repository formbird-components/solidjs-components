import '../../../solidjs-components-shared/components/checklist/src/main';
import { fleet } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Shared/Checklist', ...elementMeta('solid-checklist') } satisfies Meta<Args>;

export const DailyDriver: Story = {
  name: 'Daily Driver check',
  ...elementStory({
    app: 'fleet',
    form: fleet.dailyDriver,
    template: fleet.template,
    definition: fleet.definitions.checks,
    height: 620,
    description: 'A Daily Driver pre-start check, answered Pass / Fail / N/A by category, with progress and the sheet\'s result.',
  }),
};

export const CheckSheet: Story = {
  name: 'From a check sheet',
  ...elementStory({
    app: 'fleet',
    form: fleet.handSheet,
    template: fleet.template,
    definition: fleet.definitions.sheet,
    height: 620,
    description: 'Checks read from a check sheet document the record points to, instead of the definition.',
  }),
};
