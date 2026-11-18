import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { OrgChart } from './OrgChart';

defineFormbirdElement('solid-org-chart', OrgChart, { version, styles });
