const REGEX_PATTERNS_DIRECTORY_API_URL =
  'https://api.github.com/repos/nobnobz/Omni-Template-Bot-Bid-Raiser/contents/Other?ref=main';

const REGEX_PATTERN_FILE_PATTERN = /^(?:fusion|fustion)-tags-ume(?:-([a-z0-9-]+))?\.json$/i;

const REGEX_PATTERN_LABEL_OVERRIDES: Record<string, string> = {
  classic: 'Classic',
  colored: 'Colored',
  copy: 'Classic Copy',
  'colored-copy': 'Colored Copy',
  minimalistic: 'Minimalistic',
};

const REGEX_PATTERN_SORT_RANK: Record<string, number> = {
  classic: 0,
  colored: 1,
  copy: 2,
  'colored-copy': 3,
  minimalistic: 4,
};

const FALLBACK_REGEX_PATTERN_FILES: GithubContentsEntry[] = [
  {
    name: 'fusion-tags-ume.json',
    path: 'Other/fusion-tags-ume.json',
    type: 'file',
    download_url:
      'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/Other/fusion-tags-ume.json',
  },
  {
    name: 'fusion-tags-ume-colored.json',
    path: 'Other/fusion-tags-ume-colored.json',
    type: 'file',
    download_url:
      'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/Other/fusion-tags-ume-colored.json',
  },
  {
    name: 'fusion-tags-ume-copy.json',
    path: 'Other/fusion-tags-ume-copy.json',
    type: 'file',
    download_url:
      'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/Other/fusion-tags-ume-copy.json',
  },
  {
    name: 'fusion-tags-ume-colored-copy.json',
    path: 'Other/fusion-tags-ume-colored-copy.json',
    type: 'file',
    download_url:
      'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/Other/fusion-tags-ume-colored-copy.json',
  },
  {
    name: 'fusion-tags-ume-minimalistic.json',
    path: 'Other/fusion-tags-ume-minimalistic.json',
    type: 'file',
    download_url:
      'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/Other/fusion-tags-ume-minimalistic.json',
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

interface RegexPatternFilterPayloadEntry {
  borderColor?: string;
  id?: string;
  imageURL?: string;
  isDynamic?: boolean;
  isEnabled?: boolean;
  name?: string;
  tagColor?: string;
  tagStyle?: string;
  textColor?: string;
}

interface RegexPatternPayload {
  filters?: RegexPatternFilterPayloadEntry[];
  groups?: unknown[];
}

export interface RegexPatternVisualFilter {
  borderColor: string;
  id: string;
  imageURL: string;
  isDynamic: boolean;
  isEnabled: boolean;
  name: string;
  tagColor: string;
  tagStyle: string;
  textColor: string;
}

export interface RegexPatternPack {
  filename: string;
  filterCount: number;
  filters: RegexPatternVisualFilter[];
  groupCount: number;
  path: string;
  previewImageUrls: string[];
  rawUrl: string;
  slug: string;
  title: string;
}

export async function fetchRegexPatternPacks(fetchImpl: FetchLike = fetch): Promise<RegexPatternPack[]> {
  const repositoryEntries = await fetchRegexPatternEntries(fetchImpl);
  const patternFiles = repositoryEntries.filter((entry) => {
    if (entry.type !== 'file' || !entry.download_url) {
      return false;
    }

    return REGEX_PATTERN_FILE_PATTERN.test(entry.name);
  });

  const hydratedPacks = await Promise.all(patternFiles.map((entry) => hydrateRegexPatternPack(fetchImpl, entry)));
  const packs = hydratedPacks.filter((pack): pack is RegexPatternPack => pack !== null);

  if (packs.length === 0) {
    throw new Error('No regex pattern packs were found.');
  }

  return packs.sort((left, right) => {
    const leftRank = REGEX_PATTERN_SORT_RANK[left.slug] ?? 100;
    const rightRank = REGEX_PATTERN_SORT_RANK[right.slug] ?? 100;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.title.localeCompare(right.title);
  });
}

async function fetchRegexPatternEntries(fetchImpl: FetchLike): Promise<GithubContentsEntry[]> {
  try {
    const response = await fetchImpl(REGEX_PATTERNS_DIRECTORY_API_URL);
    if (!response.ok) {
      return FALLBACK_REGEX_PATTERN_FILES;
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return FALLBACK_REGEX_PATTERN_FILES;
    }

    const parsedEntries = payload.filter(isGithubContentsEntry);
    return parsedEntries.length > 0 ? parsedEntries : FALLBACK_REGEX_PATTERN_FILES;
  } catch {
    return FALLBACK_REGEX_PATTERN_FILES;
  }
}

async function hydrateRegexPatternPack(
  fetchImpl: FetchLike,
  repositoryEntry: Pick<GithubContentsEntry, 'name' | 'path' | 'download_url'>
): Promise<RegexPatternPack | null> {
  if (!repositoryEntry.download_url) {
    return null;
  }

  const match = repositoryEntry.name.match(REGEX_PATTERN_FILE_PATTERN);
  if (!match) {
    return null;
  }

  try {
    const response = await fetchImpl(repositoryEntry.download_url);
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (!isRegexPatternPayload(payload)) {
      return null;
    }

    const sampleImageSet = new Set<string>();
    for (const filter of payload.filters) {
      if (typeof filter.imageURL !== 'string' || !filter.imageURL.trim()) {
        continue;
      }

      sampleImageSet.add(filter.imageURL);
      if (sampleImageSet.size >= 4) {
        break;
      }
    }

    const slug = normalizeRegexPatternSlug(match[1]);

    return {
      filename: repositoryEntry.name,
      filterCount: payload.filters.length,
      filters: payload.filters.map((filter, index) => ({
        borderColor: typeof filter.borderColor === 'string' ? filter.borderColor : '',
        id: typeof filter.id === 'string' ? filter.id : `${repositoryEntry.path}-${index}`,
        imageURL: typeof filter.imageURL === 'string' ? filter.imageURL : '',
        isDynamic: Boolean(filter.isDynamic),
        isEnabled: typeof filter.isEnabled === 'boolean' ? filter.isEnabled : true,
        name: typeof filter.name === 'string' ? filter.name : `Filter ${index + 1}`,
        tagColor: typeof filter.tagColor === 'string' ? filter.tagColor : '',
        tagStyle: typeof filter.tagStyle === 'string' ? filter.tagStyle : 'filled',
        textColor: typeof filter.textColor === 'string' ? filter.textColor : '',
      })),
      groupCount: payload.groups.length,
      path: repositoryEntry.path,
      previewImageUrls: Array.from(sampleImageSet),
      rawUrl: repositoryEntry.download_url,
      slug,
      title: REGEX_PATTERN_LABEL_OVERRIDES[slug] ?? formatSlug(slug),
    };
  } catch {
    return null;
  }
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

function isRegexPatternFilterPayloadEntry(value: unknown): value is RegexPatternFilterPayloadEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as RegexPatternFilterPayloadEntry;
  return (typeof candidate.id === 'string' || typeof candidate.id === 'undefined')
    && (typeof candidate.name === 'string' || typeof candidate.name === 'undefined')
    && (typeof candidate.imageURL === 'string' || typeof candidate.imageURL === 'undefined')
    && (typeof candidate.borderColor === 'string' || typeof candidate.borderColor === 'undefined')
    && (typeof candidate.tagColor === 'string' || typeof candidate.tagColor === 'undefined')
    && (typeof candidate.textColor === 'string' || typeof candidate.textColor === 'undefined')
    && (typeof candidate.tagStyle === 'string' || typeof candidate.tagStyle === 'undefined')
    && (typeof candidate.isEnabled === 'boolean' || typeof candidate.isEnabled === 'undefined')
    && (typeof candidate.isDynamic === 'boolean' || typeof candidate.isDynamic === 'undefined');
}

function isRegexPatternPayload(value: unknown): value is RegexPatternPayload & { filters: RegexPatternFilterPayloadEntry[]; groups: unknown[] } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as RegexPatternPayload;
  return Array.isArray(candidate.filters)
    && Array.isArray(candidate.groups)
    && candidate.filters.every(isRegexPatternFilterPayloadEntry);
}

function normalizeRegexPatternSlug(value?: string): string {
  if (!value) {
    return 'classic';
  }

  return value.trim().toLowerCase() || 'classic';
}

function formatSlug(slug: string): string {
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
