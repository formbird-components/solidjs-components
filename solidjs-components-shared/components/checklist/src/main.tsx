import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { Checklist } from './Checklist';

defineFormbirdElement('solid-checklist', Checklist, { version, styles });
