import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { MapElement } from './MapElement';

defineFormbirdElement('solid-map', MapElement, { version, styles });
