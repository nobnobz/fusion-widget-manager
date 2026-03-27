import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiometadataStreamingCatalogsOnlyExport,
  collectUsedStreamingCatalogs,
  hasUsedStreamingCatalogs,
} from './streaming-catalog-export';
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
    title: 'Streaming Row',
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
            name: 'Streaming Item',
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

test('buildAiometadataStreamingCatalogsOnlyExport emits used streaming catalogs', () => {
  const manifestCatalogs: AIOMetadataCatalog[] = [
    {
      id: 'streaming.sta',
      name: 'Starz (Movies)',
      type: 'movie',
      displayType: 'movie',
    },
  ];

  const config = buildConfig([
    buildRowWidget({
      title: 'Fallback Name',
      dataSource: buildAioDataSource({
        catalogId: 'movie::streaming.sta',
        catalogType: 'movie',
      }),
    }),
  ]);

  const exported = buildAiometadataStreamingCatalogsOnlyExport(config, manifestCatalogs, '2026-03-26T18:41:10.859Z');
  assert.deepEqual(exported, {
    version: 1,
    exportedAt: '2026-03-26T18:41:10.859Z',
    catalogs: [
      {
        id: 'streaming.sta',
        type: 'movie',
        name: '[Fallback Name] Starz (Movies)',
        enabled: true,
        source: 'streaming',
        displayType: 'movie',
      },
    ],
  });
});

test('collectUsedStreamingCatalogs keeps movie and series types separate', () => {
  const config = buildConfig([
    buildRowWidget({
      title: 'Movies',
      dataSource: buildAioDataSource({
        catalogId: 'movie::streaming.sta',
        catalogType: 'movie',
      }),
    }),
    buildCollectionWidget({
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-series',
              name: 'Series',
              hideTitle: false,
              layout: 'Poster',
              backgroundImageURL: '',
              dataSources: [
                buildAioDataSource({
                  catalogId: 'series::streaming.sta',
                  catalogType: 'series',
                }),
              ],
            },
          ],
        },
      },
    }),
  ]);

  const references = collectUsedStreamingCatalogs(config);
  assert.deepEqual(
    references.map((reference) => ({ id: reference.id, type: reference.type })),
    [
      { id: 'streaming.sta', type: 'movie' },
      { id: 'streaming.sta', type: 'series' },
    ]
  );
});

test('collectUsedStreamingCatalogs ignores non-streaming aiometadata sources', () => {
  const config = buildConfig([
    buildRowWidget({
      dataSource: buildAioDataSource({
        catalogId: 'movie::mdblist.16267',
        catalogType: 'movie',
      }),
    }),
  ]);

  assert.equal(hasUsedStreamingCatalogs(config), false);
  assert.deepEqual(collectUsedStreamingCatalogs(config), []);
});
