import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiometadataSimklCatalogsOnlyExport,
  collectUsedSimklCatalogs,
  hasUsedSimklCatalogs,
} from './simkl-catalog-export';
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
    title: 'Simkl Row',
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
    title: 'Collection',
    type: 'collection.row',
    dataSource: {
      kind: 'collection',
      payload: {
        items: [
          {
            id: 'item-1',
            name: 'Simkl Item',
            hideTitle: false,
            layout: 'Wide',
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

test('buildAiometadataSimklCatalogsOnlyExport emits used simkl catalogs', () => {
  const config = buildConfig([
    buildRowWidget({
      title: 'Simkl Trending Movies',
      dataSource: buildAioDataSource({
        catalogId: 'movie::simkl.trending.movies',
        catalogType: 'movie',
      }),
    }),
  ]);

  const exported = buildAiometadataSimklCatalogsOnlyExport(config, [], '2026-03-31T08:00:00.000Z');
  assert.deepEqual(exported, {
    version: 1,
    exportedAt: '2026-03-31T08:00:00.000Z',
    catalogs: [
      {
        id: 'simkl.trending.movies',
        type: 'movie',
        name: '[Simkl Trending Movies] Simkl Trending Movies',
        enabled: true,
        source: 'simkl',
        displayType: 'movie',
      },
    ],
  });
});

test('buildAiometadataSimklCatalogsOnlyExport handles series type simkl catalog', () => {
  const config = buildConfig([
    buildRowWidget({
      id: 'row-shows',
      title: 'Simkl Trending Shows',
      dataSource: buildAioDataSource({
        catalogId: 'series::simkl.trending.shows',
        catalogType: 'series',
      }),
    }),
  ]);

  const exported = buildAiometadataSimklCatalogsOnlyExport(config, [], '2026-03-31T08:00:00.000Z');
  assert.equal(exported.catalogs.length, 1);
  assert.equal(exported.catalogs[0]?.id, 'simkl.trending.shows');
  assert.equal(exported.catalogs[0]?.type, 'series');
  assert.equal(exported.catalogs[0]?.source, 'simkl');
});

test('buildAiometadataSimklCatalogsOnlyExport prefers manifest catalog names', () => {
  const manifestCatalogs: AIOMetadataCatalog[] = [
    {
      id: 'simkl.trending.movies',
      name: 'Simkl Trending',
      type: 'movie',
      displayType: 'movie',
    },
  ];

  const config = buildConfig([
    buildRowWidget({
      title: 'My Widget',
      dataSource: buildAioDataSource({
        catalogId: 'movie::simkl.trending.movies',
        catalogType: 'movie',
      }),
    }),
  ]);

  const exported = buildAiometadataSimklCatalogsOnlyExport(config, manifestCatalogs, '2026-03-31T08:00:00.000Z');
  assert.equal(exported.catalogs.length, 1);
  assert.equal(exported.catalogs[0]?.name, '[My Widget] Simkl Trending');
});

test('buildAiometadataSimklCatalogsOnlyExport deduplicates across widgets', () => {
  const config = buildConfig([
    buildRowWidget({
      id: 'row-1',
      title: 'First Widget',
      dataSource: buildAioDataSource({
        catalogId: 'movie::simkl.trending.movies',
        catalogType: 'movie',
      }),
    }),
    buildRowWidget({
      id: 'row-2',
      title: 'Second Widget',
      dataSource: buildAioDataSource({
        catalogId: 'movie::simkl.trending.movies',
        catalogType: 'movie',
      }),
    }),
  ]);

  const exported = buildAiometadataSimklCatalogsOnlyExport(config, [], '2026-03-31T08:00:00.000Z');
  assert.equal(exported.catalogs.length, 1);
});

test('buildAiometadataSimklCatalogsOnlyExport filters catalogs already in manifest', () => {
  const manifestCatalogs: AIOMetadataCatalog[] = [
    {
      id: 'simkl.trending.movies',
      name: 'Already Synced',
      type: 'movie',
      displayType: 'movie',
    },
  ];

  const config = buildConfig([
    buildRowWidget({
      title: 'Existing',
      dataSource: buildAioDataSource({
        catalogId: 'movie::simkl.trending.movies',
        catalogType: 'movie',
      }),
    }),
    buildRowWidget({
      id: 'row-2',
      title: 'New Shows',
      dataSource: buildAioDataSource({
        catalogId: 'series::simkl.trending.shows',
        catalogType: 'series',
      }),
    }),
  ]);

  const exported = buildAiometadataSimklCatalogsOnlyExport(
    config,
    manifestCatalogs,
    '2026-03-31T08:00:00.000Z',
    { onlyNewAgainstManifest: true }
  );

  assert.equal(exported.catalogs.length, 1);
  assert.equal(exported.catalogs[0]?.id, 'simkl.trending.shows');
});

test('collectUsedSimklCatalogs ignores non-simkl aiometadata sources', () => {
  const config = buildConfig([
    buildRowWidget({
      dataSource: buildAioDataSource({
        catalogId: 'movie::mdblist.trending',
        catalogType: 'movie',
      }),
    }),
    buildRowWidget({
      id: 'row-2',
      dataSource: buildAioDataSource({
        catalogId: 'movie::trakt.popular',
        catalogType: 'movie',
      }),
    }),
  ]);

  assert.equal(hasUsedSimklCatalogs(config), false);
  assert.deepEqual(collectUsedSimklCatalogs(config), []);
});

test('collectUsedSimklCatalogs collects from collection.row items', () => {
  const config = buildConfig([
    buildCollectionWidget({
      title: 'My Collection',
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-trending',
              name: 'Trending',
              hideTitle: false,
              layout: 'Poster',
              backgroundImageURL: '',
              dataSources: [
                buildAioDataSource({
                  catalogId: 'movie::simkl.trending.movies',
                  catalogType: 'movie',
                }),
                buildAioDataSource({
                  catalogId: 'series::simkl.trending.shows',
                  catalogType: 'series',
                }),
              ],
            },
          ],
        },
      },
    }),
  ]);

  assert.equal(hasUsedSimklCatalogs(config), true);
  const references = collectUsedSimklCatalogs(config);
  assert.equal(references.length, 2);
  assert.deepEqual(
    references.map((r) => ({ id: r.id, type: r.type })),
    [
      { id: 'simkl.trending.movies', type: 'movie' },
      { id: 'simkl.trending.shows', type: 'series' },
    ]
  );
});

test('collectUsedSimklCatalogs collects simkl.watchlist catalog', () => {
  const config = buildConfig([
    buildRowWidget({
      id: 'row-watchlist',
      title: 'My Watchlist',
      dataSource: buildAioDataSource({
        catalogId: 'movie::simkl.watchlist.movies.plantowatch',
        catalogType: 'movie',
      }),
    }),
  ]);

  assert.equal(hasUsedSimklCatalogs(config), true);
  const references = collectUsedSimklCatalogs(config);
  assert.equal(references.length, 1);
  assert.equal(references[0]?.id, 'simkl.watchlist.movies.plantowatch');
  assert.equal(references[0]?.type, 'movie');
});
