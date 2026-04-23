import type {
  AddonCatalogDataSource,
  AIOMetadataCatalog,
  CollectionItem,
  FusionWidgetsConfig,
  NativeTraktDataSource,
  NativeAnilistDataSource,
  TrashCollectionItemEntry,
  TrashWidgetEntry,
  Widget,
  WidgetDataSource,
} from './types/widget';

export const MANIFEST_PLACEHOLDER = 'YOUR_AIOMETADATA';

export interface AppState {
  widgets: Widget[];
  trash: TrashWidgetEntry[];
  itemTrash: TrashCollectionItemEntry[];
  manifestUrl: string;
  replacePlaceholder: boolean;
  manifestCatalogs: AIOMetadataCatalog[];
  manifestContent: string;
}

export interface IdRepairSummary {
  widgetIds: string[];
  itemIds: string[];
}

export interface ImportIssue {
  path: string;
  message: string;
  skippedType: 'widget' | 'item' | 'dataSource';
  label: string;
  parentLabel?: string;
}

export interface NormalizedFusionConfigResult {
  config: FusionWidgetsConfig;
  repairedIds: IdRepairSummary;
  importIssues: ImportIssue[];
}

export interface ImportedManifestState {
  manifestUrl: string;
  replacePlaceholder: boolean;
  manifestCatalogs: AIOMetadataCatalog[];
  manifestContent: string;
  hasExplicitManifest: boolean;
}

interface NormalizeOptions {
  manifestUrl?: string | null;
  replacePlaceholder?: boolean;
  catalogs?: AIOMetadataCatalog[];
  sanitize?: boolean;
  allowPartialImport?: boolean;
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
  if (!addonId) return false;
  if (addonId === MANIFEST_PLACEHOLDER) return true;
  const lower = addonId.toLowerCase();
  return (
    lower.includes('aiometadata') ||
    lower.includes('fortheweak.cloud') ||
    lower.includes('midnightignite.me')
  );
}

export function getCatalogActualId(id: string): string {
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
  const lowId = catalogId.toLowerCase();
  const normalizedCurrentType = String(currentType || '').trim().toLowerCase();
  if (lowId.startsWith('all::trakt.list.')) {
    return 'series';
  }
  if (lowId.startsWith('all::mdblist.') && lowId.includes('.unified')) {
    return 'series';
  }
  if (lowId.startsWith('all::')) {
    if (normalizedCurrentType && normalizedCurrentType !== 'all') {
      return normalizedCurrentType;
    }
    return 'all';
  }
  if (lowId.includes('mdblist.upnext')) {
    return 'series';
  }
  if (lowId.startsWith('series::')) return 'series';
  if (lowId.startsWith('movie::')) return 'movie';
  return normalizedCurrentType || 'movie';
}

export function isAIOMetadataDataSource(
  dataSource: Pick<WidgetDataSource, 'kind'> | undefined | null
): dataSource is AddonCatalogDataSource {
  return dataSource?.kind === 'addonCatalog';
}

export function isNativeTraktDataSource(
  dataSource: Pick<WidgetDataSource, 'kind'> | undefined | null
): dataSource is NativeTraktDataSource {
  return dataSource?.kind === 'traktList';
}

export function isNativeAnilistDataSource(
  dataSource: Pick<WidgetDataSource, 'kind'> | undefined | null
): dataSource is NativeAnilistDataSource {
  return dataSource?.kind === 'anilistCatalog';
}

export function getPrimaryDataSource(item: Pick<CollectionItem, 'dataSources'>): WidgetDataSource | undefined {
  return item.dataSources[0];
}

function normalizeCatalogId(catalogId: string, catalogType: string): string {
  const trimmed = catalogId.trim();
  if (!trimmed) return '';
  if (trimmed.includes('::')) return trimmed;
  const resolvedType = resolveFusionCatalogType(trimmed, catalogType).toLowerCase();
  return `${resolvedType}::${trimmed}`;
}

function normalizeTraktId(value: unknown): number | string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
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
  options: NormalizeOptions,
  issues: ImportIssue[]
): WidgetDataSource | null {
  if (input === undefined || input === null) {
    return {
      sourceType: 'aiometadata',
      kind: 'addonCatalog',
      payload: {
        addonId: MANIFEST_PLACEHOLDER,
        catalogId: '',
        catalogType: 'movie',
      },
    };
  }

  const source = asRecord(input, path);
  if (source.kind === 'traktList') {
    const payload = asRecord(source.payload ?? {}, `${path}.payload`);
    return {
      sourceType: 'trakt-native',
      kind: 'traktList',
      payload: {
        listName: asOptionalString(payload.listName) || '',
        listSlug: asOptionalString(payload.listSlug) || '',
        traktId: normalizeTraktId(payload.traktId),
        username: asOptionalString(payload.username) || '',
      },
    };
  }

  if (source.kind === 'anilistCatalog') {
    const payload = asRecord(source.payload ?? {}, `${path}.payload`);
    return {
      sourceType: 'anilist-native',
      kind: 'anilistCatalog',
      payload: {
        catalogType: asOptionalString(payload.catalogType) || 'CURRENT',
        limit: typeof payload.limit === 'number' && Number.isFinite(payload.limit)
          ? Math.max(1, Math.floor(payload.limit))
          : 20,
      },
    };
  }

  if (source.kind !== 'addonCatalog') {
    if (options.allowPartialImport) {
      issues.push({
        path,
        message: `Unsupported data source kind "${String(source.kind)}".`,
        skippedType: 'dataSource',
        label: '',
      });
      return null;
    }
    throw new Error(`${path}.kind must be "addonCatalog", "traktList", or "anilistCatalog".`);
  }

  const payload = asRecord(source.payload ?? {}, `${path}.payload`);
  const addonId = asOptionalString(payload.addonId) || MANIFEST_PLACEHOLDER;
  let catalogId = asOptionalString(payload.catalogId) || '';
  let catalogType = asOptionalString(payload.catalogType) || asOptionalString(payload.type) || '';

  if (isAIOMetadataAddon(addonId) && options.catalogs && catalogId) {
    const found = resolveCatalogForNormalization(options.catalogs, catalogId, `${path}.payload.catalogId`);
    if (found) {
      catalogId = `${found.type}::${found.id}`;
      if (options.sanitize) {
        catalogType = found.displayType || found.type;
      }
    }
  }

  const finalType = resolveFusionCatalogType(catalogId, catalogType || undefined);
  
  // Normalize addonId: if it's an AIOMetadata addon AND we have a local manifestUrl,
  // we treat it as being "from our manifest" to keep fingerprints consistent.
  const normalizedAddonId = 
    isAIOMetadataAddon(addonId) && options.manifestUrl
      ? options.manifestUrl
      : addonId;

  return {
    sourceType: 'aiometadata',
    kind: 'addonCatalog',
    payload: {
      addonId: normalizedAddonId,
      catalogId: normalizeCatalogId(catalogId, finalType),
      catalogType: finalType,
    },
  };
}

function normalizeCollectionItem(
  input: unknown,
  index: number,
  options: NormalizeOptions,
  issues: ImportIssue[],
  path = `widgets[].dataSource.payload.items[${index}]`,
  parentLabel?: string
): CollectionItem | null {
  try {
    const item = asRecord(input, path) as LegacyCollectionItemInput;
    const itemLabel = asOptionalString(item.name) || asOptionalString(item.title) || `Untitled Item ${index + 1}`;
    const dataSourcesInput = Array.isArray(item.dataSources)
      ? item.dataSources
      : item.dataSource !== undefined
        ? [item.dataSource]
        : [];

    const localIssues: ImportIssue[] = [];
    const dataSources = dataSourcesInput
      .map((entry, dsIndex) =>
        normalizeDataSource(entry, `${path}.dataSources[${dsIndex}]`, options, localIssues)
      )
      .filter((entry): entry is WidgetDataSource => entry !== null);

    if (options.allowPartialImport && dataSources.length === 0) {
      const unsupportedKinds = Array.from(
        new Set(
          localIssues
            .map((issue) => {
              const match = issue.message.match(/Unsupported data source kind "(.+?)"/);
              return match?.[1];
            })
            .filter((kind): kind is string => Boolean(kind))
        )
      );

      issues.push({
        path,
        message:
          unsupportedKinds.length > 0
            ? `Unsupported source${unsupportedKinds.length === 1 ? '' : 's'}: ${unsupportedKinds.join(', ')}.`
            : 'Could not import because it has no supported data sources.',
        skippedType: 'item',
        label: itemLabel,
        parentLabel,
      });
      return null;
    }

    localIssues.forEach((issue) => {
      issues.push({
        ...issue,
        label: itemLabel,
        parentLabel,
      });
    });

    return {
      id: asOptionalString(item.id) || crypto.randomUUID(),
      name: itemLabel,
      hideTitle: asBoolean(item.hideTitle),
      layout: toLayout(item.layout ?? item.imageAspect),
      backgroundImageURL:
        asOptionalString(item.backgroundImageURL) || asOptionalString(item.imageURL) || '',
      dataSources,
    };
  } catch (error) {
    if (options.allowPartialImport) {
      issues.push({
        path,
        message: error instanceof Error ? error.message : 'Unsupported collection item.',
        skippedType: 'item',
        label: `Untitled Item ${index + 1}`,
        parentLabel,
      });
      return null;
    }
    throw error;
  }
}

function normalizeWidget(input: unknown, index: number, options: NormalizeOptions, issues: ImportIssue[]): Widget | null {
  const path = `widgets[${index}]`;

  try {
    const widget = asRecord(input, path);
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

      const items = rawItems
        .map((entry, itemIndex) =>
          normalizeCollectionItem(
            entry,
            itemIndex,
            options,
            issues,
            `widgets[${index}].dataSource.payload.items[${itemIndex}]`,
            title
          )
        )
        .filter((entry): entry is CollectionItem => entry !== null);

      return {
        id,
        title,
        hideTitle,
        type,
        dataSource: {
          kind: 'collection',
          payload: {
            items,
          },
        },
      };
    }

    const presentation = asRecord(widget.presentation ?? {}, `widgets[${index}].presentation`);
    const badges = asRecord(presentation.badges ?? {}, `widgets[${index}].presentation.badges`);
    const localIssues: ImportIssue[] = [];
    const dataSource = normalizeDataSource(widget.dataSource, `widgets[${index}].dataSource`, options, localIssues);
    if (options.allowPartialImport && !dataSource) {
      const unsupportedKinds = Array.from(
        new Set(
          localIssues
            .map((issue) => {
              const match = issue.message.match(/Unsupported data source kind "(.+?)"/);
              return match?.[1];
            })
            .filter((kind): kind is string => Boolean(kind))
        )
      );
      issues.push({
        path,
        message:
          unsupportedKinds.length > 0
            ? `Unsupported source${unsupportedKinds.length === 1 ? '' : 's'}: ${unsupportedKinds.join(', ')}.`
            : 'Could not import because its row source is not supported.',
        skippedType: 'widget',
        label: title,
      });
      return null;
    }

    return {
      id,
      title,
      hideTitle,
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
      dataSource: dataSource!,
    };
  } catch (error) {
    if (options.allowPartialImport) {
      issues.push({
        path,
        message: error instanceof Error ? error.message : 'Unsupported widget.',
        skippedType: 'widget',
        label: `Untitled Widget ${index + 1}`,
      });
      return null;
    }
    throw error;
  }
}

function normalizeTrashEntry(input: unknown, index: number, options: NormalizeOptions): TrashWidgetEntry {
  const entry = asRecord(input, `trash[${index}]`);
  const issues: ImportIssue[] = [];
  const widget = normalizeWidget(entry.widget, index, options, issues);
  if (!widget) {
    throw new Error(`trash[${index}].widget could not be normalized.`);
  }
  return {
    widget,
    deletedAt: asOptionalString(entry.deletedAt) || new Date(0).toISOString(),
    originalIndex:
      typeof entry.originalIndex === 'number' && Number.isFinite(entry.originalIndex)
        ? Math.max(0, Math.floor(entry.originalIndex))
        : 0,
  };
}

function normalizeItemTrashEntry(
  input: unknown,
  index: number,
  options: NormalizeOptions
): TrashCollectionItemEntry {
  const entry = asRecord(input, `itemTrash[${index}]`);
  const issues: ImportIssue[] = [];
  const item = normalizeCollectionItem(entry.item, index, options, issues, `itemTrash[${index}].item`);
  if (!item) {
    throw new Error(`itemTrash[${index}].item could not be normalized.`);
  }
  return {
    widgetId: asOptionalString(entry.widgetId) || '',
    widgetTitle: asOptionalString(entry.widgetTitle) || 'Untitled Widget',
    item,
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
    importIssues: [],
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

  const importIssues: ImportIssue[] = [];
  const widgets = root.widgets
    .map((entry, index) => normalizeWidget(entry, index, options, importIssues))
    .filter((entry): entry is Widget => entry !== null);
  const normalized = repairWidgetIds(widgets);
  normalized.config.exportVersion =
    typeof root.exportVersion === 'number' && Number.isFinite(root.exportVersion) ? root.exportVersion : 1;
  normalized.importIssues = importIssues;
  return normalized;
}

export function parseFusionConfig(input: unknown, options: NormalizeOptions = {}): FusionWidgetsConfig {
  return normalizeFusionConfigDetailed(input, options).config;
}

export function normalizeLoadedState(input: unknown, options: NormalizeOptions = {}): AppState {
  const root = asRecord(input, 'Saved state');
  const widgetsInput = Array.isArray(root.widgets) ? root.widgets : [];
  const trashInput = Array.isArray(root.trash) ? root.trash : [];
  const itemTrashInput = Array.isArray(root.itemTrash) ? root.itemTrash : [];
  const normalizedWidgets = repairWidgetIds(
    widgetsInput
      .map((entry, index) => normalizeWidget(entry, index, options, []))
      .filter((entry): entry is Widget => entry !== null)
  );

  return {
    widgets: normalizedWidgets.config.widgets,
    trash: trashInput.map((entry, index) => normalizeTrashEntry(entry, index, options)),
    itemTrash: itemTrashInput.map((entry, index) => normalizeItemTrashEntry(entry, index, options)),
    manifestUrl: asOptionalString(root.manifestUrl) || '',
    replacePlaceholder: asBoolean(root.replacePlaceholder),
    manifestCatalogs: Array.isArray(root.manifestCatalogs) ? parseManifest({ catalogs: root.manifestCatalogs }) : [],
    manifestContent: typeof root.manifestContent === 'string' ? root.manifestContent : '',
  };
}

export function extractImportedManifestState(input: unknown): ImportedManifestState {
  const root = asRecord(input, 'Imported config');
  const manifestUrl = asOptionalString(root.manifestUrl) || '';
  const replacePlaceholder = asBoolean(root.replacePlaceholder);
  const manifestContent = typeof root.manifestContent === 'string' ? root.manifestContent : '';

  let manifestCatalogs: AIOMetadataCatalog[] = [];
  if (Array.isArray(root.manifestCatalogs)) {
    manifestCatalogs = parseManifest({ catalogs: root.manifestCatalogs });
  } else if (manifestContent) {
    try {
      manifestCatalogs = parseManifest(manifestContent);
    } catch {
      manifestCatalogs = [];
    }
  }

  return {
    manifestUrl,
    replacePlaceholder,
    manifestCatalogs,
    manifestContent,
    hasExplicitManifest: Boolean(manifestUrl || manifestCatalogs.length > 0 || manifestContent),
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
          if (isAIOMetadataDataSource(dataSource)) {
            if (!dataSource.payload.catalogId) {
              throw new Error(
                `Export failed: widgets[${widgetIndex}].items[${itemIndex}].dataSources[${dsIndex}] is missing a catalog ID.`
              );
            }
            if (dataSource.payload.addonId === MANIFEST_PLACEHOLDER && !manifestUrl) {
              throw new Error(
                'Sync your AIOMetadata manifest before Fusion export so the AIOMetadata URL can be embedded in your Fusion setup.'
              );
            }
          }
        });
      });
      return;
    }

    if (isAIOMetadataDataSource(widget.dataSource)) {
      if (!widget.dataSource.payload.catalogId) {
        throw new Error(`Export failed: widgets[${widgetIndex}] is missing a catalog ID.`);
      }
      if (widget.dataSource.payload.addonId === MANIFEST_PLACEHOLDER && !manifestUrl) {
        throw new Error(
          'Sync your AIOMetadata manifest before Fusion export so the AIOMetadata URL can be embedded in your Fusion setup.'
        );
      }
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
