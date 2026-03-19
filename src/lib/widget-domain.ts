import type {
  AddonCatalogDataSource,
  AIOMetadataCatalog,
  CollectionItem,
  FusionWidgetsConfig,
  TrashWidgetEntry,
  Widget,
} from './types/widget';

export const MANIFEST_PLACEHOLDER = 'YOUR_AIOMETADATA';

export interface AppState {
  widgets: Widget[];
  trash: TrashWidgetEntry[];
  manifestUrl: string;
  replacePlaceholder: boolean;
  manifestCatalogs: AIOMetadataCatalog[];
  manifestContent: string;
}

export interface IdRepairSummary {
  widgetIds: string[];
  itemIds: string[];
}

export interface NormalizedFusionConfigResult {
  config: FusionWidgetsConfig;
  repairedIds: IdRepairSummary;
}

interface NormalizeOptions {
  manifestUrl?: string | null;
  replacePlaceholder?: boolean;
  catalogs?: AIOMetadataCatalog[];
  sanitize?: boolean;
}

interface LegacyCollectionItemInput {
  id?: unknown;
  name?: unknown;
  title?: unknown;
  hideTitle?: unknown;
  layout?: unknown;
  imageAspect?: unknown;
  backgroundImageURL?: unknown;
  imageURL?: unknown;
  dataSources?: unknown;
  dataSource?: unknown;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toLayout(value: unknown): CollectionItem['layout'] {
  const normalized = String(value || 'Wide').toLowerCase();
  if (normalized === 'wide' || normalized === 'landscape') return 'Wide';
  if (normalized === 'poster') return 'Poster';
  if (normalized === 'square') return 'Square';
  return 'Wide';
}

function normalizeWidgetTitleKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isAIOMetadataAddon(addonId: string): boolean {
  return addonId.toUpperCase().includes('AIOMETADATA');
}

function getCatalogActualId(id: string): string {
  const parts = id.split('::');
  return parts[parts.length - 1];
}

function resolveCatalogCandidates(
  catalogs: AIOMetadataCatalog[],
  id: string
): { match?: AIOMetadataCatalog; ambiguous: boolean } {
  if (!id || catalogs.length === 0) {
    return { ambiguous: false };
  }

  const exact = catalogs.filter(
    (catalog) => catalog.id === id || `${catalog.type}::${catalog.id}` === id
  );
  if (exact.length === 1) {
    return { match: exact[0], ambiguous: false };
  }
  if (exact.length > 1) {
    return { ambiguous: true };
  }

  const actualId = getCatalogActualId(id);
  const suffixMatches = catalogs.filter((catalog) => getCatalogActualId(catalog.id) === actualId);
  if (suffixMatches.length === 1) {
    return { match: suffixMatches[0], ambiguous: false };
  }
  return { ambiguous: suffixMatches.length > 1 };
}

function resolveCatalogForNormalization(catalogs: AIOMetadataCatalog[], id: string, path: string): AIOMetadataCatalog | undefined {
  const result = resolveCatalogCandidates(catalogs, id);
  if (result.ambiguous) {
    throw new Error(`${path} is ambiguous in the manifest: "${id}". Use a fully-qualified catalog ID.`);
  }
  return result.match;
}

export function findCatalog(catalogs: AIOMetadataCatalog[], id: string): AIOMetadataCatalog | undefined {
  const result = resolveCatalogCandidates(catalogs, id);
  return result.ambiguous ? undefined : result.match;
}

export function resolveFusionCatalogType(catalogId: string, currentType?: string): string {
  if (catalogId.startsWith('all::')) {
    return 'series';
  }
  return currentType || 'movie';
}

export function getPrimaryDataSource(item: Pick<CollectionItem, 'dataSources'>): AddonCatalogDataSource | undefined {
  return item.dataSources[0];
}

function normalizeCatalogId(catalogId: string, catalogType: string): string {
  const trimmed = catalogId.trim();
  if (!trimmed) return '';
  if (trimmed.includes('::')) return trimmed;
  const resolvedType = resolveFusionCatalogType(trimmed, catalogType);
  return `${resolvedType}::${trimmed}`;
}

export function parseManifest(input: unknown): AIOMetadataCatalog[] {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  const root = asRecord(parsed, 'Manifest');
  const rawCatalogs = root.catalogs;
  if (!Array.isArray(rawCatalogs)) {
    throw new Error('Manifest must contain a "catalogs" array.');
  }

  return rawCatalogs.map((entry, index) => {
    const catalog = asRecord(entry, `Manifest catalogs[${index}]`);
    const id = asOptionalString(catalog.id);
    if (!id) {
      throw new Error(`Manifest catalogs[${index}].id must be a non-empty string.`);
    }

    const type = asOptionalString(catalog.type) || 'movie';
    const displayType = asOptionalString(catalog.displayType) || type;

    return {
      id,
      name: asOptionalString(catalog.name) || id,
      type,
      displayType,
    };
  });
}

function normalizeDataSource(
  input: unknown,
  path: string,
  options: NormalizeOptions
): AddonCatalogDataSource {
  if (input === undefined || input === null) {
    return {
      kind: 'addonCatalog',
      payload: {
        addonId: MANIFEST_PLACEHOLDER,
        catalogId: '',
        catalogType: 'movie',
      },
    };
  }

  const source = asRecord(input, path);
  if (source.kind !== 'addonCatalog') {
    throw new Error(`${path}.kind must be "addonCatalog".`);
  }

  const payload = asRecord(source.payload ?? {}, `${path}.payload`);
  const addonId = asOptionalString(payload.addonId) || MANIFEST_PLACEHOLDER;
  let catalogId = asOptionalString(payload.catalogId) || '';
  let catalogType = asOptionalString(payload.catalogType) || asOptionalString(payload.type) || 'movie';

  if (isAIOMetadataAddon(addonId) && options.catalogs && catalogId) {
    const found = resolveCatalogForNormalization(options.catalogs, catalogId, `${path}.payload.catalogId`);
    if (found) {
      catalogId = `${found.type}::${found.id}`;
      if (options.sanitize) {
        catalogType = found.displayType || found.type;
      }
    }
  }

  const finalType = resolveFusionCatalogType(catalogId, catalogType);
  return {
    kind: 'addonCatalog',
    payload: {
      addonId:
        isAIOMetadataAddon(addonId) && options.replacePlaceholder && options.manifestUrl
          ? options.manifestUrl
          : addonId,
      catalogId: normalizeCatalogId(catalogId, finalType),
      catalogType: finalType,
    },
  };
}

function normalizeCollectionItem(
  input: unknown,
  index: number,
  options: NormalizeOptions
): CollectionItem {
  const item = asRecord(input, `widgets[].dataSource.payload.items[${index}]`) as LegacyCollectionItemInput;
  const dataSourcesInput = Array.isArray(item.dataSources)
    ? item.dataSources
    : item.dataSource !== undefined
      ? [item.dataSource]
      : [];

  const dataSources = dataSourcesInput.map((entry, dsIndex) =>
    normalizeDataSource(entry, `widgets[].dataSource.payload.items[${index}].dataSources[${dsIndex}]`, options)
  );

  return {
    id: asOptionalString(item.id) || crypto.randomUUID(),
    name: asOptionalString(item.name) || asOptionalString(item.title) || `Untitled Item ${index + 1}`,
    hideTitle: asBoolean(item.hideTitle),
    layout: toLayout(item.layout ?? item.imageAspect),
    backgroundImageURL:
      asOptionalString(item.backgroundImageURL) || asOptionalString(item.imageURL) || '',
    dataSources,
  };
}

function normalizeWidget(input: unknown, index: number, options: NormalizeOptions): Widget {
  const widget = asRecord(input, `widgets[${index}]`);
  const type = widget.type;
  if (type !== 'collection.row' && type !== 'row.classic') {
    throw new Error(`widgets[${index}].type must be "collection.row" or "row.classic".`);
  }

  const id = asOptionalString(widget.id) || crypto.randomUUID();
  const title = asOptionalString(widget.title) || `Untitled Widget ${index + 1}`;
  const hideTitle = asBoolean(widget.hideTitle);

  if (type === 'collection.row') {
    const dataSource = asRecord(widget.dataSource ?? {}, `widgets[${index}].dataSource`);
    if (dataSource.kind !== 'collection') {
      throw new Error(`widgets[${index}].dataSource.kind must be "collection".`);
    }
    const payload = asRecord(dataSource.payload ?? {}, `widgets[${index}].dataSource.payload`);
    const rawItems = payload.items;
    if (!Array.isArray(rawItems)) {
      throw new Error(`widgets[${index}].dataSource.payload.items must be an array.`);
    }

    return {
      id,
      title,
      hideTitle,
      type,
      dataSource: {
        kind: 'collection',
        payload: {
          items: rawItems.map((entry, itemIndex) => normalizeCollectionItem(entry, itemIndex, options)),
        },
      },
    };
  }

  const presentation = asRecord(widget.presentation ?? {}, `widgets[${index}].presentation`);
  const badges = asRecord(presentation.badges ?? {}, `widgets[${index}].presentation.badges`);

  return {
    id,
    title,
    type,
    cacheTTL: typeof widget.cacheTTL === 'number' ? widget.cacheTTL : 3600,
    limit: typeof widget.limit === 'number' ? widget.limit : 20,
    presentation: {
      aspectRatio:
        presentation.aspectRatio === 'wide' ||
        presentation.aspectRatio === 'poster' ||
        presentation.aspectRatio === 'square'
          ? presentation.aspectRatio
          : 'poster',
      cardStyle:
        presentation.cardStyle === 'small' ||
        presentation.cardStyle === 'medium' ||
        presentation.cardStyle === 'large'
          ? presentation.cardStyle
          : 'medium',
      badges: {
        providers: asBoolean(badges.providers, true),
        ratings: asBoolean(badges.ratings, true),
      },
      backgroundImageURL: asOptionalString(presentation.backgroundImageURL) || '',
    },
    dataSource: normalizeDataSource(widget.dataSource, `widgets[${index}].dataSource`, options),
  };
}

function normalizeTrashEntry(input: unknown, index: number, options: NormalizeOptions): TrashWidgetEntry {
  const entry = asRecord(input, `trash[${index}]`);
  return {
    widget: normalizeWidget(entry.widget, index, options),
    deletedAt: asOptionalString(entry.deletedAt) || new Date(0).toISOString(),
    originalIndex:
      typeof entry.originalIndex === 'number' && Number.isFinite(entry.originalIndex)
        ? Math.max(0, Math.floor(entry.originalIndex))
        : 0,
  };
}

function repairCollectionItemIds(widget: Widget, repairs: IdRepairSummary): Widget {
  if (widget.type !== 'collection.row') return widget;

  const seen = new Set<string>();
  const items = widget.dataSource.payload.items.map((item) => {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      return item;
    }

    const nextId = crypto.randomUUID();
    repairs.itemIds.push(`${widget.id}:${item.id}`);
    seen.add(nextId);
    return {
      ...item,
      id: nextId,
    };
  });

  return {
    ...widget,
    dataSource: {
      ...widget.dataSource,
      payload: {
        ...widget.dataSource.payload,
        items,
      },
    },
  };
}

function repairWidgetIds(widgets: Widget[]): NormalizedFusionConfigResult {
  const repairs: IdRepairSummary = { widgetIds: [], itemIds: [] };
  const seen = new Set<string>();

  const normalizedWidgets = widgets.map((widget) => {
    let nextWidget = widget;
    if (seen.has(widget.id)) {
      const newId = crypto.randomUUID();
      repairs.widgetIds.push(widget.id);
      nextWidget = {
        ...widget,
        id: newId,
      } as Widget;
    }
    seen.add(nextWidget.id);
    return repairCollectionItemIds(nextWidget, repairs);
  });

  return {
    config: {
      exportType: 'fusionWidgets',
      exportVersion: 1,
      widgets: normalizedWidgets,
    },
    repairedIds: repairs,
  };
}

export function normalizeFusionConfigDetailed(input: unknown, options: NormalizeOptions = {}): NormalizedFusionConfigResult {
  const root = asRecord(input, 'Fusion config');
  if (root.exportType !== 'fusionWidgets') {
    throw new Error('Fusion config exportType must be "fusionWidgets".');
  }
  if (!Array.isArray(root.widgets)) {
    throw new Error('Fusion config must contain a widgets array.');
  }

  const widgets = root.widgets.map((entry, index) => normalizeWidget(entry, index, options));
  const normalized = repairWidgetIds(widgets);
  normalized.config.exportVersion =
    typeof root.exportVersion === 'number' && Number.isFinite(root.exportVersion) ? root.exportVersion : 1;
  return normalized;
}

export function parseFusionConfig(input: unknown, options: NormalizeOptions = {}): FusionWidgetsConfig {
  return normalizeFusionConfigDetailed(input, options).config;
}

export function normalizeLoadedState(input: unknown, options: NormalizeOptions = {}): AppState {
  const root = asRecord(input, 'Saved state');
  const widgetsInput = Array.isArray(root.widgets) ? root.widgets : [];
  const trashInput = Array.isArray(root.trash) ? root.trash : [];
  const normalizedWidgets = repairWidgetIds(
    widgetsInput.map((entry, index) => normalizeWidget(entry, index, options))
  );

  return {
    widgets: normalizedWidgets.config.widgets,
    trash: trashInput.map((entry, index) => normalizeTrashEntry(entry, index, options)),
    manifestUrl: asOptionalString(root.manifestUrl) || '',
    replacePlaceholder: asBoolean(root.replacePlaceholder),
    manifestCatalogs: Array.isArray(root.manifestCatalogs) ? parseManifest({ catalogs: root.manifestCatalogs }) : [],
    manifestContent: typeof root.manifestContent === 'string' ? root.manifestContent : '',
  };
}

export function validateFusionExport(config: FusionWidgetsConfig, manifestUrl?: string | null): void {
  if (config.exportType !== 'fusionWidgets') {
    throw new Error('Export failed: exportType must be "fusionWidgets".');
  }

  const seenWidgetIds = new Set<string>();
  config.widgets.forEach((widget, widgetIndex) => {
    if (seenWidgetIds.has(widget.id)) {
      throw new Error(`Export failed: Duplicate widget ID "${widget.id}" at widgets[${widgetIndex}].`);
    }
    seenWidgetIds.add(widget.id);

    if (!widget.title.trim()) {
      throw new Error(`Export failed: widgets[${widgetIndex}] has an empty title.`);
    }

    if (widget.type === 'collection.row') {
      widget.dataSource.payload.items.forEach((item, itemIndex) => {
        if (!item.name.trim()) {
          throw new Error(`Export failed: widgets[${widgetIndex}].items[${itemIndex}] has an empty name.`);
        }
        item.dataSources.forEach((dataSource, dsIndex) => {
          if (!dataSource.payload.catalogId) {
            throw new Error(
              `Export failed: widgets[${widgetIndex}].items[${itemIndex}].dataSources[${dsIndex}] is missing a catalog ID.`
            );
          }
          if (dataSource.payload.addonId === MANIFEST_PLACEHOLDER && !manifestUrl) {
            throw new Error(
              `Export failed: widgets[${widgetIndex}].items[${itemIndex}].dataSources[${dsIndex}] still uses the AIOMetadata placeholder.`
            );
          }
        });
      });
      return;
    }

    if (!widget.dataSource.payload.catalogId) {
      throw new Error(`Export failed: widgets[${widgetIndex}] is missing a catalog ID.`);
    }
    if (widget.dataSource.payload.addonId === MANIFEST_PLACEHOLDER && !manifestUrl) {
      throw new Error(`Export failed: widgets[${widgetIndex}] still uses the AIOMetadata placeholder.`);
    }
  });
}

export function createWidgetDuplicateKey(widget: Pick<Widget, 'title' | 'type'>): string {
  return `${widget.type}::${normalizeWidgetTitleKey(widget.title)}`;
}

export function mergeWidgetLists(existing: Widget[], incoming: Widget[]) {
  const next = [...existing];
  const existingKeys = new Set(existing.map(createWidgetDuplicateKey));
  const acceptedKeys = new Set(existingKeys);
  let added = 0;
  let skippedExisting = 0;
  let skippedInPayload = 0;

  incoming.forEach((widget) => {
    const key = createWidgetDuplicateKey(widget);
    if (existingKeys.has(key)) {
      skippedExisting += 1;
      return;
    }
    if (acceptedKeys.has(key)) {
      skippedInPayload += 1;
      return;
    }

    acceptedKeys.add(key);
    next.push(widget);
    added += 1;
  });

  return {
    widgets: next,
    added,
    skippedExisting,
    skippedInPayload,
  };
}
