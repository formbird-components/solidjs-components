import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { ApprovalChain } from './ApprovalChain';

defineFormbirdElement('solid-approval-chain', ApprovalChain, { version, styles });
