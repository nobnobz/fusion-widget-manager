import { convertOmniToFusion } from './omni-converter';
import { compareVersions } from './template-repository';
import type { CollectionItem, CollectionRowWidget } from './types/widget';

const ANIMATED_COVERS_DIRECTORY_API_URL =
  'https://api.github.com/repos/nobnobz/Omni-Template-Bot-Bid-Raiser/contents/Other?ref=main';
const TEMPLATE_MANIFEST_URL =
  'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/template-manifest.json';
const FALLBACK_ANIMATED_COVER_WIDGET_TEMPLATE_URL =
  'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/ume-omni-template-v3.0.json';

const ANIMATED_COVERS_FILE_PATTERN = /^fusion-animated-covers(?:-([a-z0-9-]+))?\.json$/i;

const ANIMATED_COVER_LABEL_OVERRIDES: Record<string, string> = {
  all: 'All Animated Covers',
  decades: 'Decades',
  genres: 'Genres',
  services: 'Streaming Services',
  studios: 'Studios',
};

const ANIMATED_COVER_SORT_RANK: Record<string, number> = {
  all: 0,
  services: 1,
  studios: 2,
  decades: 3,
  genres: 4,
};

const FALLBACK_ANIMATED_COVER_FILES: GithubContentsEntry[] = [
  {
    name: 'fusion-animated-covers.json',
    path: 'Other/fusion-animated-covers.json',
    type: 'file',
    download_url:
      'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/Other/fusion-animated-covers.json',
  },
  {
    name: 'fusion-animated-covers-genres.json',
    path: 'Other/fusion-animated-covers-genres.json',
    type: 'file',
    download_url:
      'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/Other/fusion-animated-covers-genres.json',
  },
  {
    name: 'fusion-animated-covers-services.json',
    path: 'Other/fusion-animated-covers-services.json',
    type: 'file',
    download_url:
      'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/Other/fusion-animated-covers-services.json',
  },
  {
    name: 'fusion-animated-covers-studios.json',
    path: 'Other/fusion-animated-covers-studios.json',
    type: 'file',
    download_url:
      'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/Other/fusion-animated-covers-studios.json',
  },
  {
    name: 'fusion-animated-covers-decades.json',
    path: 'Other/fusion-animated-covers-decades.json',
    type: 'file',
    download_url:
      'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/Other/fusion-animated-covers-decades.json',
  },
];

interface FetchResponseLike {
  ok: boolean;
  json(): Promise<unknown>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<FetchResponseLike>;

interface GithubContentsEntry {
  name: string;
  path: string;
  type: 'dir' | 'file';
  download_url: string | null;
}

interface AnimatedCoverPayloadEntry {
  id?: string;
  title?: string;
  videoURL?: string;
  backgroundURL?: string;
}

interface TemplateManifestEntry {
  id?: string;
  isDefault?: boolean;
  name?: string;
  url?: string;
  version?: string;
}

interface TemplateManifestPayload {
  templates?: TemplateManifestEntry[];
}

interface CollectionItemLookupCandidate {
  item: CollectionItem;
  sourceWidgetTitle: string;
}

export interface AnimatedCoverMatchedItem {
  item: CollectionItem;
  sourceWidgetTitle: string;
}

export interface AnimatedCoverEntry {
  id: string;
  title: string;
  videoURL: string;
  backgroundURL: string;
}

export interface AnimatedCoverPack {
  coverCount: number;
  covers: AnimatedCoverEntry[];
  defaultPreviewIndex: number;
  filename: string;
  path: string;
  previewImageUrl: string;
  previewVideoUrl: string;
  rawUrl: string;
  slug: string;
  title: string;
}

export interface AnimatedCoverWidgetBlueprint {
  matchedCoverBackgroundUrls: string[];
  matchedCoverCount: number;
  matchedItems: AnimatedCoverMatchedItem[];
  sourceWidgetTitles: string[];
  totalCoverCount: number;
  unmatchedCoverTitles: string[];
  widget: CollectionRowWidget;
}

export interface AnimatedCoverWidgetBlueprintBundle {
  snapshotUrl: string;
  blueprints: Record<string, AnimatedCoverWidgetBlueprint>;
}

export async function fetchAnimatedCoverPacks(fetchImpl: FetchLike = fetch): Promise<AnimatedCoverPack[]> {
  const repositoryEntries = await fetchAnimatedCoverEntries(fetchImpl);
  const packFiles = repositoryEntries.filter((entry) => {
    if (entry.type !== 'file' || !entry.download_url) {
      return false;
    }

    return ANIMATED_COVERS_FILE_PATTERN.test(entry.name);
  });

  const hydratedPacks = await Promise.all(packFiles.map((entry) => hydrateAnimatedCoverPack(fetchImpl, entry)));
  const packs = hydratedPacks.filter((pack): pack is AnimatedCoverPack => pack !== null);

  if (packs.length === 0) {
    throw new Error('No animated cover packs were found.');
  }

  return packs.sort((left, right) => {
    const leftRank = ANIMATED_COVER_SORT_RANK[left.slug] ?? 100;
    const rightRank = ANIMATED_COVER_SORT_RANK[right.slug] ?? 100;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.title.localeCompare(right.title);
  });
}

export async function fetchAnimatedCoverWidgetTemplateUrl(fetchImpl: FetchLike = fetch): Promise<string> {
  try {
    const response = await fetchImpl(TEMPLATE_MANIFEST_URL);
    if (!response.ok) {
      return FALLBACK_ANIMATED_COVER_WIDGET_TEMPLATE_URL;
    }

    const payload = await response.json();
    if (!isTemplateManifestPayload(payload)) {
      return FALLBACK_ANIMATED_COVER_WIDGET_TEMPLATE_URL;
    }

    const candidates = payload.templates.filter((entry) => {
      const joined = `${entry.id || ''} ${entry.name || ''}`.toLowerCase();
      return joined.includes('ume-omni-template') || joined.includes('omni snapshot');
    });

    const sortedCandidates = [...candidates].sort((left, right) => {
      const versionComparison = compareVersions(right.version || '', left.version || '');
      if (versionComparison !== 0) {
        return versionComparison;
      }

      if (left.isDefault !== right.isDefault) {
        return left.isDefault ? -1 : 1;
      }

      return (left.name || '').localeCompare(right.name || '');
    });

    const newestCandidate = sortedCandidates.find((entry) => typeof entry.url === 'string' && entry.url.trim());
    if (newestCandidate?.url) {
      return newestCandidate.url;
    }

    return FALLBACK_ANIMATED_COVER_WIDGET_TEMPLATE_URL;
  } catch {
    return FALLBACK_ANIMATED_COVER_WIDGET_TEMPLATE_URL;
  }
}

export async function fetchAnimatedCoverWidgetBlueprints(
  packs: AnimatedCoverPack[],
  fetchImpl: FetchLike = fetch
): Promise<AnimatedCoverWidgetBlueprintBundle> {
  const snapshotUrl = await fetchAnimatedCoverWidgetTemplateUrl(fetchImpl);

  let snapshotPayload: unknown;
  try {
    const response = await fetchImpl(snapshotUrl);
    if (!response.ok) {
      throw new Error('Snapshot response was not OK.');
    }
    snapshotPayload = await response.json();
  } catch (error) {
    throw new Error(`Failed to load UME snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  let converted;
  try {
    converted = convertOmniToFusion(snapshotPayload);
  } catch (error) {
    throw new Error(`Could not convert UME snapshot to Fusion widgets: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  const collectionWidgets = converted.widgets.filter((widget) => widget.type === 'collection.row');
  const itemLookup = buildCollectionItemLookup(collectionWidgets);
  const blueprints: Record<string, AnimatedCoverWidgetBlueprint> = {};

  packs.forEach((pack) => {
    const usedItemIds = new Set<string>();
    const matchedItems: CollectionItem[] = [];
    const matchedWidgetItems: AnimatedCoverMatchedItem[] = [];
    const matchedCoverBackgroundUrls: string[] = [];
    const unmatchedCoverTitles: string[] = [];
    const sourceWidgetTitles = new Set<string>();

    pack.covers.forEach((cover) => {
      const candidate = pickCollectionItemCandidate(itemLookup, cover.title, usedItemIds);
      if (!candidate) {
        unmatchedCoverTitles.push(cover.title);
        return;
      }

      usedItemIds.add(candidate.item.id);
      sourceWidgetTitles.add(candidate.sourceWidgetTitle);
      const matchedItem = cloneCollectionItem(candidate.item, cover.backgroundURL);
      matchedItems.push(matchedItem);
      matchedWidgetItems.push({
        item: matchedItem,
        sourceWidgetTitle: candidate.sourceWidgetTitle,
      });
      matchedCoverBackgroundUrls.push(cover.backgroundURL);
    });

    const sourceWidgetTitlesList = Array.from(sourceWidgetTitles);
    const widgetTitle = sourceWidgetTitlesList.length === 1
      ? sourceWidgetTitlesList[0]
      : pack.title;

    blueprints[pack.slug] = {
      matchedCoverBackgroundUrls,
      matchedCoverCount: matchedItems.length,
      matchedItems: matchedWidgetItems,
      sourceWidgetTitles: sourceWidgetTitlesList,
      totalCoverCount: pack.coverCount,
      unmatchedCoverTitles,
      widget: {
        id: `collection.${crypto.randomUUID()}`,
        title: widgetTitle,
        type: 'collection.row',
        hideTitle: false,
        dataSource: {
          kind: 'collection',
          payload: {
            items: matchedItems,
          },
        },
      },
    };
  });

  return {
    snapshotUrl,
    blueprints,
  };
}

async function fetchAnimatedCoverEntries(fetchImpl: FetchLike): Promise<GithubContentsEntry[]> {
  try {
    const response = await fetchImpl(ANIMATED_COVERS_DIRECTORY_API_URL);
    if (!response.ok) {
      return FALLBACK_ANIMATED_COVER_FILES;
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return FALLBACK_ANIMATED_COVER_FILES;
    }

    const parsedEntries = payload.filter(isGithubContentsEntry);
    return parsedEntries.length > 0 ? parsedEntries : FALLBACK_ANIMATED_COVER_FILES;
  } catch {
    return FALLBACK_ANIMATED_COVER_FILES;
  }
}

async function hydrateAnimatedCoverPack(
  fetchImpl: FetchLike,
  repositoryEntry: Pick<GithubContentsEntry, 'name' | 'path' | 'download_url'>
): Promise<AnimatedCoverPack | null> {
  if (!repositoryEntry.download_url) {
    return null;
  }

  const match = repositoryEntry.name.match(ANIMATED_COVERS_FILE_PATTERN);
  if (!match) {
    return null;
  }

  try {
    const response = await fetchImpl(repositoryEntry.download_url);
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return null;
    }

    const covers = payload
      .filter(isAnimatedCoverPayloadEntry)
      .map((entry, index) => ({
        id: entry.id || `${repositoryEntry.path}-${index}`,
        title: entry.title,
        videoURL: entry.videoURL,
        backgroundURL: entry.backgroundURL,
      }));

    const slug = normalizeAnimatedCoverSlug(match[1]);
    const preferredPreviewIndex = findPreferredPreviewIndex(slug, covers);
    const preferredPreview = covers[preferredPreviewIndex] || covers[0];

    return {
      coverCount: covers.length,
      covers,
      defaultPreviewIndex: preferredPreviewIndex,
      filename: repositoryEntry.name,
      path: repositoryEntry.path,
      previewImageUrl: preferredPreview?.backgroundURL || '',
      previewVideoUrl: preferredPreview?.videoURL || '',
      rawUrl: repositoryEntry.download_url,
      slug,
      title: ANIMATED_COVER_LABEL_OVERRIDES[slug] ?? formatSlug(slug),
    };
  } catch {
    return null;
  }
}

function buildCollectionItemLookup(
  collectionWidgets: CollectionRowWidget[]
): Map<string, CollectionItemLookupCandidate[]> {
  const lookup = new Map<string, CollectionItemLookupCandidate[]>();

  collectionWidgets.forEach((widget) => {
    widget.dataSource.payload.items.forEach((item) => {
      const keys = buildLookupKeys(item.name);
      keys.forEach((key) => {
        const existing = lookup.get(key) ?? [];
        existing.push({
          item,
          sourceWidgetTitle: widget.title,
        });
        lookup.set(key, existing);
      });
    });
  });

  return lookup;
}

function pickCollectionItemCandidate(
  lookup: Map<string, CollectionItemLookupCandidate[]>,
  title: string,
  usedItemIds: Set<string>
): CollectionItemLookupCandidate | null {
  const keys = buildLookupKeys(title);
  for (const key of keys) {
    const candidates = lookup.get(key);
    if (!candidates || candidates.length === 0) {
      continue;
    }

    const available = candidates.find((candidate) => !usedItemIds.has(candidate.item.id));
    if (available) {
      return available;
    }
  }

  return null;
}

function cloneCollectionItem(item: CollectionItem, preferredBackgroundUrl: string): CollectionItem {
  return {
    ...item,
    backgroundImageURL: preferredBackgroundUrl || item.backgroundImageURL,
    dataSources: item.dataSources.map((dataSource) => ({
      ...dataSource,
      payload: {
        ...dataSource.payload,
      },
    })) as CollectionItem['dataSources'],
  };
}

function buildLookupKeys(value: string): string[] {
  const normalized = normalizeLookupKey(value);
  if (!normalized) {
    return [];
  }

  const condensed = normalized.replace(/\s+/g, '');
  return condensed === normalized ? [normalized] : [normalized, condensed];
}

function normalizeLookupKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function findPreferredPreviewIndex(slug: string, covers: AnimatedCoverEntry[]): number {
  if (covers.length === 0) {
    return 0;
  }

  if (slug !== 'all') {
    return 0;
  }

  const watchlistIndex = covers.findIndex((cover) => normalizeLookupKey(cover.title).includes('watchlist'));
  return watchlistIndex >= 0 ? watchlistIndex : 0;
}

function isGithubContentsEntry(value: unknown): value is GithubContentsEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<GithubContentsEntry>;
  return typeof candidate.name === 'string'
    && typeof candidate.path === 'string'
    && (candidate.type === 'dir' || candidate.type === 'file')
    && (typeof candidate.download_url === 'string' || candidate.download_url === null);
}

function isAnimatedCoverPayloadEntry(
  value: unknown
): value is AnimatedCoverPayloadEntry & { title: string; videoURL: string; backgroundURL: string } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as AnimatedCoverPayloadEntry;
  return typeof candidate.title === 'string'
    && typeof candidate.videoURL === 'string'
    && typeof candidate.backgroundURL === 'string';
}

function isTemplateManifestPayload(value: unknown): value is TemplateManifestPayload & { templates: TemplateManifestEntry[] } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as TemplateManifestPayload;
  return Array.isArray(candidate.templates);
}

function normalizeAnimatedCoverSlug(suffix: string | undefined): string {
  if (!suffix) {
    return 'all';
  }

  return suffix.trim().toLowerCase();
}

function formatSlug(slug: string): string {
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
