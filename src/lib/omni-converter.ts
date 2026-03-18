/* eslint-disable @typescript-eslint/no-explicit-any */
import { 
  Widget, 
  FusionWidgetsConfig, 
  CollectionRowWidget, 
  RowClassicWidget,
  CollectionItem,
  AddonCatalogDataSource
} from './types/widget';
import { MANIFEST_PLACEHOLDER, resolveFusionCatalogType } from './config-utils';

export interface NormalizedOmniMainGroup {
  id: string;
  name: string;
  posterType: string;
  subgroups: string[];
}

export interface NormalizedOmniSubgroup {
  name: string;
  catalogs: string[];
}

export interface NormalizedOmniModel {
  mainGroups: NormalizedOmniMainGroup[];
  subgroups: Record<string, NormalizedOmniSubgroup>;
  selectedCatalogs: string[];
  catalogOrdering: string[];
  customNames: Record<string, string>;
  imageUrls: Record<string, string>;
  smallCatalogs: string[];
  landscapeCatalogs: string[];
  hiddenCatalogIds: string[];
}


/**
 * Decodes base64 string safely, handling potential UTF-8 issues.
 */
function decodeBase64(str: string): any {
  try {
    const decoded = atob(str);
    try {
      // Try to parse as UTF-8 first
      const utf8Decoded = decodeURIComponent(
        Array.prototype.map.call(decoded, (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
      );
      return JSON.parse(utf8Decoded);
    } catch {
      // Fallback to literal decode
      return JSON.parse(decoded);
    }
  } catch (err) {
    console.warn('Failed to decode base64 data:', err);
    return null;
  }
}

/**
 * Recursively decodes _data fields in the Omni snapshot.
 */
function resolveOmniData(value: any): any {
  if (value && typeof value === 'object') {
    if ('_data' in value && typeof value._data === 'string') {
      return resolveOmniData(decodeBase64(value._data));
    }
    if (Array.isArray(value)) {
      return value.map(resolveOmniData);
    }
    const resolved: any = {};
    for (const key in value) {
      resolved[key] = resolveOmniData(value[key]);
    }
    return resolved;
  }
  return value;
}

/**
 * Normalizes a raw Omni snapshot into a stable internal model.
 */
export function normalizeOmniSnapshot(snapshot: any): NormalizedOmniModel {
  const values = resolveOmniData(snapshot.values) || {};
  
  const mainGroups: NormalizedOmniMainGroup[] = [];
  const mainGroupOrder = values.main_group_order || [];
  const mainCatalogGroups = values.main_catalog_groups || {};
  
  mainGroupOrder.forEach((groupId: string) => {
    const group = mainCatalogGroups[groupId];
    if (group) {
      mainGroups.push({
        id: groupId,
        name: group.name || 'Untitled Group',
        posterType: group.posterType || group.poster_type || 'poster',
        subgroups: group.subgroupNames || group.subgroup_order || group.catalog_group_order || []
      });
    }

  });

  // Collect all catalog IDs used in groups to distinguish visible vs structural
  const visibleInHierarchy = new Set<string>();
  Object.values(values.catalog_groups || {}).forEach((subgroup: any) => {
    const ids = Array.isArray(subgroup) ? subgroup : (subgroup as any)?.catalogs || [];
    ids.forEach((id: string) => visibleInHierarchy.add(id));
  });

  // Collect structural catalogs that should be hidden from main list
  const hiddenCatalogIds = [
    ...(values.top_row_catalogs || []),
    ...(values.small_toprow_catalogs || []),
    ...(values.disabled_shelves || [])
  ];

  return {
    mainGroups,
    subgroups: values.catalog_groups || {},
    selectedCatalogs: values.selected_catalogs || [],
    catalogOrdering: values.catalog_ordering || [],
    customNames: values.custom_catalog_names || {},
    imageUrls: values.catalog_group_image_urls || {},
    smallCatalogs: values.small_catalogs || [],
    landscapeCatalogs: values.landscape_catalogs || [],
    hiddenCatalogIds: hiddenCatalogIds.filter(id => !visibleInHierarchy.has(id))
  };
}



/**
 * Normalizes Omni catalog IDs (type:source.id) to Fusion format (type::source.id).
 */
function normalizeCatalogId(omniId: string): string {
  if (!omniId) return omniId;
  // Omni uses type:source.id or just source.id
  // We want type::source.id
  if (omniId.includes(':') && !omniId.includes('::')) {
    return omniId.replace(':', '::');
  }
  return omniId;
}

/**
 * Extracts the type from a normalized catalog ID.
 */
function getCatalogType(normalizedId: string): string {
  let guessedType = 'movie';
  if (normalizedId.startsWith('movie::')) guessedType = 'movie';
  else if (normalizedId.startsWith('series::')) guessedType = 'series';
  else if (normalizedId.startsWith('anime::')) guessedType = 'series'; // Typically anime maps to series in Fusion
  
  return resolveFusionCatalogType(normalizedId, guessedType);
}

/**
 * Converts a normalized Omni model to Fusion Widgets configuration.
 */
export function convertOmniToFusion(snapshot: any): FusionWidgetsConfig {
  const model = normalizeOmniSnapshot(snapshot);
  const widgets: Widget[] = [];

  // 1. Build Grouped Widgets (collection.row)
  model.mainGroups.forEach(group => {
    // Skip placeholder labels like ❗️[Discover]
    if (group.name.includes('❗️')) return;

    const items: CollectionItem[] = [];
    
    group.subgroups.forEach(subgroupName => {
      // Skip structural placeholders
      if (subgroupName.includes('❗️')) return;
      
      const subgroupData = model.subgroups[subgroupName];
      // subgroupData can be an array of catalog strings or an object with catalogs array
      const catalogIds: string[] = Array.isArray(subgroupData) 
        ? subgroupData 
        : (subgroupData as any)?.catalogs || [];

      if (catalogIds.length === 0) return;

      const dataSources: AddonCatalogDataSource[] = catalogIds.map(id => {
        const normalizedId = normalizeCatalogId(id);
        return {
          kind: 'addonCatalog',
          payload: {
            addonId: MANIFEST_PLACEHOLDER,
            catalogId: normalizedId,
            catalogType: getCatalogType(normalizedId)
          }
        };
      });

      // Map Omni poster type to Fusion layout (case-sensitive reference format)
      let layout: 'Wide' | 'Poster' | 'Square' = 'Poster';
      const lowPosterType = group.posterType.toLowerCase();
      
      if (lowPosterType.includes('landscape')) {
        layout = 'Wide';
      } else if (lowPosterType.includes('square')) {
        layout = 'Square';
      }


      const newItem: CollectionItem = {
        id: crypto.randomUUID(),
        name: subgroupName,
        hideTitle: false,
        layout,
        backgroundImageURL: model.imageUrls[subgroupName] || '',
        dataSources,
        dataSource: dataSources[0]
      };
      items.push(newItem);
    });

    if (items.length > 0) {
      widgets.push({
        id: crypto.randomUUID(),
        title: group.name,
        type: 'collection.row',
        dataSource: {
          kind: 'collection',
          payload: { items }
        }
      } as CollectionRowWidget);
    }
  });

  // 2. Build Standalone Widgets (row.classic)
  const standaloneCatalogs = model.catalogOrdering.length > 0 ? model.catalogOrdering : model.selectedCatalogs;
  
  standaloneCatalogs.forEach(omniId => {
    // 1. Filter out structural catalogs (top row items not in groups)
    if (model.hiddenCatalogIds.includes(omniId)) return;
    
    // 2. Heuristic: filter out catalogs with clear structural names
    const customName = model.customNames[omniId] || '';
    const lowName = customName.toLowerCase();
    const isStructuralName = 
      lowName.includes('header') || 
      (lowName.includes('top') && lowName.includes('week'));
      
    if (isStructuralName) return;


    const normalizedId = normalizeCatalogId(omniId);
    const type = getCatalogType(normalizedId);
    
    // Determine aspect ratio from small/landscape catalogs or name heuristics
    const isLandscape = model.landscapeCatalogs.includes(omniId) || lowName.includes('landscape');
    const isSquare = lowName.includes('square');
    const isSmall = model.smallCatalogs.includes(omniId) || lowName.includes('mini') || lowName.includes('small');

    widgets.push({
      id: crypto.randomUUID(),
      title: customName || normalizedId.split('::').pop() || 'Untitled Row',
      type: 'row.classic',
      cacheTTL: 3600,
      limit: 20,
      presentation: {
        aspectRatio: isSquare ? 'square' : (isLandscape ? 'wide' : 'poster'),
        cardStyle: isSmall ? 'small' : 'medium',
        badges: {
          providers: true,
          ratings: true
        }
      },


      dataSource: {
        kind: 'addonCatalog',
        payload: {
          addonId: MANIFEST_PLACEHOLDER,
          catalogId: normalizedId,
          catalogType: type
        }
      }
    } as RowClassicWidget);
  });


  return {
    exportType: 'fusionWidgets',
    exportVersion: 1,
    widgets
  };
}

/**

 * Encodes a string to Base64 safely.
 */
function encodeBase64(data: any): string {
  try {
    const jsonString = JSON.stringify(data);
    // Use btoa with UTF-8 support
    const utf8Encoded = encodeURIComponent(jsonString).replace(/%([0-9A-F]{2})/g, (_, p1) => 
      String.fromCharCode(parseInt(p1, 16))
    );
    return btoa(utf8Encoded);
  } catch (err) {
    console.error('Failed to encode base64 data:', err);
    return '';
  }
}

/**
 * Converts Fusion Widgets configuration back to Omni JSON format.
 */
export function convertFusionToOmni(config: FusionWidgetsConfig): any {
  const main_catalog_groups: Record<string, any> = {};
  const main_group_order: string[] = [];
  const catalog_groups: Record<string, string[]> = {};
  const subgroup_order: Record<string, string[]> = {};
  const catalog_group_image_urls: Record<string, string> = {};
  const selected_catalogs: string[] = [];
  const catalog_ordering: string[] = [];
  const custom_catalog_names: Record<string, string> = {};
  const landscape_catalogs: string[] = [];
  const small_catalogs: string[] = [];
  const catalog_group_order: string[] = [];

  const generateGroupId = (index: number, title: string) => {
    // Generate a consistent pseudo-UUID from the index and title
    const hash = Array.from(title).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `FUSION-${index}-${hash.toString(16).toUpperCase()}-WIDGET`;
  };

  config.widgets.forEach((widget, index) => {
    if (widget.type === 'collection.row') {
      const groupId = generateGroupId(index, widget.title);
      main_group_order.push(groupId);
      
      // Add tagged group header
      const headerTitle = `❗️[${widget.title}]`;
      catalog_group_order.push(headerTitle);
      // Omni needs headers to be keys in catalog_groups too (with empty array)
      catalog_groups[headerTitle] = [];
      
      const subgroupNames: string[] = [];
      
      widget.dataSource.payload.items.forEach((item: CollectionItem) => {
        const subgroupName = item.name;
        subgroupNames.push(subgroupName);
        catalog_group_order.push(subgroupName);
        
        const catalogs = item.dataSources.map(ds => {
          const id = ds.payload.catalogId;
          return id.includes('::') ? id.replace('::', ':') : id;
        });
        
        catalog_groups[subgroupName] = catalogs;
        if (item.backgroundImageURL) {
          catalog_group_image_urls[subgroupName] = item.backgroundImageURL;
        }
      });
      
      subgroup_order[groupId] = subgroupNames;

      main_catalog_groups[groupId] = {
        name: widget.title,
        posterType: widget.dataSource.payload.items[0]?.layout === 'Wide' ? 'Landscape' : 'Poster',
        posterSize: 'Default', // Collection items don't have individual card styles in this version
        subgroupNames: subgroupNames
      };
    } else if (widget.type === 'row.classic') {
      const ds = widget.dataSource;
      if (ds.kind === 'addonCatalog') {
        const id = ds.payload.catalogId;
        const omniId = id.includes('::') ? id.replace('::', ':') : id;
        
        selected_catalogs.push(omniId);
        catalog_ordering.push(omniId);
        custom_catalog_names[omniId] = widget.title;
        
        if (widget.presentation?.aspectRatio === 'wide') {
          landscape_catalogs.push(omniId);
        }
        if (widget.presentation?.cardStyle === 'small') {
          small_catalogs.push(omniId);
        }
      }
    }
  });

  const rawValues: Record<string, any> = {
    main_group_order,
    main_catalog_groups,
    catalog_groups,
    subgroup_order,
    selected_catalogs,
    catalog_ordering,
    custom_catalog_names,
    catalog_group_image_urls,
    landscape_catalogs,
    small_catalogs,
    catalog_group_order
  };

  const values: Record<string, any> = {};
  const includedKeys: string[] = [];

  for (const [key, value] of Object.entries(rawValues)) {
    includedKeys.push(key);
    if (typeof value === 'object' && value !== null) {
      values[key] = { _data: encodeBase64(value) };
    } else {
      values[key] = value;
    }
  }

  return {
    name: `Fusion Export ${new Date().toLocaleDateString('en-US')}`,
    includedKeys,
    values
  };
}
