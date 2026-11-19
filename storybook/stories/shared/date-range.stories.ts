import '../../../solidjs-components-shared/components/date-range/src/main';
import { fleet, hr } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Shared/Date range', ...elementMeta('solid-date-range') } satisfies Meta<Args>;

export const Booking: Story = {
  name: 'Date and time (booking)',
  ...elementStory({
    app: 'fleet',
    form: fleet.newBooking,
    template: fleet.template,
    definition: fleet.definitions.period,
    height: 420,
    description: 'Start and end with times, as on a fleet booking: quick durations, the duration shown, and the time range rules.',
  }),
};

export const Leave: Story = {
  name: 'Days (leave)',
  ...elementStory({
    app: 'hr',
    form: hr.newLeave,
    template: hr.template,
    definition: hr.definitions.dates,
    height: 460,
    description: 'First and last day, as on a leave request: half days, and working days counted without weekends and public holidays.',
  }),
};
