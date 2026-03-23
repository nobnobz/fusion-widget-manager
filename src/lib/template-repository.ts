export const TEMPLATE_REPOSITORY_CONTENTS_URL =
  'https://api.github.com/repos/nobnobz/Omni-Template-Bot-Bid-Raiser/contents';

const TEMPLATE_REPOSITORY_RAW_BASE_URL =
  'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main';

export type TemplateKind = 'fusion' | 'aiometadata' | 'aiostreams';

export interface RepositoryTemplate {
  kind: TemplateKind;
  filename: string;
  path: string;
  rawUrl: string;
  version: string;
}

interface GithubContentsEntry {
  download_url: string | null;
  name: string;
  path?: string;
  type: 'dir' | 'file';
  url: string;
}

interface FetchResponseLike {
  ok: boolean;
  json(): Promise<unknown>;
  text?: () => Promise<string>;
}

interface GithubFileResponse {
  content?: string;
  encoding?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<FetchResponseLike>;

export interface TemplateRepositorySnapshot {
  aiometadataTemplate?: RepositoryTemplate;
  aiostreamsTemplate?: RepositoryTemplate;
  defaultFusionTemplate?: RepositoryTemplate;
  fusionTemplates: RepositoryTemplate[];
}

export function extractVersionFromFilename(filename: string): string {
  return normalizeVersion(filename);
}

export function extractVersionFromTemplateContent(template: unknown): string {
  if (!template || typeof template !== 'object') {
    return '';
  }

  const candidate = (template as { version?: unknown }).version;
  return typeof candidate === 'string' ? normalizeVersion(candidate.trim()) : '';
}

export function extractVersionFromTemplateText(templateText: string): string {
  const versionMatch = templateText.match(/"version"\s*:\s*"([^"]+)"/i);
  return versionMatch ? normalizeVersion(versionMatch[1]) : '';
}

export function compareVersions(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (!left) {
    return -1;
  }

  if (!right) {
    return 1;
  }

  const leftParts = normalizeVersion(left)
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = normalizeVersion(right)
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

export function requiresDownloadActionPrompt(kind: TemplateKind): boolean {
  return kind === 'aiostreams';
}

export function formatTemplateLabel(prefix: string, template?: Pick<RepositoryTemplate, 'filename' | 'version'>): string {
  if (!template) {
    return prefix;
  }

  return template.version ? `${prefix} ${template.version}` : `${prefix} ${template.filename}`;
}

export async function fetchTemplateRepository(
  fetchImpl: FetchLike = fetch,
  repositoryContentsUrl = TEMPLATE_REPOSITORY_CONTENTS_URL,
): Promise<TemplateRepositorySnapshot> {
  const files = await collectRepositoryFiles(fetchImpl, repositoryContentsUrl);
  const relevantFiles = files.filter((file) => getTemplateKind(file.name) !== null);
  const hydratedTemplates = await Promise.all(
    relevantFiles.map(async (file) => hydrateRepositoryTemplate(fetchImpl, file)),
  );
  const templates = hydratedTemplates.filter((template): template is RepositoryTemplate => template !== null);

  const fusionTemplates = dedupeTemplatesByVersion(
    sortTemplatesNewestFirst(templates.filter((template) => template.kind === 'fusion')),
  );
  const aiometadataTemplates = sortTemplatesNewestFirst(
    templates.filter((template) => template.kind === 'aiometadata'),
  );
  const aiostreamsTemplates = sortTemplatesNewestFirst(
    templates.filter((template) => template.kind === 'aiostreams'),
  );

  return {
    fusionTemplates,
    defaultFusionTemplate: fusionTemplates[0],
    aiometadataTemplate: aiometadataTemplates[0],
    aiostreamsTemplate: aiostreamsTemplates[0],
  };
}

async function collectRepositoryFiles(fetchImpl: FetchLike, url: string): Promise<GithubContentsEntry[]> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch repository contents from ${url}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error(`Unexpected GitHub contents payload from ${url}`);
  }

  const entries = payload.filter(isGithubContentsEntry);
  const directories = entries.filter((entry) => entry.type === 'dir');
  const nestedFiles = await Promise.all(directories.map((entry) => collectRepositoryFiles(fetchImpl, entry.url)));

  return [
    ...entries.filter((entry) => entry.type === 'file'),
    ...nestedFiles.flat(),
  ];
}

async function hydrateRepositoryTemplate(
  fetchImpl: FetchLike,
  file: GithubContentsEntry,
): Promise<RepositoryTemplate | null> {
  const kind = getTemplateKind(file.name);
  if (!kind) {
    return null;
  }

  const rawUrl = buildRawUrl(file);
  if (!rawUrl) {
    return null;
  }

  const version = await resolveTemplateVersion(fetchImpl, file, kind);

  return {
    kind,
    filename: file.name,
    path: file.path || file.name,
    rawUrl,
    version,
  };
}

async function resolveTemplateVersion(
  fetchImpl: FetchLike,
  file: GithubContentsEntry,
  kind: TemplateKind,
): Promise<string> {
  if (kind === 'aiostreams') {
    return extractVersionFromTemplateText(await fetchTemplateTextFromContentsApi(fetchImpl, file.url))
      || extractVersionFromTemplateText(await fetchTemplateTextFromRawUrl(fetchImpl, buildRawUrl(file)))
      || extractVersionFromFilename(file.name);
  }

  return extractVersionFromFilename(file.name);
}

async function fetchTemplateTextFromContentsApi(fetchImpl: FetchLike, fileApiUrl: string): Promise<string> {
  try {
    const response = await fetchImpl(fileApiUrl);
    if (!response.ok) {
      return '';
    }

    const payload = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return '';
    }

    const fileResponse = payload as GithubFileResponse;
    if (fileResponse.encoding !== 'base64' || typeof fileResponse.content !== 'string') {
      return '';
    }

    return decodeBase64(fileResponse.content.replace(/\n/g, ''));
  } catch {
    return '';
  }
}

async function fetchTemplateTextFromRawUrl(fetchImpl: FetchLike, rawUrl: string): Promise<string> {
  if (!rawUrl) {
    return '';
  }

  try {
    const response = await fetchImpl(rawUrl);
    if (!response.ok || typeof response.text !== 'function') {
      return '';
    }

    return await response.text();
  } catch {
    return '';
  }
}

function buildRawUrl(file: GithubContentsEntry): string {
  if (file.download_url) {
    return file.download_url;
  }

  const normalizedPath = (file.path || file.name).replace(/^\/+/, '');
  return normalizedPath ? `${TEMPLATE_REPOSITORY_RAW_BASE_URL}/${normalizedPath}` : '';
}

function getTemplateKind(filename: string): TemplateKind | null {
  const normalizedName = filename.toLowerCase();
  if (!normalizedName.endsWith('.json')) {
    return null;
  }

  if (normalizedName.includes('ume-omni-template') || normalizedName.includes('omni-snapshot')) {
    return 'fusion';
  }

  if (normalizedName.includes('ume-aiometadata-config')) {
    return 'aiometadata';
  }

  if (normalizedName.startsWith('ume-aiostreams-template')) {
    return 'aiostreams';
  }

  return null;
}

function dedupeTemplatesByVersion(templates: RepositoryTemplate[]): RepositoryTemplate[] {
  const seen = new Set<string>();

  return templates.filter((template) => {
    const dedupeKey = template.version || template.path;
    if (seen.has(dedupeKey)) {
      return false;
    }

    seen.add(dedupeKey);
    return true;
  });
}

function sortTemplatesNewestFirst(templates: RepositoryTemplate[]): RepositoryTemplate[] {
  return [...templates].sort((left, right) => {
    const versionComparison = compareVersions(right.version, left.version);
    if (versionComparison !== 0) {
      return versionComparison;
    }

    return left.path.localeCompare(right.path);
  });
}

function normalizeVersion(value: string): string {
  const versionMatch = value.match(/v?(\d+(?:\.\d+)+)/i);
  return versionMatch ? `v${versionMatch[1]}` : '';
}

function isGithubContentsEntry(value: unknown): value is GithubContentsEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<GithubContentsEntry>;
  return (
    typeof candidate.name === 'string'
    && typeof candidate.type === 'string'
    && typeof candidate.url === 'string'
    && (candidate.download_url === null || typeof candidate.download_url === 'string')
  );
}

function decodeBase64(value: string): string {
  if (typeof atob === 'function') {
    return atob(value);
  }

  return Buffer.from(value, 'base64').toString('utf8');
}
