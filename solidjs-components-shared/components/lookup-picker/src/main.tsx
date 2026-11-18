import { defineFormbirdElement } from '@solidjs-components/kit';
import { version } from '../package.json';
import { LookupPicker } from './LookupPicker';

defineFormbirdElement('solid-lookup-picker', LookupPicker, { version });
