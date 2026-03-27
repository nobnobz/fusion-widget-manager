import test from 'node:test';
import assert from 'node:assert/strict';
import type { AIOMetadataCatalog, CollectionItem, Widget } from './types/widget';
import {
  countInvalidCatalogsInItem,
  countTraktWarningsInItem,
  countTraktWarningsInWidget,
  getTraktValidationIssues,
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
        sourceType: 'aiometadata',
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
        sourceType: 'aiometadata',
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
        sourceType: 'aiometadata',
        kind: 'addonCatalog',
        payload: {
          addonId: 'https://example.com/manifest.json',
          catalogId: 'movie::valid-movie',
          catalogType: 'movie',
        },
      },
      {
        sourceType: 'aiometadata',
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

test('native trakt sources do not count as invalid AIOMetadata catalogs', () => {
  const item: CollectionItem = {
    id: 'item-trakt',
    name: 'Native Trakt',
    hideTitle: false,
    layout: 'Wide',
    backgroundImageURL: '',
    dataSources: [
      {
        sourceType: 'trakt-native',
        kind: 'traktList',
        payload: {
          listName: 'Rush Hour Collection',
          listSlug: 'rush-hour-collection',
          traktId: 197,
          username: 'Trakt',
        },
      },
    ],
  };

  assert.equal(countInvalidCatalogsInItem(item, catalogs), 0);
});

test('items without any catalogs count as a catalog issue', () => {
  const item: CollectionItem = {
    id: 'item-empty',
    name: 'Empty Item',
    hideTitle: false,
    layout: 'Wide',
    backgroundImageURL: '',
    dataSources: [],
  };

  const widget: Widget = {
    id: 'widget-empty',
    title: 'Empty Collection',
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

test('getTraktValidationIssues reports incomplete native trakt payloads', () => {
  const issues = getTraktValidationIssues({
    sourceType: 'trakt-native',
    kind: 'traktList',
    payload: {
      listName: '',
      listSlug: '',
      traktId: null,
      username: '',
    },
  });

  assert.equal(issues.length, 4);
});

test('trakt warning counts stay separate from AIOMetadata mismatch counts', () => {
  const item: CollectionItem = {
    id: 'item-mixed',
    name: 'Mixed Sources',
    hideTitle: false,
    layout: 'Poster',
    backgroundImageURL: '',
    dataSources: [
      {
        sourceType: 'aiometadata',
        kind: 'addonCatalog',
        payload: {
          addonId: 'https://example.com/manifest.json',
          catalogId: 'series::missing-series',
          catalogType: 'series',
        },
      },
      {
        sourceType: 'trakt-native',
        kind: 'traktList',
        payload: {
          listName: 'Incomplete',
          listSlug: '',
          traktId: null,
          username: 'Donxy',
        },
      },
    ],
  };

  const widget: Widget = {
    id: 'widget-mixed',
    title: 'Mixed Widget',
    type: 'collection.row',
    dataSource: {
      kind: 'collection',
      payload: {
        items: [item],
      },
    },
  };

  assert.equal(countInvalidCatalogsInItem(item, catalogs), 1);
  assert.equal(countTraktWarningsInItem(item), 2);
  assert.equal(countInvalidCatalogsInWidget(widget, catalogs), 1);
  assert.equal(countTraktWarningsInWidget(widget), 2);
});
