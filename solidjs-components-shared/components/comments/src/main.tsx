import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { Comments } from './Comments';

defineFormbirdElement('solid-comments', Comments, { version, styles });
