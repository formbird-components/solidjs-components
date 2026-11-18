import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { RootCause } from './RootCause';

defineFormbirdElement('solid-root-cause', RootCause, { version, styles });
