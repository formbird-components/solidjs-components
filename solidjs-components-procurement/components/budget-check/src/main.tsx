import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { BudgetCheck } from './BudgetCheck';

defineFormbirdElement('solid-budget-check', BudgetCheck, { version, styles });
