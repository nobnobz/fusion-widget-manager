import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiometadataLetterboxdCatalogsOnlyExport,
  collectUsedLetterboxdCatalogs,
  hasUsedLetterboxdCatalogs,
} from './letterboxd-catalog-export';
import type {
  AIOMetadataCatalog,
  AIOMetadataDataSource,
  CollectionRowWidget,
  FusionWidgetsConfig,
  RowClassicWidget,
  Widget,
} from './types/widget';

function buildAioDataSource(overrides: Partial<AIOMetadataDataSource['payload']> = {}): AIOMetadataDataSource {
  return {
    sourceType: 'aiometadata',
    kind: 'addonCatalog',
    payload: {
      addonId: 'https://example.com/manifest.json',
      catalogId: 'movie::catalog-one',
      catalogType: 'movie',
      ...overrides,
    },
  };
}

function buildRowWidget(overrides: Partial<RowClassicWidget> = {}): RowClassicWidget {
  return {
    id: 'row-1',
    title: 'Letterboxd Row',
    type: 'row.classic',
    cacheTTL: 3600,
    limit: 20,
    presentation: {
      aspectRatio: 'poster',
      cardStyle: 'medium',
      badges: { providers: true, ratings: true },
      backgroundImageURL: '',
    },
    dataSource: buildAioDataSource(),
    ...overrides,
  };
}

function buildCollectionWidget(overrides: Partial<CollectionRowWidget> = {}): CollectionRowWidget {
  return {
    id: 'collection-1',
    title: 'Letterboxd Collection',
    type: 'collection.row',
    dataSource: {
      kind: 'collection',
      payload: {
        items: [
          {
            id: 'item-1',
            name: 'Letterboxd Item',
            hideTitle: false,
            layout: 'Poster',
            backgroundImageURL: '',
            dataSources: [buildAioDataSource()],
          },
        ],
      },
    },
    ...overrides,
  };
}

function buildConfig(widgets: Widget[]): FusionWidgetsConfig {
  return {
    exportType: 'fusionWidgets',
    exportVersion: 1,
    widgets,
  };
}

test('buildAiometadataLetterboxdCatalogsOnlyExport emits used letterboxd catalogs', () => {
  const config = buildConfig([
    buildRowWidget({
      title: 'Top 250 Films with the Most Fans',
      dataSource: buildAioDataSource({
        catalogId: 'movie::letterboxd.nVqt6',
        catalogType: 'movie',
      }),
    }),
  ]);

  const exported = buildAiometadataLetterboxdCatalogsOnlyExport(config, [], '2026-04-02T08:00:00.000Z');
  assert.deepEqual(exported, {
    version: 1,
    exportedAt: '2026-04-02T08:00:00.000Z',
    catalogs: [
      {
        id: 'letterboxd.nVqt6',
        type: 'movie',
        name: '[Top 250 Films with the Most Fans] Top 250 Films with the Most Fans Movies',
        enabled: true,
        source: 'letterboxd',
        displayType: 'movie',
        cacheTTL: 43200,
      },
    ],
  });
});

test('buildAiometadataLetterboxdCatalogsOnlyExport exports collection item references', () => {
  const config = buildConfig([
    buildCollectionWidget({
      title: 'Discover',
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-1',
              name: 'Shows',
              hideTitle: false,
              layout: 'Poster',
              backgroundImageURL: '',
              dataSources: [buildAioDataSource({ catalogId: 'movie::letterboxd.5zIiY', catalogType: 'movie' })],
            },
          ],
        },
      },
    }),
  ]);

  const exported = buildAiometadataLetterboxdCatalogsOnlyExport(config, [], '2026-04-02T08:00:00.000Z');
  assert.equal(exported.catalogs[0]?.id, 'letterboxd.5zIiY');
  assert.equal(exported.catalogs[0]?.type, 'movie');
  assert.equal(exported.catalogs[0]?.source, 'letterboxd');
  assert.equal(exported.catalogs[0]?.cacheTTL, 43200);
});

test('buildAiometadataLetterboxdCatalogsOnlyExport prefers manifest names', () => {
  const manifestCatalogs: AIOMetadataCatalog[] = [
    {
      id: 'letterboxd.nVqt6',
      name: 'Manifest Name',
      type: 'movie',
      displayType: 'movie',
    },
  ];

  const config = buildConfig([
    buildRowWidget({
      title: 'My Widget',
      dataSource: buildAioDataSource({
        catalogId: 'movie::letterboxd.nVqt6',
        catalogType: 'movie',
      }),
    }),
  ]);

  const exported = buildAiometadataLetterboxdCatalogsOnlyExport(config, manifestCatalogs, '2026-04-02T08:00:00.000Z');
  assert.equal(exported.catalogs[0]?.name, '[My Widget] Manifest Name');
});

test('buildAiometadataLetterboxdCatalogsOnlyExport deduplicates and filters against manifest', () => {
  const manifestCatalogs: AIOMetadataCatalog[] = [
    {
      id: 'letterboxd.nVqt6',
      name: 'Existing',
      type: 'movie',
      displayType: 'movie',
    },
  ];

  const config = buildConfig([
    buildRowWidget({
      id: 'row-1',
      title: 'First',
      dataSource: buildAioDataSource({ catalogId: 'movie::letterboxd.nVqt6', catalogType: 'movie' }),
    }),
    buildRowWidget({
      id: 'row-2',
      title: 'Second',
      dataSource: buildAioDataSource({ catalogId: 'movie::letterboxd.nVqt6', catalogType: 'movie' }),
    }),
    buildRowWidget({
      id: 'row-3',
      title: 'Third',
      dataSource: buildAioDataSource({ catalogId: 'movie::letterboxd.5zIiY', catalogType: 'movie' }),
    }),
  ]);

  const exported = buildAiometadataLetterboxdCatalogsOnlyExport(
    config,
    manifestCatalogs,
    '2026-04-02T08:00:00.000Z',
    { onlyNewAgainstManifest: true }
  );

  assert.deepEqual(exported.catalogs.map((catalog) => catalog.id), ['letterboxd.5zIiY']);
});

test('collectUsedLetterboxdCatalogs forces movie type even for series-prefixed IDs', () => {
  const config = buildConfig([
    buildRowWidget({
      title: 'Series-ish',
      dataSource: buildAioDataSource({
        catalogId: 'series::letterboxd.5zIiY',
        catalogType: 'series',
      }),
    }),
  ]);

  const references = collectUsedLetterboxdCatalogs(config);
  assert.equal(references.length, 1);
  assert.equal(references[0]?.id, 'letterboxd.5zIiY');
  assert.equal(references[0]?.type, 'movie');
  assert.equal(references[0]?.displayType, 'movie');
});

test('collectUsedLetterboxdCatalogs ignores non-letterboxd sources', () => {
  const config = buildConfig([
    buildRowWidget({
      dataSource: buildAioDataSource({
        catalogId: 'movie::mdblist.trending',
        catalogType: 'movie',
      }),
    }),
  ]);

  assert.equal(hasUsedLetterboxdCatalogs(config), false);
  assert.deepEqual(collectUsedLetterboxdCatalogs(config), []);
});
