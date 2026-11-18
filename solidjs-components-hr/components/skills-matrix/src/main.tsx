import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import styles from './styles.css?inline';
import { SkillsMatrix } from './SkillsMatrix';

defineFormbirdElement('solid-skills-matrix', SkillsMatrix, { version, styles });
