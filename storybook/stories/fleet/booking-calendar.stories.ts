import '../../../solidjs-components-fleet/components/booking-calendar/src/main';
import { fleet } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Fleet/Booking calendar', ...elementMeta('solid-booking-calendar') } satisfies Meta<Args>;

export const Calendar: Story = {
  name: 'Calendar',
  ...elementStory({
    app: 'fleet',
    form: fleet.dashboard,
    template: fleet.template,
    definition: fleet.definitions.calendar,
    wide: true,
    height: 640,
    description: 'Assets by location and day, bookings by status, Hire Overdue and workshop block-outs. Drag across free time to start a booking.',
  }),
};

export const Availability: Story = {
  name: 'Availability on a booking',
  ...elementStory({
    app: 'fleet',
    form: fleet.newBooking,
    template: fleet.template,
    definition: fleet.definitions.availability,
    wide: true,
    height: 560,
    description: 'On a booking form: clashes with the chosen time, and the assets that are free.',
  }),
};
