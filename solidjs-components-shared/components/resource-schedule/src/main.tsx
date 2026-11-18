import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { ResourceSchedule } from './ResourceSchedule';

defineFormbirdElement('solid-resource-schedule', ResourceSchedule, { version, styles });
