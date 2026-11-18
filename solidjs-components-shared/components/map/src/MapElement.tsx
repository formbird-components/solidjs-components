import { createEffect, createMemo, createSignal, For, onCleanup, onSettled, Show, untrack } from 'solid-js';
import {
  Button,
  createFieldBinding,
  FieldShell,
  formatDateTime,
  formatNumber,
  getPath,
  getService,
  glyphFor,
  glyphSvg,
  Icon,
  IconButton,
  Lozenge,
  openDocument,
  parseFilter,
  relativeTime,
  searchPage,
  statusAppearance,
  toRelatedList,
  uid,
  type BaseDefinition,
  type ElementProps,
  type FormbirdElementProps,
  type IconSet,
  type SourceDocument,
  runAction,
  type RecordAction,
} from '@solidjs-components/kit';
import {
  featureProperties,
  firstPoint,
  firstPolygon,
  formatLonLat,
  pointValue,
  polygonValue,
  toCollection,
  type GeoCollection,
  type LonLat,
} from './geo';
import { getOL, type OLGlobal } from './ol';

/** A field shown in a feature's popup. */
export interface PopupField {
  label: string;
  path: string;
  /** "text" (default), "status" (a related status value), "number", "datetime" or "relative". */
  type?: 'text' | 'status' | 'number' | 'datetime' | 'relative';
  suffix?: string;
}

/** Documents drawn on the map. */
export interface MapLayer {
  name: string;
  label: string;
  /** Elasticsearch request for the documents (Handlebars allowed). */
  filter: string | Record<string, unknown>;
  /** Field holding the GeoJSON location (FeatureCollection, as Formbird stores addresses). */
  geometryField: string;
  /** How features look. */
  style?: {
    /** "tile": an icon tile (asset types); "marker": a dot; "area": polygons with their name (default by geometry). */
    kind?: 'tile' | 'marker' | 'area';
    color?: string;
    /** Related status field whose colour paints the feature (e.g. "hireStatusRel"). */
    statusField?: string;
    /** Icon family for tiles (default "asset") and the field naming the value (e.g. "assetTypeRel.0.name"). */
    iconSet?: IconSet;
    iconField?: string;
    /** Field holding an explicit icon kind (e.g. "assetTypeRel.0.iconKind"). */
    iconKindField?: string;
    /** Field labelling areas (default the summary name). */
    labelField?: string;
  };
  popup?: {
    /** Field for the title (default the summary name). */
    titleField?: string;
    fields?: PopupField[];
    actions?: RecordAction[];
  };
  /** Start with the layer switched off. */
  hidden?: boolean;
}

export interface MapDefinition extends BaseDefinition {
  /** "layers" (default): show documents; "point": edit this field's point; "area": edit this field's boundary. */
  mode?: 'layers' | 'point' | 'area';
  layers?: MapLayer[];
  /** CSS height (default 440px, or 320px when editing). */
  height?: string;
  /** [lon, lat] when there is nothing to fit to (default Sydney). */
  center?: LonLat;
  zoom?: number;
  /** XYZ tile URL (default OpenStreetMap) and its attribution. */
  tileUrl?: string;
  tileAttribution?: string;
  /** Show the list of features beside the map (layers mode; default true when wide). */
  showList?: boolean;
  hideLabel?: boolean;
}

type Props = ElementProps<FormbirdElementProps<MapDefinition, unknown>>;
type OLMap = InstanceType<OLGlobal['Map']>;
type OLFeature = InstanceType<OLGlobal['Feature']>;
type OLVectorSource = InstanceType<OLGlobal['VectorSource']>;
type OLVectorLayer = InstanceType<OLGlobal['VectorLayer']>;

const SYDNEY: LonLat = [151.2093, -33.8688];
const ACCENT = '#5b47e0';

interface Placed {
  key: string;
  layer: MapLayer;
  doc: SourceDocument;
  name: string;
  color: string;
  point?: LonLat;
  /** Drawn as an area (a site boundary): left out of the side list, which lists things at a point. */
  area: boolean;
}

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const docName = (doc: SourceDocument) => text(getPath(doc, 'systemHeader.summaryName'));

/** A status colour from a related status value ([{ name, color }]). */
function statusColor(doc: SourceDocument, field: string | undefined, fallback: string): string {
  if (!field) return fallback;
  const status = toRelatedList(getPath(doc, field))[0];
  return status ? statusAppearance(status.name, {}, status as unknown as SourceDocument).color : fallback;
}

/** Hex/rgb colour with an alpha, for canvas fills. */
function withAlpha(ol: OLGlobal, color: string, alpha: number): number[] | string {
  try {
    const [r, g, b] = ol.color.asArray(color);
    return [r, g, b, alpha];
  } catch {
    return color;
  }
}

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/**
 * `<solid-map>`: Formbird documents on a map, or a document's own location to set.
 * @param props - Formbird element properties
 */
export function MapElement(props: Props) {
  const field = createFieldBinding<GeoCollection | undefined, MapDefinition>(props, { parse: toCollection });
  const def = field.definition;
  const labelId = uid('label');
  const mode = untrack(() => def().mode ?? 'layers');
  const ol = getOL();

  const [placed, setPlaced] = createSignal<Placed[]>([]);
  const [hiddenLayers, setHiddenLayers] = createSignal<ReadonlySet<string>>(new Set(untrack(() => (def().layers ?? []).filter((l) => l.hidden).map((l) => l.name))));
  const [selected, setSelected] = createSignal<Placed>();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [reloads, setReloads] = createSignal(0);
  const [drawing, setDrawing] = createSignal(false);
  const [wide, setWide] = createSignal(true);

  let container: HTMLDivElement | undefined;
  let popupEl: HTMLDivElement | undefined;
  let wrapper: HTMLDivElement | undefined;
  let map: OLMap | undefined;
  let overlay: InstanceType<OLGlobal['Overlay']> | undefined;
  const sources = new Map<string, OLVectorSource>();
  const layers = new Map<string, OLVectorLayer>();
  let editSource: OLVectorSource | undefined;
  let drawInteraction: InstanceType<OLGlobal['interaction']['Draw']> | undefined;
  let editInteraction: { setActive(active: boolean): void } | undefined;

  // ---------------------------------------------------------------- styles
  const styleCache = new Map<string, unknown>();
  const tileStyle = (layer: MapLayer, doc: SourceDocument, color: string, isSelected: boolean) => {
    const name = text(getPath(doc, layer.style?.iconField ?? 'assetTypeRel.0.name'));
    const kind = layer.style?.iconKindField ? text(getPath(doc, layer.style.iconKindField)) || undefined : undefined;
    const set = layer.style?.iconSet ?? 'asset';
    const glyph = glyphFor(set, name, kind);
    const key = `tile|${set}|${name}|${kind}|${color}|${isSelected}`;
    if (!styleCache.has(key) && ol) {
      const svg = glyph ? glyphSvg(glyph, { color, size: 26, ring: isSelected ? '#ffffff' : undefined }) : '';
      styleCache.set(
        key,
        new ol.Style({
          image: glyph
            ? new ol.Icon({ src: svgUrl(svg), scale: isSelected ? 1.25 : 1, anchor: [0.5, 0.5] })
            : new ol.CircleStyle({ radius: 7, fill: new ol.Fill({ color }), stroke: new ol.Stroke({ color: '#fff', width: 2 }) }),
          zIndex: isSelected ? 10 : 1,
        }),
      );
    }
    return styleCache.get(key);
  };
  const markerStyle = (color: string, isSelected: boolean, big = false) => {
    const key = `marker|${color}|${isSelected}|${big}`;
    if (!styleCache.has(key) && ol) {
      styleCache.set(
        key,
        new ol.Style({
          image: new ol.CircleStyle({
            radius: big ? 9 : isSelected ? 9 : 7,
            fill: new ol.Fill({ color }),
            stroke: new ol.Stroke({ color: '#ffffff', width: isSelected || big ? 3 : 2 }),
          }),
          zIndex: isSelected ? 10 : 1,
        }),
      );
    }
    return styleCache.get(key);
  };
  const areaStyle = (color: string, label: string, isSelected: boolean) => {
    if (!ol) return undefined;
    return new ol.Style({
      fill: new ol.Fill({ color: withAlpha(ol, color, isSelected ? 0.22 : 0.1) }),
      stroke: new ol.Stroke({ color, width: isSelected ? 3 : 2 }),
      text: label
        ? new ol.Text({
            text: label,
            font: '600 12px system-ui, sans-serif',
            fill: new ol.Fill({ color: '#1b1b24' }),
            stroke: new ol.Stroke({ color: '#ffffff', width: 3 }),
            overflow: true,
          })
        : undefined,
    });
  };

  // ---------------------------------------------------------------- features
  const toFeature = (geometry: { type: string; coordinates: unknown }): OLFeature | undefined => {
    if (!ol) return undefined;
    if (geometry.type === 'Point') {
      const point = geometry.coordinates as LonLat;
      return new ol.Feature({ geometry: new ol.Point(ol.proj.fromLonLat(point)) });
    }
    if (geometry.type === 'Polygon') {
      const rings = (geometry.coordinates as LonLat[][]).map((ring) => ring.map((p) => ol.proj.fromLonLat(p)));
      return new ol.Feature({ geometry: new ol.Polygon(rings) });
    }
    if (geometry.type === 'LineString') {
      return new ol.Feature({ geometry: new ol.LineString((geometry.coordinates as LonLat[]).map((p) => ol.proj.fromLonLat(p))) });
    }
    return undefined;
  };

  const renderLayer = (layer: MapLayer, list: Placed[]) => {
    const source = sources.get(layer.name);
    if (!source || !ol) return;
    source.clear();
    for (const item of list) {
      const collection = toCollection(getPath(item.doc, layer.geometryField));
      for (const [index, geo] of (collection?.features ?? []).entries()) {
        if (!geo.geometry) continue;
        const feature = toFeature(geo.geometry);
        if (!feature) continue;
        feature.setId(`${item.key}#${index}`);
        feature.set('placedKey', item.key);
        const isArea = geo.geometry.type !== 'Point';
        const kind = layer.style?.kind ?? (isArea ? 'area' : 'marker');
        feature.setStyle(() => {
          const isSelected = untrack(selected)?.key === item.key;
          if (isArea) return areaStyle(item.color, text(getPath(item.doc, layer.style?.labelField ?? 'systemHeader.summaryName')), isSelected) as never;
          return (kind === 'tile' ? tileStyle(layer, item.doc, item.color, isSelected) : markerStyle(item.color, isSelected)) as never;
        });
        source.addFeature(feature);
      }
    }
  };

  // ---------------------------------------------------------------- loading
  let loadId = 0;
  const load = async () => {
    const id = ++loadId;
    const list = untrack(() => def().layers ?? []);
    const context = untrack(() => field.templateContext());
    setLoading(true);
    try {
      const results = await Promise.all(
        list.map(async (layer) => {
          const request = parseFilter(layer.filter, context);
          if (!request) return [] as Placed[];
          const include = [
            'documentId',
            'systemHeader.summaryName',
            layer.geometryField,
            layer.style?.statusField,
            // tileStyle falls back to the asset type's name.
            (layer.style?.iconField ?? 'assetTypeRel.0.name').split('.0.')[0],
            layer.style?.iconKindField?.split('.0.')[0],
            layer.style?.labelField,
            layer.popup?.titleField,
            ...(layer.popup?.fields ?? []).map((f) => f.path.split('.0.')[0]),
            ...(layer.popup?.actions ?? []).flatMap((a) => Object.values(a.values ?? {}).flatMap((v) => (v && typeof v === 'object' ? Object.values((v as { $record?: object; $asset?: object }).$record ?? (v as { $asset?: object }).$asset ?? {}) : []))),
          ].filter((v): v is string => typeof v === 'string' && !!v);
          const { documents } = await searchPage({ request, page: 0, pageSize: 500, include: [...new Set(include)] });
          const fallback = layer.style?.color ?? ACCENT;
          return documents
            .filter((doc) => toCollection(getPath(doc, layer.geometryField)))
            .map((doc) => ({
              key: `${layer.name}:${text(doc.documentId)}`,
              layer,
              doc,
              name: text(getPath(doc, layer.popup?.titleField ?? 'systemHeader.summaryName')) || docName(doc),
              color: statusColor(doc, layer.style?.statusField, fallback),
              point: firstPoint(getPath(doc, layer.geometryField)) ?? centroid(getPath(doc, layer.geometryField)),
              // As the features are styled: an explicit kind, else whether it has a point at all.
              area: layer.style?.kind === 'area' || (!layer.style?.kind && !firstPoint(getPath(doc, layer.geometryField))),
            }));
        }),
      );
      if (id !== loadId) return;
      list.forEach((layer, index) => renderLayer(layer, results[index]));
      setPlaced(results.flat());
      setError(undefined);
      fitOnce();
    } catch (err) {
      if (id === loadId) setError((err as Error)?.message || 'Loading the map failed');
    } finally {
      if (id === loadId) setLoading(false);
    }
  };

  const centroid = (value: unknown): LonLat | undefined => {
    const ring = firstPolygon(value);
    if (!ring) return undefined;
    const points = ring.slice(0, -1);
    return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
  };

  let fitted = false;
  const fitOnce = () => {
    if (fitted || !map || !ol) return;
    fitted = true;
    fitAll(false);
  };
  const fitAll = (animate = true) => {
    if (!map || !ol) return;
    const extent = ol.extent.createEmpty();
    for (const source of [...sources.values(), ...(editSource ? [editSource] : [])]) {
      if (source.getFeatures().length) ol.extent.extend(extent, source.getExtent());
    }
    if (ol.extent.isEmpty(extent)) return;
    map.getView().fit(extent, { padding: [48, 48, 48, 48], maxZoom: 16, duration: animate ? 300 : 0 });
  };

  // ---------------------------------------------------------------- editing (point / area)
  const editValue = () => field.value();
  const syncEditFeature = () => {
    if (!editSource || !ol) return;
    editSource.clear();
    const value = editValue();
    const geometry = value?.features[0]?.geometry;
    const feature = geometry && toFeature(geometry);
    if (feature) {
      feature.setStyle((mode === 'area' ? areaStyle(ACCENT, '', true) : markerStyle(ACCENT, false, true)) as never);
      editSource.addFeature(feature);
    }
  };
  const writePoint = (point: LonLat) => {
    const props = { ...featureProperties(editValue()), source: 'manual', recordedDate: new Date().toISOString() };
    field.setValue(pointValue(point, props));
  };
  const writePolygon = (ring: LonLat[]) => field.setValue(polygonValue(ring, featureProperties(editValue())));
  const clearValue = () => {
    field.setValue(undefined);
    setDrawing(false);
  };
  const locateMe = () => {
    navigator.geolocation?.getCurrentPosition(
      (position) => {
        const point: LonLat = [position.coords.longitude, position.coords.latitude];
        writePoint(point);
        map?.getView().animate({ center: ol!.proj.fromLonLat(point), zoom: 16, duration: 300 });
      },
      () => setError('Your location is not available.'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  // ---------------------------------------------------------------- the map
  onSettled(() => {
    if (!ol || !container) return;
    const tileUrl = untrack(() => def().tileUrl);
    const tiles = new ol.TileLayer({
      className: 'sj-map-tiles',
      source: tileUrl
        ? new ol.XYZ({ url: tileUrl, attributions: untrack(() => def().tileAttribution) ?? '', maxZoom: 19 })
        : new ol.OSM(),
    } as never);
    const vectorLayers: OLVectorLayer[] = [];
    for (const layer of untrack(() => def().layers ?? [])) {
      const source = new ol.VectorSource();
      // Area labels (site names) give way to each other instead of overlapping. Only for layers that
      // say they are areas: decluttering a marker layer would hide markers that overlap.
      const vector = new ol.VectorLayer({ source, visible: !untrack(hiddenLayers).has(layer.name), declutter: layer.style?.kind === 'area' } as never);
      sources.set(layer.name, source);
      layers.set(layer.name, vector);
      vectorLayers.push(vector);
    }
    if (mode !== 'layers') {
      editSource = new ol.VectorSource();
      vectorLayers.push(new ol.VectorLayer({ source: editSource, zIndex: 20 } as never));
    }
    const center = untrack(() => def().center) ?? firstPoint(untrack(editValue)) ?? SYDNEY;
    map = new ol.Map({
      target: container,
      layers: [tiles, ...vectorLayers],
      view: new ol.View({ center: ol.proj.fromLonLat(center), zoom: untrack(() => def().zoom) ?? (mode === 'layers' ? 11 : 15) }),
      controls: ol.control.defaults({ rotate: false, attributionOptions: { collapsible: true } } as never),
    });
    overlay = new ol.Overlay({ element: popupEl, positioning: 'bottom-center', offset: [0, -18], autoPan: true, stopEvent: true } as never);
    map.addOverlay(overlay);

    map.on('singleclick', (event) => {
      if (drawing()) return;
      let hit: Placed | undefined;
      map!.forEachFeatureAtPixel(event.pixel, (feature) => {
        const key = feature.get('placedKey') as string | undefined;
        hit = key ? untrack(placed).find((p) => p.key === key) : undefined;
        return !!hit;
      });
      if (hit) {
        select(hit, event.coordinate as number[]);
        return;
      }
      setSelected(undefined);
      if (mode === 'point' && !untrack(field.disabled)) writePoint(ol.proj.toLonLat(event.coordinate) as LonLat);
    });
    map.on('pointermove', (event) => {
      if (event.dragging) return;
      const over = map!.hasFeatureAtPixel(event.pixel, { layerFilter: (layer) => layer !== tiles });
      map!.getTargetElement().style.cursor = over ? 'pointer' : mode === 'point' && !untrack(field.disabled) ? 'crosshair' : '';
    });

    if (mode === 'point' && editSource) {
      const translate = new ol.interaction.Translate({ layers: [vectorLayers[vectorLayers.length - 1]] } as never);
      translate.on('translateend', (event) => {
        const geometry = (event as unknown as { features: { item(i: number): OLFeature } }).features.item(0)?.getGeometry() as InstanceType<OLGlobal['Point']> | undefined;
        if (geometry) writePoint(ol.proj.toLonLat(geometry.getCoordinates()) as LonLat);
      });
      map.addInteraction(translate);
      editInteraction = translate;
    }
    if (mode === 'area' && editSource) {
      const modify = new ol.interaction.Modify({ source: editSource });
      modify.on('modifyend', (event) => {
        const geometry = (event as unknown as { features: { item(i: number): OLFeature } }).features.item(0)?.getGeometry() as InstanceType<OLGlobal['Polygon']> | undefined;
        const ring = geometry?.getCoordinates()[0]?.map((c) => ol.proj.toLonLat(c) as LonLat);
        if (ring) writePolygon(ring);
      });
      map.addInteraction(modify);
      drawInteraction = new ol.interaction.Draw({ source: editSource, type: 'Polygon' } as never);
      drawInteraction.setActive(false);
      drawInteraction.on('drawstart', () => editSource!.clear());
      drawInteraction.on('drawend', (event) => {
        const geometry = event.feature.getGeometry() as InstanceType<OLGlobal['Polygon']>;
        const ring = geometry.getCoordinates()[0].map((c) => ol.proj.toLonLat(c) as LonLat);
        setDrawing(false);
        queueMicrotask(() => writePolygon(ring));
      });
      map.addInteraction(drawInteraction);
      editInteraction = modify;
    }
    editInteraction?.setActive(!untrack(field.disabled));

    // Keep the map sized to its box (forms resize as panels open and close).
    const resize = new ResizeObserver(() => {
      map?.updateSize();
      if (wrapper) setWide(wrapper.clientWidth >= 760);
    });
    resize.observe(container);
    if (wrapper) resize.observe(wrapper);

    if (mode !== 'layers') {
      syncEditFeature();
      if (firstPolygon(untrack(editValue))) fitAll(false);
    }
    void load();
    return () => {
      resize.disconnect();
      map?.setTarget(undefined);
      map = undefined;
    };
  });

  // Reload when a ruleset changes the layers, and on refresh (the first load runs once the map exists).
  createEffect(
    () => JSON.stringify([def().layers ?? null, reloads()]),
    () => {
      if (ol && map) void load();
    },
  );
  // Reload after any save in the app (a booking commenced, an asset moved…).
  let listening = false;
  const saved = getService('BroadcastService')
    ?.on?.('document:updated')
    .subscribe(() => listening && setReloads((n) => n + 1));
  queueMicrotask(() => (listening = true));
  onCleanup(() => saved?.unsubscribe());

  createEffect(
    () => JSON.stringify(editValue() ?? null),
    () => {
      if (mode !== 'layers') syncEditFeature();
    },
  );
  createEffect(
    () => drawing(),
    (on) => drawInteraction?.setActive(on),
  );
  // Rulesets can disable the field: no more dragging the marker or moving corners.
  createEffect(
    () => field.disabled(),
    (disabled) => editInteraction?.setActive(!disabled),
  );
  createEffect(
    () => hiddenLayers(),
    (hidden) => {
      for (const [name, layer] of layers) layer.setVisible(!hidden.has(name));
      const current = untrack(selected);
      if (current && hidden.has(current.layer.name)) setSelected(undefined);
    },
  );
  createEffect(
    () => selected(),
    (current) => {
      for (const source of sources.values()) source.changed();
      if (!current) overlay?.setPosition(undefined);
    },
  );

  const select = (item: Placed, coordinate?: number[]) => {
    setSelected(item);
    if (!ol || !map) return;
    const position = coordinate ?? (item.point ? ol.proj.fromLonLat(item.point) : undefined);
    overlay?.setPosition(position);
  };
  const focusItem = (item: Placed) => {
    if (!ol || !map || !item.point) return;
    map.getView().animate({ center: ol.proj.fromLonLat(item.point), zoom: Math.max(map.getView().getZoom() ?? 12, 14), duration: 300 });
    select(item);
  };
  const toggleLayer = (name: string) =>
    setHiddenLayers((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const countFor = (name: string) => placed().filter((p) => p.layer.name === name).length;
  const listed = createMemo(() => placed().filter((p) => !hiddenLayers().has(p.layer.name) && !p.area && p.point));
  const showList = () => mode === 'layers' && (def().showList ?? true) && wide();
  const areaText = () => {
    const ring = firstPolygon(editValue());
    if (!ring || !ol) return '';
    const area = ol.sphere.getArea(new ol.Polygon([ring.map((p) => ol.proj.fromLonLat(p))]));
    return area > 10_000 ? `${formatNumber(area / 10_000, 2)} ha` : `${formatNumber(area, 0)} m²`;
  };

  const fieldValue = (doc: SourceDocument, popupField: PopupField) => {
    const raw = getPath(doc, popupField.path.replace(/\.0\.name$/, ''));
    if (popupField.type === 'status') {
      const status = toRelatedList(raw)[0];
      return status ? <Lozenge color={statusAppearance(status.name, {}, status as unknown as SourceDocument).color}>{status.name}</Lozenge> : '—';
    }
    const value = popupField.path.endsWith('.0.name') ? toRelatedList(raw)[0]?.name : raw;
    if (value === null || value === undefined || value === '') return '—';
    if (popupField.type === 'number') return `${formatNumber(value, 1)}${popupField.suffix ? ` ${popupField.suffix}` : ''}`;
    if (popupField.type === 'datetime') return formatDateTime(value);
    if (popupField.type === 'relative') return relativeTime(value);
    return `${text(value)}${popupField.suffix ? ` ${popupField.suffix}` : ''}`;
  };

  const height = () => def().height ?? (mode === 'layers' ? '440px' : '320px');

  return (
    <FieldShell label={field.label()} labelId={labelId} mandatory={field.mandatory()} hideLabel={def().hideLabel} errors={field.errors()}>
      <Show
        when={ol}
        fallback={
          <div class="sj-note sj-note--warning" role="alert">
            <Icon name="alert" size={14} />
            <span>The map library (openlayers-shared) didn't load on this page, so the map can't be shown.</span>
          </div>
        }
      >
        <div class={['mp', showList() && 'mp--list']} ref={wrapper}>
          <div class="mp-stage">
            <div class="mp-map" ref={container} style={{ height: height() }} aria-labelledby={labelId} role="application" />
            <Show when={mode === 'layers'}>
              <div class="mp-panel">
                <For each={def().layers ?? []}>
                  {(layer) => (
                    <label class="mp-layer">
                      <input type="checkbox" checked={!hiddenLayers().has(layer.name)} onChange={() => toggleLayer(layer.name)} />
                      <span>{layer.label}</span> <span class="mp-layer__count">{countFor(layer.name)}</span>
                    </label>
                  )}
                </For>
                <div class="mp-tools">
                  <IconButton icon="crosshair" size="sm" label="Show everything" onClick={() => fitAll()} />
                  <IconButton icon="refresh" size="sm" label="Reload" onClick={() => setReloads((n) => n + 1)} />
                  <Show when={loading()}>
                    <span class="sj-spinner" role="status" aria-label="Loading" />
                  </Show>
                </div>
              </div>
            </Show>
            <div ref={popupEl} class="mp-popup" hidden={!selected()}>
              <Show when={selected()}>
                {(item) => (
                  <div class="mp-popup__card" role="dialog" aria-label={item().name}>
                    <div class="mp-popup__head">
                      <strong>{item().name}</strong>
                      <IconButton icon="x" size="sm" label="Close" onClick={() => setSelected(undefined)} />
                    </div>
                    <Show when={item().layer.popup?.fields?.length}>
                      <dl class="mp-popup__fields">
                        <For each={item().layer.popup!.fields}>
                          {(popupField) => (
                            <div>
                              <dt>{popupField.label}</dt>
                              <dd>{fieldValue(item().doc, popupField)}</dd>
                            </div>
                          )}
                        </For>
                      </dl>
                    </Show>
                    <div class="mp-popup__actions">
                      <Button size="sm" onClick={() => openDocument(text(item().doc.documentId))}>
                        Open
                      </Button>
                      <For each={item().layer.popup?.actions ?? []}>
                        {(action) => (
                          <Button
                            size="sm"
                            variant={action.primary ? 'primary' : 'default'}
                            icon={action.icon}
                            onClick={() =>
                              runAction(action, { documentId: text(item().doc.documentId), name: docName(item().doc), get: (path) => getPath(item().doc, path) })
                            }
                          >
                            {action.label}
                          </Button>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </Show>
            </div>
          </div>

          <Show when={showList()}>
            <ul class="mp-list" aria-label="On the map" style={{ 'max-height': height() }}>
              <For each={listed()} fallback={<li class="mp-list__empty">{loading() ? 'Loading…' : 'Nothing to show.'}</li>}>
                {(item) => (
                  <li>
                    <button type="button" class={['mp-item', selected()?.key === item.key && 'mp-item--selected']} onClick={() => focusItem(item)}>
                      <span class="mp-item__dot" style={{ background: item.color }} />
                      <span class="mp-item__name">{item.name}</span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>

        <Show when={mode !== 'layers'}>
          <div class="mp-edit">
            <Show
              when={mode === 'point'}
              fallback={
                <>
                  <span class="mp-edit__value">{firstPolygon(editValue()) ? `Boundary: ${areaText()}` : 'No boundary yet.'}</span>
                  <Show when={!field.disabled()}>
                    <Button size="sm" icon="polygon" variant={drawing() ? 'primary' : 'default'} onClick={() => setDrawing((d) => !d)}>
                      {drawing() ? 'Click to add corners, double-click to finish' : firstPolygon(editValue()) ? 'Redraw' : 'Draw boundary'}
                    </Button>
                  </Show>
                </>
              }
            >
              <span class="mp-edit__value">
                <Show when={firstPoint(editValue())} fallback="Click the map to set the location.">
                  {(point) => (
                    <>
                      <Icon name="map-pin" size={13} /> {formatLonLat(point())}
                      <Show when={featureProperties(editValue()).recordedDate}>
                        {(when) => <span class="mp-edit__when"> · {relativeTime(when())}</span>}
                      </Show>
                    </>
                  )}
                </Show>
              </span>
              <Show when={!field.disabled() && 'geolocation' in navigator}>
                <Button size="sm" icon="crosshair" onClick={locateMe}>
                  My location
                </Button>
              </Show>
            </Show>
            <Show when={!field.disabled() && editValue()}>
              <Button size="sm" variant="subtle" icon="trash" onClick={clearValue}>
                Clear
              </Button>
            </Show>
          </div>
        </Show>

        <Show when={error()}>
          <div class="sj-note sj-note--danger" role="alert">
            <Icon name="alert" size={14} />
            <span>{error()}</span>
          </div>
        </Show>
      </Show>
    </FieldShell>
  );
}
