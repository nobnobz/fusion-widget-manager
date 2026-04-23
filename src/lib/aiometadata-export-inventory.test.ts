import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectAiometadataExportInventory,
} from './aiometadata-export-inventory';
import { buildAiometadataCatalogExport, getDefaultAiometadataExportOverrides } from './aiometadata-export';
import type {
  AIOMetadataCatalog,
  AIOMetadataDataSource,
  CollectionRowWidget,
  FusionWidgetsConfig,
  NativeTraktDataSource,
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

function buildTraktDataSource(overrides: Partial<NativeTraktDataSource['payload']> = {}): NativeTraktDataSource {
  return {
    sourceType: 'trakt-native',
    kind: 'traktList',
    payload: {
      listName: 'Trakt Catalog',
      listSlug: 'trakt-catalog',
      traktId: 77,
      username: 'Trakt',
      ...overrides,
    },
  };
}

function buildRowWidget(overrides: Partial<RowClassicWidget> = {}): RowClassicWidget {
  return {
    id: 'row-1',
    title: 'Row Widget',
    type: 'row.classic',
    cacheTTL: 3600,
    limit: 20,
    presentation: {
      aspectRatio: 'poster',
      cardStyle: 'medium',
      badges: {
        providers: true,
        ratings: true,
      },
      backgroundImageURL: '',
    },
    dataSource: buildAioDataSource(),
    ...overrides,
  };
}

function buildCollectionWidget(overrides: Partial<CollectionRowWidget> = {}): CollectionRowWidget {
  return {
    id: 'collection-1',
    title: 'Collection Widget',
    type: 'collection.row',
    dataSource: {
      kind: 'collection',
      payload: {
        items: [
          {
            id: 'item-1',
            name: 'Item One',
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

test('collectAiometadataExportInventory groups exportable trakt and mdblist catalogs by widget and item', () => {
  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildRowWidget({
        id: 'row-trakt',
        title: 'Trakt Row',
        dataSource: buildTraktDataSource({ listName: 'Trakt Row Name', traktId: 12 }),
      }),
      buildCollectionWidget({
        dataSource: {
          kind: 'collection',
          payload: {
            items: [
              {
                id: 'item-mdblist',
                name: 'MDBList Item',
                hideTitle: false,
                layout: 'Poster',
                backgroundImageURL: '',
                dataSources: [buildAioDataSource({ catalogId: 'movie::mdblist.16267', catalogType: 'movie' })],
              },
            ],
          },
        },
      }),
    ])
  );

  assert.equal(inventory.catalogs.length, 2);
  assert.equal(inventory.widgets.length, 2);
  assert.equal(inventory.widgets[0]?.rowCatalogKeys.length, 1);
  assert.equal(inventory.widgets[1]?.items[0]?.catalogKeys.length, 1);
});

test('collectAiometadataExportInventory includes streaming catalogs', () => {
  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildRowWidget({
        id: 'row-streaming',
        title: 'Streaming Row',
        dataSource: buildAioDataSource({ catalogId: 'movie::streaming.sta', catalogType: 'movie' }),
      }),
      buildCollectionWidget({
        id: 'collection-streaming',
        title: 'Streaming Collection',
        dataSource: {
          kind: 'collection',
          payload: {
            items: [
              {
                id: 'item-streaming',
                name: 'Streaming Item',
                hideTitle: false,
                layout: 'Poster',
                backgroundImageURL: '',
                dataSources: [buildAioDataSource({ catalogId: 'series::streaming.nlz', catalogType: 'series' })],
              },
            ],
          },
        },
      }),
    ])
  );

  assert.deepEqual(
    inventory.catalogs.map((catalog) => ({
      id: catalog.entry.id,
      type: catalog.entry.type,
      source: catalog.entry.source,
    })),
    [
      { id: 'streaming.sta', type: 'movie', source: 'streaming' },
      { id: 'streaming.nlz', type: 'series', source: 'streaming' },
    ]
  );
});

test('collectAiometadataExportInventory includes AniList catalogs for AIOMetadata export', () => {
  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildRowWidget({
        id: 'row-anilist',
        title: 'AniList Row',
        dataSource: buildAioDataSource({ catalogId: 'anime::anilist.trending', catalogType: 'anime' }),
      }),
      buildCollectionWidget({
        id: 'collection-anilist',
        title: 'Anime Collection',
        dataSource: {
          kind: 'collection',
          payload: {
            items: [
              {
                id: 'item-anilist',
                name: 'Planning',
                hideTitle: false,
                layout: 'Poster',
                backgroundImageURL: '',
                dataSources: [buildAioDataSource({ catalogId: 'anime::anilist.animaechan.Planning', catalogType: 'anime' })],
              },
            ],
          },
        },
      }),
    ])
  );

  assert.deepEqual(
    inventory.catalogs.map((catalog) => ({
      id: catalog.entry.id,
      type: catalog.entry.type,
      source: catalog.entry.source,
      displayType: catalog.entry.displayType,
    })),
    [
      { id: 'anilist.trending', type: 'anime', source: 'anilist', displayType: 'anime' },
      { id: 'anilist.animaechan.Planning', type: 'anime', source: 'anilist', displayType: 'anime' },
    ]
  );

  const exported = buildAiometadataCatalogExport({ inventory, includeAll: true, exportedAt: '2026-04-10T21:47:25.719Z' });
  assert.deepEqual(exported.catalogs, [
    {
      id: 'anilist.trending',
      type: 'anime',
      name: '[Classic Row] AniList Row (Anime)  ',
      enabled: true,
      source: 'anilist',
      displayType: 'anime',
    },
    {
      id: 'anilist.animaechan.Planning',
      type: 'anime',
      name: '[Anime Collection] Planning (Anime)  ',
      enabled: true,
      source: 'anilist',
      displayType: 'anime',
    },
  ]);
});

test('collectAiometadataExportInventory includes letterboxd catalogs and keeps them movie-only', () => {
  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildRowWidget({
        id: 'row-letterboxd',
        title: 'Letterboxd Row',
        dataSource: buildAioDataSource({ catalogId: 'movie::letterboxd.nVqt6', catalogType: 'movie' }),
      }),
      buildCollectionWidget({
        id: 'collection-letterboxd',
        title: 'Letterboxd Collection',
        dataSource: {
          kind: 'collection',
          payload: {
            items: [
              {
                id: 'item-letterboxd',
                name: 'Fans',
                hideTitle: false,
                layout: 'Poster',
                backgroundImageURL: '',
                dataSources: [buildAioDataSource({ catalogId: 'series::letterboxd.5zIiY', catalogType: 'series' })],
              },
            ],
          },
        },
      }),
    ])
  );

  assert.deepEqual(
    inventory.catalogs.map((catalog) => ({
      id: catalog.entry.id,
      type: catalog.entry.type,
      source: catalog.entry.source,
    })),
    [
      { id: 'letterboxd.nVqt6', type: 'movie', source: 'letterboxd' },
      { id: 'letterboxd.5zIiY', type: 'movie', source: 'letterboxd' },
    ]
  );
});

test('collectAiometadataExportInventory includes AIOMetadata trakt catalogs without treating them as native bridge sources', () => {
  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildRowWidget({
        id: 'row-trakt-aiom',
        title: 'Imported Trakt Row',
        dataSource: buildAioDataSource({ catalogId: 'all::trakt.list.42', catalogType: 'all' }),
      }),
      buildCollectionWidget({
        id: 'collection-trakt-aiom',
        title: 'Imported Trakt Collection',
        dataSource: {
          kind: 'collection',
          payload: {
            items: [
              {
                id: 'item-trakt-aiom',
                name: 'Imported Trakt Item',
                hideTitle: false,
                layout: 'Poster',
                backgroundImageURL: '',
                dataSources: [buildAioDataSource({ catalogId: 'movie::trakt.anticipated', catalogType: 'movie' })],
              },
            ],
          },
        },
      }),
    ])
  );

  assert.deepEqual(
    inventory.catalogs.map((catalog) => ({
      id: catalog.entry.id,
      type: catalog.entry.type,
      source: catalog.entry.source,
    })),
    [
      { id: 'trakt.list.42', type: 'all', source: 'trakt' },
      { id: 'trakt.anticipated', type: 'movie', source: 'trakt' },
    ]
  );
});

test('collectAiometadataExportInventory re-adds movie labels for synced trakt catalogs when manifest names imply them', () => {
  const manifestCatalogs: AIOMetadataCatalog[] = [
    {
      id: 'trakt.anticipated',
      name: 'Anticipated Movies',
      type: 'movie',
      displayType: 'movie',
    },
  ];

  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildRowWidget({
        id: 'row-trakt-aiom',
        title: 'Anticipated',
        dataSource: buildAioDataSource({ catalogId: 'movie::trakt.anticipated', catalogType: 'movie' }),
      }),
    ]),
    { manifestCatalogs }
  );

  assert.equal(inventory.catalogs[0]?.entry.name, '[Classic Row] Anticipated (Movies) ');
});

test('collectAiometadataExportInventory re-adds show labels for synced letterboxd catalogs when manifest names imply them', () => {
  const manifestCatalogs: AIOMetadataCatalog[] = [
    {
      id: 'letterboxd.5zIiY',
      name: 'Fan Favorites Series',
      type: 'series',
      displayType: 'series',
    },
  ];

  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildCollectionWidget({
        id: 'collection-letterboxd',
        title: 'Letterboxd Collection',
        dataSource: {
          kind: 'collection',
          payload: {
            items: [
              {
                id: 'item-letterboxd',
                name: 'Fan Favorites',
                hideTitle: false,
                layout: 'Poster',
                backgroundImageURL: '',
                dataSources: [buildAioDataSource({ catalogId: 'series::letterboxd.5zIiY', catalogType: 'series' })],
              },
            ],
          },
        },
      }),
    ]),
    { manifestCatalogs }
  );

  assert.equal(inventory.catalogs[0]?.entry.name, '[Letterboxd Collection] Fan Favorites (Shows)');
});

test('collectAiometadataExportInventory can filter to catalogs missing from the manifest', () => {
  const manifestCatalogs: AIOMetadataCatalog[] = [
    {
      id: 'mdblist.16267',
      name: 'Existing MDBList',
      type: 'movie',
      displayType: 'movie',
    },
  ];

  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildRowWidget({
        id: 'row-trakt',
        title: 'Trakt Row',
        dataSource: buildTraktDataSource({ listName: 'Trakt Row Name', traktId: 12 }),
      }),
      buildRowWidget({
        id: 'row-mdblist',
        title: 'MDBList Row',
        dataSource: buildAioDataSource({ catalogId: 'movie::mdblist.16267', catalogType: 'movie' }),
      }),
    ]),
    {
      manifestCatalogs,
      onlyNewAgainstManifest: true,
    }
  );

  assert.deepEqual(
    inventory.catalogs.map((catalog) => catalog.entry.id),
    ['trakt.list.12']
  );
});

test('collectAiometadataExportInventory treats unified mdblist catalogs as already present in matching manifests', () => {
  const manifestCatalogs: AIOMetadataCatalog[] = [
    {
      id: 'mdblist.nobnobz.netflix.unified',
      name: '[Service] Netflix',
      type: 'all',
      metadata: {
        itemCount: 2000,
      },
    },
  ];

  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildRowWidget({
        id: 'row-mdblist-unified',
        title: 'Unified Row',
        dataSource: buildAioDataSource({
          catalogId: 'all::mdblist.nobnobz.netflix.unified',
          catalogType: 'series',
        }),
      }),
    ]),
    { manifestCatalogs }
  );

  assert.equal(inventory.catalogs[0]?.isAlreadyInManifest, true);
  assert.deepEqual(inventory.catalogs[0]?.entry.metadata, {
    unified: true,
    username: 'nobnobz',
    listSlug: 'netflix',
    author: 'nobnobz',
    url: 'https://mdblist.com/lists/nobnobz/netflix',
    itemCount: 2000,
  });
});

test('buildAiometadataCatalogExport emits only the selected deduplicated catalogs', () => {
  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildRowWidget({
        id: 'row-mdblist',
        title: 'MDBList Row',
        dataSource: buildAioDataSource({ catalogId: 'movie::mdblist.16267', catalogType: 'movie' }),
      }),
      buildRowWidget({
        id: 'row-trakt',
        title: 'Trakt Row',
        dataSource: buildTraktDataSource({ listName: 'Trakt Row Name', traktId: 12 }),
      }),
    ])
  );

  const exported = buildAiometadataCatalogExport({
    inventory,
    selectedCatalogKeys: inventory.catalogs
      .filter((catalog) => catalog.entry.source === 'trakt')
      .map((catalog) => catalog.key),
    exportedAt: '2026-03-26T18:41:10.859Z',
  });

  assert.deepEqual(exported, {
    version: 1,
    exportedAt: '2026-03-26T18:41:10.859Z',
    catalogs: [
      {
        id: 'trakt.list.12',
        type: 'all',
        name: '[Classic Row] Trakt Row',
        enabled: true,
        source: 'trakt',
        displayType: 'all',
        sort: 'default',
        sortDirection: 'asc',
        cacheTTL: 43200,
      },
    ],
  });
});

test('collectAiometadataExportInventory uses stable item fallback labels and derived catalog names', () => {
  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildCollectionWidget({
        title: 'Streaming Services',
        dataSource: {
          kind: 'collection',
          payload: {
            items: [
              {
                id: 'item-blank',
                name: '',
                hideTitle: false,
                layout: 'Poster',
                backgroundImageURL: '',
                dataSources: [
                  buildAioDataSource({ catalogId: 'movie::mdblist.16267', catalogType: 'movie' }),
                  buildAioDataSource({ catalogId: 'movie::mdblist.16268', catalogType: 'movie' }),
                ],
              },
            ],
          },
        },
      }),
    ])
  );

  assert.equal(inventory.widgets[0]?.items[0]?.itemName, 'Item 1');
  assert.deepEqual(
    inventory.catalogs.map((catalog) => catalog.entry.name),
    ['[Streaming Services] Item 1 (Movies) ', '[Streaming Services] Item 1 (Movies) ']
  );
});

test('collectAiometadataExportInventory reads collection item titles from exported fusion payloads', () => {
  const inventory = collectAiometadataExportInventory({
    exportType: 'fusionWidgets',
    exportVersion: 1,
    widgets: [
      {
        id: 'collection-1',
        title: 'Streaming Services',
        type: 'collection.row',
        dataSource: {
          kind: 'collection',
          payload: {
            items: [
              {
                id: 'item-7',
                title: 'Hunger Games',
                hideTitle: false,
                imageAspect: 'poster',
                dataSources: [
                  buildAioDataSource({ catalogId: 'movie::mdblist.2410', catalogType: 'movie' }),
                ],
              },
            ],
          },
        },
      } as unknown as Widget,
    ],
  });

  assert.equal(inventory.widgets[0]?.items[0]?.itemName, 'Hunger Games');
  assert.equal(inventory.catalogs[0]?.entry.name, '[Streaming Services] Hunger Games (Movies) ');
});

test('collectAiometadataExportInventory sorts catalogs by widget order and alphabetically within each widget', () => {
  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildRowWidget({
        id: 'collections-widget',
        title: 'Collections',
        dataSource: buildAioDataSource({ catalogId: 'movie::mdblist.300', catalogType: 'movie' }),
      }),
      buildCollectionWidget({
        id: 'discover-widget',
        title: 'Discover',
        dataSource: {
          kind: 'collection',
          payload: {
            items: [
              {
                id: 'discover-b',
                name: 'Zeta',
                hideTitle: false,
                layout: 'Poster',
                backgroundImageURL: '',
                dataSources: [buildAioDataSource({ catalogId: 'movie::mdblist.2', catalogType: 'movie' })],
              },
              {
                id: 'discover-a',
                name: 'Alpha',
                hideTitle: false,
                layout: 'Poster',
                backgroundImageURL: '',
                dataSources: [buildAioDataSource({ catalogId: 'movie::mdblist.1', catalogType: 'movie' })],
              },
            ],
          },
        },
      }),
    ])
  );

  assert.deepEqual(
    inventory.catalogs.map((catalog) => catalog.entry.name),
    [
      '[Classic Row] Collections (Movies) ',
      '[Discover] Alpha (Movies) ',
      '[Discover] Zeta (Movies) ',
    ]
  );
});

test('buildAiometadataCatalogExport numbers duplicate final names using omni whitespace semantics', () => {
  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildCollectionWidget({
        title: 'Discover',
        dataSource: {
          kind: 'collection',
          payload: {
            items: [
              {
                id: 'dup-item',
                name: 'Latest Movies',
                hideTitle: false,
                layout: 'Poster',
                backgroundImageURL: '',
                dataSources: [
                  buildAioDataSource({ catalogId: 'movie::mdblist.1', catalogType: 'movie' }),
                  buildAioDataSource({ catalogId: 'movie::mdblist.2', catalogType: 'movie' }),
                ],
              },
            ],
          },
        },
      }),
    ])
  );

  const exported = buildAiometadataCatalogExport({
    inventory,
    includeAll: true,
    exportedAt: '2026-03-26T18:41:10.859Z',
  });

  assert.deepEqual(
    exported.catalogs.map((catalog) => catalog.name),
    [
      '[Discover] Latest Movies (Movies) ',
      '[Discover] Latest Movies (Movies) 2',
    ]
  );
});

test('getDefaultAiometadataExportOverrides applies UME rules to supported sources and ignores simkl', () => {
  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildCollectionWidget({
        title: 'Streaming Services',
        dataSource: {
          kind: 'collection',
          payload: {
            items: [
              {
                id: 'service-item',
                name: 'IMDb Top Movies',
                hideTitle: false,
                layout: 'Poster',
                backgroundImageURL: '',
                dataSources: [
                  buildAioDataSource({ catalogId: 'movie::mdblist.301', catalogType: 'movie' }),
                  buildAioDataSource({ catalogId: 'movie::streaming.nlz', catalogType: 'movie' }),
                  buildAioDataSource({ catalogId: 'movie::simkl.animated', catalogType: 'movie' }),
                ],
              },
            ],
          },
        },
      }),
    ])
  );

  const overrides = getDefaultAiometadataExportOverrides({
    inventory,
    currentOverrides: {
      widgets: {},
      items: {},
      catalogs: {},
    },
  });

  const mdblistCatalog = inventory.catalogs.find((catalog) => catalog.source === 'mdblist');
  const streamingCatalog = inventory.catalogs.find((catalog) => catalog.source === 'streaming');
  const simklCatalog = inventory.catalogs.find((catalog) => catalog.source === 'simkl');

  assert.deepEqual(
    overrides.catalogs[mdblistCatalog?.key || ''],
    {
      sort: 'random',
      order: 'asc',
      cacheTTL: 43200,
    }
  );
  assert.equal(overrides.catalogs[streamingCatalog?.key || ''], undefined);
  assert.equal(overrides.catalogs[simklCatalog?.key || ''], undefined);
});

test('getDefaultAiometadataExportOverrides ignores letterboxd catalogs', () => {
  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildRowWidget({
        id: 'row-letterboxd',
        title: 'Letterboxd Row',
        dataSource: buildAioDataSource({ catalogId: 'movie::letterboxd.nVqt6', catalogType: 'movie' }),
      }),
    ])
  );

  const overrides = getDefaultAiometadataExportOverrides({
    inventory,
    currentOverrides: {
      widgets: {},
      items: {},
      catalogs: {},
    },
  });

  const letterboxdCatalog = inventory.catalogs.find((catalog) => catalog.source === 'letterboxd');
  assert.equal(overrides.catalogs[letterboxdCatalog?.key || ''], undefined);
});
