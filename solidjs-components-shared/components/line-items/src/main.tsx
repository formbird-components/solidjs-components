import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { LineItems } from './LineItems';

defineFormbirdElement('solid-line-items', LineItems, { version, styles });
