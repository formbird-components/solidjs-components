import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { PhotoCapture } from './PhotoCapture';

defineFormbirdElement('solid-photo-capture', PhotoCapture, { version, styles });
