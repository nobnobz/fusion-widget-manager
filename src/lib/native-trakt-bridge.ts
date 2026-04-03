import type {
  AIOMetadataCatalog,
  AiometadataCatalogsOnlyEntry,
  AiometadataCatalogsOnlyExport,
  AIOMetadataDataSource,
  CollectionItem,
  FusionWidgetsConfig,
  NativeTraktDataSource,
  RowClassicWidget,
  Widget,
  WidgetDataSource,
} from './types/widget';
import {
  buildCatalogFallbackName,
  compareCatalogExportOrder,
  getFusionCollectionItemName,
  prefixCatalogNameWithWidget,
} from './aiometadata-catalog-labels';
import { MANIFEST_PLACEHOLDER, isNativeTraktDataSource } from './widget-domain';

export interface NativeTraktSourceReference {
  widgetId: string;
  widgetTitle: string;
  widgetIndex: number;
  itemId?: string;
  itemName?: string;
  itemIndex?: number;
  dataSourceIndex: number;
  displayName: string;
  locationLabel: string;
  catalogId: string;
  dataSource: NativeTraktDataSource;
}

interface CatalogExportFilterOptions {
  manifestCatalogs?: AIOMetadataCatalog[];
  onlyNewAgainstManifest?: boolean;
}

function normalizeTraktId(value: NativeTraktDataSource['payload']['traktId']): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return '';
}

function humanizeSlug(slug: string): string {
  return slug
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getRecognizedDisplayName(
  dataSource: NativeTraktDataSource,
): string | null {
  const listName = dataSource.payload.listName.trim();
  if (listName) {
    return listName;
  }

  const listSlug = dataSource.payload.listSlug.trim();
  if (listSlug) {
    return humanizeSlug(listSlug);
  }
  return null;
}

function getLocationLabel(widgetTitle: string, widgetIndex: number, itemName?: string, itemIndex?: number): string {
  const widgetLabel = widgetTitle.trim() || `widget #${widgetIndex + 1}`;
  if (itemName !== undefined || itemIndex !== undefined) {
    const itemLabel = String(itemName || '').trim() || `item #${(itemIndex ?? 0) + 1}`;
    return `collection item "${itemLabel}" in widget "${widgetLabel}"`;
  }
  return `widget "${widgetLabel}"`;
}

function getCatalogIdForTraktId(traktId: string): string {
  return `trakt.list.${traktId}`;
}

function toAiometadataDataSource(dataSource: NativeTraktDataSource, manifestUrl: string | null = null): AIOMetadataDataSource {
  const traktId = normalizeTraktId(dataSource.payload.traktId);
  if (!traktId) {
    throw new Error('Native Trakt source is missing a traktId.');
  }

  return {
    sourceType: 'aiometadata',
    kind: 'addonCatalog',
    payload: {
      addonId: manifestUrl || MANIFEST_PLACEHOLDER,
      catalogId: `all::${getCatalogIdForTraktId(traktId)}`,
      catalogType: 'all',
    },
  };
}

function cloneDataSource(dataSource: WidgetDataSource, manifestUrl: string | null): WidgetDataSource {
  if (isNativeTraktDataSource(dataSource)) {
    return toAiometadataDataSource(dataSource, manifestUrl);
  }

  return {
    ...dataSource,
    payload: {
      ...dataSource.payload,
    },
  };
}

function cloneCollectionItem(item: CollectionItem, manifestUrl: string | null): CollectionItem {
  return {
    ...item,
    dataSources: item.dataSources.map((dataSource) => cloneDataSource(dataSource, manifestUrl)),
  };
}

export function hasNativeTraktSources(config: FusionWidgetsConfig): boolean {
  return config.widgets.some((widget) => {
    if (widget.type === 'row.classic') {
      return isNativeTraktDataSource(widget.dataSource);
    }

    return widget.dataSource.payload.items.some((item) => item.dataSources.some(isNativeTraktDataSource));
  });
}

export function collectNativeTraktSources(config: FusionWidgetsConfig): NativeTraktSourceReference[] {
  const references: NativeTraktSourceReference[] = [];
  const fallbackCounts = new Map<string, number>();

  config.widgets.forEach((widget, widgetIndex) => {
    const widgetTitle = String(widget.title || '').trim();

    if (widget.type === 'row.classic') {
      if (!isNativeTraktDataSource(widget.dataSource)) {
        return;
      }

      const traktId = normalizeTraktId(widget.dataSource.payload.traktId);
      if (!traktId) {
        throw new Error(`Native Trakt source in ${getLocationLabel(widgetTitle, widgetIndex)} is missing a traktId.`);
      }

      references.push({
        widgetId: widget.id,
        widgetTitle,
        widgetIndex,
        dataSourceIndex: 0,
        displayName: (() => {
          const recognizedName = getRecognizedDisplayName(widget.dataSource);
          if (recognizedName) {
            return prefixCatalogNameWithWidget(widgetTitle, widgetIndex, recognizedName);
          }
          const fallbackKey = `${widget.id}::row::all`;
          const fallbackOccurrence = (fallbackCounts.get(fallbackKey) || 0) + 1;
          fallbackCounts.set(fallbackKey, fallbackOccurrence);
          return prefixCatalogNameWithWidget(widgetTitle, widgetIndex, buildCatalogFallbackName({
            widgetTitle,
            widgetIndex,
            type: 'all',
            occurrence: fallbackOccurrence,
          }));
        })(),
        locationLabel: getLocationLabel(widgetTitle, widgetIndex),
        catalogId: getCatalogIdForTraktId(traktId),
        dataSource: widget.dataSource,
      });
      return;
    }

    widget.dataSource.payload.items.forEach((item, itemIndex) => {
      const itemName = getFusionCollectionItemName(item, itemIndex);
      item.dataSources.forEach((dataSource, dataSourceIndex) => {
        if (!isNativeTraktDataSource(dataSource)) {
          return;
        }

        const traktId = normalizeTraktId(dataSource.payload.traktId);
        if (!traktId) {
          throw new Error(
            `Native Trakt source in ${getLocationLabel(widgetTitle, widgetIndex, item.name, itemIndex)} is missing a traktId.`
          );
        }

        references.push({
          widgetId: widget.id,
          widgetTitle,
          widgetIndex,
          itemId: item.id,
          itemName,
          itemIndex,
          dataSourceIndex,
          displayName: (() => {
            const recognizedName = getRecognizedDisplayName(dataSource);
            if (recognizedName) {
              return prefixCatalogNameWithWidget(widgetTitle, widgetIndex, recognizedName);
            }
            const fallbackKey = `${widget.id}::${item.id}::all`;
            const fallbackOccurrence = (fallbackCounts.get(fallbackKey) || 0) + 1;
            fallbackCounts.set(fallbackKey, fallbackOccurrence);
            return prefixCatalogNameWithWidget(widgetTitle, widgetIndex, buildCatalogFallbackName({
              widgetTitle,
              widgetIndex,
              itemName,
              itemIndex,
              type: 'all',
              occurrence: fallbackOccurrence,
            }));
          })(),
          locationLabel: getLocationLabel(widgetTitle, widgetIndex, itemName, itemIndex),
          catalogId: getCatalogIdForTraktId(traktId),
          dataSource,
        });
      });
    });
  });

  return references;
}

function dedupeNativeTraktSources(references: NativeTraktSourceReference[]): NativeTraktSourceReference[] {
  const seen = new Set<string>();
  const deduped: NativeTraktSourceReference[] = [];

  references.forEach((reference) => {
    if (seen.has(reference.catalogId)) {
      return;
    }

    seen.add(reference.catalogId);
    deduped.push(reference);
  });

  return deduped;
}

function createCatalogEntryKey(type: string, id: string): string {
  return `${String(type || '').trim().toLowerCase()}::${String(id || '').trim().toLowerCase()}`;
}

function filterCatalogEntriesAgainstManifest(
  entries: AiometadataCatalogsOnlyEntry[],
  manifestCatalogs: AIOMetadataCatalog[],
  onlyNewAgainstManifest: boolean
): AiometadataCatalogsOnlyEntry[] {
  if (!onlyNewAgainstManifest || manifestCatalogs.length === 0) {
    return entries;
  }

  const manifestKeys = new Set(
    manifestCatalogs.map((catalog) => createCatalogEntryKey(catalog.type, catalog.id))
  );

  return entries.filter((entry) => !manifestKeys.has(createCatalogEntryKey(entry.type, entry.id)));
}

export function buildAiometadataCatalogsOnlyExport(
  config: FusionWidgetsConfig,
  exportedAt = new Date().toISOString(),
  options: CatalogExportFilterOptions = {}
): AiometadataCatalogsOnlyExport {
  const catalogs = dedupeNativeTraktSources(collectNativeTraktSources(config))
    .sort((left, right) =>
      compareCatalogExportOrder(
        {
          widgetIndex: left.widgetIndex,
          name: left.displayName,
          id: left.catalogId,
          type: 'all',
        },
        {
          widgetIndex: right.widgetIndex,
          name: right.displayName,
          id: right.catalogId,
          type: 'all',
        }
      )
    )
    .map<AiometadataCatalogsOnlyEntry>(
    (reference) => ({
      id: reference.catalogId,
      type: 'all',
      name: reference.displayName,
      enabled: true,
      source: 'trakt',
    })
  );

  const filteredCatalogs = filterCatalogEntriesAgainstManifest(
    catalogs,
    options.manifestCatalogs || [],
    options.onlyNewAgainstManifest === true
  );

  return {
    version: 1,
    exportedAt,
    catalogs: filteredCatalogs,
  };
}

export function getNativeTraktBridgeFingerprint(
  config: FusionWidgetsConfig,
  options: CatalogExportFilterOptions = {}
): string {
  const exportPayload = buildAiometadataCatalogsOnlyExport(config, 'fingerprint', options);
  return JSON.stringify(exportPayload.catalogs);
}

export function bridgeNativeTraktSourcesForOmni(
  config: FusionWidgetsConfig,
  manifestUrl: string | null = null
): FusionWidgetsConfig {
  return {
    ...config,
    widgets: config.widgets.map((widget): Widget => {
      if (widget.type === 'row.classic') {
        const nextDataSource = cloneDataSource(widget.dataSource, manifestUrl);
        return {
          ...widget,
          dataSource: nextDataSource as RowClassicWidget['dataSource'],
          presentation: {
            ...widget.presentation,
            badges: {
              ...widget.presentation.badges,
            },
          },
        };
      }

      return {
        ...widget,
        dataSource: {
          ...widget.dataSource,
          payload: {
            ...widget.dataSource.payload,
            items: widget.dataSource.payload.items.map((item) => cloneCollectionItem(item, manifestUrl)),
          },
        },
      };
    }),
  };
}
