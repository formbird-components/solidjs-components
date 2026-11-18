// The OpenLayers modules formbird-sc-components' openlayers-shared puts on `globalThis.OL`
// (packages/openlayers-shared/src/main.ts there). Map elements use OpenLayers only through that
// global, so they share one copy with Formbird's own mapping components and never bundle it.
// This file lists the same modules, for the types (OLGlobal) and for the test-only bundle.
import Feature from 'ol/Feature';
import Map from 'ol/Map';
import View from 'ol/View';
import Overlay from 'ol/Overlay';
import * as control from 'ol/control';
import * as interaction from 'ol/interaction';
import * as proj from 'ol/proj';
import * as extent from 'ol/extent';
import * as color from 'ol/color';
import * as sphere from 'ol/sphere';
import * as geom from 'ol/geom';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import MultiLineString from 'ol/geom/MultiLineString';
import Polygon from 'ol/geom/Polygon';
import MultiPolygon from 'ol/geom/MultiPolygon';
import MultiPoint from 'ol/geom/MultiPoint';
import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import CircleStyle from 'ol/style/Circle';
import Icon from 'ol/style/Icon';
import Text from 'ol/style/Text';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import Group from 'ol/layer/Group';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import VectorSource from 'ol/source/Vector';

export const OL_SURFACE = {
  Feature, Map, View, Overlay,
  control, interaction, proj, extent, color, sphere,
  geom,
  Point, LineString, MultiLineString, Polygon, MultiPolygon, MultiPoint,
  Style, Fill, Stroke, CircleStyle, Icon, Text,
  TileLayer, VectorLayer, Group,
  OSM, XYZ, VectorSource,
};

/** Type of `globalThis.OL`. */
export type OLGlobal = typeof OL_SURFACE;
