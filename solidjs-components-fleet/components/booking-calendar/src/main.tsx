import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { BookingCalendar } from './BookingCalendar';

defineFormbirdElement('solid-booking-calendar', BookingCalendar, { version, styles });
