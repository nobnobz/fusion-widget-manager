import type { FusionWidgetsConfig, RowClassicWidget } from './types/widget';
import { MANIFEST_PLACEHOLDER } from './widget-domain';
import { LETTERBOXD_DEFAULT_CACHE_TTL } from './letterboxd-catalog-export';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asCacheTTL(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 300
    ? value
    : LETTERBOXD_DEFAULT_CACHE_TTL;
}

function isLetterboxdSource(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'letterboxd';
}

function resolveLetterboxdIdentifier(entry: UnknownRecord): string | null {
  const metadata = isRecord(entry.metadata) ? entry.metadata : null;
  const metadataIdentifier = asOptionalString(metadata?.identifier);
  if (metadataIdentifier) {
    return metadataIdentifier;
  }

  const rawId = asOptionalString(entry.id);
  if (!rawId) {
    return null;
  }

  if (rawId.toLowerCase().startsWith('letterboxd.')) {
    return rawId.slice('letterboxd.'.length);
  }

  return rawId;
}

function shouldImportLetterboxdEntry(entry: UnknownRecord): boolean {
  if (!isLetterboxdSource(entry.source)) {
    return false;
  }

  if (!asBoolean(entry.enabled, true)) {
    return false;
  }

  if (!asBoolean(entry.showInHome, true)) {
    return false;
  }

  return resolveLetterboxdIdentifier(entry) !== null;
}

function buildLetterboxdRowWidget(entry: UnknownRecord, index: number): RowClassicWidget {
  const identifier = resolveLetterboxdIdentifier(entry);
  if (!identifier) {
    throw new Error(`AIOMetadata import widgets[${index}] is missing a usable Letterboxd identifier.`);
  }

  const title = asOptionalString(entry.name) || asOptionalString(entry.title) || `Letterboxd ${index + 1}`;
  const cacheTTL = asCacheTTL(entry.cacheTTL);
  const enableRatingPosters = asBoolean(entry.enableRatingPosters, true);

  return {
    id: crypto.randomUUID(),
    title,
    type: 'row.classic',
    cacheTTL,
    limit: 20,
    presentation: {
      aspectRatio: 'poster',
      cardStyle: 'medium',
      badges: {
        providers: false,
        ratings: enableRatingPosters,
      },
      backgroundImageURL: '',
    },
    dataSource: {
      sourceType: 'aiometadata',
      kind: 'addonCatalog',
      payload: {
        addonId: MANIFEST_PLACEHOLDER,
        catalogId: `movie::letterboxd.${identifier}`,
        catalogType: 'movie',
      },
    },
  };
}

function getAiometadataEntries(input: unknown): UnknownRecord[] | null {
  if (!isRecord(input)) {
    return null;
  }

  if (Array.isArray(input.widgets)) {
    return input.widgets.filter(isRecord);
  }

  if (Array.isArray(input.catalogs)) {
    return input.catalogs.filter(isRecord);
  }

  return null;
}

export function isAiometadataImportPayload(input: unknown): boolean {
  const entries = getAiometadataEntries(input);
  if (!entries || entries.length === 0) {
    return false;
  }

  return entries.some((entry) => isLetterboxdSource(entry.source));
}

export function convertAiometadataImportToFusion(input: unknown): FusionWidgetsConfig | null {
  const entries = getAiometadataEntries(input);
  if (!entries) {
    return null;
  }

  const widgets = entries
    .filter(shouldImportLetterboxdEntry)
    .map((entry, index) => buildLetterboxdRowWidget(entry, index));

  if (widgets.length === 0) {
    throw new Error('AIOMetadata import did not contain any importable Letterboxd widgets.');
  }

  return {
    exportType: 'fusionWidgets',
    exportVersion: 1,
    widgets,
  };
}
