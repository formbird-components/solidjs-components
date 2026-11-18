import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { ImagePins } from './ImagePins';

defineFormbirdElement('solid-image-pins', ImagePins, { version, styles });
