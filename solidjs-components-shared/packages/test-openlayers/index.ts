// TEST ONLY: sets `globalThis.OL` like the published openlayers-shared (see surface.ts).
// OpenLayers' own stylesheet isn't part of openlayers-shared either; map elements style the few
// controls they use themselves.
import { OL_SURFACE } from './surface';

Object.assign(globalThis, { OL: OL_SURFACE });
