import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { AssetSummary } from './AssetSummary';

defineFormbirdElement('solid-asset-summary', AssetSummary, { version, styles });
