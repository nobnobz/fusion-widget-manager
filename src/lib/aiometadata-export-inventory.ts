import type {
  AIOMetadataCatalog,
  AiometadataCatalogsOnlyEntry,
  AiometadataCatalogsOnlyExport,
  FusionWidgetsConfig,
} from './types/widget';
import { compareCatalogExportOrder, getItemDisplayName } from './aiometadata-catalog-labels';
import { collectUsedMdblistCatalogs } from './mdblist-catalog-export';
import { collectNativeTraktSources } from './native-trakt-bridge';
import { collectUsedStreamingCatalogs } from './streaming-catalog-export';
import { collectUsedAiometadataTraktCatalogs } from './trakt-catalog-export';

export type ExportableCatalogSource = 'trakt' | 'mdblist' | 'streaming';

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
  itemName?: string;
  itemIndex?: number;
  label: string;
  searchText: string;
}

export interface ExportableCatalogItemGroup {
  key: string;
  itemId: string;
  itemName: string;
  itemIndex: number;
  catalogKeys: string[];
}

export interface ExportableCatalogWidgetGroup {
  key: string;
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
    const catalogKey = createCatalogKey('trakt', 'all', reference.catalogId);
    const entry: AiometadataCatalogsOnlyEntry = {
      id: reference.catalogId,
      type: 'all',
      name: reference.displayName,
      enabled: true,
      source: 'trakt',
    };

    const existingDefinition = catalogMap.get(catalogKey);
    if (existingDefinition) {
      existingDefinition.occurrenceCount += 1;
    } else {
      catalogMap.set(catalogKey, {
        key: catalogKey,
        entry,
        source: 'trakt',
        occurrenceCount: 1,
        isAlreadyInManifest: manifestKeys.has(createManifestKey(entry.type, entry.id)),
      });
    }

    const widgetGroup = ensureWidgetGroup(
      widgetMap,
      reference.widgetId,
      reference.widgetTitle,
      reference.widgetIndex,
      reference.itemId ? 'collection.row' : 'row.classic'
    );
    pushUnique(widgetGroup.catalogKeys, catalogKey);

    if (reference.itemId) {
      const itemGroup = ensureItemGroup(
        widgetGroup,
        reference.itemId,
        getItemDisplayName(reference.itemName, reference.itemIndex),
        reference.itemIndex || 0
      );
      pushUnique(itemGroup.catalogKeys, catalogKey);
    } else {
      pushUnique(widgetGroup.rowCatalogKeys, catalogKey);
    }

    const label = reference.itemId
      ? `${getItemDisplayName(reference.itemName, reference.itemIndex)} / ${reference.displayName}`
      : reference.displayName;
    occurrences.push({
      key: createOccurrenceKey(catalogKey, reference.widgetId, reference.itemId, String(occurrenceIndex)),
      catalogKey,
      source: 'trakt',
      widgetId: reference.widgetId,
      widgetTitle: reference.widgetTitle,
      widgetIndex: reference.widgetIndex,
      widgetType: reference.itemId ? 'collection.row' : 'row.classic',
      itemId: reference.itemId,
      itemName: reference.itemName,
      itemIndex: reference.itemIndex,
      label,
      searchText: [reference.widgetTitle, reference.itemName, reference.displayName, reference.catalogId, 'trakt']
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    });
  });

  collectUsedAiometadataTraktCatalogs(config, manifestCatalogs).forEach((reference, occurrenceIndex) => {
    const catalogKey = createCatalogKey('trakt', reference.type, reference.id);
    const entry: AiometadataCatalogsOnlyEntry = {
      id: reference.id,
      type: reference.type,
      name: reference.name,
      enabled: true,
      source: 'trakt',
      displayType: reference.displayType,
    };

    const existingDefinition = catalogMap.get(catalogKey);
    if (existingDefinition) {
      existingDefinition.occurrenceCount += 1;
    } else {
      catalogMap.set(catalogKey, {
        key: catalogKey,
        entry,
        source: 'trakt',
        occurrenceCount: 1,
        isAlreadyInManifest: manifestKeys.has(createManifestKey(entry.type, entry.id)),
      });
    }

    const widgetType = reference.itemId ? 'collection.row' : 'row.classic';
    const widgetGroup = ensureWidgetGroup(
      widgetMap,
      reference.widgetId,
      reference.widgetTitle,
      reference.widgetIndex,
      widgetType
    );
    pushUnique(widgetGroup.catalogKeys, catalogKey);

    if (reference.itemId) {
      const itemGroup = ensureItemGroup(
        widgetGroup,
        reference.itemId,
        getItemDisplayName(reference.itemName, reference.itemIndex),
        reference.itemIndex || 0
      );
      pushUnique(itemGroup.catalogKeys, catalogKey);
    } else {
      pushUnique(widgetGroup.rowCatalogKeys, catalogKey);
    }

    const label = reference.itemId
      ? `${getItemDisplayName(reference.itemName, reference.itemIndex)} / ${reference.name}`
      : reference.name;
    occurrences.push({
      key: createOccurrenceKey(catalogKey, reference.widgetId, reference.itemId, `aiom-trakt-${occurrenceIndex}`),
      catalogKey,
      source: 'trakt',
      widgetId: reference.widgetId,
      widgetTitle: reference.widgetTitle,
      widgetIndex: reference.widgetIndex,
      widgetType,
      itemId: reference.itemId,
      itemName: reference.itemName,
      itemIndex: reference.itemIndex,
      label,
      searchText: [reference.widgetTitle, reference.itemName, reference.name, reference.id, reference.type, 'trakt']
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    });
  });

  collectUsedMdblistCatalogs(config, manifestCatalogs).forEach((reference, occurrenceIndex) => {
    const catalogKey = createCatalogKey('mdblist', reference.type, reference.id);
    const entry: AiometadataCatalogsOnlyEntry = {
      id: reference.id,
      type: reference.type,
      name: reference.name,
      enabled: true,
      source: 'mdblist',
      displayType: reference.displayType,
    };

    const existingDefinition = catalogMap.get(catalogKey);
    if (existingDefinition) {
      existingDefinition.occurrenceCount += 1;
    } else {
      catalogMap.set(catalogKey, {
        key: catalogKey,
        entry,
        source: 'mdblist',
        occurrenceCount: 1,
        isAlreadyInManifest: manifestKeys.has(createManifestKey(entry.type, entry.id)),
      });
    }

    const widgetType = reference.itemId ? 'collection.row' : 'row.classic';
    const widgetGroup = ensureWidgetGroup(
      widgetMap,
      reference.widgetId,
      reference.widgetTitle,
      reference.widgetIndex,
      widgetType
    );
    pushUnique(widgetGroup.catalogKeys, catalogKey);

    if (reference.itemId) {
      const itemGroup = ensureItemGroup(
        widgetGroup,
        reference.itemId,
        getItemDisplayName(reference.itemName, reference.itemIndex),
        reference.itemIndex || 0
      );
      pushUnique(itemGroup.catalogKeys, catalogKey);
    } else {
      pushUnique(widgetGroup.rowCatalogKeys, catalogKey);
    }

    const label = reference.itemId
      ? `${getItemDisplayName(reference.itemName, reference.itemIndex)} / ${reference.name}`
      : reference.name;
    occurrences.push({
      key: createOccurrenceKey(catalogKey, reference.widgetId, reference.itemId, `mdblist-${occurrenceIndex}`),
      catalogKey,
      source: 'mdblist',
      widgetId: reference.widgetId,
      widgetTitle: reference.widgetTitle,
      widgetIndex: reference.widgetIndex,
      widgetType,
      itemId: reference.itemId,
      itemName: reference.itemName,
      itemIndex: reference.itemIndex,
      label,
      searchText: [reference.widgetTitle, reference.itemName, reference.name, reference.id, reference.type, 'mdblist']
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    });
  });

  collectUsedStreamingCatalogs(config, manifestCatalogs).forEach((reference, occurrenceIndex) => {
    const catalogKey = createCatalogKey('streaming', reference.type, reference.id);
    const entry: AiometadataCatalogsOnlyEntry = {
      id: reference.id,
      type: reference.type,
      name: reference.name,
      enabled: true,
      source: 'streaming',
      displayType: reference.displayType,
    };

    const existingDefinition = catalogMap.get(catalogKey);
    if (existingDefinition) {
      existingDefinition.occurrenceCount += 1;
    } else {
      catalogMap.set(catalogKey, {
        key: catalogKey,
        entry,
        source: 'streaming',
        occurrenceCount: 1,
        isAlreadyInManifest: manifestKeys.has(createManifestKey(entry.type, entry.id)),
      });
    }

    const widgetType = reference.itemId ? 'collection.row' : 'row.classic';
    const widgetGroup = ensureWidgetGroup(
      widgetMap,
      reference.widgetId,
      reference.widgetTitle,
      reference.widgetIndex,
      widgetType
    );
    pushUnique(widgetGroup.catalogKeys, catalogKey);

    if (reference.itemId) {
      const itemGroup = ensureItemGroup(
        widgetGroup,
        reference.itemId,
        getItemDisplayName(reference.itemName, reference.itemIndex),
        reference.itemIndex || 0
      );
      pushUnique(itemGroup.catalogKeys, catalogKey);
    } else {
      pushUnique(widgetGroup.rowCatalogKeys, catalogKey);
    }

    const label = reference.itemId
      ? `${getItemDisplayName(reference.itemName, reference.itemIndex)} / ${reference.name}`
      : reference.name;
    occurrences.push({
      key: createOccurrenceKey(catalogKey, reference.widgetId, reference.itemId, `streaming-${occurrenceIndex}`),
      catalogKey,
      source: 'streaming',
      widgetId: reference.widgetId,
      widgetTitle: reference.widgetTitle,
      widgetIndex: reference.widgetIndex,
      widgetType,
      itemId: reference.itemId,
      itemName: reference.itemName,
      itemIndex: reference.itemIndex,
      label,
      searchText: [reference.widgetTitle, reference.itemName, reference.name, reference.id, reference.type, 'streaming']
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
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
      items: widget.items
        .map((item) => ({
          ...item,
          catalogKeys: item.catalogKeys.filter((catalogKey) => allowedKeys.has(catalogKey)),
        }))
        .filter((item) => item.catalogKeys.length > 0),
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

export function buildAiometadataSelectionExport(
  inventory: ExportableCatalogInventory,
  selectedCatalogKeys: Iterable<string>,
  exportedAt = new Date().toISOString()
): AiometadataCatalogsOnlyExport {
  const selected = new Set(selectedCatalogKeys);
  return {
    version: 1,
    exportedAt,
    catalogs: inventory.catalogs
      .filter((catalog) => selected.has(catalog.key))
      .map((catalog) => catalog.entry),
  };
}
