import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { RiskMatrix } from './RiskMatrix';

defineFormbirdElement('solid-risk-matrix', RiskMatrix, { version, styles });
