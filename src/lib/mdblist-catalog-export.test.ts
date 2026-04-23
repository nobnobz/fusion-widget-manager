import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiometadataMdblistCatalogsOnlyExport,
  collectUsedMdblistCatalogs,
  hasUsedMdblistCatalogs,
} from './mdblist-catalog-export';
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
    title: 'MDBList Row',
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
    title: 'Collection',
    type: 'collection.row',
    dataSource: {
      kind: 'collection',
      payload: {
        items: [
          {
            id: 'item-1',
            name: 'MDBList Item',
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

test('buildAiometadataMdblistCatalogsOnlyExport emits used mdblist catalogs', () => {
  const config = buildConfig([
    buildRowWidget({
      title: '[Header] Movies for Header',
      dataSource: buildAioDataSource({
        catalogId: 'movie::mdblist.16267',
        catalogType: 'movie',
      }),
    }),
  ]);

  const exported = buildAiometadataMdblistCatalogsOnlyExport(config, [], '2026-03-26T18:41:10.859Z');
  assert.deepEqual(exported, {
    version: 1,
    exportedAt: '2026-03-26T18:41:10.859Z',
    catalogs: [
      {
        id: 'mdblist.16267',
        type: 'movie',
        name: '[Header] Movies for Header',
        enabled: true,
        source: 'mdblist',
        displayType: 'movie',
      },
    ],
  });
});

test('buildAiometadataMdblistCatalogsOnlyExport emits unified mdblist catalogs with aiometadata metadata', () => {
  const manifestCatalogs: AIOMetadataCatalog[] = [
    {
      id: 'mdblist.nobnobz.netflix.unified',
      name: '[Service] Netflix',
      type: 'all',
      displayType: 'series',
      metadata: {
        itemCount: 2000,
      },
    },
  ];

  const config = buildConfig([
    buildCollectionWidget({
      title: 'Streaming Services',
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-netflix',
              name: 'Netflix',
              hideTitle: false,
              layout: 'Wide',
              backgroundImageURL: '',
              dataSources: [
                buildAioDataSource({
                  catalogId: 'all::mdblist.nobnobz.netflix.unified',
                  catalogType: 'series',
                }),
              ],
            },
          ],
        },
      },
    }),
  ]);

  const exported = buildAiometadataMdblistCatalogsOnlyExport(
    config,
    manifestCatalogs,
    '2026-04-23T09:53:54.465Z'
  );

  assert.deepEqual(exported, {
    version: 1,
    exportedAt: '2026-04-23T09:53:54.465Z',
    catalogs: [
      {
        id: 'mdblist.nobnobz.netflix.unified',
        type: 'all',
        name: '[Service] Netflix',
        enabled: true,
        source: 'mdblist',
        sort: 'default',
        order: 'asc',
        cacheTTL: 86400,
        showInHome: true,
        genreSelection: 'standard',
        enableRatingPosters: true,
        metadata: {
          itemCount: 2000,
          unified: true,
          username: 'nobnobz',
          listSlug: 'netflix',
          author: 'nobnobz',
          url: 'https://mdblist.com/lists/nobnobz/netflix',
        },
      },
    ],
  });
});

test('buildAiometadataMdblistCatalogsOnlyExport prefers manifest catalog names and deduplicates', () => {
  const manifestCatalogs: AIOMetadataCatalog[] = [
    {
      id: 'mdblist.16267',
      name: 'Manifest MDBList Name',
      type: 'movie',
      displayType: 'movie',
    },
  ];

  const config = buildConfig([
    buildRowWidget({
      title: 'First Widget Name',
      dataSource: buildAioDataSource({
        catalogId: 'movie::mdblist.16267',
        catalogType: 'movie',
      }),
    }),
    buildCollectionWidget({
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-dup',
              name: 'Second Item Name',
              hideTitle: false,
              layout: 'Poster',
              backgroundImageURL: '',
              dataSources: [
                buildAioDataSource({
                  catalogId: 'movie::mdblist.16267',
                  catalogType: 'movie',
                }),
              ],
            },
          ],
        },
      },
    }),
  ]);

  const exported = buildAiometadataMdblistCatalogsOnlyExport(config, manifestCatalogs, '2026-03-26T18:41:10.859Z');
  assert.equal(exported.catalogs.length, 1);
  assert.equal(exported.catalogs[0]?.name, '[First Widget Name] Manifest MDBList Name');
});

test('buildAiometadataMdblistCatalogsOnlyExport can export only catalogs missing from the manifest', () => {
  const manifestCatalogs: AIOMetadataCatalog[] = [
    {
      id: 'mdblist.16267',
      name: 'Already There',
      type: 'movie',
      displayType: 'movie',
    },
  ];

  const config = buildConfig([
    buildRowWidget({
      title: 'Existing',
      dataSource: buildAioDataSource({
        catalogId: 'movie::mdblist.16267',
        catalogType: 'movie',
      }),
    }),
    buildRowWidget({
      id: 'row-2',
      title: 'New One',
      dataSource: buildAioDataSource({
        catalogId: 'series::mdblist.500',
        catalogType: 'series',
      }),
    }),
  ]);

  const exported = buildAiometadataMdblistCatalogsOnlyExport(
    config,
    manifestCatalogs,
    '2026-03-26T18:41:10.859Z',
    { onlyNewAgainstManifest: true }
  );

  assert.deepEqual(exported.catalogs, [
    {
      id: 'mdblist.500',
      type: 'series',
      name: '[New One] New One Shows',
      enabled: true,
      source: 'mdblist',
      displayType: 'series',
    },
  ]);
});

test('collectUsedMdblistCatalogs ignores non-mdblist aiometadata sources', () => {
  const config = buildConfig([
    buildRowWidget({
      dataSource: buildAioDataSource({
        catalogId: 'movie::catalog-one',
        catalogType: 'movie',
      }),
    }),
  ]);

  assert.equal(hasUsedMdblistCatalogs(config), false);
  assert.deepEqual(collectUsedMdblistCatalogs(config), []);
});

test('collectUsedMdblistCatalogs keeps movie and series types from widget data', () => {
  const config = buildConfig([
    buildRowWidget({
      title: 'Movie Catalog',
      dataSource: buildAioDataSource({
        catalogId: 'movie::mdblist.16267',
        catalogType: 'movie',
      }),
    }),
    buildRowWidget({
      id: 'row-2',
      title: 'Series Catalog',
      dataSource: buildAioDataSource({
        catalogId: 'series::mdblist.500',
        catalogType: 'series',
      }),
    }),
  ]);

  const references = collectUsedMdblistCatalogs(config);
  assert.deepEqual(
    references.map((reference) => ({ id: reference.id, type: reference.type })),
    [
      { id: 'mdblist.16267', type: 'movie' },
      { id: 'mdblist.500', type: 'series' },
    ]
  );
});

test('collectUsedMdblistCatalogs uses item-based fallback names with type suffixes and numbering', () => {
  const config = buildConfig([
    buildCollectionWidget({
      title: 'Streaming Services',
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-hunger-games',
              name: 'Hunger Games',
              hideTitle: false,
              layout: 'Poster',
              backgroundImageURL: '',
              dataSources: [
                buildAioDataSource({
                  catalogId: 'movie::mdblist.1',
                  catalogType: 'movie',
                }),
                buildAioDataSource({
                  catalogId: 'movie::mdblist.2',
                  catalogType: 'movie',
                }),
                buildAioDataSource({
                  catalogId: 'series::mdblist.3',
                  catalogType: 'series',
                }),
              ],
            },
          ],
        },
      },
    }),
  ]);

  const references = collectUsedMdblistCatalogs(config);
  assert.deepEqual(
    references.map((reference) => reference.name),
    [
      '[Streaming Services] Hunger Games Movies',
      '[Streaming Services] Hunger Games Movies 2',
      '[Streaming Services] Hunger Games Shows',
    ]
  );
});
