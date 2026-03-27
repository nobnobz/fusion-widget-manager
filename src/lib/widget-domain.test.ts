import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectUsedAiometadataCatalogKeys,
  exportConfigToFusion,
  processConfigWithManifest,
  processWidgetWithManifest,
  sanitizeFusionConfigForExport,
} from './config-utils';
import { convertFusionToOmni, convertOmniToFusion, validateOmniExport } from './omni-converter';
import {
  extractImportedManifestState,
  MANIFEST_PLACEHOLDER,
  mergeWidgetLists,
  normalizeFusionConfigDetailed,
  normalizeLoadedState,
  parseFusionConfig,
} from './widget-domain';
import type {
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
      listName: 'MARVEL Cinematic Universe',
      listSlug: 'marvel-cinematic-universe',
      traktId: 1248149,
      username: 'Donxy',
      ...overrides,
    },
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
            name: 'Netflix',
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

function buildRowWidget(overrides: Partial<RowClassicWidget> = {}): RowClassicWidget {
  return {
    id: 'row-1',
    title: 'Netflix Movies',
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

function buildConfig(widgets: Widget[]): FusionWidgetsConfig {
  return {
    exportType: 'fusionWidgets',
    exportVersion: 1,
    widgets,
  };
}

test('parseFusionConfig rejects malformed payloads', () => {
  assert.throws(() => parseFusionConfig({ widgets: [] }), /exportType/);
});

test('legacy collection item dataSource normalizes into dataSources', () => {
  const parsed = parseFusionConfig({
    exportType: 'fusionWidgets',
    exportVersion: 1,
    widgets: [
      {
        id: 'collection-legacy',
        title: 'Legacy',
        type: 'collection.row',
        dataSource: {
          kind: 'collection',
          payload: {
            items: [
              {
                id: 'legacy-item',
                title: 'Legacy Item',
                imageAspect: 'wide',
                dataSource: {
                  kind: 'addonCatalog',
                  payload: {
                    addonId: MANIFEST_PLACEHOLDER,
                    catalogId: 'movie::legacy',
                    catalogType: 'movie',
                  },
                },
              },
            ],
          },
        },
      },
    ],
  });

  const item = parsed.widgets[0].type === 'collection.row' ? parsed.widgets[0].dataSource.payload.items[0] : null;
  assert.ok(item);
  assert.equal(item.dataSources.length, 1);
  assert.equal(item.dataSources[0]?.kind, 'addonCatalog');
  if (item.dataSources[0]?.kind !== 'addonCatalog') {
    throw new Error('Expected AIOMetadata data source.');
  }
  assert.equal(item.dataSources[0].payload.catalogId, 'movie::legacy');
  assert.equal('dataSource' in item, false);
});

test('normalizeFusionConfigDetailed repairs duplicate widget and item IDs', () => {
  const normalized = normalizeFusionConfigDetailed({
    exportType: 'fusionWidgets',
    exportVersion: 1,
    widgets: [
      buildCollectionWidget(),
      buildCollectionWidget({
        id: 'collection-1',
        title: 'Collection 2',
        dataSource: {
          kind: 'collection',
          payload: {
            items: [
              {
                id: 'item-1',
                name: 'Prime Video',
                hideTitle: false,
                layout: 'Poster',
                backgroundImageURL: '',
                dataSources: [],
              },
            ],
          },
        },
      }),
    ],
  });

  assert.equal(new Set(normalized.config.widgets.map((widget) => widget.id)).size, 2);
  assert.equal(normalized.repairedIds.widgetIds.length, 1);
  const repairedCollection = normalized.config.widgets[1];
  if (repairedCollection.type !== 'collection.row') {
    throw new Error('Expected collection widget.');
  }
  assert.equal(new Set(repairedCollection.dataSource.payload.items.map((item) => item.id)).size, 1);
});

test('mergeWidgetLists skips duplicates already present and inside the same payload', () => {
  const existing = [buildCollectionWidget()];
  const incoming = [
    buildCollectionWidget(),
    buildRowWidget(),
    buildRowWidget({ id: 'row-2' }),
  ];

  const result = mergeWidgetLists(existing, incoming);
  assert.equal(result.added, 1);
  assert.equal(result.skippedExisting, 1);
  assert.equal(result.skippedInPayload, 1);
  assert.equal(result.widgets.length, 2);
});

test('normalizeLoadedState preserves trash entries', () => {
  const state = normalizeLoadedState({
    widgets: [],
    trash: [
      {
        widget: buildRowWidget(),
        deletedAt: '2026-03-19T10:00:00.000Z',
        originalIndex: 2,
      },
    ],
  });

  assert.equal(state.widgets.length, 0);
  assert.equal(state.trash.length, 1);
  assert.equal(state.trash[0]?.widget.title, 'Netflix Movies');
  assert.equal(state.trash[0]?.originalIndex, 2);
});

test('normalizeLoadedState preserves collection item trash entries', () => {
  const state = normalizeLoadedState({
    widgets: [],
    itemTrash: [
      {
        widgetId: 'collection-1',
        widgetTitle: 'Collection',
        item: {
          id: 'item-99',
          name: 'Action',
          hideTitle: false,
          layout: 'Wide',
          backgroundImageURL: '',
          dataSources: [
            buildAioDataSource(),
          ],
        },
        deletedAt: '2026-03-20T10:00:00.000Z',
        originalIndex: 1,
      },
    ],
  });

  assert.equal(state.itemTrash.length, 1);
  assert.equal(state.itemTrash[0]?.widgetId, 'collection-1');
  assert.equal(state.itemTrash[0]?.widgetTitle, 'Collection');
  assert.equal(state.itemTrash[0]?.item.name, 'Action');
  assert.equal(state.itemTrash[0]?.originalIndex, 1);
});

test('extractImportedManifestState reads explicit manifest metadata from imported configs', () => {
  const imported = extractImportedManifestState({
    exportType: 'fusionWidgets',
    exportVersion: 1,
    manifestUrl: 'https://aiometadata.example/manifest.json',
    replacePlaceholder: true,
    manifestCatalogs: [
      {
        id: 'catalog-one',
        name: 'Catalog One',
        type: 'movie',
        displayType: 'movie',
      },
    ],
    widgets: [buildRowWidget()],
  });

  assert.equal(imported.hasExplicitManifest, true);
  assert.equal(imported.manifestUrl, 'https://aiometadata.example/manifest.json');
  assert.equal(imported.replacePlaceholder, true);
  assert.equal(imported.manifestCatalogs.length, 1);
  assert.equal(imported.manifestCatalogs[0]?.id, 'catalog-one');
});

test('extractImportedManifestState falls back to manifest content when catalogs are not stored separately', () => {
  const imported = extractImportedManifestState({
    exportType: 'fusionWidgets',
    exportVersion: 1,
    manifestContent: JSON.stringify({
      catalogs: [
        {
          id: 'catalog-two',
          name: 'Catalog Two',
          type: 'series',
          displayType: 'series',
        },
      ],
    }),
    widgets: [buildCollectionWidget()],
  });

  assert.equal(imported.hasExplicitManifest, true);
  assert.equal(imported.manifestCatalogs.length, 1);
  assert.equal(imported.manifestCatalogs[0]?.id, 'catalog-two');
  assert.equal(imported.manifestCatalogs[0]?.type, 'series');
});

test('Fusion export derives requiredAddons from collection item dataSources', () => {
  const config = buildConfig([
    buildCollectionWidget({
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-1',
              name: 'Netflix',
              hideTitle: false,
              layout: 'Wide',
              backgroundImageURL: '',
              dataSources: [
                buildAioDataSource({
                  addonId: 'https://one.example/manifest.json',
                  catalogId: 'movie::catalog-one',
                  catalogType: 'movie',
                }),
                buildAioDataSource({
                  addonId: 'https://two.example/manifest.json',
                  catalogId: 'series::catalog-two',
                  catalogType: 'series',
                }),
              ],
            },
          ],
        },
      },
    }),
  ]);

  const exported = exportConfigToFusion(config);
  assert.deepEqual(exported.requiredAddons.sort(), [
    'https://one.example/manifest.json',
    'https://two.example/manifest.json',
  ]);
});

test('collectUsedAiometadataCatalogKeys deduplicates AIOMetadata catalogs and ignores native trakt', () => {
  const config = buildConfig([
    buildRowWidget({
      dataSource: buildAioDataSource({
        catalogId: 'mdblist.1',
        catalogType: 'movie',
      }),
    }),
    buildCollectionWidget({
      title: 'Collections',
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-1',
              name: 'One',
              hideTitle: false,
              layout: 'Wide',
              backgroundImageURL: '',
              dataSources: [
                buildAioDataSource({
                  catalogId: 'movie::mdblist.1',
                  catalogType: 'movie',
                }),
                buildAioDataSource({
                  catalogId: 'series::streaming.sta',
                  catalogType: 'series',
                }),
                buildTraktDataSource(),
              ],
            },
          ],
        },
      },
    }),
  ]);

  assert.deepEqual(collectUsedAiometadataCatalogKeys(config).sort(), [
    'movie::mdblist.1',
    'series::streaming.sta',
  ]);
});

test('ambiguous manifest suffix matches are rejected', () => {
  assert.throws(
    () =>
      parseFusionConfig(
        buildConfig([
          buildRowWidget({
            dataSource: buildAioDataSource({
              addonId: MANIFEST_PLACEHOLDER,
              catalogId: 'popular',
              catalogType: 'movie',
            }),
          }),
        ]),
        {
          catalogs: [
            { id: 'popular', name: 'Popular Movies', type: 'movie', displayType: 'movie' },
            { id: 'popular', name: 'Popular Series', type: 'series', displayType: 'series' },
          ],
          sanitize: true,
        }
      ),
    /ambiguous/
  );
});

test('parseFusionConfig imports native trakt row widgets', () => {
  const parsed = parseFusionConfig({
    exportType: 'fusionWidgets',
    exportVersion: 1,
    widgets: [
      {
        id: 'trakt.8306839E-006E-4A6E-90CE-56BFFD9D3E09',
        title: 'MARVEL Cinematic Universe',
        hideTitle: true,
        type: 'row.classic',
        cacheTTL: 7200,
        limit: 12,
        presentation: {
          aspectRatio: 'wide',
          cardStyle: 'small',
          badges: { providers: false, ratings: true },
          backgroundImageURL: 'https://img.test/marvel.jpg',
        },
        dataSource: {
          kind: 'traktList',
          payload: {
            listName: 'MARVEL Cinematic Universe',
            listSlug: 'marvel-cinematic-universe',
            traktId: 1248149,
            username: 'Donxy',
          },
        },
      },
    ],
  });

  const widget = parsed.widgets[0];
  assert.equal(widget?.type, 'row.classic');
  if (!widget || widget.type !== 'row.classic') {
    throw new Error('Expected classic row widget.');
  }

  assert.equal(widget.dataSource.sourceType, 'trakt-native');
  assert.equal(widget.dataSource.payload.listSlug, 'marvel-cinematic-universe');
  assert.equal(widget.hideTitle, true);
  assert.equal(widget.limit, 12);
  assert.equal(widget.presentation.backgroundImageURL, 'https://img.test/marvel.jpg');
});

test('parseFusionConfig imports collection items with native trakt data sources', () => {
  const parsed = parseFusionConfig({
    exportType: 'fusionWidgets',
    exportVersion: 1,
    widgets: [
      {
        id: 'collection-trakt',
        title: 'Collections',
        type: 'collection.row',
        dataSource: {
          kind: 'collection',
          payload: {
            items: [
              {
                id: 'Rush_Hour',
                title: 'Rush Hour',
                dataSources: [
                  {
                    kind: 'traktList',
                    payload: {
                      listName: 'Rush Hour Collection',
                      listSlug: 'rush-hour-collection',
                      traktId: 197,
                      username: 'Trakt',
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    ],
  });

  const widget = parsed.widgets[0];
  assert.equal(widget?.type, 'collection.row');
  if (!widget || widget.type !== 'collection.row') {
    throw new Error('Expected collection row widget.');
  }

  const item = widget.dataSource.payload.items[0];
  assert.ok(item);
  assert.equal(item?.dataSources[0]?.sourceType, 'trakt-native');
  assert.equal(item?.dataSources[0]?.kind, 'traktList');
});

test('mixed imports keep AIOMetadata catalogs and native trakt distinct', () => {
  const parsed = parseFusionConfig({
    exportType: 'fusionWidgets',
    exportVersion: 1,
    widgets: [
      buildRowWidget(),
      {
        ...buildRowWidget({
          id: 'trakt.row',
          title: 'Native Trakt',
          dataSource: buildTraktDataSource(),
        }),
      },
      buildCollectionWidget({
        id: 'mixed-collection',
        dataSource: {
          kind: 'collection',
          payload: {
            items: [
              {
                id: 'mixed-item',
                name: 'Mixed',
                hideTitle: false,
                layout: 'Wide',
                backgroundImageURL: '',
                dataSources: [
                  buildAioDataSource({ catalogId: 'all::trakt.list.29034789', catalogType: 'series' }),
                  buildTraktDataSource({ listName: 'Mixed Trakt', listSlug: 'mixed-trakt', traktId: 99 }),
                ],
              },
            ],
          },
        },
      }),
    ],
  });

  const collection = parsed.widgets[2];
  if (!collection || collection.type !== 'collection.row') {
    throw new Error('Expected collection row widget.');
  }

  assert.equal(collection.dataSource.payload.items[0]?.dataSources[0]?.sourceType, 'aiometadata');
  assert.equal(collection.dataSource.payload.items[0]?.dataSources[1]?.sourceType, 'trakt-native');
});

test('native trakt rows round-trip through Fusion export without catalog prefixing', () => {
  const config = buildConfig([
    buildRowWidget({
      id: 'trakt.8306839E-006E-4A6E-90CE-56BFFD9D3E09',
      title: 'MARVEL Cinematic Universe',
      hideTitle: true,
      limit: 15,
      presentation: {
        aspectRatio: 'wide',
        cardStyle: 'small',
        badges: { providers: false, ratings: true },
        backgroundImageURL: 'https://img.test/marvel.jpg',
      },
      dataSource: buildTraktDataSource(),
    }),
  ]);

  const exported = exportConfigToFusion(config);
  const widget = exported.widgets[0];
  assert.equal(widget?.id, 'trakt.8306839E-006E-4A6E-90CE-56BFFD9D3E09');
  assert.equal(widget?.type, 'row.classic');
  if (!widget || widget.type !== 'row.classic') {
    throw new Error('Expected row.classic export.');
  }
  assert.equal(widget.dataSource.kind, 'traktList');
  assert.equal(widget.limit, 15);
  assert.equal(widget.hideTitle, true);
  assert.equal(widget.presentation.backgroundImageURL, 'https://img.test/marvel.jpg');
});

test('native trakt collection items round-trip through Fusion export', () => {
  const config = buildConfig([
    buildCollectionWidget({
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'Rush_Hour',
              name: 'Rush Hour',
              hideTitle: false,
              layout: 'Poster',
              backgroundImageURL: '',
              dataSources: [buildTraktDataSource({
                listName: 'Rush Hour Collection',
                listSlug: 'rush-hour-collection',
                traktId: 197,
                username: 'Trakt',
              })],
            },
          ],
        },
      },
    }),
  ]);

  const exported = exportConfigToFusion(config);
  const widget = exported.widgets[0];
  if (!widget || widget.type !== 'collection.row') {
    throw new Error('Expected collection export.');
  }
  assert.equal(widget.dataSource.payload.items[0]?.dataSources[0]?.kind, 'traktList');
});

test('processWidgetWithManifest leaves native trakt sources untouched', () => {
  const widget = buildRowWidget({
    id: 'trakt.row',
    dataSource: buildTraktDataSource({ username: '' }),
  });

  const processed = processWidgetWithManifest(
    widget,
    'https://aiometadata.example/manifest.json',
    true,
    [{ id: 'catalog-one', name: 'Catalog One', type: 'movie', displayType: 'movie' }],
    true
  );

  if (processed.type !== 'row.classic' || processed.dataSource.kind !== 'traktList') {
    throw new Error('Expected native trakt row.');
  }
  assert.equal(processed.dataSource.payload.username, '');
  assert.equal(processed.id, 'trakt.row');
});

test('processConfigWithManifest leaves native trakt collection item sources untouched', () => {
  const config = buildConfig([
    buildCollectionWidget({
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'trakt-item',
              name: 'Trakt Item',
              hideTitle: false,
              layout: 'Wide',
              backgroundImageURL: '',
              dataSources: [buildTraktDataSource({ listSlug: '', traktId: null })],
            },
          ],
        },
      },
    }),
  ]);

  const processed = processConfigWithManifest(
    config,
    'https://aiometadata.example/manifest.json',
    true,
    [{ id: 'catalog-one', name: 'Catalog One', type: 'movie', displayType: 'movie' }],
    true
  );

  const itemSource = processed.widgets[0]?.type === 'collection.row'
    ? processed.widgets[0].dataSource.payload.items[0]?.dataSources[0]
    : null;
  assert.equal(itemSource?.kind, 'traktList');
  if (!itemSource || itemSource.kind !== 'traktList') {
    throw new Error('Expected native trakt collection item source.');
  }
  assert.equal(itemSource.payload.listSlug, '');
  assert.equal(itemSource.payload.traktId, null);
});

test('sanitizeFusionConfigForExport removes invalid AIOMetadata collection catalogs and empty items', () => {
  const config = buildConfig([
    buildCollectionWidget({
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-valid',
              name: 'Valid Item',
              hideTitle: false,
              layout: 'Wide',
              backgroundImageURL: '',
              dataSources: [
                buildAioDataSource({ catalogId: 'movie::catalog-one' }),
                buildAioDataSource({ catalogId: '' }),
              ],
            },
            {
              id: 'item-invalid',
              name: 'Invalid Item',
              hideTitle: false,
              layout: 'Wide',
              backgroundImageURL: '',
              dataSources: [buildAioDataSource({ catalogId: '' })],
            },
          ],
        },
      },
    }),
  ]);

  const sanitized = sanitizeFusionConfigForExport(config, [
    { id: 'catalog-one', name: 'Catalog One', type: 'movie', displayType: 'movie' },
  ]);

  assert.equal(sanitized.skippedDataSources, 2);
  assert.equal(sanitized.skippedItems, 1);
  assert.equal(sanitized.skippedWidgets, 0);
  assert.equal(sanitized.emptiedItems, 0);
  const widget = sanitized.config.widgets[0];
  if (!widget || widget.type !== 'collection.row') {
    throw new Error('Expected collection widget.');
  }
  assert.equal(widget.dataSource.payload.items.length, 1);
  assert.equal(widget.dataSource.payload.items[0]?.dataSources.length, 1);
});

test('sanitizeFusionConfigForExport can keep invalid collection items as empty items', () => {
  const config = buildConfig([
    buildCollectionWidget({
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-invalid',
              name: 'Invalid Item',
              hideTitle: false,
              layout: 'Wide',
              backgroundImageURL: 'https://images.example/item.jpg',
              dataSources: [buildAioDataSource({ catalogId: '' })],
            },
          ],
        },
      },
    }),
  ]);

  const sanitized = sanitizeFusionConfigForExport(config, [
    { id: 'catalog-one', name: 'Catalog One', type: 'movie', displayType: 'movie' },
  ], {
    invalidAiometadataMode: 'empty-items',
  });

  assert.equal(sanitized.skippedDataSources, 1);
  assert.equal(sanitized.skippedItems, 0);
  assert.equal(sanitized.skippedWidgets, 0);
  assert.equal(sanitized.emptiedItems, 1);
  const widget = sanitized.config.widgets[0];
  if (!widget || widget.type !== 'collection.row') {
    throw new Error('Expected collection widget.');
  }
  assert.equal(widget.dataSource.payload.items.length, 1);
  assert.equal(widget.dataSource.payload.items[0]?.dataSources.length, 0);
  assert.equal(widget.dataSource.payload.items[0]?.backgroundImageURL, 'https://images.example/item.jpg');
});

test('sanitizeFusionConfigForExport can keep collection items without catalogs as empty items', () => {
  const config = buildConfig([
    buildCollectionWidget({
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-empty',
              name: 'Empty Item',
              hideTitle: false,
              layout: 'Wide',
              backgroundImageURL: 'https://images.example/empty.jpg',
              dataSources: [],
            },
          ],
        },
      },
    }),
  ]);

  const sanitized = sanitizeFusionConfigForExport(config, [], {
    invalidAiometadataMode: 'empty-items',
  });

  assert.equal(sanitized.skippedDataSources, 0);
  assert.equal(sanitized.skippedItems, 0);
  assert.equal(sanitized.skippedWidgets, 0);
  assert.equal(sanitized.emptiedItems, 1);
  const widget = sanitized.config.widgets[0];
  if (!widget || widget.type !== 'collection.row') {
    throw new Error('Expected collection widget.');
  }
  assert.equal(widget.dataSource.payload.items.length, 1);
  assert.equal(widget.dataSource.payload.items[0]?.dataSources.length, 0);
  assert.equal(widget.dataSource.payload.items[0]?.backgroundImageURL, 'https://images.example/empty.jpg');
});

test('sanitizeFusionConfigForExport removes invalid classic rows entirely', () => {
  const config = buildConfig([
    buildRowWidget({ dataSource: buildAioDataSource({ catalogId: '' }) }),
    buildRowWidget({
      id: 'row-2',
      title: 'Valid',
      dataSource: buildAioDataSource({ catalogId: 'movie::catalog-one' }),
    }),
  ]);

  const sanitized = sanitizeFusionConfigForExport(config, [
    { id: 'catalog-one', name: 'Catalog One', type: 'movie', displayType: 'movie' },
  ]);

  assert.equal(sanitized.skippedDataSources, 1);
  assert.equal(sanitized.skippedWidgets, 1);
  assert.equal(sanitized.emptiedItems, 0);
  assert.equal(sanitized.config.widgets.length, 1);
  assert.equal(sanitized.config.widgets[0]?.title, 'Valid');
});

test('exportConfigToFusion can skip invalid AIOMetadata catalogs when requested', () => {
  const config = buildConfig([
    buildCollectionWidget({
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-1',
              name: 'Mixed Item',
              hideTitle: false,
              layout: 'Wide',
              backgroundImageURL: '',
              dataSources: [
                buildAioDataSource({ catalogId: 'movie::catalog-one' }),
                buildAioDataSource({ catalogId: '' }),
              ],
            },
          ],
        },
      },
    }),
  ]);

  const exported = exportConfigToFusion(config, 'https://example.com/manifest.json', {
    skipInvalidAiometadataSources: true,
    catalogs: [{ id: 'catalog-one', name: 'Catalog One', type: 'movie', displayType: 'movie' }],
  });

  const widget = exported.widgets[0];
  if (!widget || widget.type !== 'collection.row') {
    throw new Error('Expected collection widget.');
  }
  assert.equal(widget.dataSource.payload.items[0]?.dataSources.length, 1);
  assert.equal(widget.dataSource.payload.items[0]?.dataSources[0]?.kind, 'addonCatalog');
});

test('exportConfigToFusion can keep invalid collection items as empty items when requested', () => {
  const config = buildConfig([
    buildCollectionWidget({
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-1',
              name: 'Mixed Item',
              hideTitle: false,
              layout: 'Wide',
              backgroundImageURL: '',
              dataSources: [buildAioDataSource({ catalogId: '' })],
            },
          ],
        },
      },
    }),
  ]);

  const exported = exportConfigToFusion(config, 'https://example.com/manifest.json', {
    skipInvalidAiometadataSources: true,
    invalidAiometadataMode: 'empty-items',
    catalogs: [{ id: 'catalog-one', name: 'Catalog One', type: 'movie', displayType: 'movie' }],
  });

  const widget = exported.widgets[0];
  if (!widget || widget.type !== 'collection.row') {
    throw new Error('Expected collection widget.');
  }
  assert.equal(widget.dataSource.payload.items[0]?.dataSources.length, 0);
  assert.equal(widget.dataSource.payload.items[0]?.title, 'Mixed Item');
});

test('exportConfigToFusion can keep collection items without catalogs as empty items when requested', () => {
  const config = buildConfig([
    buildCollectionWidget({
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-empty',
              name: 'Empty Item',
              hideTitle: false,
              layout: 'Wide',
              backgroundImageURL: '',
              dataSources: [],
            },
          ],
        },
      },
    }),
  ]);

  const exported = exportConfigToFusion(config, 'https://example.com/manifest.json', {
    skipInvalidAiometadataSources: true,
    invalidAiometadataMode: 'empty-items',
    catalogs: [],
  });

  const widget = exported.widgets[0];
  if (!widget || widget.type !== 'collection.row') {
    throw new Error('Expected collection widget.');
  }
  assert.equal(widget.dataSource.payload.items[0]?.dataSources.length, 0);
  assert.equal(widget.dataSource.payload.items[0]?.title, 'Empty Item');
});

test('partial import skips unsupported item sources instead of rejecting the full file', () => {
  const normalized = normalizeFusionConfigDetailed(
    {
      exportType: 'fusionWidgets',
      exportVersion: 1,
      widgets: [
        {
          id: 'collections',
          title: 'Collections',
          type: 'collection.row',
          dataSource: {
            kind: 'collection',
            payload: {
              items: [
                {
                  id: 'supported',
                  title: 'Rush Hour',
                  imageAspect: 'poster',
                  dataSources: [
                    {
                      kind: 'traktList',
                      payload: {
                        listName: 'Rush Hour Collection',
                        listSlug: 'rush-hour-collection',
                        traktId: 197,
                        username: 'Trakt',
                      },
                    },
                  ],
                },
                {
                  id: 'unsupported',
                  title: 'The Chronicles of Riddick',
                  imageAspect: 'poster',
                  dataSources: [
                    {
                      kind: 'tmdbDiscover',
                      payload: {
                        limit: 30,
                        sortBy: 'popularity.desc',
                        type: 'movie',
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    },
    { allowPartialImport: true }
  );

  const widget = normalized.config.widgets[0];
  if (!widget || widget.type !== 'collection.row') {
    throw new Error('Expected collection row widget.');
  }

  assert.equal(widget.dataSource.payload.items.length, 1);
  assert.equal(widget.dataSource.payload.items[0]?.name, 'Rush Hour');
  assert.equal(normalized.importIssues.length, 1);
  assert.equal(normalized.importIssues[0]?.label, 'The Chronicles of Riddick');
  assert.match(normalized.importIssues[0]?.message || '', /Unsupported source/);
});

test('export preserves reorder and delete outcomes for native trakt entries', () => {
  const reordered = buildConfig([
    buildRowWidget({ id: 'trakt-2', title: 'Second', dataSource: buildTraktDataSource({ listSlug: 'second' }) }),
    buildRowWidget({ id: 'trakt-1', title: 'First', dataSource: buildTraktDataSource({ listSlug: 'first' }) }),
  ]);

  const exportedRows = exportConfigToFusion(reordered);
  assert.deepEqual(
    exportedRows.widgets.map((widget) => widget.id),
    ['trakt-2', 'trakt-1']
  );

  const collectionConfig = buildConfig([
    buildCollectionWidget({
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'keep',
              name: 'Keep',
              hideTitle: false,
              layout: 'Wide',
              backgroundImageURL: '',
              dataSources: [buildTraktDataSource({ listSlug: 'keep' })],
            },
          ],
        },
      },
    }),
  ]);
  const exportedCollection = exportConfigToFusion(collectionConfig);
  const collection = exportedCollection.widgets[0];
  if (!collection || collection.type !== 'collection.row') {
    throw new Error('Expected collection export.');
  }
  assert.deepEqual(collection.dataSource.payload.items.map((item) => item.id), ['keep']);
});

test('validateOmniExport makes duplicate subgroup names unique', () => {
  const secondCollection = buildCollectionWidget({
    id: 'collection-2',
    title: 'Second',
    dataSource: {
      kind: 'collection',
      payload: {
        items: [
          {
            id: 'item-2',
            name: 'Netflix',
            hideTitle: false,
            layout: 'Wide',
            backgroundImageURL: '',
            dataSources: [buildAioDataSource({ catalogId: 'movie::catalog-two' })],
          },
        ],
      },
    },
  });

  assert.doesNotThrow(() =>
    validateOmniExport(
      buildConfig([
        buildCollectionWidget(),
        secondCollection,
        buildRowWidget(),
      ])
    )
  );

  const snapshot = convertFusionToOmni(
    buildConfig([
      buildCollectionWidget(),
      secondCollection,
      buildRowWidget(),
    ])
  );

  const converted = convertOmniToFusion(snapshot);
  const collectionWidgets = converted.widgets.filter((widget) => widget.type === 'collection.row');
  assert.equal(collectionWidgets.length, 2);
  assert.equal(collectionWidgets[0]?.type, 'collection.row');
  assert.equal(collectionWidgets[1]?.type, 'collection.row');
  if (collectionWidgets[0]?.type !== 'collection.row' || collectionWidgets[1]?.type !== 'collection.row') {
    throw new Error('Expected converted collection widgets.');
  }
  assert.equal(collectionWidgets[0].dataSource.payload.items[0]?.name, 'Netflix');
  assert.equal(collectionWidgets[1].dataSource.payload.items[0]?.name, 'Netflix (Second)');
});

test('validateOmniExport rejects native trakt sources', () => {
  assert.throws(
    () => validateOmniExport(buildConfig([buildRowWidget({ dataSource: buildTraktDataSource() })])),
    /does not support native Trakt/
  );
});

test('standalone rows are representable in Omni export', () => {
  const snapshot = convertFusionToOmni(buildConfig([buildRowWidget()]));
  assert.equal(typeof snapshot, 'object');
  assert.ok(Array.isArray(snapshot.includedKeys));
  assert.ok(snapshot.values);
});

test('convertOmniToFusion keeps valid standalone rows', () => {
  const converted = convertOmniToFusion({
    values: {
      main_group_order: [],
      main_catalog_groups: {},
      catalog_groups: {},
      selected_catalogs: ['movie:catalog-one'],
      catalog_ordering: [],
      custom_catalog_names: {
        'movie:catalog-one': 'Catalog One',
      },
      catalog_group_image_urls: {},
      landscape_catalogs: [],
      small_catalogs: [],
      top_row_catalogs: [],
      small_toprow_catalogs: [],
    },
  });

  assert.equal(converted.widgets.length, 1);
  assert.equal(converted.widgets[0]?.type, 'row.classic');
  assert.equal(converted.widgets[0]?.title, 'Catalog One');
});

test('convertOmniToFusion excludes internal omni helper catalogs from standalone rows', () => {
  const converted = convertOmniToFusion({
    values: {
      main_group_order: ['group-1'],
      main_catalog_groups: {
        'group-1': {
          name: 'Movies',
          posterType: 'Landscape',
          subgroupNames: ['Netflix'],
        },
      },
      subgroup_order: {},
      catalog_groups: {
        Netflix: ['movie:streaming.nfx'],
      },
      selected_catalogs: ['series:aisearch.home.1.series', 'movie:aisearch.home.0.movie'],
      catalog_ordering: [
        'series:top-10-tv-shows-this-week-series',
        'movie:top-movies-of-the-week-movie',
        'movie:top-10-movie',
        'movie:omni.ai.search.catalog.movie',
        'series:omni.ai.search.catalog.series',
        'movie:aisearch.top',
        'series:aisearch.top',
        'movie:aisearch.home.0.movie',
        'series:aisearch.home.1.series',
      ],
      custom_catalog_names: {},
      catalog_group_image_urls: {},
      landscape_catalogs: ['movie:omni.ai.search.catalog.movie'],
      small_catalogs: [],
      top_row_catalogs: [
        'movie:top-10-movie',
        'movie:top-movies-of-the-week-movie',
        'series:top-10-tv-shows-this-week-series',
      ],
      small_toprow_catalogs: [],
    },
  });

  assert.deepEqual(
    converted.widgets.map((widget) => widget.title),
    ['Movies']
  );
});

test('convertOmniToFusion keeps all subgroupNames when subgroup_order is partial', () => {
  const converted = convertOmniToFusion({
    values: {
      main_group_order: ['group-1'],
      main_catalog_groups: {
        'group-1': {
          name: 'Steaming Services',
          posterType: 'Landscape',
          subgroupNames: ['Starz', 'Apple TV', 'Disney+', 'Peacock ', 'Prime ', 'Netflix', 'Discovery +', 'Hulu', 'HBO', 'Paramount', 'TLC'],
        },
      },
      subgroup_order: {
        'group-1': ['Disney+', 'Netflix', 'HBO', 'Discovery +', 'Paramont', 'Prime '],
      },
      catalog_groups: {
        Starz: ['series:stz'],
        'Apple TV': ['series:atp'],
        'Disney+': ['series:dnp'],
        'Peacock ': ['series:pcp'],
        'Prime ': ['series:amp'],
        Netflix: ['series:nfx'],
        'Discovery +': ['series:discovery-tv-series'],
        Hulu: ['series:streaming.hlu'],
        HBO: ['series:hbm'],
        Paramount: ['series:pplus'],
        TLC: ['series:tlc-network-series'],
      },
      selected_catalogs: [],
      catalog_ordering: [],
      custom_catalog_names: {},
      catalog_group_image_urls: {},
      landscape_catalogs: [],
      small_catalogs: [],
      top_row_catalogs: [],
      small_toprow_catalogs: [],
    },
  });

  assert.equal(converted.widgets.length, 1);
  const widget = converted.widgets[0];
  if (!widget || widget.type !== 'collection.row') {
    throw new Error('Expected collection widget.');
  }

  assert.deepEqual(
    widget.dataSource.payload.items.map((item) => item.name),
    ['Disney+', 'Netflix', 'HBO', 'Discovery +', 'Prime ', 'Starz', 'Apple TV', 'Peacock ', 'Hulu', 'Paramount', 'TLC']
  );
});

test('convertOmniToFusion appends main catalog groups missing from main_group_order', () => {
  const converted = convertOmniToFusion({
    values: {
      main_group_order: ['services', 'movies'],
      main_catalog_groups: {
        collections: {
          name: 'Collections ',
          posterType: 'Poster',
          subgroupNames: ['Marvel'],
        },
        movies: {
          name: 'Movies',
          posterType: 'Landscape',
          subgroupNames: ['Horror'],
        },
        services: {
          name: 'Steaming Services',
          posterType: 'Landscape',
          subgroupNames: ['Netflix'],
        },
      },
      subgroup_order: {},
      catalog_groups: {
        Marvel: ['movie:marvel-movies-mdblist-movie'],
        Horror: ['movie:latest-hd-horror-movies-top-rated-from-1980-to-today-movie'],
        Netflix: ['series:nfx'],
      },
      selected_catalogs: [],
      catalog_ordering: [],
      custom_catalog_names: {},
      catalog_group_image_urls: {},
      landscape_catalogs: [],
      small_catalogs: [],
      top_row_catalogs: [],
      small_toprow_catalogs: [],
    },
  });

  assert.deepEqual(
    converted.widgets.map((widget) => widget.title),
    ['Steaming Services', 'Movies', 'Collections ']
  );
});
