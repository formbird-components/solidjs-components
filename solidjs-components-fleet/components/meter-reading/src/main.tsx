import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { MeterReading } from './MeterReading';

defineFormbirdElement('solid-meter-reading', MeterReading, { version, styles });
