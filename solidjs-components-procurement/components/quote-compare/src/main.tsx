import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { QuoteCompare } from './QuoteCompare';

defineFormbirdElement('solid-quote-compare', QuoteCompare, { version, styles });
