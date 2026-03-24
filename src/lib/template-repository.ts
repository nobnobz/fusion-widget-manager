export const TEMPLATE_MANIFEST_URL =
  'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/template-manifest.json';

export const TEMPLATE_REPOSITORY_CONTENTS_URL =
  'https://api.github.com/repos/nobnobz/Omni-Template-Bot-Bid-Raiser/contents';

const TEMPLATE_REPOSITORY_RAW_BASE_URL =
  'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main';

export type TemplateKind = 'fusion' | 'aiometadata' | 'aiometadata-catalogs-only' | 'aiostreams';

export const FALLBACK_TEMPLATE_URLS: Record<TemplateKind, string> = {
  fusion: `${TEMPLATE_REPOSITORY_RAW_BASE_URL}/ume-omni-template-v2.1.1.json`,
  aiometadata: `${TEMPLATE_REPOSITORY_RAW_BASE_URL}/ume-aiometadata-config-v2.1.json`,
  'aiometadata-catalogs-only': `${TEMPLATE_REPOSITORY_RAW_BASE_URL}/ume-aiometadata-catalogs-only-v2.1.json`,
  aiostreams: `${TEMPLATE_REPOSITORY_RAW_BASE_URL}/ume-aiostreams-template-v1.7.json`,
};

export interface RepositoryTemplate {
  kind: TemplateKind;
  filename: string;
  path: string;
  rawUrl: string;
  sourcePriority?: number;
  version: string;
  isDefault?: boolean;
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

interface TemplateManifestEntry {
  id: string;
  isDefault?: boolean;
  name: string;
  url: string;
  version?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<FetchResponseLike>;

export interface TemplateRepositorySnapshot {
  aiometadataTemplate?: RepositoryTemplate;
  aiometadataCatalogsOnlyTemplate?: RepositoryTemplate;
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
  manifestUrl = TEMPLATE_MANIFEST_URL,
): Promise<TemplateRepositorySnapshot> {
  const manifestTemplates = await fetchTemplatesFromManifest(fetchImpl, manifestUrl);
  const manifestSnapshot = buildTemplateRepositorySnapshot(manifestTemplates ?? []);

  let repositoryTemplates: RepositoryTemplate[] = [];
  if (!manifestTemplates || isSnapshotMissingRelevantTemplates(manifestSnapshot)) {
    repositoryTemplates = await fetchTemplatesFromRepositoryScan(fetchImpl, repositoryContentsUrl);
  }

  const combinedTemplates = mergeTemplateCollections(manifestTemplates ?? [], repositoryTemplates);
  const combinedSnapshot = buildTemplateRepositorySnapshot(combinedTemplates);
  const fallbackTemplates = buildFallbackTemplates(getMissingTemplateKinds(combinedSnapshot));

  return buildTemplateRepositorySnapshot(mergeTemplateCollections(combinedTemplates, fallbackTemplates));
}

async function fetchTemplatesFromManifest(
  fetchImpl: FetchLike,
  manifestUrl: string,
): Promise<RepositoryTemplate[] | null> {
  try {
    const response = await fetchImpl(manifestUrl);
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (!isTemplateManifestPayload(payload)) {
      return null;
    }

    const templates = payload.templates
      .map((entry) => normalizeManifestTemplate(entry))
      .filter((template): template is RepositoryTemplate => template !== null);

    return templates.length > 0 ? templates : null;
  } catch {
    return null;
  }
}

async function fetchTemplatesFromRepositoryScan(
  fetchImpl: FetchLike,
  repositoryContentsUrl: string,
): Promise<RepositoryTemplate[]> {
  try {
    const files = await collectRepositoryFiles(fetchImpl, repositoryContentsUrl);
    const relevantFiles = files.filter((file) => getTemplateKind(file.name) !== null);
    const hydratedTemplates = await Promise.all(
      relevantFiles.map(async (file) => hydrateRepositoryTemplate(fetchImpl, file)),
    );

    return hydratedTemplates.filter((template): template is RepositoryTemplate => template !== null);
  } catch {
    return [];
  }
}

function buildTemplateRepositorySnapshot(templates: RepositoryTemplate[]): TemplateRepositorySnapshot {
  const fusionTemplates = dedupeTemplatesByVersion(
    sortTemplatesNewestFirst(templates.filter((template) => template.kind === 'fusion')),
  );
  const aiometadataTemplates = sortTemplatesNewestFirst(
    templates.filter((template) => template.kind === 'aiometadata'),
  );
  const aiometadataCatalogsOnlyTemplates = sortTemplatesNewestFirst(
    templates.filter((template) => template.kind === 'aiometadata-catalogs-only'),
  );
  const aiostreamsTemplates = sortTemplatesNewestFirst(
    templates.filter((template) => template.kind === 'aiostreams'),
  );

  const explicitDefaultFusionTemplates = fusionTemplates.filter((template) => template.isDefault);

  return {
    fusionTemplates,
    defaultFusionTemplate: explicitDefaultFusionTemplates[0] ?? fusionTemplates[0],
    aiometadataTemplate: aiometadataTemplates[0],
    aiometadataCatalogsOnlyTemplate: aiometadataCatalogsOnlyTemplates[0],
    aiostreamsTemplate: aiostreamsTemplates[0],
  };
}

function isSnapshotMissingRelevantTemplates(snapshot: TemplateRepositorySnapshot): boolean {
  return !snapshot.defaultFusionTemplate
    || !snapshot.aiometadataTemplate
    || !snapshot.aiometadataCatalogsOnlyTemplate
    || !snapshot.aiostreamsTemplate;
}

function getMissingTemplateKinds(snapshot: TemplateRepositorySnapshot): TemplateKind[] {
  const missingKinds: TemplateKind[] = [];

  if (!snapshot.defaultFusionTemplate) {
    missingKinds.push('fusion');
  }

  if (!snapshot.aiometadataTemplate) {
    missingKinds.push('aiometadata');
  }

  if (!snapshot.aiometadataCatalogsOnlyTemplate) {
    missingKinds.push('aiometadata-catalogs-only');
  }

  if (!snapshot.aiostreamsTemplate) {
    missingKinds.push('aiostreams');
  }

  return missingKinds;
}

function mergeTemplateCollections(...collections: RepositoryTemplate[][]): RepositoryTemplate[] {
  const merged: RepositoryTemplate[] = [];
  const seen = new Set<string>();

  for (const collection of collections) {
    for (const template of collection) {
      const identity = getTemplateIdentity(template);
      if (seen.has(identity)) {
        continue;
      }

      seen.add(identity);
      merged.push(template);
    }
  }

  return merged;
}

function getTemplateIdentity(template: RepositoryTemplate): string {
  return template.rawUrl || [template.kind, template.path, template.version].join('|');
}

function buildFallbackTemplates(missingKinds: TemplateKind[]): RepositoryTemplate[] {
  return missingKinds
    .map((kind) => [kind, FALLBACK_TEMPLATE_URLS[kind]] as const)
    .map(([kind, rawUrl]) => buildFallbackTemplate(kind, rawUrl))
    .filter((template): template is RepositoryTemplate => template !== null);
}

function buildFallbackTemplate(kind: TemplateKind, rawUrl: string): RepositoryTemplate | null {
  const filename = extractFilename(rawUrl);
  if (!filename) {
    return null;
  }

  return {
    kind,
    filename,
    path: `fallback/${filename}`,
    rawUrl,
    sourcePriority: 2,
    version: extractVersionFromFilename(filename),
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
    sourcePriority: 1,
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

function normalizeManifestTemplate(value: unknown): RepositoryTemplate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<TemplateManifestEntry>;
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  const rawUrl = typeof candidate.url === 'string' ? candidate.url.trim() : '';
  if (!id || !name || !rawUrl) {
    return null;
  }

  const kind = resolveTemplateKind(id, rawUrl, name);
  if (!kind) {
    return null;
  }

  const filename = extractFilename(id) || extractFilename(rawUrl) || `${kind}-template.json`;
  const version = normalizeTemplateVersion(candidate.version)
    || extractVersionFromFilename(filename)
    || extractVersionFromFilename(name);

  return {
    kind,
    filename,
    path: id,
    rawUrl,
    sourcePriority: 0,
    version,
    isDefault: typeof candidate.isDefault === 'boolean' ? candidate.isDefault : undefined,
  };
}

function resolveTemplateKind(...candidates: string[]): TemplateKind | null {
  for (const candidate of candidates) {
    const directMatch = getTemplateKind(candidate);
    if (directMatch) {
      return directMatch;
    }
  }

  const haystack = candidates.join(' ').toLowerCase();
  return getTemplateKindFromHaystack(haystack);
}

function getTemplateKind(filename: string): TemplateKind | null {
  const normalizedName = filename.toLowerCase();
  if (!normalizedName.endsWith('.json')) {
    return null;
  }

  return getTemplateKindFromHaystack(normalizedName);
}

function getTemplateKindFromHaystack(value: string): TemplateKind | null {
  if (value.includes('ume-omni-template') || value.includes('omni-snapshot')) {
    return 'fusion';
  }

  if (value.includes('ume-aiometadata-catalogs-only')) {
    return 'aiometadata-catalogs-only';
  }

  if (value.includes('ume-aiometadata-config')) {
    return 'aiometadata';
  }

  if (value.includes('ume-aiostreams-template')) {
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

    const sourcePriorityComparison = (left.sourcePriority ?? Number.MAX_SAFE_INTEGER)
      - (right.sourcePriority ?? Number.MAX_SAFE_INTEGER);
    if (sourcePriorityComparison !== 0) {
      return sourcePriorityComparison;
    }

    return left.path.localeCompare(right.path);
  });
}

function normalizeVersion(value: string): string {
  const versionMatch = value.match(/v?(\d+(?:\.\d+)+)/i);
  return versionMatch ? `v${versionMatch[1]}` : '';
}

function normalizeTemplateVersion(value: unknown): string {
  if (typeof value === 'string') {
    return normalizeVersion(value.trim());
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizeVersion(String(value));
  }

  return '';
}

function extractFilename(value: string): string {
  const normalized = value.split('?')[0].split('#')[0];
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function isTemplateManifestPayload(value: unknown): value is { templates: unknown[] } {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Array.isArray((value as { templates?: unknown }).templates);
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
