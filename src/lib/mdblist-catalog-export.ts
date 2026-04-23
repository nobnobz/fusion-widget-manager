import type {
  AIOMetadataCatalog,
  AiometadataCatalogMetadata,
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

export const UNIFIED_MDBLIST_DEFAULT_CACHE_TTL = 86400;

export interface UsedMdblistCatalogReference {
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
  rawName: string;
  metadata?: AiometadataCatalogMetadata;
  dataSource: AIOMetadataDataSource;
}

interface CatalogExportFilterOptions {
  onlyNewAgainstManifest?: boolean;
}

function getCatalogActualId(catalogId: string): string {
  const parts = String(catalogId || '').split('::');
  return parts[parts.length - 1] || '';
}



const PRETTY_BUILTIN_TITLES: Record<string, string> = {
  'mdblist.upnext': 'MDBList Up Next Series',
};

function isMdblistCatalogId(catalogId: string): boolean {
  return getCatalogActualId(catalogId).startsWith('mdblist.');
}

export function isUnifiedMdblistCatalogId(catalogId: string): boolean {
  const actualId = getCatalogActualId(catalogId).toLowerCase();
  return actualId.startsWith('mdblist.') && actualId.endsWith('.unified');
}

function parseUnifiedMdblistCatalogId(catalogId: string): { username: string; listSlug: string } | null {
  if (!isUnifiedMdblistCatalogId(catalogId)) {
    return null;
  }

  const actualId = getCatalogActualId(catalogId);
  const body = actualId.slice('mdblist.'.length, -'.unified'.length);
  const splitIndex = body.indexOf('.');
  if (splitIndex <= 0 || splitIndex >= body.length - 1) {
    return null;
  }

  const username = body.slice(0, splitIndex).trim();
  const listSlug = body.slice(splitIndex + 1).trim();
  if (!username || !listSlug) {
    return null;
  }

  return { username, listSlug };
}

export function buildUnifiedMdblistCatalogMetadata(
  catalogId: string,
  manifestMetadata?: Record<string, unknown>
): AiometadataCatalogMetadata | undefined {
  const parsed = parseUnifiedMdblistCatalogId(catalogId);
  if (!parsed) {
    return undefined;
  }

  const metadata: AiometadataCatalogMetadata = {
    unified: true,
    username: parsed.username,
    listSlug: parsed.listSlug,
    author: parsed.username,
    url: `https://mdblist.com/lists/${parsed.username}/${parsed.listSlug}`,
  };

  if (
    manifestMetadata
    && typeof manifestMetadata.itemCount === 'number'
    && Number.isFinite(manifestMetadata.itemCount)
  ) {
    metadata.itemCount = manifestMetadata.itemCount;
  }

  return metadata;
}

export function buildUnifiedMdblistCatalogExportName(rawName: string): string {
  const normalized = String(rawName || '').trim().replace(/^\[Service\]\s*/iu, '');
  return normalized ? `[Service] ${normalized}` : '[Service]';
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
  const actualId = getCatalogActualId(catalogId);
  const type = getCatalogType(dataSource);

  const manifestMatch = manifestCatalogs.find(
    (catalog) => catalog.id === actualId && catalog.type === type
  );
  if (manifestMatch?.name?.trim()) {
    return manifestMatch.name.trim();
  }

  return PRETTY_BUILTIN_TITLES[actualId] || null;
}

function dedupeReferences(references: UsedMdblistCatalogReference[]): UsedMdblistCatalogReference[] {
  const seen = new Set<string>();
  const deduped: UsedMdblistCatalogReference[] = [];

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

export function collectUsedMdblistCatalogs(
  config: FusionWidgetsConfig,
  manifestCatalogs: AIOMetadataCatalog[] = []
): UsedMdblistCatalogReference[] {
  const references: UsedMdblistCatalogReference[] = [];
  const fallbackCounts = new Map<string, number>();

  config.widgets.forEach((widget, widgetIndex) => {
    const widgetTitle = String(widget.title || '').trim();

    if (widget.type === 'row.classic') {
      if (!isAIOMetadataDataSource(widget.dataSource) || !isMdblistCatalogId(widget.dataSource.payload.catalogId)) {
        return;
      }

      const type = getCatalogType(widget.dataSource);
      const recognizedName = getCatalogDisplayName(widget.dataSource, manifestCatalogs);
      const manifestMatch = findCatalog(manifestCatalogs, getCatalogActualId(widget.dataSource.payload.catalogId));
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
        rawName: widgetTitle || `Widget ${widgetIndex + 1}`,
        metadata: isUnifiedMdblistCatalogId(widget.dataSource.payload.catalogId)
          ? buildUnifiedMdblistCatalogMetadata(
              getCatalogActualId(widget.dataSource.payload.catalogId),
              manifestMatch?.metadata
            )
          : undefined,
        dataSource: widget.dataSource,
      });
      return;
    }

    widget.dataSource.payload.items.forEach((item, itemIndex) => {
      const itemName = getFusionCollectionItemName(item, itemIndex);
      item.dataSources.forEach((dataSource, dataSourceIndex) => {
        if (!isAIOMetadataDataSource(dataSource) || !isMdblistCatalogId(dataSource.payload.catalogId)) {
          return;
        }

        const type = getCatalogType(dataSource);
        const recognizedName = getCatalogDisplayName(dataSource, manifestCatalogs);
        const manifestMatch = findCatalog(manifestCatalogs, getCatalogActualId(dataSource.payload.catalogId));
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
          rawName: itemName,
          metadata: isUnifiedMdblistCatalogId(dataSource.payload.catalogId)
            ? buildUnifiedMdblistCatalogMetadata(
                getCatalogActualId(dataSource.payload.catalogId),
                manifestMatch?.metadata
              )
            : undefined,
          dataSource,
        });
      });
    });
  });

  return references;
}

export function hasUsedMdblistCatalogs(config: FusionWidgetsConfig): boolean {
  return config.widgets.some((widget) => {
    if (widget.type === 'row.classic') {
      return isAIOMetadataDataSource(widget.dataSource) && isMdblistCatalogId(widget.dataSource.payload.catalogId);
    }

    return widget.dataSource.payload.items.some((item) =>
      item.dataSources.some(
        (dataSource) => isAIOMetadataDataSource(dataSource) && isMdblistCatalogId(dataSource.payload.catalogId)
      )
    );
  });
}

export function buildAiometadataMdblistCatalogsOnlyExport(
  config: FusionWidgetsConfig,
  manifestCatalogs: AIOMetadataCatalog[] = [],
  exportedAt = new Date().toISOString(),
  options: CatalogExportFilterOptions = {}
): AiometadataCatalogsOnlyExport {
  const catalogs = dedupeReferences(
    collectUsedMdblistCatalogs(config, manifestCatalogs)
  ).sort(compareCatalogExportOrder).map<AiometadataCatalogsOnlyEntry>((reference) => {
    if (isUnifiedMdblistCatalogId(reference.id)) {
      return {
        id: reference.id,
        type: 'all',
        name: buildUnifiedMdblistCatalogExportName(reference.rawName),
        enabled: true,
        source: 'mdblist',
        sort: 'default',
        order: 'asc',
        cacheTTL: UNIFIED_MDBLIST_DEFAULT_CACHE_TTL,
        showInHome: true,
        genreSelection: 'standard',
        enableRatingPosters: true,
        metadata: reference.metadata || buildUnifiedMdblistCatalogMetadata(reference.id),
      };
    }

    return {
      id: reference.id,
      type: reference.type,
      name: reference.name,
      enabled: true,
      source: 'mdblist',
      displayType: reference.displayType,
    };
  });

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
