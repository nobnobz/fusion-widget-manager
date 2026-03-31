import type {
  AddonCatalogDataSource,
  AIOMetadataCatalog,
  CollectionItem,
  FusionWidgetsConfig,
  NativeTraktDataSource,
  Widget,
  WidgetDataSource,
} from './types/widget';
import {
  MANIFEST_PLACEHOLDER,
  findCatalog,
  isAIOMetadataDataSource,
  isNativeTraktDataSource,
  normalizeFusionConfigDetailed,
  resolveFusionCatalogType,
  validateFusionExport,
} from './widget-domain';

export {
  MANIFEST_PLACEHOLDER,
  findCatalog,
  getPrimaryDataSource,
  resolveFusionCatalogType,
} from './widget-domain';

export interface FusionExportSkipIssue {
  path: string;
  reason: 'missingCatalogId' | 'catalogNotInManifest' | 'noDataSources';
  widgetTitle: string;
  itemName?: string;
}

export type FusionInvalidCatalogExportMode = 'skip' | 'empty-items';

export interface FusionExportSanitizationResult {
  config: FusionWidgetsConfig;
  issues: FusionExportSkipIssue[];
  skippedDataSources: number;
  skippedItems: number;
  skippedWidgets: number;
  emptiedItems: number;
}

export function processWidgetWithManifest(
  widget: unknown,
  manifestUrl: string | null = null,
  replace = false,
  catalogs: AIOMetadataCatalog[] = [],
  sanitize = false
): Widget {
  const normalized = normalizeFusionConfigDetailed(
    {
      exportType: 'fusionWidgets',
      exportVersion: 1,
      widgets: [widget],
    },
    {
      manifestUrl,
      replacePlaceholder: replace,
      catalogs,
      sanitize,
    }
  );

  return normalized.config.widgets[0];
}

export function processConfigWithManifest(
  config: FusionWidgetsConfig,
  manifestUrl: string,
  applyReplacement: boolean,
  catalogs: AIOMetadataCatalog[] = [],
  sanitize = false
): FusionWidgetsConfig {
  return normalizeFusionConfigDetailed(config, {
    manifestUrl,
    replacePlaceholder: applyReplacement,
    catalogs,
    sanitize,
  }).config;
}

export function mapLayoutToImageAspect(layout: string): 'wide' | 'poster' | 'square' {
  const lowLayout = String(layout).toLowerCase();
  if (lowLayout === 'wide') return 'wide';
  if (lowLayout === 'poster') return 'poster';
  if (lowLayout === 'square') return 'square';
  return 'poster';
}

function normalizeFusionDataSourcePayload(
  dataSource: AddonCatalogDataSource,
  manifestUrl: string | null
) {
  const payload = { ...dataSource.payload };
  if (payload.addonId === MANIFEST_PLACEHOLDER && manifestUrl) {
    payload.addonId = manifestUrl;
  }

  if (payload.addonId === MANIFEST_PLACEHOLDER) {
    throw new Error(
      'Sync your AIOMetadata manifest before Fusion export so the AIOMetadata URL can be embedded in your Fusion setup.'
    );
  }
  if (!payload.catalogId) {
    throw new Error('Export failed: A data source still has an empty catalog ID. Please select a catalog first.');
  }

  const type = resolveFusionCatalogType(payload.catalogId, payload.catalogType).toLowerCase();
  
  // Normalize catalogId to lowercase type prefix (e.g. Movie:: -> movie::)
  let normalizedCatalogId = payload.catalogId;
  if (normalizedCatalogId.includes('::')) {
    const parts = normalizedCatalogId.split('::');
    normalizedCatalogId = `${parts[0].toLowerCase()}::${parts.slice(1).join('::')}`;
  } else {
    normalizedCatalogId = `${type}::${normalizedCatalogId}`;
  }

  return {
    addonId: payload.addonId,
    catalogId: normalizedCatalogId,
    type,
  };
}

function normalizeTraktFusionDataSourcePayload(dataSource: NativeTraktDataSource) {
  return {
    listName: dataSource.payload.listName,
    listSlug: dataSource.payload.listSlug,
    traktId: dataSource.payload.traktId,
    username: dataSource.payload.username,
  };
}

function getFusionExportSkipReason(
  dataSource: WidgetDataSource,
  catalogs: AIOMetadataCatalog[]
): FusionExportSkipIssue['reason'] | null {
  if (!isAIOMetadataDataSource(dataSource)) {
    return null;
  }

  const catalogId = dataSource.payload.catalogId.trim();
  if (!catalogId) {
    return 'missingCatalogId';
  }

  if (catalogs.length === 0) {
    return null;
  }

  return findCatalog(catalogs, catalogId) ? null : 'catalogNotInManifest';
}

export function sanitizeFusionConfigForExport(
  config: FusionWidgetsConfig,
  catalogs: AIOMetadataCatalog[] = [],
  options: {
    invalidAiometadataMode?: FusionInvalidCatalogExportMode;
  } = {}
): FusionExportSanitizationResult {
  const invalidAiometadataMode = options.invalidAiometadataMode ?? 'skip';
  const issues: FusionExportSkipIssue[] = [];
  let skippedDataSources = 0;
  let skippedItems = 0;
  let skippedWidgets = 0;
  let emptiedItems = 0;

  const widgets: Widget[] = [];

  config.widgets.forEach((widget, widgetIndex) => {
    if (widget.type === 'row.classic') {
      const reason = getFusionExportSkipReason(widget.dataSource, catalogs);
      if (!reason) {
        widgets.push(widget);
        return;
      }

      issues.push({
        path: `widgets[${widgetIndex}]`,
        reason,
        widgetTitle: widget.title,
      });
      skippedDataSources += 1;
      skippedWidgets += 1;
      return;
    }

    const items: CollectionItem[] = [];
    widget.dataSource.payload.items.forEach((item, itemIndex) => {
      if (item.dataSources.length === 0) {
        issues.push({
          path: `widgets[${widgetIndex}].items[${itemIndex}]`,
          reason: 'noDataSources',
          widgetTitle: widget.title,
          itemName: item.name,
        });

        if (invalidAiometadataMode === 'empty-items') {
          items.push({ ...item, dataSources: [] });
          emptiedItems += 1;
          return;
        }

        skippedItems += 1;
        return;
      }

      const dataSources = item.dataSources.filter((dataSource, dsIndex) => {
        const reason = getFusionExportSkipReason(dataSource, catalogs);
        if (!reason) {
          return true;
        }

        issues.push({
          path: `widgets[${widgetIndex}].items[${itemIndex}].dataSources[${dsIndex}]`,
          reason,
          widgetTitle: widget.title,
          itemName: item.name,
        });
        skippedDataSources += 1;
        return false;
      });

      if (dataSources.length > 0) {
        items.push({ ...item, dataSources });
        return;
      }

      if (invalidAiometadataMode === 'empty-items') {
        items.push({ ...item, dataSources: [] });
        emptiedItems += 1;
        return;
      }

      skippedItems += 1;
    });

    if (items.length > 0) {
      widgets.push({
        ...widget,
        dataSource: {
          ...widget.dataSource,
          payload: {
            ...widget.dataSource.payload,
            items,
          },
        },
      });
      return;
    }

    skippedWidgets += 1;
  });

  return {
    config: {
      ...config,
      widgets,
    },
    issues,
    skippedDataSources,
    skippedItems,
    skippedWidgets,
    emptiedItems,
  };
}

export function collectUsedAiometadataCatalogKeys(config: FusionWidgetsConfig): string[] {
  const catalogKeys = new Set<string>();

  const addCatalogKey = (dataSource: WidgetDataSource) => {
    if (!isAIOMetadataDataSource(dataSource)) {
      return;
    }

    const catalogId = String(dataSource.payload.catalogId || '').trim();
    if (!catalogId) {
      return;
    }

    const resolvedType = resolveFusionCatalogType(catalogId, dataSource.payload.catalogType);
    const normalizedCatalogId = catalogId.includes('::') ? catalogId : `${resolvedType}::${catalogId}`;
    catalogKeys.add(normalizedCatalogId);
  };

  config.widgets.forEach((widget) => {
    if (widget.type === 'row.classic') {
      addCatalogKey(widget.dataSource);
      return;
    }

    widget.dataSource.payload.items.forEach((item) => {
      item.dataSources.forEach(addCatalogKey);
    });
  });

  return Array.from(catalogKeys);
}

export function convertEditorDataSourceToFusionDataSource(
  dataSource: WidgetDataSource,
  manifestUrl: string | null = null
) {
  if (isNativeTraktDataSource(dataSource)) {
    return {
      kind: 'traktList' as const,
      payload: normalizeTraktFusionDataSourcePayload(dataSource),
    };
  }

  return {
    kind: 'addonCatalog' as const,
    payload: normalizeFusionDataSourcePayload(dataSource, manifestUrl),
  };
}

export function convertEditorItemToFusionCollectionItem(
  item: CollectionItem,
  manifestUrl: string | null = null
) {
  const dataSources = item.dataSources.map((dataSource) =>
    convertEditorDataSourceToFusionDataSource(dataSource, manifestUrl)
  );
  const isAllCatalog = dataSources.some(
    (dataSource) => dataSource.kind === 'addonCatalog' && dataSource.payload.catalogId.startsWith('all::')
  );

  const fusionItem: {
    id: string;
    title: string;
    hideTitle: boolean;
    imageAspect: 'wide' | 'poster' | 'square';
    dataSources: ReturnType<typeof convertEditorDataSourceToFusionDataSource>[];
    imageURL?: string;
  } = {
    id: item.id,
    title: item.name,
    hideTitle: item.hideTitle,
    imageAspect: mapLayoutToImageAspect(item.layout),
    dataSources,
  };

  if (item.backgroundImageURL) {
    fusionItem.imageURL = item.backgroundImageURL;
  }
  if (isAllCatalog && !fusionItem.imageURL) {
    delete fusionItem.imageURL;
  }

  return fusionItem;
}

export function convertEditorWidgetToFusionWidget(widget: Widget, manifestUrl: string | null = null) {
  const prefix = widget.type === 'row.classic' ? 'catalog.' : 'collection.';
  const id =
    widget.type === 'row.classic' && isNativeTraktDataSource(widget.dataSource)
      ? widget.id
      : widget.id.startsWith(prefix)
        ? widget.id
        : `${prefix}${widget.id}`;

  if (widget.type === 'collection.row') {
    return {
      id,
      title: widget.title,
      hideTitle: widget.hideTitle ?? false,
      type: widget.type,
      dataSource: {
        kind: 'collection' as const,
        payload: {
          items: widget.dataSource.payload.items.map((item) =>
            convertEditorItemToFusionCollectionItem(item, manifestUrl)
          ),
        },
      },
    };
  }

  const isMdblistUpNext = 
    isAIOMetadataDataSource(widget.dataSource) && 
    widget.dataSource.payload.catalogId.includes('mdblist.upnext');

  if (isMdblistUpNext) {
    return {
      id,
      title: "MDBList Up Next Series",
      hideTitle: false,
      cacheTTL: 1800,
      limit: 20,
      type: widget.type,
      presentation: {
        aspectRatio: 'poster',
        badges: { providers: false, ratings: true },
        cardStyle: 'medium',
        backgroundImageURL: '',
      },
      dataSource: convertEditorDataSourceToFusionDataSource(widget.dataSource, manifestUrl),
    };
  }

  return {
    id,
    title: widget.title,
    ...(widget.hideTitle ? { hideTitle: true } : {}),
    type: widget.type,
    cacheTTL: widget.cacheTTL || 1800,
    limit: widget.limit || 20,
    presentation: {
      aspectRatio: widget.presentation.aspectRatio || 'poster',
      badges: widget.presentation.badges || { providers: false, ratings: true },
      cardStyle: widget.presentation.cardStyle || 'medium',
      ...(widget.presentation.backgroundImageURL
        ? { backgroundImageURL: widget.presentation.backgroundImageURL }
        : {}),
    },
    dataSource: convertEditorDataSourceToFusionDataSource(widget.dataSource, manifestUrl),
  };
}

export function exportConfigToFusion(
  config: FusionWidgetsConfig,
  manifestUrl: string | null = null,
  options: {
    skipInvalidAiometadataSources?: boolean;
    invalidAiometadataMode?: FusionInvalidCatalogExportMode;
    catalogs?: AIOMetadataCatalog[];
  } = {}
) {
  const exportConfig = options.skipInvalidAiometadataSources
    ? sanitizeFusionConfigForExport(config, options.catalogs, {
        invalidAiometadataMode: options.invalidAiometadataMode ?? 'skip',
      }).config
    : config;

  validateFusionExport(exportConfig, manifestUrl);

  const fusionWidgets = exportConfig.widgets.map((widget) =>
    convertEditorWidgetToFusionWidget(widget, manifestUrl)
  );
  const requiredAddons = new Set<string>();

  fusionWidgets.forEach((widget) => {
    if (widget.type === 'collection.row') {
      widget.dataSource.payload.items.forEach((item) => {
        item.dataSources.forEach((dataSource) => {
          if (dataSource.kind === 'addonCatalog' && dataSource.payload.addonId.startsWith('http')) {
            requiredAddons.add(dataSource.payload.addonId);
          }
        });
      });
      return;
    }

    if (widget.dataSource.kind === 'addonCatalog' && widget.dataSource.payload.addonId.startsWith('http')) {
      requiredAddons.add(widget.dataSource.payload.addonId);
    }
  });

  return {
    exportType: exportConfig.exportType,
    exportVersion: exportConfig.exportVersion || 1,
    requiredAddons: Array.from(requiredAddons),
    widgets: fusionWidgets,
  };
}
