import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { StatTiles } from './StatTiles';

defineFormbirdElement('solid-stat-tiles', StatTiles, { version, styles });
