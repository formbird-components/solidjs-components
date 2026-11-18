import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { Status } from './Status';

defineFormbirdElement('solid-status', Status, { version, styles });
