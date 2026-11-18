import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { DateRange } from './DateRange';

defineFormbirdElement('solid-date-range', DateRange, { version, styles });
