import type {
  AIOMetadataCatalog,
  AiometadataCatalogsOnlyEntry,
  AiometadataCatalogsOnlyExport,
  AIOMetadataDataSource,
  FusionWidgetsConfig,
} from './types/widget';
import {
  buildCatalogFallbackName,
  compareCatalogExportOrder,
  getFusionCollectionItemName,
  prefixCatalogNameWithWidget,
} from './aiometadata-catalog-labels';
import { findCatalog, isAIOMetadataDataSource, resolveFusionCatalogType } from './widget-domain';

export interface UsedStreamingCatalogReference {
  widgetId: string;
  widgetTitle: string;
  widgetIndex: number;
  itemId?: string;
  itemName?: string;
  itemIndex?: number;
  dataSourceIndex: number;
  id: string;
  type: string;
  displayType: string;
  name: string;
  dataSource: AIOMetadataDataSource;
}

interface CatalogExportFilterOptions {
  onlyNewAgainstManifest?: boolean;
}

function getCatalogActualId(catalogId: string): string {
  const parts = String(catalogId || '').split('::');
  return parts[parts.length - 1] || '';
}

function isStreamingCatalogId(catalogId: string): boolean {
  return getCatalogActualId(catalogId).startsWith('streaming.');
}

function getCatalogType(dataSource: AIOMetadataDataSource): string {
  const catalogId = String(dataSource.payload.catalogId || '').trim();
  if (catalogId.includes('::')) {
    return catalogId.split('::')[0] || resolveFusionCatalogType(catalogId, dataSource.payload.catalogType);
  }
  return resolveFusionCatalogType(catalogId, dataSource.payload.catalogType);
}

function getCatalogDisplayName(
  dataSource: AIOMetadataDataSource,
  manifestCatalogs: AIOMetadataCatalog[]
): string | null {
  const catalogId = String(dataSource.payload.catalogId || '').trim();
  const manifestCatalog = findCatalog(manifestCatalogs, catalogId);
  if (manifestCatalog?.name?.trim()) {
    return manifestCatalog.name.trim();
  }

  return null;
}

function dedupeReferences(references: UsedStreamingCatalogReference[]): UsedStreamingCatalogReference[] {
  const seen = new Set<string>();
  const deduped: UsedStreamingCatalogReference[] = [];

  references.forEach((reference) => {
    const key = `${reference.type}::${reference.id}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
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

export function collectUsedStreamingCatalogs(
  config: FusionWidgetsConfig,
  manifestCatalogs: AIOMetadataCatalog[] = []
): UsedStreamingCatalogReference[] {
  const references: UsedStreamingCatalogReference[] = [];
  const fallbackCounts = new Map<string, number>();

  config.widgets.forEach((widget, widgetIndex) => {
    const widgetTitle = String(widget.title || '').trim();

    if (widget.type === 'row.classic') {
      if (!isAIOMetadataDataSource(widget.dataSource) || !isStreamingCatalogId(widget.dataSource.payload.catalogId)) {
        return;
      }

      const type = getCatalogType(widget.dataSource);
      const recognizedName = getCatalogDisplayName(widget.dataSource, manifestCatalogs);
      const fallbackKey = `${widget.id}::row::${type}`;
      const fallbackOccurrence = (fallbackCounts.get(fallbackKey) || 0) + 1;
      fallbackCounts.set(fallbackKey, fallbackOccurrence);
      references.push({
        widgetId: widget.id,
        widgetTitle,
        widgetIndex,
        dataSourceIndex: 0,
        id: getCatalogActualId(widget.dataSource.payload.catalogId),
        type,
        displayType: type,
        name: prefixCatalogNameWithWidget(
          widgetTitle,
          widgetIndex,
          recognizedName || buildCatalogFallbackName({
            widgetTitle,
            widgetIndex,
            type,
            occurrence: fallbackOccurrence,
          })
        ),
        dataSource: widget.dataSource,
      });
      return;
    }

    widget.dataSource.payload.items.forEach((item, itemIndex) => {
      const itemName = getFusionCollectionItemName(item, itemIndex);
      item.dataSources.forEach((dataSource, dataSourceIndex) => {
        if (!isAIOMetadataDataSource(dataSource) || !isStreamingCatalogId(dataSource.payload.catalogId)) {
          return;
        }

        const type = getCatalogType(dataSource);
        const recognizedName = getCatalogDisplayName(dataSource, manifestCatalogs);
        const fallbackKey = `${widget.id}::${item.id}::${type}`;
        const fallbackOccurrence = (fallbackCounts.get(fallbackKey) || 0) + 1;
        fallbackCounts.set(fallbackKey, fallbackOccurrence);
        references.push({
          widgetId: widget.id,
          widgetTitle,
          widgetIndex,
          itemId: item.id,
          itemName,
          itemIndex,
          dataSourceIndex,
          id: getCatalogActualId(dataSource.payload.catalogId),
          type,
          displayType: type,
          name: prefixCatalogNameWithWidget(
            widgetTitle,
            widgetIndex,
            recognizedName || buildCatalogFallbackName({
              widgetTitle,
              widgetIndex,
              itemName,
              itemIndex,
              type,
              occurrence: fallbackOccurrence,
            })
          ),
          dataSource,
        });
      });
    });
  });

  return references;
}

export function hasUsedStreamingCatalogs(config: FusionWidgetsConfig): boolean {
  return config.widgets.some((widget) => {
    if (widget.type === 'row.classic') {
      return isAIOMetadataDataSource(widget.dataSource) && isStreamingCatalogId(widget.dataSource.payload.catalogId);
    }

    return widget.dataSource.payload.items.some((item) =>
      item.dataSources.some(
        (dataSource) => isAIOMetadataDataSource(dataSource) && isStreamingCatalogId(dataSource.payload.catalogId)
      )
    );
  });
}

export function buildAiometadataStreamingCatalogsOnlyExport(
  config: FusionWidgetsConfig,
  manifestCatalogs: AIOMetadataCatalog[] = [],
  exportedAt = new Date().toISOString(),
  options: CatalogExportFilterOptions = {}
): AiometadataCatalogsOnlyExport {
  const catalogs = dedupeReferences(
    collectUsedStreamingCatalogs(config, manifestCatalogs)
  ).sort(compareCatalogExportOrder).map<AiometadataCatalogsOnlyEntry>((reference) => ({
    id: reference.id,
    type: reference.type,
    name: reference.name,
    enabled: true,
    source: 'streaming',
    displayType: reference.displayType,
  }));

  const filteredCatalogs = filterCatalogEntriesAgainstManifest(
    catalogs,
    manifestCatalogs,
    options.onlyNewAgainstManifest === true
  );

  return {
    version: 1,
    exportedAt,
    catalogs: filteredCatalogs,
  };
}
