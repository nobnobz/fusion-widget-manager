function titleCaseWords(value: string): string {
  return value
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function getCatalogTypeLabel(type: string): string {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'movie' || normalized === 'movies') {
    return 'Movies';
  }
  if (normalized === 'series' || normalized === 'show' || normalized === 'shows') {
    return 'Shows';
  }
  if (normalized === 'all') {
    return 'All';
  }
  if (normalized === 'anime') {
    return 'Anime';
  }
  return titleCaseWords(normalized || 'Catalog');
}

export function getCatalogTypeTrailingWhitespace(type: string): string {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'movie' || normalized === 'movies') {
    return ' ';
  }
  if (normalized === 'all') {
    return '   ';
  }
  if (normalized === 'anime') {
    return '  ';
  }
  return '';
}

export function appendCatalogTypeLabel(baseLabel: string, type: string): string {
  const suffix = getCatalogTypeLabel(type);
  if (!suffix) {
    return baseLabel.trim();
  }

  return `${baseLabel.trim()} (${suffix})${getCatalogTypeTrailingWhitespace(type)}`;
}

export function getWidgetDisplayName(widgetTitle: string, widgetIndex: number): string {
  const normalized = String(widgetTitle || '').trim();
  return normalized || `Widget ${widgetIndex + 1}`;
}

export function getItemDisplayName(itemName: string | undefined, itemIndex: number | undefined): string {
  const normalized = String(itemName || '').trim();
  return normalized || `Item ${(itemIndex ?? 0) + 1}`;
}

export function getFusionCollectionItemName(
  item: { name?: string; title?: string },
  itemIndex: number | undefined
): string {
  const normalizedName = String(item.name || '').trim();
  if (normalizedName) {
    return normalizedName;
  }

  const normalizedTitle = String(item.title || '').trim();
  if (normalizedTitle) {
    return normalizedTitle;
  }

  return getItemDisplayName(undefined, itemIndex);
}

export function normalizeNamePrefix(name: string): string {
  return String(name || '').replace(/^\[[^\]]+\]\s*/, '').trim();
}

export function stripWidgetPrefix(name: string, widgetLabel: string): string {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) {
    return normalizedName;
  }

  const prefix = widgetLabel.startsWith('[') ? widgetLabel : `[${widgetLabel}]`;
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return normalizedName.replace(new RegExp(`^${escapedPrefix}\\s*`, 'iu'), '').trim();
}

export function stripCatalogTypeDecoration(name: string): string {
  return String(name || '').replace(/\s+\((Movies|Shows|All|Anime)\)\s*$/iu, '').trim();
}

export function buildCollectionCatalogExportName(params: {
  widgetTitle: string;
  widgetIndex: number;
  itemName: string;
  type: string;
  includeTypeLabel?: boolean;
}): string {
  const widgetLabel = getWidgetDisplayName(params.widgetTitle, params.widgetIndex);
  const baseLabel = stripWidgetPrefix(params.itemName, widgetLabel) || params.itemName.trim();
  return `[${widgetLabel}] ${params.includeTypeLabel === false ? baseLabel.trim() : appendCatalogTypeLabel(baseLabel, params.type)}`;
}

export function buildClassicRowCatalogExportName(params: {
  widgetTitle: string;
  widgetIndex: number;
  type: string;
  includeTypeLabel?: boolean;
}): string {
  const baseLabel = stripWidgetPrefix(getWidgetDisplayName(params.widgetTitle, params.widgetIndex), 'Classic Row')
    || getWidgetDisplayName(params.widgetTitle, params.widgetIndex);
  return `[Classic Row] ${params.includeTypeLabel === false ? baseLabel.trim() : appendCatalogTypeLabel(baseLabel, params.type)}`;
}

export function prefixCatalogNameWithWidget(
  widgetTitle: string,
  widgetIndex: number,
  catalogName: string
): string {
  const widgetLabel = getWidgetDisplayName(widgetTitle, widgetIndex);
  const normalizedCatalogName = String(catalogName || '').trim();
  const prefix = widgetLabel.startsWith('[') ? widgetLabel : `[${widgetLabel}]`;

  if (!normalizedCatalogName) {
    return prefix;
  }

  return normalizedCatalogName.startsWith(`${prefix} `) || normalizedCatalogName === prefix
    ? normalizedCatalogName
    : `${prefix} ${normalizedCatalogName}`;
}

export function buildCatalogFallbackName(params: {
  widgetTitle: string;
  widgetIndex: number;
  itemName?: string;
  itemIndex?: number;
  type: string;
  occurrence: number;
}): string {
  const baseLabel = params.itemName !== undefined || params.itemIndex !== undefined
    ? getItemDisplayName(params.itemName, params.itemIndex)
    : getWidgetDisplayName(params.widgetTitle, params.widgetIndex);
  const typeLabel = getCatalogTypeLabel(params.type);
  const normalizedBase = baseLabel.trim().toLowerCase();
  const normalizedType = typeLabel.toLowerCase();
  const hasTypeSuffix =
    (normalizedType === 'movies' && /\b(movie|movies)\b/.test(normalizedBase))
    || (normalizedType === 'shows' && /\b(show|shows|series)\b/.test(normalizedBase))
    || (normalizedType === 'all' && /\ball$/.test(normalizedBase))
    || normalizedBase.endsWith(normalizedType);
  const suffix = params.occurrence > 1 ? ` ${params.occurrence}` : '';
  return hasTypeSuffix ? `${baseLabel}${suffix}` : `${baseLabel} ${typeLabel}${suffix}`;
}

export function applyExportNameNumbering<T extends { name: string }>(catalogs: T[]): T[] {
  const nameCounts = new Map<string, number>();

  return catalogs.map((catalog) => {
    const currentCount = (nameCounts.get(catalog.name) || 0) + 1;
    nameCounts.set(catalog.name, currentCount);

    if (currentCount === 1) {
      return catalog;
    }

    return {
      ...catalog,
      name: `${catalog.name}${/\s$/u.test(catalog.name) ? '' : ' '}${currentCount}`,
    };
  });
}

export function compareCatalogExportOrder(
  left: { widgetIndex: number; name?: string; displayName?: string; id: string; type?: string },
  right: { widgetIndex: number; name?: string; displayName?: string; id: string; type?: string }
): number {
  if (left.widgetIndex !== right.widgetIndex) {
    return left.widgetIndex - right.widgetIndex;
  }

  const leftLabel = String(left.name ?? left.displayName ?? '');
  const rightLabel = String(right.name ?? right.displayName ?? '');
  const nameCompare = leftLabel.localeCompare(rightLabel, undefined, { sensitivity: 'base' });
  if (nameCompare !== 0) {
    return nameCompare;
  }

  const idCompare = left.id.localeCompare(right.id, undefined, { sensitivity: 'base' });
  if (idCompare !== 0) {
    return idCompare;
  }

  return String(left.type || '').localeCompare(String(right.type || ''), undefined, { sensitivity: 'base' });
}
