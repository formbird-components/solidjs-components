// TEST ONLY: the same globals formbird-sc-components' solid-vendor sets (minus tom-select and
// es-toolkit), built from the versions pinned in pnpm-workspace.yaml. Production pages get these
// from solid-vendor; this bundle is never deployed.
import * as SolidJS from 'solid-js';
import * as SolidJSWeb from '@solidjs/web';
import * as SolidElement from '@solidjs/element';

const target = globalThis as Record<string, unknown>;
target.SolidJS = SolidJS;
target.SolidJSWeb = SolidJSWeb;
target.SolidElement = SolidElement;
