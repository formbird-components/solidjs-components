import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { RecordKey } from './RecordKey';

defineFormbirdElement('solid-record-key', RecordKey, { version, styles });
