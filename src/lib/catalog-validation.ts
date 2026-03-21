import { findCatalog } from './config-utils';
import type {
  AddonCatalogDataSource,
  AIOMetadataCatalog,
  CollectionItem,
  Widget,
} from './types/widget';

export function isInvalidCatalogDataSource(
  dataSource: AddonCatalogDataSource,
  catalogs: AIOMetadataCatalog[]
): boolean {
  const catalogId = dataSource.payload?.catalogId?.trim();
  if (!catalogId) {
    return true;
  }

  if (catalogs.length === 0) {
    return false;
  }

  return !findCatalog(catalogs, catalogId);
}

export function countInvalidCatalogsInItem(
  item: CollectionItem,
  catalogs: AIOMetadataCatalog[]
): number {
  return item.dataSources.filter((dataSource) => isInvalidCatalogDataSource(dataSource, catalogs)).length;
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
