import {
  applyExportNameNumbering,
  normalizeNamePrefix,
  stripCatalogTypeDecoration,
  stripWidgetPrefix,
} from './aiometadata-catalog-labels';
import type {
  AiometadataCatalogsOnlyEntry,
} from './types/widget';
import type {
  AIOMetadataCatalogExportOverride,
  AIOMetadataExportOverrideState,
  AIOMetadataLetterboxdExportOverride,
  AIOMetadataMDBListExportOverride,
  AIOMetadataSourceScopedOverrideMap,
  AIOMetadataMDBListSort,
  AIOMetadataStreamingExportOverride,
  AIOMetadataStreamingSort,
  AIOMetadataTraktExportOverride,
  AIOMetadataTraktSort,
  AIOMetadataTemplateTargetRule,
} from './aiometadata-export-settings';
import {
  DEFAULT_AIOMETADATA_EXPORT_TEMPLATE,
} from './aiometadata-export-settings';
import type {
  ExportableCatalogInventory,
  ExportableCatalogOccurrence,
  ExportableCatalogSource,
} from './aiometadata-export-inventory';
import { LETTERBOXD_DEFAULT_CACHE_TTL } from './letterboxd-catalog-export';

const MDBLIST_SORT_VALUES = new Set<string>([
  'default', 'rank', 'score', 'usort', 'score_average', 'released', 'releasedigital', 'imdbrating',
  'imdbvotes', 'last_air_date', 'imdbpopular', 'tmdbpopular', 'rogerbert', 'rtomatoes', 'rtaudience',
  'metacritic', 'myanimelist', 'letterrating', 'lettervotes', 'budget', 'revenue', 'runtime', 'title',
  'added', 'random',
]);
const TRAKT_SORT_VALUES = new Set<string>([
  'default', 'rank', 'added', 'title', 'released', 'runtime', 'popularity', 'percentage', 'imdb_rating',
  'tmdb_rating', 'rt_tomatometer', 'rt_audience', 'metascore', 'votes', 'imdb_votes', 'collected',
  'watched', 'my_rating', 'tmdb_votes', 'random',
]);
const STREAMING_SORT_VALUES = new Set<string>([
  'popularity', 'release_date', 'vote_average', 'revenue',
]);

type CanonicalOccurrence = ExportableCatalogOccurrence & {
  sortKey: string;
};

const isValidMDBListSort = (value: unknown): value is AIOMetadataMDBListSort =>
  typeof value === 'string' && MDBLIST_SORT_VALUES.has(value);
const isValidTraktSort = (value: unknown): value is AIOMetadataTraktSort =>
  typeof value === 'string' && TRAKT_SORT_VALUES.has(value);
const isValidStreamingSort = (value: unknown): value is AIOMetadataStreamingSort =>
  typeof value === 'string' && STREAMING_SORT_VALUES.has(value);
const isValidSortDirection = (value: unknown): value is 'asc' | 'desc' =>
  value === 'asc' || value === 'desc';
const isValidCacheTTL = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 300;

function sanitizeMDBListOverride(
  override: AIOMetadataMDBListExportOverride | undefined
): AIOMetadataMDBListExportOverride | undefined {
  if (!override) {
    return undefined;
  }

  const next: AIOMetadataMDBListExportOverride = {};
  if (isValidMDBListSort(override.sort)) {
    next.sort = override.sort;
  }
  if (override.order === 'asc' || override.order === 'desc') {
    next.order = override.order;
  }
  if (isValidCacheTTL(override.cacheTTL)) {
    next.cacheTTL = override.cacheTTL;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function sanitizeTraktOverride(
  override: AIOMetadataTraktExportOverride | undefined
): AIOMetadataTraktExportOverride | undefined {
  if (!override) {
    return undefined;
  }

  const next: AIOMetadataTraktExportOverride = {};
  if (isValidTraktSort(override.sort)) {
    next.sort = override.sort;
  }
  if (isValidSortDirection(override.sortDirection)) {
    next.sortDirection = override.sortDirection;
  }
  if (isValidCacheTTL(override.cacheTTL)) {
    next.cacheTTL = override.cacheTTL;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function sanitizeStreamingOverride(
  override: AIOMetadataStreamingExportOverride | undefined
): AIOMetadataStreamingExportOverride | undefined {
  if (!override) {
    return undefined;
  }

  const next: AIOMetadataStreamingExportOverride = {};
  if (isValidStreamingSort(override.sort)) {
    next.sort = override.sort;
  }
  if (isValidSortDirection(override.sortDirection)) {
    next.sortDirection = override.sortDirection;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function sanitizeLetterboxdOverride(
  override: AIOMetadataLetterboxdExportOverride | undefined
): AIOMetadataLetterboxdExportOverride | undefined {
  if (!override) {
    return undefined;
  }

  const next: AIOMetadataLetterboxdExportOverride = {};
  if (isValidCacheTTL(override.cacheTTL)) {
    next.cacheTTL = override.cacheTTL;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function sanitizeSourceScopedOverrideMap(
  override: AIOMetadataSourceScopedOverrideMap | undefined
): AIOMetadataSourceScopedOverrideMap | undefined {
  if (!override) {
    return undefined;
  }

  const next: AIOMetadataSourceScopedOverrideMap = {};
  const mdblist = sanitizeMDBListOverride(override.mdblist);
  const trakt = sanitizeTraktOverride(override.trakt);
  const streaming = sanitizeStreamingOverride(override.streaming);
  const letterboxd = sanitizeLetterboxdOverride(override.letterboxd);

  if (mdblist) {
    next.mdblist = mdblist;
  }
  if (trakt) {
    next.trakt = trakt;
  }
  if (streaming) {
    next.streaming = streaming;
  }
  if (letterboxd) {
    next.letterboxd = letterboxd;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function sanitizeCatalogOverrideForSource(
  source: ExportableCatalogSource,
  override: AIOMetadataCatalogExportOverride | undefined
): AIOMetadataCatalogExportOverride | undefined {
  if (!override) {
    return undefined;
  }

  if (source === 'mdblist') {
    return sanitizeMDBListOverride(override as AIOMetadataMDBListExportOverride);
  }

  if (source === 'trakt') {
    return sanitizeTraktOverride(override as AIOMetadataTraktExportOverride);
  }

  if (source === 'streaming') {
    return sanitizeStreamingOverride(override as AIOMetadataStreamingExportOverride);
  }

  if (source === 'letterboxd') {
    return sanitizeLetterboxdOverride(override as AIOMetadataLetterboxdExportOverride);
  }

  return undefined;
}

const compareOccurrences = (left: ExportableCatalogOccurrence, right: ExportableCatalogOccurrence) => {
  if (left.widgetIndex !== right.widgetIndex) {
    return left.widgetIndex - right.widgetIndex;
  }

  const leftWidget = left.widgetTitle.localeCompare(right.widgetTitle, undefined, { sensitivity: 'base' });
  if (leftWidget !== 0) {
    return leftWidget;
  }

  const leftItem = String(left.itemName || '').localeCompare(String(right.itemName || ''), undefined, { sensitivity: 'base' });
  if (leftItem !== 0) {
    return leftItem;
  }

  const leftName = left.entry.name.localeCompare(right.entry.name, undefined, { sensitivity: 'base' });
  if (leftName !== 0) {
    return leftName;
  }

  return left.catalogKey.localeCompare(right.catalogKey, undefined, { sensitivity: 'base' });
};

const getOccurrenceSortKey = (occurrence: ExportableCatalogOccurrence) => [
  occurrence.widgetIndex.toString().padStart(4, '0'),
  occurrence.widgetTitle.toLowerCase(),
  String(occurrence.itemName || '').toLowerCase(),
  occurrence.entry.name.toLowerCase(),
].join(':');

export function getCanonicalOccurrencesByCatalogKey(
  inventory: ExportableCatalogInventory
): Map<string, CanonicalOccurrence> {
  const canonicalOccurrences = new Map<string, CanonicalOccurrence>();

  [...inventory.occurrences]
    .sort(compareOccurrences)
    .forEach((occurrence) => {
      if (!canonicalOccurrences.has(occurrence.catalogKey)) {
        canonicalOccurrences.set(occurrence.catalogKey, {
          ...occurrence,
          sortKey: getOccurrenceSortKey(occurrence),
        });
      }
    });

  return canonicalOccurrences;
}

const getSourceScopedOverride = <
  TOverride extends Record<string, unknown>,
>(
  scopeOverride: Record<string, unknown> | undefined,
  source: ExportableCatalogSource
) => scopeOverride?.[source] as TOverride | undefined;

function getMatchCandidates(occurrence: ExportableCatalogOccurrence): string[] {
  const widgetLabel = occurrence.widgetType === 'row.classic'
    ? 'Classic Row'
    : occurrence.widgetTitle.trim();
  const exportNameWithoutWidget = stripWidgetPrefix(occurrence.entry.name, widgetLabel);
  const typeStrippedName = stripCatalogTypeDecoration(exportNameWithoutWidget);

  return Array.from(new Set([
    occurrence.entry.name,
    occurrence.rawName,
    occurrence.itemName,
    exportNameWithoutWidget,
    typeStrippedName,
    normalizeNamePrefix(occurrence.entry.name),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));
}

function getTemplateRuleSpecificity(rule: AIOMetadataTemplateTargetRule) {
  if (rule.kind === 'trakt-watchlist') {
    return 500;
  }

  if (rule.kind === 'mdblist-catalog' || rule.kind === 'trakt-catalog' || rule.kind === 'letterboxd-catalog') {
    const hasExactIds = (rule.match.catalogIds || []).length > 0;
    const hasExactNames = (rule.match.names || []).length > 0;
    const hasPrefixes = (rule.match.namePrefixes || []).length > 0;

    if (hasExactIds || hasExactNames) return 400;
    if (hasPrefixes) return 300;
    return 250;
  }

  const hasWidgetNames = (rule.match.widgetNames || []).length > 0;
  const hasPrefixes = (rule.match.namePrefixes || []).length > 0;

  if (hasWidgetNames || hasPrefixes) return 200;
  return 100;
}

function mergeOverrideValues<T extends Record<string, unknown>>(
  existing: T | undefined,
  values: Partial<T>
): T {
  return {
    ...(existing || {} as T),
    ...values,
  };
}

function mergeUnsetOverrideValues<T extends Record<string, unknown>>(
  existing: T | undefined,
  values: Partial<T>
): T {
  const nextValue: T = { ...(existing || {} as T) };

  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) return;
    if (nextValue[key as keyof T] !== undefined) return;
    nextValue[key as keyof T] = value as T[keyof T];
  });

  return nextValue;
}

function matchesWidgetNameRule(
  occurrence: ExportableCatalogOccurrence,
  rule: Extract<AIOMetadataTemplateTargetRule, { kind: 'mdblist-group' | 'trakt-group' | 'streaming-group' | 'letterboxd-group' }>
) {
  const normalizedWidgetName = occurrence.widgetTitle.trim().toLowerCase();
  return (rule.match.widgetNames || []).some((name) => name.trim().toLowerCase() === normalizedWidgetName);
}

function matchesNamePrefixRule(
  occurrence: ExportableCatalogOccurrence,
  rule: Extract<AIOMetadataTemplateTargetRule, { kind: 'mdblist-group' | 'trakt-group' | 'streaming-group' | 'letterboxd-group' }>
) {
  const candidates = getMatchCandidates(occurrence);
  return (rule.match.namePrefixes || []).some((prefix) => candidates.some((candidate) => candidate.startsWith(prefix)));
}

function matchesCatalogRule(
  occurrence: ExportableCatalogOccurrence,
  rule: Extract<AIOMetadataTemplateTargetRule, { kind: 'mdblist-catalog' | 'trakt-catalog' | 'letterboxd-catalog' }>
) {
  const candidates = getMatchCandidates(occurrence);
  const normalizedCandidates = candidates.map((candidate) => candidate.trim().toLowerCase());

  const idMatch = (rule.match.catalogIds || []).some((catalogId) => catalogId === occurrence.entry.id);
  const exactNameMatch = (rule.match.names || []).some((name) => normalizedCandidates.includes(name.trim().toLowerCase()));
  const prefixMatch = (rule.match.namePrefixes || []).some((prefix) => candidates.some((candidate) => candidate.startsWith(prefix)));

  return idMatch || exactNameMatch || prefixMatch;
}

function matchesWatchlistRule(
  occurrence: ExportableCatalogOccurrence,
  rule: Extract<AIOMetadataTemplateTargetRule, { kind: 'trakt-watchlist' }>
) {
  const candidates = getMatchCandidates(occurrence);
  const idMatch = rule.match.catalogIds.some((catalogId) => catalogId === occurrence.entry.id);
  const nameMatch = (rule.match.names || []).some((name) => candidates.some((candidate) => candidate === name));
  return idMatch || nameMatch;
}

function getTemplateGroupRuleSource(
  rule: Extract<AIOMetadataTemplateTargetRule, { kind: 'mdblist-group' | 'trakt-group' | 'streaming-group' | 'letterboxd-group' }>
): ExportableCatalogSource {
  if (rule.kind === 'mdblist-group') return 'mdblist';
  if (rule.kind === 'trakt-group') return 'trakt';
  if (rule.kind === 'letterboxd-group') return 'letterboxd';
  return 'streaming';
}

function getTemplateCatalogRuleSource(
  rule: Extract<AIOMetadataTemplateTargetRule, { kind: 'mdblist-catalog' | 'trakt-catalog' | 'letterboxd-catalog' }>
): ExportableCatalogSource {
  if (rule.kind === 'mdblist-catalog') return 'mdblist';
  if (rule.kind === 'trakt-catalog') return 'trakt';
  return 'letterboxd';
}

function getMatchingGroupRuleOccurrences(
  canonicalOccurrences: CanonicalOccurrence[],
  rule: Extract<AIOMetadataTemplateTargetRule, { kind: 'mdblist-group' | 'trakt-group' | 'streaming-group' | 'letterboxd-group' }>
) {
  const source = getTemplateGroupRuleSource(rule);
  return canonicalOccurrences.filter((occurrence) =>
    occurrence.source === source
    && (matchesWidgetNameRule(occurrence, rule) || matchesNamePrefixRule(occurrence, rule))
  );
}

function getFullyMatchedWidgetIds(
  canonicalOccurrences: CanonicalOccurrence[],
  rule: Extract<AIOMetadataTemplateTargetRule, { kind: 'mdblist-group' | 'trakt-group' | 'streaming-group' | 'letterboxd-group' }>
) {
  const source = getTemplateGroupRuleSource(rule);
  const widgetToOccurrences = new Map<string, CanonicalOccurrence[]>();

  canonicalOccurrences.forEach((occurrence) => {
    if (occurrence.source !== source) return;

    const current = widgetToOccurrences.get(occurrence.widgetId) || [];
    current.push(occurrence);
    widgetToOccurrences.set(occurrence.widgetId, current);
  });

  return new Set(
    Array.from(widgetToOccurrences.entries())
      .filter(([, occurrences]) =>
        occurrences.length > 0
        && occurrences.every((occurrence) => matchesWidgetNameRule(occurrence, rule) || matchesNamePrefixRule(occurrence, rule))
      )
      .map(([widgetId]) => widgetId)
  );
}

export function getDefaultAiometadataExportOverrides({
  inventory,
  currentOverrides,
}: {
  inventory: ExportableCatalogInventory;
  currentOverrides: AIOMetadataExportOverrideState;
}): AIOMetadataExportOverrideState {
  const canonicalOccurrences = Array.from(getCanonicalOccurrencesByCatalogKey(inventory).values());
  const orderedRules = DEFAULT_AIOMETADATA_EXPORT_TEMPLATE.rules
    .map((rule, index) => ({ rule, index, specificity: getTemplateRuleSpecificity(rule) }))
    .sort((left, right) => right.specificity - left.specificity || left.index - right.index);

  const nextOverrides: AIOMetadataExportOverrideState = {
    widgets: Object.fromEntries(Object.entries(currentOverrides.widgets).map(([key, value]) => [key, { ...value }])),
    items: Object.fromEntries(Object.entries(currentOverrides.items).map(([key, value]) => [key, { ...value }])),
    catalogs: { ...currentOverrides.catalogs },
  };

  orderedRules.forEach(({ rule }) => {
    if (rule.kind === 'mdblist-group' || rule.kind === 'trakt-group' || rule.kind === 'streaming-group' || rule.kind === 'letterboxd-group') {
      const source = getTemplateGroupRuleSource(rule);
      const matchingOccurrences = getMatchingGroupRuleOccurrences(canonicalOccurrences, rule);
      const fullyMatchedWidgetIds = getFullyMatchedWidgetIds(canonicalOccurrences, rule);

      fullyMatchedWidgetIds.forEach((widgetId) => {
        nextOverrides.widgets[widgetId] = mergeOverrideValues(nextOverrides.widgets[widgetId], {
          [source]: mergeUnsetOverrideValues(getSourceScopedOverride(nextOverrides.widgets[widgetId], source), rule.values),
        });
      });

      matchingOccurrences
        .filter((occurrence) => !fullyMatchedWidgetIds.has(occurrence.widgetId))
        .forEach((occurrence) => {
          nextOverrides.catalogs[occurrence.catalogKey] = mergeUnsetOverrideValues(
            nextOverrides.catalogs[occurrence.catalogKey],
            rule.values
          );
        });

      return;
    }

    if (rule.kind === 'mdblist-catalog' || rule.kind === 'trakt-catalog' || rule.kind === 'letterboxd-catalog') {
      const source = getTemplateCatalogRuleSource(rule);
      canonicalOccurrences
        .filter((occurrence) => occurrence.source === source && matchesCatalogRule(occurrence, rule))
        .forEach((occurrence) => {
          nextOverrides.catalogs[occurrence.catalogKey] = mergeUnsetOverrideValues(
            nextOverrides.catalogs[occurrence.catalogKey],
            rule.values
          );
        });
      return;
    }

    canonicalOccurrences
      .filter((occurrence) => occurrence.source === 'trakt' && matchesWatchlistRule(occurrence, rule))
      .forEach((occurrence) => {
        nextOverrides.catalogs[occurrence.catalogKey] = mergeUnsetOverrideValues(
          nextOverrides.catalogs[occurrence.catalogKey],
          rule.values
        );
      });
  });

  return nextOverrides;
}

function resolveMDBListExportOverrideForOccurrence(
  occurrence: ExportableCatalogOccurrence,
  overrides?: AIOMetadataExportOverrideState
) {
  if (occurrence.source !== 'mdblist') {
    return null;
  }

  const widgetOverride = getSourceScopedOverride<AIOMetadataMDBListExportOverride>(
    overrides?.widgets[occurrence.widgetId],
    'mdblist'
  );
  const itemOverride = getSourceScopedOverride<AIOMetadataMDBListExportOverride>(
    occurrence.itemKey ? overrides?.items[occurrence.itemKey] : undefined,
    'mdblist'
  );
  const catalogOverride = overrides?.catalogs[occurrence.catalogKey] as AIOMetadataMDBListExportOverride | undefined;

  const resolveField = <T,>(key: keyof AIOMetadataMDBListExportOverride, fallback: T) => {
    if (catalogOverride?.[key] !== undefined) return catalogOverride[key] as T;
    if (itemOverride?.[key] !== undefined) return itemOverride[key] as T;
    if (widgetOverride?.[key] !== undefined) return widgetOverride[key] as T;
    return fallback;
  };

  return {
    sort: resolveField(
      'sort',
      isValidMDBListSort(occurrence.entry.sort) ? occurrence.entry.sort : 'default'
    ),
    order: resolveField<'asc' | 'desc'>(
      'order',
      occurrence.entry.order === 'desc' ? 'desc' : 'asc'
    ),
    cacheTTL: resolveField(
      'cacheTTL',
      isValidCacheTTL(occurrence.entry.cacheTTL) ? occurrence.entry.cacheTTL : 43200
    ),
  };
}

function resolveTraktExportOverrideForOccurrence(
  occurrence: ExportableCatalogOccurrence,
  overrides?: AIOMetadataExportOverrideState
) {
  if (occurrence.source !== 'trakt') {
    return null;
  }

  const widgetOverride = getSourceScopedOverride<AIOMetadataTraktExportOverride>(
    overrides?.widgets[occurrence.widgetId],
    'trakt'
  );
  const itemOverride = getSourceScopedOverride<AIOMetadataTraktExportOverride>(
    occurrence.itemKey ? overrides?.items[occurrence.itemKey] : undefined,
    'trakt'
  );
  const catalogOverride = overrides?.catalogs[occurrence.catalogKey] as AIOMetadataTraktExportOverride | undefined;

  const resolveField = <T,>(key: keyof AIOMetadataTraktExportOverride, fallback: T) => {
    if (catalogOverride?.[key] !== undefined) return catalogOverride[key] as T;
    if (itemOverride?.[key] !== undefined) return itemOverride[key] as T;
    if (widgetOverride?.[key] !== undefined) return widgetOverride[key] as T;
    return fallback;
  };

  return {
    sort: resolveField(
      'sort',
      isValidTraktSort(occurrence.entry.sort) ? occurrence.entry.sort : 'default'
    ),
    sortDirection: resolveField(
      'sortDirection',
      isValidSortDirection(occurrence.entry.sortDirection) ? occurrence.entry.sortDirection : 'asc'
    ),
    cacheTTL: resolveField(
      'cacheTTL',
      isValidCacheTTL(occurrence.entry.cacheTTL) ? occurrence.entry.cacheTTL : 43200
    ),
  };
}

function resolveStreamingExportOverrideForOccurrence(
  occurrence: ExportableCatalogOccurrence,
  overrides?: AIOMetadataExportOverrideState
) {
  if (occurrence.source !== 'streaming') {
    return null;
  }

  const widgetOverride = getSourceScopedOverride<AIOMetadataStreamingExportOverride>(
    overrides?.widgets[occurrence.widgetId],
    'streaming'
  );
  const itemOverride = getSourceScopedOverride<AIOMetadataStreamingExportOverride>(
    occurrence.itemKey ? overrides?.items[occurrence.itemKey] : undefined,
    'streaming'
  );
  const catalogOverride = overrides?.catalogs[occurrence.catalogKey] as AIOMetadataStreamingExportOverride | undefined;

  const resolveField = <T,>(key: keyof AIOMetadataStreamingExportOverride, fallback: T | undefined) => {
    if (catalogOverride?.[key] !== undefined) return catalogOverride[key] as T;
    if (itemOverride?.[key] !== undefined) return itemOverride[key] as T;
    if (widgetOverride?.[key] !== undefined) return widgetOverride[key] as T;
    return fallback;
  };

  return {
    sort: resolveField(
      'sort',
      isValidStreamingSort(occurrence.entry.sort) ? occurrence.entry.sort : 'popularity'
    ),
    sortDirection: resolveField(
      'sortDirection',
      isValidSortDirection(occurrence.entry.sortDirection) ? occurrence.entry.sortDirection : 'desc'
    ),
  };
}

function resolveLetterboxdExportOverrideForOccurrence(
  occurrence: ExportableCatalogOccurrence,
  overrides?: AIOMetadataExportOverrideState
) {
  if (occurrence.source !== 'letterboxd') {
    return null;
  }

  const widgetOverride = getSourceScopedOverride<AIOMetadataLetterboxdExportOverride>(
    overrides?.widgets[occurrence.widgetId],
    'letterboxd'
  );
  const itemOverride = getSourceScopedOverride<AIOMetadataLetterboxdExportOverride>(
    occurrence.itemKey ? overrides?.items[occurrence.itemKey] : undefined,
    'letterboxd'
  );
  const catalogOverride = overrides?.catalogs[occurrence.catalogKey] as AIOMetadataLetterboxdExportOverride | undefined;

  const resolveField = <T,>(key: keyof AIOMetadataLetterboxdExportOverride, fallback: T) => {
    if (catalogOverride?.[key] !== undefined) return catalogOverride[key] as T;
    if (itemOverride?.[key] !== undefined) return itemOverride[key] as T;
    if (widgetOverride?.[key] !== undefined) return widgetOverride[key] as T;
    return fallback;
  };

  return {
    cacheTTL: resolveField(
      'cacheTTL',
      isValidCacheTTL(occurrence.entry.cacheTTL) ? occurrence.entry.cacheTTL : LETTERBOXD_DEFAULT_CACHE_TTL
    ),
  };
}

export function applyExportOverrideToCatalog(
  occurrence: ExportableCatalogOccurrence,
  overrides?: AIOMetadataExportOverrideState
): AiometadataCatalogsOnlyEntry {
  if (occurrence.source === 'mdblist') {
    const resolved = resolveMDBListExportOverrideForOccurrence(occurrence, overrides);
    if (!resolved) {
      return { ...occurrence.entry };
    }

    return {
      ...occurrence.entry,
      sort: resolved.sort,
      order: resolved.order,
      cacheTTL: resolved.cacheTTL,
    };
  }

  if (occurrence.source === 'trakt') {
    const resolved = resolveTraktExportOverrideForOccurrence(occurrence, overrides);
    if (!resolved) {
      return { ...occurrence.entry };
    }

    return {
      ...occurrence.entry,
      sort: resolved.sort,
      sortDirection: resolved.sortDirection,
      cacheTTL: resolved.cacheTTL,
    };
  }

  if (occurrence.source === 'streaming') {
    const resolved = resolveStreamingExportOverrideForOccurrence(occurrence, overrides);
    const streamingCatalog: AiometadataCatalogsOnlyEntry = { ...occurrence.entry };
    delete streamingCatalog.cacheTTL;
    if (!resolved) {
      return streamingCatalog;
    }

    return {
      ...streamingCatalog,
      ...(resolved.sort !== undefined ? { sort: resolved.sort } : {}),
      ...(resolved.sortDirection !== undefined ? { sortDirection: resolved.sortDirection } : {}),
    };
  }

  if (occurrence.source === 'letterboxd') {
    const resolved = resolveLetterboxdExportOverrideForOccurrence(occurrence, overrides);
    if (!resolved) {
      return { ...occurrence.entry };
    }

    const letterboxdCatalog: AiometadataCatalogsOnlyEntry = { ...occurrence.entry };
    delete letterboxdCatalog.sort;
    delete letterboxdCatalog.order;
    delete letterboxdCatalog.sortDirection;

    return {
      ...letterboxdCatalog,
      cacheTTL: resolved.cacheTTL,
    };
  }

  return { ...occurrence.entry };
}

export function buildAiometadataCatalogExport({
  inventory,
  selectedCatalogKeys,
  includeAll = false,
  exportSettingsOverrides,
  exportedAt = new Date().toISOString(),
}: {
  inventory: ExportableCatalogInventory;
  selectedCatalogKeys?: Iterable<string>;
  includeAll?: boolean;
  exportSettingsOverrides?: AIOMetadataExportOverrideState;
  exportedAt?: string;
}) {
  const selectedKeys = includeAll ? null : new Set(selectedCatalogKeys || []);
  const uniqueCatalogs = new Map<string, CanonicalOccurrence>();

  getCanonicalOccurrencesByCatalogKey(inventory).forEach((occurrence, catalogKey) => {
    if (selectedKeys && !selectedKeys.has(catalogKey)) {
      return;
    }

    uniqueCatalogs.set(catalogKey, occurrence);
  });

  const catalogs = Array.from(uniqueCatalogs.values())
    .sort(compareOccurrences)
    .map((occurrence) => applyExportOverrideToCatalog(occurrence, exportSettingsOverrides));

  return {
    version: 1 as const,
    exportedAt,
    catalogs: applyExportNameNumbering(catalogs),
  };
}

export function sanitizeAiometadataExportOverrides(
  inventory: ExportableCatalogInventory,
  overrides: AIOMetadataExportOverrideState
): AIOMetadataExportOverrideState {
  const canonicalOccurrences = getCanonicalOccurrencesByCatalogKey(inventory);
  const validWidgetIds = new Set(inventory.widgets.map((widget) => widget.id));
  const validItemIds = new Set(inventory.widgets.flatMap((widget) => widget.items.map((item) => item.id)));
  const validCatalogKeys = new Set(Array.from(canonicalOccurrences.keys()));

  return {
    widgets: Object.fromEntries(
      Object.entries(overrides.widgets)
        .filter(([key]) => validWidgetIds.has(key))
        .map(([key, value]) => [key, sanitizeSourceScopedOverrideMap(value)])
        .filter(([, value]) => value !== undefined)
    ),
    items: Object.fromEntries(
      Object.entries(overrides.items)
        .filter(([key]) => validItemIds.has(key))
        .map(([key, value]) => [key, sanitizeSourceScopedOverrideMap(value)])
        .filter(([, value]) => value !== undefined)
    ),
    catalogs: Object.fromEntries(
      Object.entries(overrides.catalogs)
        .filter(([key]) => validCatalogKeys.has(key))
        .map(([key, value]) => [
          key,
          sanitizeCatalogOverrideForSource(canonicalOccurrences.get(key)?.source || 'simkl', value),
        ])
        .filter(([, value]) => value !== undefined)
    ),
  };
}

export function getResolvedAiometadataTargetSettings({
  inventory,
  target,
  exportSettingsOverrides,
}: {
  inventory: ExportableCatalogInventory;
  target:
    | { kind: 'widget'; widgetId: string }
    | { kind: 'item'; itemKey: string }
    | { kind: 'catalog'; catalogKey: string }
    | null;
  exportSettingsOverrides?: AIOMetadataExportOverrideState;
}): AIOMetadataSourceScopedOverrideMap {
  if (!target) {
    return {};
  }

  const canonicalOccurrences = Array.from(getCanonicalOccurrencesByCatalogKey(inventory).values()).sort(compareOccurrences);
  const relevantOccurrences = canonicalOccurrences.filter((occurrence) => {
    if (target.kind === 'widget') {
      return occurrence.widgetId === target.widgetId;
    }
    if (target.kind === 'item') {
      return occurrence.itemKey === target.itemKey;
    }
    return occurrence.catalogKey === target.catalogKey;
  });

  const mdblistOccurrence = relevantOccurrences.find((occurrence) => occurrence.source === 'mdblist');
  const traktOccurrence = relevantOccurrences.find((occurrence) => occurrence.source === 'trakt');
  const streamingOccurrence = relevantOccurrences.find((occurrence) => occurrence.source === 'streaming');
  const letterboxdOccurrence = relevantOccurrences.find((occurrence) => occurrence.source === 'letterboxd');

  return {
    ...(mdblistOccurrence
      ? { mdblist: resolveMDBListExportOverrideForOccurrence(mdblistOccurrence, exportSettingsOverrides) || undefined }
      : {}),
    ...(traktOccurrence
      ? { trakt: resolveTraktExportOverrideForOccurrence(traktOccurrence, exportSettingsOverrides) || undefined }
      : {}),
    ...(streamingOccurrence
      ? { streaming: resolveStreamingExportOverrideForOccurrence(streamingOccurrence, exportSettingsOverrides) || undefined }
      : {}),
    ...(letterboxdOccurrence
      ? { letterboxd: resolveLetterboxdExportOverrideForOccurrence(letterboxdOccurrence, exportSettingsOverrides) || undefined }
      : {}),
  };
}
