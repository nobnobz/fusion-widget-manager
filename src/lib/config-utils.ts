import { Widget, FusionWidgetsConfig, AddonCatalogDataSource } from './types/widget';
import { AIOMetadataCatalog } from './types/widget';

export const MANIFEST_PLACEHOLDER = 'YOUR_AIOMETADATA';

export function findCatalog(catalogs: AIOMetadataCatalog[], id: string): AIOMetadataCatalog | undefined {
  if (!id || !catalogs.length) return undefined;
  
  // 1. Try exact match on ID or type::id
  const exact = catalogs.find(c => c.id === id || `${c.type}::${c.id}` === id);
  if (exact) return exact;
  
  // 2. Try matching the last part of the ID (robust against all:: prefixes)
  const idParts = id.split('::');
  const actualId = idParts[idParts.length - 1];
  
  return catalogs.find(c => {
    const cIdParts = c.id.split('::');
    const cActualId = cIdParts[cIdParts.length - 1];
    return cActualId === actualId;
  });
}

/**
 * Universal rule for Fusion catalog types:
 * If catalogId starts with all:: -> always series
 * Otherwise use provided type or default to movie
 */
export function resolveFusionCatalogType(catalogId: string, currentType?: string): string {
  if (catalogId?.startsWith("all::")) {
    return "series";
  }
  return currentType || "movie";
}

export function processWidgetWithManifest(
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  widget: any, 
  manifestUrl: string | null = null, 
  replace: boolean = false,
  catalogs: AIOMetadataCatalog[] = [],
  sanitize: boolean = false
): Widget {
  // Defensive check: ensure widget is an object
  if (!widget || typeof widget !== 'object') {
    return {
      id: crypto.randomUUID(),
      title: 'Invalid Widget',
      type: 'collection.row',
      dataSource: { kind: 'collection', payload: { items: [] } }
    } as Widget;
  }

  const isAIOMetadata = (addonId: string) => (addonId || '').toUpperCase().includes('AIOMETADATA');
  
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const processDataSource = (ds: any): AddonCatalogDataSource => {
    const defaultDS: AddonCatalogDataSource = {
      kind: 'addonCatalog',
      payload: {
        addonId: MANIFEST_PLACEHOLDER,
        catalogId: '',
        catalogType: 'movie'
      }
    };

    if (!ds || ds.kind !== 'addonCatalog') return defaultDS;

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const payload: any = ds.payload || {};
    const addonId = payload.addonId || '';
    const isAIO = isAIOMetadata(addonId);
    let catalogId = payload.catalogId || '';
    let catalogType = payload.catalogType || payload.type || 'movie';

    // Resolve catalog ID and type if manifest is provided
    if (isAIO && catalogs.length > 0 && catalogId) {
      const found = findCatalog(catalogs, catalogId);
      if (found) {
        // Normalize to manifest's type::id
        catalogId = `${found.type}::${found.id}`;
        if (sanitize) {
          catalogType = found.displayType || found.type;
        }
      }
    }
    
    // Final type resolution based on global all:: rule
    const finalType = resolveFusionCatalogType(catalogId, catalogType);
    
    return {
      kind: 'addonCatalog',
      payload: {
        addonId: isAIO && replace && manifestUrl ? manifestUrl : (addonId || MANIFEST_PLACEHOLDER),
        catalogId: catalogId,
        catalogType: finalType
      }
    };
  };

  // Base properties with defaults
  const base = {
    id: widget.id || crypto.randomUUID(),
    title: widget.title || 'Untitled Widget',
    hideTitle: !!widget.hideTitle,
    type: widget.type === 'row.classic' ? 'row.classic' : 'collection.row'
  };

  if (base.type === 'collection.row') {
    const rawDS = widget.dataSource || {};
    const rawPayload = rawDS.payload || {};
    const rawItems = Array.isArray(rawPayload.items) ? rawPayload.items : [];

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const newItems = rawItems.map((item: any) => {
      const rawDataSources = Array.isArray(item.dataSources) 
        ? item.dataSources 
        : (item.dataSource ? [item.dataSource] : []);
      
      const newDataSources = rawDataSources.length > 0 
        ? rawDataSources.map(processDataSource)
        : [processDataSource(null)];
      
      // Handle legacy layout/imageAspect
      let layout = item.layout || item.imageAspect || 'Wide';
      const lowLayout = String(layout).toLowerCase();
      if (lowLayout === 'wide') layout = 'Wide';
      else if (lowLayout === 'poster') layout = 'Poster';
      else if (lowLayout === 'square') layout = 'Square';
      else layout = 'Wide'; // Safety default

      return {
        id: item.id || crypto.randomUUID(),
        name: item.name || item.title || 'Untitled Item',
        hideTitle: !!item.hideTitle,
        layout: layout as 'Wide' | 'Poster' | 'Square',
        backgroundImageURL: item.backgroundImageURL || item.imageURL || '',
        dataSources: newDataSources,
        dataSource: newDataSources[0]
      };
    });

    return {
      ...base,
      dataSource: {
        kind: 'collection',
        payload: {
          items: newItems
        }
      }
    } as Widget;
  }

  if (base.type === 'row.classic') {
    const presentation = widget.presentation || {};
    const badges = presentation.badges || {};
    
    return {
      ...base,
      cacheTTL: typeof widget.cacheTTL === 'number' ? widget.cacheTTL : 3600,
      limit: typeof widget.limit === 'number' ? widget.limit : 20,
      presentation: {
        aspectRatio: presentation.aspectRatio || 'poster',
        cardStyle: presentation.cardStyle || 'medium',
        badges: {
          providers: typeof badges.providers === 'boolean' ? badges.providers : true,
          ratings: typeof badges.ratings === 'boolean' ? badges.ratings : true,
        },
        backgroundImageURL: presentation.backgroundImageURL || ''
      },
      dataSource: processDataSource(widget.dataSource)
    } as Widget;
  }

  return base as Widget;
}

export function processConfigWithManifest(
  config: FusionWidgetsConfig, 
  manifestUrl: string, 
  applyReplacement: boolean,
  catalogs: AIOMetadataCatalog[] = [],
  sanitize: boolean = false
): FusionWidgetsConfig {
  return {
    ...config,
    exportVersion: config.exportVersion || 1,
    widgets: (config.widgets || []).map(w => 
      processWidgetWithManifest(w, manifestUrl, applyReplacement, catalogs, sanitize)
    )
  };
}

/**
 * STRICT FUSION EXPORT TRANSFORMATION LAYER
 * These functions ensure the exported JSON matches the strict Fusion schema,
 * mapping internal editor fields to their correct export counterparts.
 */

export function mapLayoutToImageAspect(layout: string): 'wide' | 'poster' | 'square' {
  const lowLayout = String(layout).toLowerCase();
  if (lowLayout === 'wide') return 'wide';
  if (lowLayout === 'poster') return 'poster';
  if (lowLayout === 'square') return 'square';
  return 'poster'; // Default fallback
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function convertEditorDataSourceToFusionDataSource(ds: any, manifestUrl: string | null = null): any {
  if (!ds || ds.kind !== 'addonCatalog') return ds;

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const payload: any = { ...ds.payload };
  
  // Strict AddonId Resolution: Always replace placeholder if a real URL is available
  if (payload.addonId === MANIFEST_PLACEHOLDER && manifestUrl) {
    payload.addonId = manifestUrl;
  }
  
  // Validation: BLOCK export if placeholder still exists
  if (payload.addonId === MANIFEST_PLACEHOLDER) {
    throw new Error(`Export failed: A data source still uses the placeholder '${MANIFEST_PLACEHOLDER}'. Please sync a manifest first.`);
  }
  
  // Resolve type via global rule
  const type = resolveFusionCatalogType(payload.catalogId, payload.catalogType || payload.type);
  
  payload.type = type;
  delete payload.catalogType; // Remove internal key

  // Normalize catalogId: if it does NOT include '::', add the type prefix
  // NOTE: all:: catalogs are kept as-is (no rewriting to movie:: or series::)
  if (payload.catalogId && !payload.catalogId.includes('::')) {
    payload.catalogId = `${type}::${payload.catalogId}`;
  }

  return {
    kind: ds.kind,
    payload: payload
  };
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function convertEditorItemToFusionCollectionItem(item: any, manifestUrl: string | null = null): any {
  const dataSources = (item.dataSources || []).map((ds: any) => convertEditorDataSourceToFusionDataSource(ds, manifestUrl));
  
  // HEURISTIC: Check if this is an "all::" catalog item to align with Fusion structure
  const isAllCatalog = dataSources.some((ds: any) => 
    ds.kind === 'addonCatalog' && ds.payload?.catalogId?.startsWith('all::')
  );

  const fusionItem: any = {
    id: item.id,
    title: item.name || item.title || '',
    hideTitle: !!item.hideTitle,
    imageAspect: mapLayoutToImageAspect(item.layout || item.imageAspect || 'Wide'),
    dataSources: dataSources
  };

  // Omit imageURL if empty or if it's an all:: catalog (Fusion natively uses poster art for watchlist)
  if (item.backgroundImageURL || item.imageURL) {
    // Only keep if NOT an all:: catalog, or if explicitly provided and we want to override
    // For now, let's keep it if provided, but default to 'poster' aspect
    fusionItem.imageURL = item.backgroundImageURL || item.imageURL || '';
  }

  // Final structural alignment: if it's an all:: item and imageURL is empty/placeholder, OMIT IT
  if (isAllCatalog && !fusionItem.imageURL) {
    delete fusionItem.imageURL;
  }

  // Ensure singular dataSource is removed if it leaked into the internal model
  delete fusionItem.dataSource; 
  
  return fusionItem;
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function convertEditorWidgetToFusionWidget(widget: any, manifestUrl: string | null = null): any {
  if (!widget) return null;

  // Clone base properties and normalize ID with prefix if needed
  const prefix = widget.type === 'row.classic' ? 'classic.' : 'collection.';
  const id = widget.id && widget.id.startsWith(prefix) ? widget.id : `${prefix}${widget.id}`;

  const fusionWidget: any = {
    id: id,
    title: widget.title,
    hideTitle: !!widget.hideTitle,
    type: widget.type
  };

  if (widget.type === 'collection.row') {
    const rawDS = widget.dataSource || {};
    const rawPayload = rawDS.payload || {};
    const rawItems = Array.isArray(rawPayload.items) ? rawPayload.items : [];

    fusionWidget.dataSource = {
      kind: 'collection',
      payload: {
        items: rawItems.map((item: any) => convertEditorItemToFusionCollectionItem(item, manifestUrl))
      }
    };
  } else if (widget.type === 'row.classic') {
    fusionWidget.cacheTTL = widget.cacheTTL;
    fusionWidget.limit = widget.limit;
    
    const presentation = widget.presentation || {};
    fusionWidget.presentation = {
      aspectRatio: presentation.aspectRatio || 'poster',
      cardStyle: presentation.cardStyle || 'medium',
      badges: presentation.badges,
      imageURL: presentation.backgroundImageURL || presentation.imageURL || ''
    };
    
    fusionWidget.dataSource = convertEditorDataSourceToFusionDataSource(widget.dataSource, manifestUrl);
  }

  return fusionWidget;
}

export function exportConfigToFusion(config: FusionWidgetsConfig, manifestUrl: string | null = null): any {
  return {
    exportType: config.exportType || 'fusionWidgets',
    exportVersion: config.exportVersion || 1,
    widgets: (config.widgets || []).map(w => convertEditorWidgetToFusionWidget(w, manifestUrl))
  };
}
