import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { LeaveBalance } from './LeaveBalance';

defineFormbirdElement('solid-leave-balance', LeaveBalance, { version, styles });
