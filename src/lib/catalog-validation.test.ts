import test from 'node:test';
import assert from 'node:assert/strict';
import type { AIOMetadataCatalog, CollectionItem, Widget } from './types/widget';
import {
  countInvalidCatalogsInItem,
  countInvalidCatalogsInWidget,
  isInvalidCatalogDataSource,
} from './catalog-validation';

const catalogs: AIOMetadataCatalog[] = [
  { id: 'valid-movie', name: 'Valid Movie', type: 'movie', displayType: 'movie' },
  { id: 'valid-series', name: 'Valid Series', type: 'series', displayType: 'series' },
];

test('isInvalidCatalogDataSource flags empty catalog ids', () => {
  assert.equal(
    isInvalidCatalogDataSource(
      {
        kind: 'addonCatalog',
        payload: {
          addonId: 'https://example.com/manifest.json',
          catalogId: '',
          catalogType: 'movie',
        },
      },
      catalogs
    ),
    true
  );
});

test('isInvalidCatalogDataSource flags catalog ids missing from manifest', () => {
  assert.equal(
    isInvalidCatalogDataSource(
      {
        kind: 'addonCatalog',
        payload: {
          addonId: 'https://example.com/manifest.json',
          catalogId: 'series::missing-series',
          catalogType: 'series',
        },
      },
      catalogs
    ),
    true
  );
});

test('invalid catalog counts propagate from item to widget', () => {
  const item: CollectionItem = {
    id: 'item-1',
    name: 'Mixed Sources',
    hideTitle: false,
    layout: 'Wide',
    backgroundImageURL: '',
    dataSources: [
      {
        kind: 'addonCatalog',
        payload: {
          addonId: 'https://example.com/manifest.json',
          catalogId: 'movie::valid-movie',
          catalogType: 'movie',
        },
      },
      {
        kind: 'addonCatalog',
        payload: {
          addonId: 'https://example.com/manifest.json',
          catalogId: 'series::missing-series',
          catalogType: 'series',
        },
      },
    ],
  };

  const widget: Widget = {
    id: 'widget-1',
    title: 'Collection',
    type: 'collection.row',
    dataSource: {
      kind: 'collection',
      payload: {
        items: [item],
      },
    },
  };

  assert.equal(countInvalidCatalogsInItem(item, catalogs), 1);
  assert.equal(countInvalidCatalogsInWidget(widget, catalogs), 1);
});
