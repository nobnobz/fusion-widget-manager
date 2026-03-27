import { findCatalog } from './config-utils';
import type {
  AIOMetadataCatalog,
  CollectionItem,
  NativeTraktDataSource,
  Widget,
  WidgetDataSource,
} from './types/widget';
import { isAIOMetadataDataSource, isNativeTraktDataSource } from './widget-domain';

export function isInvalidCatalogDataSource(
  dataSource: WidgetDataSource,
  catalogs: AIOMetadataCatalog[]
): boolean {
  if (!isAIOMetadataDataSource(dataSource)) {
    return false;
  }

  const catalogId = dataSource.payload?.catalogId?.trim();
  if (!catalogId) {
    return true;
  }

  if (catalogs.length === 0) {
    return false;
  }

  return !findCatalog(catalogs, catalogId);
}

export function getTraktValidationIssues(dataSource: NativeTraktDataSource): string[] {
  const issues: string[] = [];

  if (!dataSource.payload.listName.trim()) {
    issues.push('Missing Trakt list name.');
  }
  if (!dataSource.payload.listSlug.trim()) {
    issues.push('Missing Trakt list slug.');
  }
  if (!dataSource.payload.username.trim()) {
    issues.push('Missing Trakt username.');
  }
  if (dataSource.payload.traktId === null || dataSource.payload.traktId === '') {
    issues.push('Missing Trakt ID.');
  }

  return issues;
}

export function countTraktWarningsInDataSource(dataSource: WidgetDataSource): number {
  if (!isNativeTraktDataSource(dataSource)) {
    return 0;
  }
  return getTraktValidationIssues(dataSource).length;
}

export function countInvalidCatalogsInItem(
  item: CollectionItem,
  catalogs: AIOMetadataCatalog[]
): number {
  if (item.dataSources.length === 0) {
    return 1;
  }

  return item.dataSources.filter((dataSource) => isInvalidCatalogDataSource(dataSource, catalogs)).length;
}

export function countTraktWarningsInItem(item: CollectionItem): number {
  return item.dataSources.reduce((sum, dataSource) => sum + countTraktWarningsInDataSource(dataSource), 0);
}

export function countInvalidCatalogsInWidget(
  widget: Widget,
  catalogs: AIOMetadataCatalog[]
): number {
  if (widget.type === 'row.classic') {
    return isInvalidCatalogDataSource(widget.dataSource, catalogs) ? 1 : 0;
  }

  return widget.dataSource.payload.items.reduce(
    (sum, item) => sum + countInvalidCatalogsInItem(item, catalogs),
    0
  );
}

export function countTraktWarningsInWidget(widget: Widget): number {
  if (widget.type === 'row.classic') {
    return countTraktWarningsInDataSource(widget.dataSource);
  }

  return widget.dataSource.payload.items.reduce(
    (sum, item) => sum + countTraktWarningsInItem(item),
    0
  );
}
