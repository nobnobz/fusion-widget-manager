import type {
  AIOMetadataCatalog,
  AiometadataCatalogsOnlyEntry,
  FusionWidgetsConfig,
} from './types/widget';
import {
  buildClassicRowCatalogExportName,
  buildCollectionCatalogExportName,
  compareCatalogExportOrder,
  getItemDisplayName,
  getWidgetDisplayName,
} from './aiometadata-catalog-labels';
import { collectUsedLetterboxdCatalogs } from './letterboxd-catalog-export';
import { collectUsedMdblistCatalogs } from './mdblist-catalog-export';
import { collectNativeTraktSources } from './native-trakt-bridge';
import { collectUsedSimklCatalogs } from './simkl-catalog-export';
import { collectUsedStreamingCatalogs } from './streaming-catalog-export';
import { collectUsedAiometadataTraktCatalogs } from './trakt-catalog-export';
import { findCatalog } from './widget-domain';

export type ExportableCatalogSource = 'trakt' | 'mdblist' | 'streaming' | 'simkl' | 'letterboxd';

export interface ExportableCatalogDefinition {
  key: string;
  entry: AiometadataCatalogsOnlyEntry;
  source: ExportableCatalogSource;
  occurrenceCount: number;
  isAlreadyInManifest: boolean;
}

export interface ExportableCatalogOccurrence {
  key: string;
  catalogKey: string;
  source: ExportableCatalogSource;
  widgetId: string;
  widgetTitle: string;
  widgetIndex: number;
  widgetType: 'row.classic' | 'collection.row';
  itemId?: string;
  itemKey?: string;
  itemName?: string;
  itemIndex?: number;
  label: string;
  searchText: string;
  entry: AiometadataCatalogsOnlyEntry;
  rawName: string;
}

export interface ExportableCatalogItemGroup {
  key: string;
  id: string;
  itemId: string;
  itemName: string;
  itemIndex: number;
  catalogKeys: string[];
}

export interface ExportableCatalogWidgetGroup {
  key: string;
  id: string;
  widgetId: string;
  widgetTitle: string;
  widgetIndex: number;
  widgetType: 'row.classic' | 'collection.row';
  catalogKeys: string[];
  rowCatalogKeys: string[];
  items: ExportableCatalogItemGroup[];
}

export interface ExportableCatalogInventory {
  catalogs: ExportableCatalogDefinition[];
  occurrences: ExportableCatalogOccurrence[];
  widgets: ExportableCatalogWidgetGroup[];
}

interface InventoryOptions {
  manifestCatalogs?: AIOMetadataCatalog[];
  onlyNewAgainstManifest?: boolean;
}

function createCatalogKey(source: ExportableCatalogSource, type: string, id: string): string {
  return `${source}::${String(type || '').trim().toLowerCase()}::${String(id || '').trim().toLowerCase()}`;
}

function createManifestKey(type: string, id: string): string {
  return `${String(type || '').trim().toLowerCase()}::${String(id || '').trim().toLowerCase()}`;
}

function inferSpecialCatalogLabelType(
  source: ExportableCatalogSource,
  type: string,
  id: string,
  manifestCatalogs: AIOMetadataCatalog[]
): string | undefined {
  if ((source !== 'trakt' && source !== 'letterboxd') || manifestCatalogs.length === 0) {
    return undefined;
  }

  const manifestCatalog = findCatalog(manifestCatalogs, `${type}::${id}`) || findCatalog(manifestCatalogs, id);
  const normalizedName = String(manifestCatalog?.name || '').trim().toLowerCase();
  if (!normalizedName) {
    return undefined;
  }

  if (/\b(movie|movies|film|films)\b/u.test(normalizedName)) {
    return 'movie';
  }

  if (/\b(show|shows|series)\b/u.test(normalizedName)) {
    return 'series';
  }

  if (/\banime\b/u.test(normalizedName)) {
    return 'anime';
  }

  return undefined;
}

function createOccurrenceKey(
  catalogKey: string,
  widgetId: string,
  itemId: string | undefined,
  suffix: string
): string {
  return [catalogKey, widgetId, itemId || 'row', suffix].join('::');
}

function ensureWidgetGroup(
  widgetMap: Map<string, ExportableCatalogWidgetGroup>,
  widgetId: string,
  widgetTitle: string,
  widgetIndex: number,
  widgetType: 'row.classic' | 'collection.row'
): ExportableCatalogWidgetGroup {
  const existing = widgetMap.get(widgetId);
  if (existing) {
    return existing;
  }

  const next: ExportableCatalogWidgetGroup = {
    key: widgetId,
    id: widgetId,
    widgetId,
    widgetTitle,
    widgetIndex,
    widgetType,
    catalogKeys: [],
    rowCatalogKeys: [],
    items: [],
  };
  widgetMap.set(widgetId, next);
  return next;
}

function ensureItemGroup(
  widgetGroup: ExportableCatalogWidgetGroup,
  itemId: string,
  itemName: string,
  itemIndex: number
): ExportableCatalogItemGroup {
  const existing = widgetGroup.items.find((item) => item.itemId === itemId);
  if (existing) {
    return existing;
  }

  const next: ExportableCatalogItemGroup = {
    key: `${widgetGroup.widgetId}::${itemId}`,
    id: `${widgetGroup.widgetId}::${itemId}`,
    itemId,
    itemName,
    itemIndex,
    catalogKeys: [],
  };
  widgetGroup.items.push(next);
  return next;
}

function pushUnique(values: string[], value: string) {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function filterAgainstManifest(
  definitions: ExportableCatalogDefinition[],
  manifestCatalogs: AIOMetadataCatalog[],
  onlyNewAgainstManifest: boolean
): ExportableCatalogDefinition[] {
  if (!onlyNewAgainstManifest || manifestCatalogs.length === 0) {
    return definitions;
  }

  const manifestKeys = new Set(
    manifestCatalogs.map((catalog) => createManifestKey(catalog.type, catalog.id))
  );

  return definitions.filter((definition) => {
    const { type, id } = definition.entry;
    return !manifestKeys.has(createManifestKey(type, id));
  });
}

function createExportName(params: {
  source: ExportableCatalogSource;
  widgetType: 'row.classic' | 'collection.row';
  widgetTitle: string;
  widgetIndex: number;
  itemName?: string;
  itemIndex?: number;
  type: string;
  id: string;
  manifestCatalogs: AIOMetadataCatalog[];
}) {
  const inferredLabelType = inferSpecialCatalogLabelType(
    params.source,
    params.type,
    params.id,
    params.manifestCatalogs
  );
  const includeTypeLabel = params.source !== 'trakt' && params.source !== 'letterboxd'
    ? true
    : inferredLabelType !== undefined;
  const labelType = inferredLabelType || params.type;
  if (params.widgetType === 'row.classic') {
    const rawName = getWidgetDisplayName(params.widgetTitle, params.widgetIndex);
    return {
      rawName,
      exportName: buildClassicRowCatalogExportName({
        widgetTitle: params.widgetTitle,
        widgetIndex: params.widgetIndex,
        type: labelType,
        includeTypeLabel,
      }),
    };
  }

  const itemName = getItemDisplayName(params.itemName, params.itemIndex);
  return {
    rawName: itemName,
    exportName: buildCollectionCatalogExportName({
      widgetTitle: params.widgetTitle,
      widgetIndex: params.widgetIndex,
      itemName,
      type: labelType,
      includeTypeLabel,
    }),
  };
}

function sortAlphabetically<T>(entries: T[], getValue: (entry: T) => string) {
  return [...entries].sort((left, right) =>
    getValue(left).localeCompare(getValue(right), undefined, { sensitivity: 'base' })
  );
}

function registerOccurrence(params: {
  catalogMap: Map<string, ExportableCatalogDefinition>;
  occurrences: ExportableCatalogOccurrence[];
  widgetMap: Map<string, ExportableCatalogWidgetGroup>;
  manifestKeys: Set<string>;
  source: ExportableCatalogSource;
  id: string;
  type: string;
  displayType: string;
  widgetId: string;
  widgetTitle: string;
  widgetIndex: number;
  itemId?: string;
  itemName?: string;
  itemIndex?: number;
  suffix: string;
  manifestCatalogs: AIOMetadataCatalog[];
}) {
  const catalogKey = createCatalogKey(params.source, params.type, params.id);
  const widgetType = params.itemId ? 'collection.row' : 'row.classic';
  const { rawName, exportName } = createExportName({
    source: params.source,
    widgetType,
    widgetTitle: params.widgetTitle,
    widgetIndex: params.widgetIndex,
    itemName: params.itemName,
    itemIndex: params.itemIndex,
    type: params.type,
    id: params.id,
    manifestCatalogs: params.manifestCatalogs,
  });
  const entry: AiometadataCatalogsOnlyEntry = {
    id: params.id,
    type: params.type,
    name: exportName,
    enabled: true,
    source: params.source,
    displayType: params.displayType,
  };

  const existingDefinition = params.catalogMap.get(catalogKey);
  if (existingDefinition) {
    existingDefinition.occurrenceCount += 1;
  } else {
    params.catalogMap.set(catalogKey, {
      key: catalogKey,
      entry,
      source: params.source,
      occurrenceCount: 1,
      isAlreadyInManifest: params.manifestKeys.has(createManifestKey(entry.type, entry.id)),
    });
  }

  const widgetGroup = ensureWidgetGroup(
    params.widgetMap,
    params.widgetId,
    params.widgetTitle,
    params.widgetIndex,
    widgetType
  );
  pushUnique(widgetGroup.catalogKeys, catalogKey);

  if (params.itemId) {
    const itemGroup = ensureItemGroup(
      widgetGroup,
      params.itemId,
      getItemDisplayName(params.itemName, params.itemIndex),
      params.itemIndex || 0
    );
    pushUnique(itemGroup.catalogKeys, catalogKey);
  } else {
    pushUnique(widgetGroup.rowCatalogKeys, catalogKey);
  }

    params.occurrences.push({
    key: createOccurrenceKey(catalogKey, params.widgetId, params.itemId, params.suffix),
    catalogKey,
    source: params.source,
    widgetId: params.widgetId,
    widgetTitle: params.widgetTitle,
    widgetIndex: params.widgetIndex,
    widgetType,
      itemId: params.itemId,
      itemKey: params.itemId ? `${params.widgetId}::${params.itemId}` : undefined,
      itemName: params.itemName,
    itemIndex: params.itemIndex,
    label: params.itemId ? `${getItemDisplayName(params.itemName, params.itemIndex)} / ${entry.name}` : entry.name,
    searchText: [
      params.widgetTitle,
      params.itemName,
      rawName,
      entry.name,
      entry.id,
      entry.type,
      params.source,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
    entry,
    rawName,
  });
}

export function collectAiometadataExportInventory(
  config: FusionWidgetsConfig,
  options: InventoryOptions = {}
): ExportableCatalogInventory {
  const catalogMap = new Map<string, ExportableCatalogDefinition>();
  const occurrences: ExportableCatalogOccurrence[] = [];
  const widgetMap = new Map<string, ExportableCatalogWidgetGroup>();
  const manifestCatalogs = options.manifestCatalogs || [];
  const manifestKeys = new Set(
    manifestCatalogs.map((catalog) => createManifestKey(catalog.type, catalog.id))
  );

  collectNativeTraktSources(config).forEach((reference, occurrenceIndex) => {
    registerOccurrence({
      catalogMap,
      occurrences,
      widgetMap,
      manifestKeys,
      source: 'trakt',
      id: reference.catalogId,
      type: 'all',
      displayType: 'all',
      widgetId: reference.widgetId,
      widgetTitle: reference.widgetTitle,
      widgetIndex: reference.widgetIndex,
      itemId: reference.itemId,
      itemName: reference.itemName,
      itemIndex: reference.itemIndex,
      suffix: `native-trakt-${occurrenceIndex}`,
      manifestCatalogs,
    });
  });

  collectUsedAiometadataTraktCatalogs(config, manifestCatalogs).forEach((reference, occurrenceIndex) => {
    registerOccurrence({
      catalogMap,
      occurrences,
      widgetMap,
      manifestKeys,
      source: 'trakt',
      id: reference.id,
      type: reference.type,
      displayType: reference.displayType,
      widgetId: reference.widgetId,
      widgetTitle: reference.widgetTitle,
      widgetIndex: reference.widgetIndex,
      itemId: reference.itemId,
      itemName: reference.itemName,
      itemIndex: reference.itemIndex,
      suffix: `aiom-trakt-${occurrenceIndex}`,
      manifestCatalogs,
    });
  });

  collectUsedMdblistCatalogs(config, manifestCatalogs).forEach((reference, occurrenceIndex) => {
    registerOccurrence({
      catalogMap,
      occurrences,
      widgetMap,
      manifestKeys,
      source: 'mdblist',
      id: reference.id,
      type: reference.type,
      displayType: reference.displayType,
      widgetId: reference.widgetId,
      widgetTitle: reference.widgetTitle,
      widgetIndex: reference.widgetIndex,
      itemId: reference.itemId,
      itemName: reference.itemName,
      itemIndex: reference.itemIndex,
      suffix: `mdblist-${occurrenceIndex}`,
      manifestCatalogs,
    });
  });

  collectUsedStreamingCatalogs(config, manifestCatalogs).forEach((reference, occurrenceIndex) => {
    registerOccurrence({
      catalogMap,
      occurrences,
      widgetMap,
      manifestKeys,
      source: 'streaming',
      id: reference.id,
      type: reference.type,
      displayType: reference.displayType,
      widgetId: reference.widgetId,
      widgetTitle: reference.widgetTitle,
      widgetIndex: reference.widgetIndex,
      itemId: reference.itemId,
      itemName: reference.itemName,
      itemIndex: reference.itemIndex,
      suffix: `streaming-${occurrenceIndex}`,
      manifestCatalogs,
    });
  });

  collectUsedSimklCatalogs(config, manifestCatalogs).forEach((reference, occurrenceIndex) => {
    registerOccurrence({
      catalogMap,
      occurrences,
      widgetMap,
      manifestKeys,
      source: 'simkl',
      id: reference.id,
      type: reference.type,
      displayType: reference.displayType,
      widgetId: reference.widgetId,
      widgetTitle: reference.widgetTitle,
      widgetIndex: reference.widgetIndex,
      itemId: reference.itemId,
      itemName: reference.itemName,
      itemIndex: reference.itemIndex,
      suffix: `simkl-${occurrenceIndex}`,
      manifestCatalogs,
    });
  });

  collectUsedLetterboxdCatalogs(config, manifestCatalogs).forEach((reference, occurrenceIndex) => {
    registerOccurrence({
      catalogMap,
      occurrences,
      widgetMap,
      manifestKeys,
      source: 'letterboxd',
      id: reference.id,
      type: reference.type,
      displayType: reference.displayType,
      widgetId: reference.widgetId,
      widgetTitle: reference.widgetTitle,
      widgetIndex: reference.widgetIndex,
      itemId: reference.itemId,
      itemName: reference.itemName,
      itemIndex: reference.itemIndex,
      suffix: `letterboxd-${occurrenceIndex}`,
      manifestCatalogs,
    });
  });

  const filteredCatalogs = filterAgainstManifest(
    Array.from(catalogMap.values()),
    manifestCatalogs,
    options.onlyNewAgainstManifest === true
  );
  const allowedKeys = new Set(filteredCatalogs.map((catalog) => catalog.key));
  const filteredOccurrences = occurrences.filter((occurrence) => allowedKeys.has(occurrence.catalogKey));
  const firstWidgetIndexByCatalogKey = new Map<string, number>();
  filteredOccurrences.forEach((occurrence) => {
    const current = firstWidgetIndexByCatalogKey.get(occurrence.catalogKey);
    if (current === undefined || occurrence.widgetIndex < current) {
      firstWidgetIndexByCatalogKey.set(occurrence.catalogKey, occurrence.widgetIndex);
    }
  });

  const filteredWidgets = Array.from(widgetMap.values())
    .map((widget) => ({
      ...widget,
      catalogKeys: widget.catalogKeys.filter((catalogKey) => allowedKeys.has(catalogKey)),
      rowCatalogKeys: widget.rowCatalogKeys.filter((catalogKey) => allowedKeys.has(catalogKey)),
      items: sortAlphabetically(
        widget.items
          .map((item) => ({
            ...item,
            catalogKeys: item.catalogKeys.filter((catalogKey) => allowedKeys.has(catalogKey)),
          }))
          .filter((item) => item.catalogKeys.length > 0),
        (item) => item.itemName
      ),
    }))
    .filter((widget) => widget.catalogKeys.length > 0)
    .sort((left, right) => left.widgetIndex - right.widgetIndex);

  return {
    catalogs: [...filteredCatalogs].sort((left, right) =>
      compareCatalogExportOrder(
        {
          widgetIndex: firstWidgetIndexByCatalogKey.get(left.key) ?? Number.MAX_SAFE_INTEGER,
          name: left.entry.name,
          id: left.entry.id,
          type: left.entry.type,
        },
        {
          widgetIndex: firstWidgetIndexByCatalogKey.get(right.key) ?? Number.MAX_SAFE_INTEGER,
          name: right.entry.name,
          id: right.entry.id,
          type: right.entry.type,
        }
      )
    ),
    occurrences: filteredOccurrences,
    widgets: filteredWidgets,
  };
}
