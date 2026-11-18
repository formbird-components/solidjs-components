import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { CorrectiveActions } from './CorrectiveActions';

defineFormbirdElement('solid-corrective-actions', CorrectiveActions, { version, styles });
