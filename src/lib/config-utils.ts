import type {
  AddonCatalogDataSource,
  AIOMetadataCatalog,
  CollectionItem,
  FusionWidgetsConfig,
  Widget,
} from './types/widget';
import {
  MANIFEST_PLACEHOLDER,
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
      `Export failed: A data source still uses the placeholder '${MANIFEST_PLACEHOLDER}'. Please sync a manifest first.`
    );
  }
  if (!payload.catalogId) {
    throw new Error('Export failed: A data source still has an empty catalog ID. Please select a catalog first.');
  }

  const type = resolveFusionCatalogType(payload.catalogId, payload.catalogType);
  return {
    addonId: payload.addonId,
    catalogId: payload.catalogId.includes('::') ? payload.catalogId : `${type}::${payload.catalogId}`,
    type,
  };
}

export function convertEditorDataSourceToFusionDataSource(
  dataSource: AddonCatalogDataSource,
  manifestUrl: string | null = null
) {
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
  const isAllCatalog = dataSources.some((dataSource) =>
    dataSource.payload.catalogId.startsWith('all::')
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
  const id = widget.id.startsWith(prefix) ? widget.id : `${prefix}${widget.id}`;

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

  return {
    id,
    title: widget.title,
    type: widget.type,
    cacheTTL: widget.cacheTTL || 1800,
    presentation: {
      aspectRatio: widget.presentation.aspectRatio || 'poster',
      badges: widget.presentation.badges || { providers: false, ratings: true },
      cardStyle: widget.presentation.cardStyle || 'medium',
    },
    dataSource: convertEditorDataSourceToFusionDataSource(widget.dataSource, manifestUrl),
  };
}

export function exportConfigToFusion(config: FusionWidgetsConfig, manifestUrl: string | null = null) {
  validateFusionExport(config, manifestUrl);

  const fusionWidgets = config.widgets.map((widget) =>
    convertEditorWidgetToFusionWidget(widget, manifestUrl)
  );
  const requiredAddons = new Set<string>();

  fusionWidgets.forEach((widget) => {
    if (widget.type === 'collection.row') {
      widget.dataSource.payload.items.forEach((item) => {
        item.dataSources.forEach((dataSource) => {
          if (dataSource.payload.addonId.startsWith('http')) {
            requiredAddons.add(dataSource.payload.addonId);
          }
        });
      });
      return;
    }

    if (widget.dataSource.payload.addonId.startsWith('http')) {
      requiredAddons.add(widget.dataSource.payload.addonId);
    }
  });

  return {
    exportType: config.exportType,
    exportVersion: config.exportVersion || 1,
    requiredAddons: Array.from(requiredAddons),
    widgets: fusionWidgets,
  };
}
