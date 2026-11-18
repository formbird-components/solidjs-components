import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import { UserPicker } from './UserPicker';

defineFormbirdElement('solid-user-picker', UserPicker, { version });
