import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { IssueSummary } from './IssueSummary';

defineFormbirdElement('solid-issue-summary', IssueSummary, { version, styles });
