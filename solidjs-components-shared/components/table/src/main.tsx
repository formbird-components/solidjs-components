import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { Table } from './Table';

defineFormbirdElement('solid-table', Table, { version, styles });
