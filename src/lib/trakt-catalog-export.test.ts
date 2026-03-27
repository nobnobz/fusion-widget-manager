import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiometadataTraktCatalogsOnlyExport,
  collectUsedAiometadataTraktCatalogs,
  hasUsedAiometadataTraktCatalogs,
} from './trakt-catalog-export';
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
    title: 'Trakt Row',
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
            name: 'Trakt Item',
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

test('buildAiometadataTraktCatalogsOnlyExport emits used AIOMetadata trakt catalogs', () => {
  const manifestCatalogs: AIOMetadataCatalog[] = [
    {
      id: 'trakt.list.42',
      name: 'Imported Trakt',
      type: 'all',
      displayType: 'all',
    },
  ];

  const config = buildConfig([
    buildRowWidget({
      title: 'Fallback Name',
      dataSource: buildAioDataSource({
        catalogId: 'all::trakt.list.42',
        catalogType: 'all',
      }),
    }),
  ]);

  const exported = buildAiometadataTraktCatalogsOnlyExport(config, manifestCatalogs, '2026-03-26T18:41:10.859Z');
  assert.deepEqual(exported, {
    version: 1,
    exportedAt: '2026-03-26T18:41:10.859Z',
    catalogs: [
      {
        id: 'trakt.list.42',
        type: 'all',
        name: '[Fallback Name] Imported Trakt',
        enabled: true,
        source: 'trakt',
        displayType: 'all',
      },
    ],
  });
});

test('collectUsedAiometadataTraktCatalogs keeps different trakt types separate', () => {
  const config = buildConfig([
    buildRowWidget({
      title: 'Movies',
      dataSource: buildAioDataSource({
        catalogId: 'movie::trakt.anticipated',
        catalogType: 'movie',
      }),
    }),
    buildCollectionWidget({
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-all',
              name: 'All',
              hideTitle: false,
              layout: 'Poster',
              backgroundImageURL: '',
              dataSources: [
                buildAioDataSource({
                  catalogId: 'all::trakt.list.42',
                  catalogType: 'all',
                }),
              ],
            },
          ],
        },
      },
    }),
  ]);

  const references = collectUsedAiometadataTraktCatalogs(config);
  assert.deepEqual(
    references.map((reference) => ({ id: reference.id, type: reference.type })),
    [
      { id: 'trakt.anticipated', type: 'movie' },
      { id: 'trakt.list.42', type: 'all' },
    ]
  );
});

test('collectUsedAiometadataTraktCatalogs ignores native trakt and non-trakt aiometadata sources', () => {
  const config = buildConfig([
    buildRowWidget({
      dataSource: buildAioDataSource({
        catalogId: 'movie::mdblist.16267',
        catalogType: 'movie',
      }),
    }),
  ]);

  assert.equal(hasUsedAiometadataTraktCatalogs(config), false);
  assert.deepEqual(collectUsedAiometadataTraktCatalogs(config), []);
});
