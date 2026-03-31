/* eslint-disable @typescript-eslint/no-explicit-any */
import type { 
  Widget, 
  FusionWidgetsConfig, 
  CollectionRowWidget, 
  RowClassicWidget,
  CollectionItem,
  AddonCatalogDataSource
} from './types/widget';
import { MANIFEST_PLACEHOLDER, resolveFusionCatalogType, getCatalogActualId } from './config-utils';
import { bridgeNativeTraktSourcesForOmni } from './native-trakt-bridge';
import { isNativeTraktDataSource } from './widget-domain';

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
  globalGroupOrder: string[];
  subgroupOrderMap: Record<string, string[]>;
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
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Omni snapshot must be an object.');
  }
  if (!snapshot.values || typeof snapshot.values !== 'object') {
    throw new Error('Omni snapshot is missing a values object.');
  }

  const values = resolveOmniData(snapshot.values) || {};
  
  const mainGroups: NormalizedOmniMainGroup[] = [];
  const mainGroupOrder = values.main_group_order || [];
  const mainCatalogGroups = values.main_catalog_groups || {};

  const orderedGroupIds: string[] = [];
  const seenGroupIds = new Set<string>();

  mainGroupOrder.forEach((groupId: string) => {
    if (!groupId || seenGroupIds.has(groupId)) return;
    seenGroupIds.add(groupId);
    orderedGroupIds.push(groupId);
  });

  Object.keys(mainCatalogGroups).forEach((groupId) => {
    if (!groupId || seenGroupIds.has(groupId)) return;
    seenGroupIds.add(groupId);
    orderedGroupIds.push(groupId);
  });

  orderedGroupIds.forEach((groupId: string) => {
    const group = mainCatalogGroups[groupId];
    if (group) {
      const subgroupNames = Array.isArray(group.subgroupNames)
        ? group.subgroupNames
        : Array.isArray(group.catalog_group_order)
          ? group.catalog_group_order
          : Array.isArray(group.subgroup_order)
            ? group.subgroup_order
            : [];

      mainGroups.push({
        id: groupId,
        name: group.name || 'Untitled Group',
        posterType: group.posterType || group.poster_type || 'poster',
        subgroups: subgroupNames
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
    globalGroupOrder: [
      ...(Array.isArray(values.catalog_group_order) ? values.catalog_group_order : []),
      ...(Array.isArray(values.catalog_groups_order) ? values.catalog_groups_order : []),
      ...(Array.isArray(values.subgroup_order_list) ? values.subgroup_order_list : []),
      ...(Array.isArray(values.subgroup_order) ? values.subgroup_order : [])
    ],
    subgroupOrderMap: values.subgroup_order || {},
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
  // We want type::source.id — always lowercase the type prefix
  if (omniId.includes(':') && !omniId.includes('::')) {
    const colonIndex = omniId.indexOf(':');
    const typePrefix = omniId.slice(0, colonIndex).toLowerCase();
    const rest = omniId.slice(colonIndex + 1);
    return `${typePrefix}::${rest}`;
  }
  return omniId;
}

/**
 * Catalog IDs that do not encode their type in their name and cannot be inferred
 * by keyword heuristics. Maps to their canonical Fusion catalog type.
 */
const KNOWN_CATALOG_TYPES: Record<string, string> = {
  'mdblist.upnext': 'series',
};

/**
 * Extracts the type from a normalized catalog ID.
 * For IDs with a type prefix (movie::, series::) the prefix is authoritative.
 * For IDs without a prefix (stored as bare IDs in some Omni snapshots), keyword
 * heuristics and a known-ID lookup are applied before falling back to 'movie'.
 */
function getCatalogType(normalizedId: string): string {
  let guessedType = 'movie';
  if (normalizedId.startsWith('movie::')) guessedType = 'movie';
  else if (normalizedId.startsWith('series::')) guessedType = 'series';
  else if (normalizedId.startsWith('anime::')) guessedType = 'series'; // Typically anime maps to series in Fusion
  else {
    // No type prefix — try keyword heuristics on the raw ID segment.
    const bare = normalizedId.split('::').pop() || normalizedId;
    const known = KNOWN_CATALOG_TYPES[bare.toLowerCase()];
    if (known) {
      guessedType = known;
    } else {
      const lower = bare.toLowerCase();
      if (/\b(show|shows|series)\b/.test(lower)) guessedType = 'series';
      else if (/\b(movie|movies)\b/.test(lower)) guessedType = 'movie';
    }
  }

  return resolveFusionCatalogType(normalizedId, guessedType);
}

function isInternalOmniCatalogId(omniId: string): boolean {
  const trimmed = String(omniId || '').trim().toLowerCase();
  if (!trimmed) return false;

  const separatorIndex = trimmed.indexOf(':');
  const catalogKey = separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) : trimmed;

  return (
    catalogKey.startsWith('omni.ai.search.') ||
    catalogKey === 'aisearch.top' ||
    /^aisearch\.home\.\d+\.(movie|series|anime)$/.test(catalogKey)
  );
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
    
    const authoritativeOrder = model.subgroupOrderMap[group.id] || [];
    const baseSubgroups = group.subgroups || [];
    
    // 1. Authoritative items (in order) that actually exist in the base list
    const itemsToRender = authoritativeOrder.filter(name => baseSubgroups.includes(name));
    
    // 2. Leftover items (in original relative order) that are in base list but NOT in authoritative order
    const leftovers = baseSubgroups.filter(name => !authoritativeOrder.includes(name));
    
    // Combine them: Ordered first, then leftovers
    const finalSubgroups = [...itemsToRender, ...leftovers];

    finalSubgroups.forEach(subgroupName => {
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
          sourceType: 'aiometadata',
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

    // 1b. Skip internal helper catalogs that Omni keeps in ordering fields.
    if (isInternalOmniCatalogId(omniId)) return;
    
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
    const isUpNext = omniId.includes('mdblist.upnext');
    const title = isUpNext ? 'MDBList Up Next Series' : (customName || normalizedId.split('::').pop() || 'Untitled Row');
    const cacheTTL = isUpNext ? 1800 : 3600;

    const row: RowClassicWidget = {
      id: `catalog.${crypto.randomUUID()}`,
      title,
      type: 'row.classic',
      cacheTTL,
      limit: 20,
      presentation: {
        aspectRatio: 'poster',
        cardStyle: 'medium',
        badges: { providers: false, ratings: true },
        backgroundImageURL: '',
      },
      dataSource: {
        sourceType: 'aiometadata',
        kind: 'addonCatalog',
        payload: {
          addonId: MANIFEST_PLACEHOLDER,
          catalogId: normalizedId,
          catalogType: type,
        },
      },
    };

    widgets.push(row);
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

interface NormalizedOmniCatalog {
  key: string;
  catalogId: string;
  customName: string;
  isLandscape: boolean;
  isSmall: boolean;
  sourceRowTitle: string;
  sourceRowIndex: number;
}

interface NormalizedOmniSubgroupExport {
  name: string;
  imageUrl: string;
  posterType: 'Poster' | 'Landscape' | 'Square';
  posterSize: 'Default' | 'Small';
  linkedCatalogIds: string[];
  catalogs: NormalizedOmniCatalog[];
}

interface NormalizedOmniMainGroupExport {
  id: string;
  name: string;
  imageUrl: string;
  posterType: 'Poster' | 'Landscape' | 'Square';
  posterSize: 'Default' | 'Small';
  subgroups: NormalizedOmniSubgroupExport[];
}

interface NormalizedFusionToOmniModel {
  mainGroups: NormalizedOmniMainGroupExport[];
  standaloneRows: NormalizedOmniCatalog[];
  rowCatalogs: NormalizedOmniCatalog[];
  sourceCounts: {
    collections: number;
    collectionItems: number;
    rows: number;
    syntheticGroups: number;
    syntheticSubgroups: number;
  };
}

export interface OmniExportOptions {
  nativeTraktStrategy?: 'reject' | 'bridge';
  manifestUrl?: string | null;
}

const OMNI_ALLOWED_VALUE_FIELDS = [
  'main_group_order',
  'main_catalog_groups',
  'subgroup_order',
  'catalog_groups',
  'catalog_group_order',
  'selected_catalogs',
  'catalog_ordering',
  'custom_catalog_names',
  'catalog_group_image_urls',
  'landscape_catalogs',
  'small_catalogs',
] as const;

const OMNI_RAW_VALUE_FIELDS = new Set<string>([
  'main_group_order',
  'catalog_group_order',
]);

const OMNI_FORBIDDEN_VALUE_FIELDS = new Set<string>([
  'top_row_catalogs',
  'small_toprow_catalogs',
  'top_row_item_limits',
  'shelf_order',
  'disabled_shelves',
  'starred_catalogs',
  'pinned_catalogs',
  'randomized_catalogs',
  'pattern_image_color_indices',
  'pattern_background_opacities',
  'pattern_border_radius_indices',
  'pattern_border_thickness_indices',
  'pattern_color_indices',
  'pattern_color_hex_values',
  'regex_pattern_image_urls',
  'regex_pattern_custom_names',
  'auto_play_patterns',
  'auto_play_enabled_patterns',
  'pattern_default_filter_enabled_patterns',
  'pattern_tag_enabled_patterns',
  'subtitle_font_size',
  'preferred_subtitle_language',
  'preferred_audio_language',
  'subtitle_color',
  'subtitle_background_color',
  'subtitle_bold',
  'subtitle_italic',
  'always_show_titles',
  'default_metadata_provider',
  'show_metadata_provider',
  'show_metadata_tags',
  'show_only_first_regex_tag',
  'hide_spoilers',
  'oled_mode_enabled',
  'catalog_cache_duration',
  'metadata_cache_duration',
  'image_cache_duration',
  'recommendation_cache_duration',
  'enable_external_player_trakt_scrobbling',
  'hide_external_playback_prompt',
  'bottom_align_logo',
  'stream_button_elements_order',
  'hidden_stream_button_elements',
]);

function isMdblistCatalogId(catalogId: string): boolean {
  return getCatalogActualId(catalogId).startsWith('mdblist.');
}

function toOmniCatalogId(catalogId: string): string {
  return String(catalogId || '').replace(/::/g, ':').trim();
}

function canonicalCatalogKey(catalogId: string): string {
  return toOmniCatalogId(catalogId).toLowerCase();
}

function normalizeMatchText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeServiceAlias(value: string): string {
  let normalized = normalizeMatchText(value);
  // Remove common catalog suffix tokens to compare service/root names.
  normalized = normalized
    .replace(/\b(movies|movie|shows|show|series)\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  // Provider aliases used across Fusion row names vs collection subgroup labels.
  normalized = normalized.replace(/\bamazon prime video\b/g, 'prime video');
  normalized = normalized.replace(/\bamazon prime\b/g, 'prime video');
  normalized = normalized.replace(/\bdisney plus\b/g, 'disney');
  normalized = normalized.replace(/\bhbo\b/g, 'hbo');

  return normalized;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'group';
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function mapLayoutToPosterType(layout?: string): 'Poster' | 'Landscape' | 'Square' {
  const low = String(layout || '').toLowerCase();
  if (low === 'wide' || low === 'landscape') return 'Landscape';
  if (low === 'square') return 'Square';
  return 'Poster';
}

function createStableMainGroupId(name: string, occurrence: number): string {
  const safeName = name.trim() || 'Untitled Collection';
  const slug = slugify(safeName);
  const hash = stableHash(`${safeName.toLowerCase()}::${occurrence}`);
  return `fusion-${slug}-${hash}`;
}

function createUniqueSubgroupName(baseName: string, groupName: string, usedNames: Set<string>): string {
  const safeBaseName = baseName.trim() || 'Untitled Item';
  if (!usedNames.has(safeBaseName)) {
    usedNames.add(safeBaseName);
    return safeBaseName;
  }

  const safeGroupName = groupName.trim();
  if (safeGroupName) {
    const groupScopedCandidate = `${safeBaseName} (${safeGroupName})`;
    if (!usedNames.has(groupScopedCandidate)) {
      usedNames.add(groupScopedCandidate);
      return groupScopedCandidate;
    }

    let groupScopedCounter = 2;
    let groupScopedName = `${safeBaseName} (${safeGroupName} ${groupScopedCounter})`;
    while (usedNames.has(groupScopedName)) {
      groupScopedCounter += 1;
      groupScopedName = `${safeBaseName} (${safeGroupName} ${groupScopedCounter})`;
    }
    usedNames.add(groupScopedName);
    return groupScopedName;
  }

  let counter = 2;
  let candidate = `${safeBaseName} (${counter})`;
  while (usedNames.has(candidate)) {
    counter += 1;
    candidate = `${safeBaseName} (${counter})`;
  }
  usedNames.add(candidate);
  return candidate;
}

function assertOmniCompatibleConfig(config: FusionWidgetsConfig): void {
  config.widgets.forEach((widget, widgetIndex) => {
    if (widget.type === 'row.classic') {
      if (isNativeTraktDataSource(widget.dataSource)) {
        throw new Error(
          `Omni export does not support native Trakt Fusion sources. Remove or convert widget "${widget.title || `#${widgetIndex + 1}`}" before exporting to Omni.`
        );
      }
      return;
    }

    widget.dataSource.payload.items.forEach((item, itemIndex) => {
      if (item.dataSources.some(isNativeTraktDataSource)) {
        throw new Error(
          `Omni export does not support native Trakt Fusion sources. Remove or convert collection item "${item.name || `#${itemIndex + 1}`}" before exporting to Omni.`
        );
      }
    });
  });
}

function normalizeFusionForOmniExport(
  config: FusionWidgetsConfig,
  options: OmniExportOptions = {}
): NormalizedFusionToOmniModel {
  const effectiveConfig =
    options.nativeTraktStrategy === 'bridge'
      ? bridgeNativeTraktSourcesForOmni(config, options.manifestUrl ?? null)
      : config;

  assertOmniCompatibleConfig(effectiveConfig);
  const widgets = Array.isArray(effectiveConfig?.widgets) ? effectiveConfig.widgets : [];

  const rowCatalogs: NormalizedOmniCatalog[] = [];
  const rowByKey = new Map<string, NormalizedOmniCatalog>();
  const rowMembership = new Map<string, { groupIndex: number; subgroupIndex: number }>();
  const mainGroups: NormalizedOmniMainGroupExport[] = [];
  const usedSubgroupNames = new Set<string>();
  const subgroupIndexEntries: Array<{
    groupIndex: number;
    subgroupIndex: number;
    subgroupName: string;
    matchName: string;
    normalizedName: string;
  }> = [];

  let collectionCount = 0;
  let collectionItemCount = 0;
  let rowCount = 0;
  let syntheticGroups = 0;
  let syntheticSubgroups = 0;

  widgets.forEach((widget, widgetIndex) => {
    if (widget.type !== 'row.classic') return;
    rowCount += 1;
    if (widget.dataSource.kind !== 'addonCatalog') {
      throw new Error(`Omni export does not support native Trakt Fusion sources. Remove or convert widget "${widget.title || `#${widgetIndex + 1}`}" before exporting to Omni.`);
    }

    const catalogId = widget.dataSource?.payload?.catalogId;
    if (!catalogId) {
      throw new Error(`Omni Export Validation Error: Row "${widget.title || `#${widgetIndex + 1}`}" has no catalogId.`);
    }

    const omniCatalogId = toOmniCatalogId(catalogId);
    const key = canonicalCatalogKey(omniCatalogId);
    if (rowByKey.has(key)) {
      const existing = rowByKey.get(key)!;
      throw new Error(
        `Omni Export Validation Error: Duplicate Row catalog "${omniCatalogId}" found in rows "${existing.sourceRowTitle}" and "${widget.title || `#${widgetIndex + 1}`}". ` +
        'Row catalogs must be unique for deterministic Omni export.'
      );
    }

    const normalizedRow: NormalizedOmniCatalog = {
      key,
      catalogId: omniCatalogId,
      customName: widget.title || '',
      isLandscape: widget.presentation?.aspectRatio === 'wide',
      isSmall: widget.presentation?.cardStyle === 'small',
      sourceRowTitle: widget.title || `Row ${widgetIndex + 1}`,
      sourceRowIndex: widgetIndex
    };

    rowByKey.set(key, normalizedRow);
    rowCatalogs.push(normalizedRow);
  });

  const nameOccurrences = new Map<string, number>();

  widgets.forEach((widget) => {
    if (widget.type !== 'collection.row') return;
    collectionCount += 1;

    const rawCollectionName = (widget.title || '').trim();
    const collectionName = rawCollectionName || `Untitled Collection ${collectionCount}`;
    const collectionNameKey = collectionName.toLowerCase();
    const occurrence = (nameOccurrences.get(collectionNameKey) || 0) + 1;
    nameOccurrences.set(collectionNameKey, occurrence);

    const group: NormalizedOmniMainGroupExport = {
      id: createStableMainGroupId(collectionName, occurrence),
      name: collectionName,
      imageUrl: '',
      posterType: 'Poster',
      posterSize: 'Default',
      subgroups: []
    };

    const items = widget.dataSource?.payload?.items || [];

    items.forEach((item: any, itemIndex: number) => {
      collectionItemCount += 1;

      const subgroupBaseName = (item.name || item.title || '').trim() || `Untitled Item ${itemIndex + 1}`;
      const subgroupName = createUniqueSubgroupName(subgroupBaseName, collectionName, usedSubgroupNames);
      const subgroup: NormalizedOmniSubgroupExport = {
        name: subgroupName,
        imageUrl: item.backgroundImageURL || item.imageURL || '',
        posterType: mapLayoutToPosterType(item.layout || item.imageAspect),
        posterSize: 'Default',
        linkedCatalogIds: [],
        catalogs: []
      };

      group.subgroups.push(subgroup);
      const subgroupIndex = group.subgroups.length - 1;
      subgroupIndexEntries.push({
        groupIndex: mainGroups.length,
        subgroupIndex,
        subgroupName,
        matchName: subgroupBaseName,
        normalizedName: normalizeMatchText(subgroupBaseName)
      });

      const rawSources = Array.isArray(item.dataSources) && item.dataSources.length > 0
        ? item.dataSources
        : (item.dataSource ? [item.dataSource] : []);

      rawSources.forEach((ds: any) => {
        const sourceCatalogId = ds?.payload?.catalogId;
        if (!sourceCatalogId) return;
        const omniSourceCatalogId = toOmniCatalogId(sourceCatalogId);
        if (!subgroup.linkedCatalogIds.some(id => canonicalCatalogKey(id) === canonicalCatalogKey(omniSourceCatalogId))) {
          subgroup.linkedCatalogIds.push(omniSourceCatalogId);
        }

        const key = canonicalCatalogKey(omniSourceCatalogId);
        const row = rowByKey.get(key);
        if (!row) {
          return;
        }

        const existingMembership = rowMembership.get(key);
        if (existingMembership && (existingMembership.groupIndex !== mainGroups.length || existingMembership.subgroupIndex !== subgroupIndex)) {
          const existingGroup = mainGroups[existingMembership.groupIndex];
          const existingSubgroup = existingGroup?.subgroups[existingMembership.subgroupIndex];
          throw new Error(
            `Omni Export Validation Error: Row catalog "${row.catalogId}" is mapped to multiple Collection items ("${existingSubgroup?.name || 'Unknown'}" and "${subgroupName}").`
          );
        }

        rowMembership.set(key, { groupIndex: mainGroups.length, subgroupIndex });
      });
    });

    const firstSubgroup = group.subgroups[0];
    if (firstSubgroup) {
      group.posterType = firstSubgroup.posterType;
      group.posterSize = firstSubgroup.posterSize;
    }

    if (group.subgroups.some(sg => sg.posterSize === 'Small')) {
      group.posterSize = 'Small';
    }

    mainGroups.push(group);
  });

  // Pass 2: deterministic title-based assignment for rows not directly mapped by catalog ID.
  const scoreRowToSubgroup = (rowTitle: string, subgroupName: string): number => {
    const rowNorm = normalizeMatchText(rowTitle);
    const subgroupNorm = normalizeMatchText(subgroupName);
    if (!rowNorm || !subgroupNorm) return 0;
    const rowAlias = normalizeServiceAlias(rowTitle);
    const subgroupAlias = normalizeServiceAlias(subgroupName);

    if (rowNorm === subgroupNorm) {
      return 1000 + subgroupNorm.length;
    }
    if (rowNorm.startsWith(`${subgroupNorm} `)) {
      return 900 + subgroupNorm.length;
    }
    if (rowNorm.endsWith(` ${subgroupNorm}`)) {
      return 850 + subgroupNorm.length;
    }
    if (rowNorm.includes(` ${subgroupNorm} `)) {
      return 800 + subgroupNorm.length;
    }

    if (rowAlias && subgroupAlias) {
      if (rowAlias === subgroupAlias) {
        return 700 + subgroupAlias.length;
      }
      if (rowAlias.startsWith(`${subgroupAlias} `)) {
        return 650 + subgroupAlias.length;
      }
      if (rowAlias.endsWith(` ${subgroupAlias}`)) {
        return 625 + subgroupAlias.length;
      }
      if (rowAlias.includes(` ${subgroupAlias} `)) {
        return 600 + subgroupAlias.length;
      }
    }

    return 0;
  };

  rowCatalogs.forEach((row) => {
    if (rowMembership.has(row.key)) return;

    let bestScore = 0;
    let bestCandidates: Array<{ groupIndex: number; subgroupIndex: number }> = [];

    subgroupIndexEntries.forEach((entry) => {
      if (!entry.normalizedName) return;
      const score = scoreRowToSubgroup(row.customName || row.sourceRowTitle, entry.matchName);
      if (score <= 0) return;

      if (score > bestScore) {
        bestScore = score;
        bestCandidates = [{ groupIndex: entry.groupIndex, subgroupIndex: entry.subgroupIndex }];
        return;
      }
      if (score === bestScore) {
        bestCandidates.push({ groupIndex: entry.groupIndex, subgroupIndex: entry.subgroupIndex });
      }
    });

    if (bestScore > 0 && bestCandidates.length === 1) {
      rowMembership.set(row.key, bestCandidates[0]);
    }
  });

  const standaloneRows: NormalizedOmniCatalog[] = [];

  rowCatalogs.forEach((row) => {
    const membership = rowMembership.get(row.key);
    if (!membership) {
      standaloneRows.push(row);
      return;
    }
    const subgroup = mainGroups[membership.groupIndex]?.subgroups[membership.subgroupIndex];
    if (!subgroup) {
      standaloneRows.push(row);
      return;
    }
    subgroup.catalogs.push(row);
    if (row.isSmall) subgroup.posterSize = 'Small';
  });

  if (standaloneRows.length > 0) {
    syntheticGroups += 1;

    const existingGroupNames = new Set(mainGroups.map((group) => group.name));
    let standaloneGroupName = 'Standalone Rows';
    let groupCounter = 2;
    while (existingGroupNames.has(standaloneGroupName)) {
      standaloneGroupName = `Standalone Rows (${groupCounter})`;
      groupCounter += 1;
    }

    const standaloneGroup: NormalizedOmniMainGroupExport = {
      id: createStableMainGroupId(standaloneGroupName, 1),
      name: standaloneGroupName,
      imageUrl: '',
      posterType: 'Poster',
      posterSize: 'Default',
      subgroups: [],
    };

    standaloneRows.forEach((row, index) => {
      syntheticSubgroups += 1;

      const baseName = (row.customName || row.sourceRowTitle || `Standalone Row ${index + 1}`).trim();
      let subgroupName = baseName || `Standalone Row ${index + 1}`;
      let subgroupCounter = 2;

      while (usedSubgroupNames.has(subgroupName)) {
        subgroupName = `${baseName || `Standalone Row ${index + 1}`} (${subgroupCounter})`;
        subgroupCounter += 1;
      }

      usedSubgroupNames.add(subgroupName);
      standaloneGroup.subgroups.push({
        name: subgroupName,
        imageUrl: '',
        posterType: row.isLandscape ? 'Landscape' : 'Poster',
        posterSize: row.isSmall ? 'Small' : 'Default',
        linkedCatalogIds: [],
        catalogs: [row],
      });
    });

    const firstSyntheticSubgroup = standaloneGroup.subgroups[0];
    if (firstSyntheticSubgroup) {
      standaloneGroup.posterType = firstSyntheticSubgroup.posterType;
      standaloneGroup.posterSize = standaloneGroup.subgroups.some((subgroup) => subgroup.posterSize === 'Small')
        ? 'Small'
        : firstSyntheticSubgroup.posterSize;
    }

    mainGroups.push(standaloneGroup);
  }

  return {
    mainGroups,
    standaloneRows,
    rowCatalogs,
    sourceCounts: {
      collections: collectionCount,
      collectionItems: collectionItemCount,
      rows: rowCount,
      syntheticGroups,
      syntheticSubgroups
    }
  };
}

function validateNormalizedModel(model: NormalizedFusionToOmniModel) {
  if (model.sourceCounts.collections + model.sourceCounts.syntheticGroups !== model.mainGroups.length) {
    throw new Error(
      `Omni Export Validation Error: Expected ${model.sourceCounts.collections + model.sourceCounts.syntheticGroups} main groups, got ${model.mainGroups.length}.`
    );
  }

  const subgroupCount = model.mainGroups.reduce((sum, group) => sum + group.subgroups.length, 0);
  if (subgroupCount !== model.sourceCounts.collectionItems + model.sourceCounts.syntheticSubgroups) {
    throw new Error(
      `Omni Export Validation Error: Expected ${model.sourceCounts.collectionItems + model.sourceCounts.syntheticSubgroups} subgroups, got ${subgroupCount}.`
    );
  }

  if (model.sourceCounts.collections + model.sourceCounts.syntheticGroups > 0 && subgroupCount === 0) {
    throw new Error('Omni Export Validation Error: Collections exist but no subgroup hierarchy was generated.');
  }

  const mainGroupIds = new Set<string>();
  const subgroupNames = new Set<string>();
  const rowKeysInHierarchy = new Set<string>();

  model.mainGroups.forEach((group) => {
    if (!group.id || !group.name) {
      throw new Error('Omni Export Validation Error: Main group has missing id or name.');
    }

    if (mainGroupIds.has(group.id)) {
      throw new Error(`Omni Export Validation Error: Duplicate main group ID "${group.id}".`);
    }
    mainGroupIds.add(group.id);

    group.subgroups.forEach((subgroup) => {
      if (!subgroup.name) {
        throw new Error(`Omni Export Validation Error: Collection "${group.name}" has a subgroup with an empty name.`);
      }
      if (subgroupNames.has(subgroup.name)) {
        throw new Error(
          `Omni Export Validation Error: Duplicate subgroup name "${subgroup.name}". Omni catalog_groups keys must be unique.`
        );
      }
      subgroupNames.add(subgroup.name);

      subgroup.catalogs.forEach((catalog) => {
        if (rowKeysInHierarchy.has(catalog.key)) {
          throw new Error(`Omni Export Validation Error: Catalog "${catalog.catalogId}" assigned more than once in hierarchy.`);
        }
        rowKeysInHierarchy.add(catalog.key);
      });
    });
  });

  if (rowKeysInHierarchy.size !== model.rowCatalogs.length) {
    throw new Error(
      `Omni Export Validation Error: Hierarchy contains ${rowKeysInHierarchy.size} catalogs, but ${model.rowCatalogs.length} rows were exported.`
    );
  }
}

function hasNullish(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) {
    return value.some(v => hasNullish(v));
  }
  if (typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => k === 'undefined' || hasNullish(v));
  }
  return false;
}

function validateOmniExportFieldSet(values: Record<string, any>, includedKeys: string[]) {
  const valueKeys = Object.keys(values);
  const extraKeys = valueKeys.filter((key) => !OMNI_ALLOWED_VALUE_FIELDS.includes(key as typeof OMNI_ALLOWED_VALUE_FIELDS[number]));
  const missingIncludedKeys = valueKeys.filter((key) => !includedKeys.includes(key));
  const staleIncludedKeys = includedKeys.filter((key) => !(key in values));
  const forbiddenKeys = valueKeys.filter((key) => OMNI_FORBIDDEN_VALUE_FIELDS.has(key));

  if (extraKeys.length > 0) {
    throw new Error(`Omni Export Error: Export attempted to include non-allowlisted field(s): ${extraKeys.join(', ')}.`);
  }

  if (forbiddenKeys.length > 0) {
    throw new Error(`Omni Export Error: Export attempted to include forbidden template-only field(s): ${forbiddenKeys.join(', ')}.`);
  }

  if (missingIncludedKeys.length > 0 || staleIncludedKeys.length > 0) {
    throw new Error(
      `Omni Export Error: includedKeys must exactly match emitted values. Missing: ${missingIncludedKeys.join(', ') || 'none'}. Extra: ${staleIncludedKeys.join(', ') || 'none'}.`
    );
  }
}

function serializeModelToOmniSnapshot(model: NormalizedFusionToOmniModel): any {
  const main_group_order: string[] = [];
  const main_catalog_groups: Record<string, any> = {};
  const subgroup_order: Record<string, string[]> = {};
  const catalog_groups: Record<string, string[]> = {};
  const catalog_group_order: string[] = [];
  const catalog_group_image_urls: Record<string, string> = {};
  const selected_catalogs: string[] = [];
  const catalog_ordering: string[] = [];
  const custom_catalog_names: Record<string, string> = {};
  const landscape_catalogs: string[] = [];
  const small_catalogs: string[] = [];

  model.mainGroups.forEach((group) => {
    main_group_order.push(group.id);

    const subgroupNames = group.subgroups.map(subgroup => subgroup.name);
    subgroup_order[group.id] = subgroupNames;

    main_catalog_groups[group.id] = {
      name: group.name,
      posterType: group.posterType,
      posterSize: group.posterSize,
      subgroupNames
    };

    const header = `❗️[${group.name}]`;
    catalog_group_order.push(header);
    catalog_groups[header] = [];

    group.subgroups.forEach((subgroup) => {
      catalog_group_order.push(subgroup.name);
      const mergedCatalogIds: string[] = [...subgroup.linkedCatalogIds];
      const seenCatalogKeys = new Set(mergedCatalogIds.map(id => canonicalCatalogKey(id)));
      subgroup.catalogs.forEach((catalog) => {
        if (seenCatalogKeys.has(catalog.key)) return;
        seenCatalogKeys.add(catalog.key);
        mergedCatalogIds.push(catalog.catalogId);
      });
      catalog_groups[subgroup.name] = mergedCatalogIds;
      if (subgroup.imageUrl) {
        catalog_group_image_urls[subgroup.name] = subgroup.imageUrl;
      }
    });
  });

  model.rowCatalogs.forEach((catalog) => {
    selected_catalogs.push(catalog.catalogId);
    catalog_ordering.push(catalog.catalogId);
    custom_catalog_names[catalog.catalogId] = catalog.customName;
    if (catalog.isLandscape) landscape_catalogs.push(catalog.catalogId);
    if (catalog.isSmall) small_catalogs.push(catalog.catalogId);
  });

  const rawValues: Record<string, any> = {
    main_group_order,
    main_catalog_groups,
    subgroup_order,
    catalog_groups,
    catalog_group_order,
    selected_catalogs,
    catalog_ordering,
    custom_catalog_names,
    catalog_group_image_urls,
    landscape_catalogs,
    small_catalogs
  };

  if (hasNullish(rawValues)) {
    throw new Error('Omni Export Error: Export payload contains null/undefined values.');
  }

  const values: Record<string, any> = {};
  OMNI_ALLOWED_VALUE_FIELDS.forEach((key) => {
    const value = rawValues[key];
    if (OMNI_RAW_VALUE_FIELDS.has(key)) {
      values[key] = value;
    } else {
      values[key] = { _data: encodeBase64(value) };
    }
  });

  const includedKeys = [...OMNI_ALLOWED_VALUE_FIELDS];
  validateOmniExportFieldSet(values, includedKeys);

  return {
    name: `Fusion Export ${new Date().toLocaleDateString('en-US')}`,
    date: new Date().toISOString(),
    includedKeys,
    values
  };
}

function validateSerializedOmniSnapshot(snapshot: any, model: NormalizedFusionToOmniModel) {
  const snapshotValues = snapshot.values && typeof snapshot.values === 'object' ? snapshot.values : {};
  const snapshotIncludedKeys = Array.isArray(snapshot.includedKeys) ? snapshot.includedKeys : [];
  validateOmniExportFieldSet(snapshotValues, snapshotIncludedKeys);

  const decodedValues = resolveOmniData(snapshot.values || {}) || {};
  const mgo = Array.isArray(decodedValues.main_group_order) ? decodedValues.main_group_order : [];
  const mcgs = decodedValues.main_catalog_groups || {};
  const sgo = decodedValues.subgroup_order || {};
  const cgs = decodedValues.catalog_groups || {};
  const cgo = Array.isArray(decodedValues.catalog_group_order) ? decodedValues.catalog_group_order : [];
  const selected = Array.isArray(decodedValues.selected_catalogs) ? decodedValues.selected_catalogs : [];
  const ordering = Array.isArray(decodedValues.catalog_ordering) ? decodedValues.catalog_ordering : [];

  if (mgo.length !== model.mainGroups.length) {
    throw new Error('Omni Export Error: main_group_order length does not match normalized model.');
  }

  mgo.forEach((groupId: string) => {
    const group = mcgs[groupId];
    if (!group) {
      throw new Error(`Omni Export Error: Main group "${groupId}" missing from main_catalog_groups.`);
    }
    const subgroupNames = Array.isArray(group.subgroupNames) ? group.subgroupNames : [];
    const subgroupNamesFromOrder = Array.isArray(sgo[groupId]) ? sgo[groupId] : [];
    if (subgroupNames.length !== subgroupNamesFromOrder.length || subgroupNames.some((name: string, idx: number) => name !== subgroupNamesFromOrder[idx])) {
      throw new Error(`Omni Export Error: subgroup_order mismatch for main group "${groupId}".`);
    }
    subgroupNamesFromOrder.forEach((subgroupName: string) => {
      if (!Array.isArray(cgs[subgroupName])) {
        throw new Error(`Omni Export Error: Subgroup "${subgroupName}" missing from catalog_groups.`);
      }
    });

    const header = `❗️[${group.name}]`;
    if (!Array.isArray(cgs[header])) {
      throw new Error(`Omni Export Error: Header "${header}" missing from catalog_groups.`);
    }
  });

  // Ensure every linked collection catalog survives into the serialized subgroup mapping.
  model.mainGroups.forEach((group) => {
    group.subgroups.forEach((subgroup) => {
      const exportedCatalogs = Array.isArray(cgs[subgroup.name]) ? cgs[subgroup.name] : [];
      const exportedKeys = new Set(exportedCatalogs.map((id: string) => canonicalCatalogKey(id)));
      subgroup.linkedCatalogIds.forEach((linkedId) => {
        if (!exportedKeys.has(canonicalCatalogKey(linkedId))) {
          throw new Error(
            `Omni Export Error: Linked catalog "${linkedId}" from "${group.name} > ${subgroup.name}" is missing in catalog_groups.`
          );
        }
      });
    });
  });

  const expectedCatalogGroupOrder = model.mainGroups.flatMap(group => [
    `❗️[${group.name}]`,
    ...group.subgroups.map(subgroup => subgroup.name)
  ]);
  if (cgo.length !== expectedCatalogGroupOrder.length || cgo.some((name: string, idx: number) => name !== expectedCatalogGroupOrder[idx])) {
    throw new Error('Omni Export Error: catalog_group_order does not match normalized subgroup order.');
  }

  const subgroupBelongsToMain = new Set(expectedCatalogGroupOrder);
  Object.keys(cgs).forEach((subgroupName) => {
    if (!subgroupBelongsToMain.has(subgroupName)) {
      throw new Error(`Omni Export Error: Subgroup "${subgroupName}" exists in catalog_groups but is not attached to any main group.`);
    }
  });

  const hierarchyCatalogs = new Set<string>();
  Object.entries(cgs).forEach(([subgroupName, catalogIds]: [string, any]) => {
    if (subgroupName.startsWith('❗️[')) return;
    if (!Array.isArray(catalogIds)) return;
    catalogIds.forEach((catalogId: string) => hierarchyCatalogs.add(canonicalCatalogKey(catalogId)));
  });

  selected.forEach((catalogId: string) => {
    if (!hierarchyCatalogs.has(canonicalCatalogKey(catalogId))) {
      throw new Error(`Omni Export Error: Catalog "${catalogId}" from selected_catalogs is outside hierarchy.`);
    }
  });

  const expectedSelected = model.rowCatalogs.map(catalog => catalog.catalogId);
  if (selected.length !== expectedSelected.length || selected.some((catalogId: string, idx: number) => catalogId !== expectedSelected[idx])) {
    throw new Error('Omni Export Error: selected_catalogs does not match row catalog order.');
  }

  if (ordering.length !== expectedSelected.length || ordering.some((catalogId: string, idx: number) => catalogId !== expectedSelected[idx])) {
    throw new Error('Omni Export Error: catalog_ordering does not match row catalog order.');
  }
}

export function convertFusionToOmni(config: FusionWidgetsConfig, options: OmniExportOptions = {}): any {
  const normalizedModel = normalizeFusionForOmniExport(config, options);
  validateNormalizedModel(normalizedModel);
  const snapshot = serializeModelToOmniSnapshot(normalizedModel);
  validateSerializedOmniSnapshot(snapshot, normalizedModel);
  return snapshot;
}

export function validateOmniExport(config: FusionWidgetsConfig, options: OmniExportOptions = {}): void {
  validateNormalizedModel(normalizeFusionForOmniExport(config, options));
}
