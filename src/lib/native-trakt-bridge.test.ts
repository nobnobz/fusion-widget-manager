import test from 'node:test';
import assert from 'node:assert/strict';
import { convertFusionToOmni, convertOmniToFusion } from './omni-converter';
import {
  buildAiometadataCatalogsOnlyExport,
  bridgeNativeTraktSourcesForOmni,
  getNativeTraktBridgeFingerprint,
  hasNativeTraktSources,
} from './native-trakt-bridge';
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

function buildConfig(widgets: Widget[]): FusionWidgetsConfig {
  return {
    exportType: 'fusionWidgets',
    exportVersion: 1,
    widgets,
  };
}

function decodeSnapshotValue<T>(value: unknown): T {
  if (!value || typeof value !== 'object' || !('_data' in value) || typeof value._data !== 'string') {
    throw new Error('Expected Omni snapshot value with _data.');
  }

  return JSON.parse(atob(value._data)) as T;
}

test('buildAiometadataCatalogsOnlyExport emits trakt catalogs for rows and collection items', () => {
  const config = buildConfig([
    buildRowWidget({
      title: 'Popular Movies',
      dataSource: buildTraktDataSource({
        listName: 'IMDB: Popular Movies',
        traktId: 2142788,
      }),
    }),
    buildCollectionWidget({
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-trakt',
              name: 'Docs',
              hideTitle: false,
              layout: 'Poster',
              backgroundImageURL: '',
              dataSources: [
                buildTraktDataSource({
                  listName: 'Attenborough Documentaries',
                  listSlug: 'attenborough-documentaries',
                  traktId: 6652017,
                }),
              ],
            },
          ],
        },
      },
    }),
  ]);

  const exported = buildAiometadataCatalogsOnlyExport(config, '2026-03-26T17:33:20.949Z');
  assert.deepEqual(exported, {
    version: 1,
    exportedAt: '2026-03-26T17:33:20.949Z',
    catalogs: [
      {
        id: 'trakt.list.2142788',
        type: 'all',
        name: '[Popular Movies] IMDB: Popular Movies',
        enabled: true,
        source: 'trakt',
      },
      {
        id: 'trakt.list.6652017',
        type: 'all',
        name: '[Collection] Attenborough Documentaries',
        enabled: true,
        source: 'trakt',
      },
    ],
  });
});

test('buildAiometadataCatalogsOnlyExport deduplicates by traktId and keeps the first name', () => {
  const config = buildConfig([
    buildRowWidget({
      title: 'First Widget',
      dataSource: buildTraktDataSource({
        listName: 'First Name Wins',
        listSlug: 'first-name-wins',
        traktId: 77,
      }),
    }),
    buildCollectionWidget({
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-dup',
              name: 'Second Name',
              hideTitle: false,
              layout: 'Wide',
              backgroundImageURL: '',
              dataSources: [
                buildTraktDataSource({
                  listName: 'Second Name Loses',
                  listSlug: 'second-name-loses',
                  traktId: 77,
                }),
              ],
            },
          ],
        },
      },
    }),
  ]);

  const exported = buildAiometadataCatalogsOnlyExport(config, '2026-03-26T17:33:20.949Z');
  assert.equal(exported.catalogs.length, 1);
  assert.equal(exported.catalogs[0]?.name, '[First Widget] First Name Wins');
});

test('buildAiometadataCatalogsOnlyExport can export only trakt catalogs missing from the manifest', () => {
  const config = buildConfig([
    buildRowWidget({
      title: 'Already Present',
      dataSource: buildTraktDataSource({
        listName: 'Existing Trakt',
        traktId: 77,
      }),
    }),
    buildRowWidget({
      id: 'row-2',
      title: 'Needs Export',
      dataSource: buildTraktDataSource({
        listName: 'Missing Trakt',
        traktId: 88,
      }),
    }),
  ]);

  const exported = buildAiometadataCatalogsOnlyExport(config, '2026-03-26T17:33:20.949Z', {
    manifestCatalogs: [
      {
        id: 'trakt.list.77',
        name: 'Existing Trakt',
        type: 'all',
        displayType: 'all',
      },
    ],
    onlyNewAgainstManifest: true,
  });

  assert.deepEqual(exported.catalogs, [
    {
      id: 'trakt.list.88',
      type: 'all',
      name: '[Needs Export] Missing Trakt',
      enabled: true,
      source: 'trakt',
    },
  ]);
});

test('buildAiometadataCatalogsOnlyExport uses slug and widget or item names as fallbacks', () => {
  const config = buildConfig([
    buildRowWidget({
      title: 'Fallback Widget',
      dataSource: buildTraktDataSource({
        listName: '',
        listSlug: 'popular-documentaries',
        traktId: 88,
      }),
    }),
    buildCollectionWidget({
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'item-fallback',
              name: 'Item Label',
              hideTitle: false,
              layout: 'Poster',
              backgroundImageURL: '',
              dataSources: [
                buildTraktDataSource({
                  listName: '',
                  listSlug: '',
                  traktId: 99,
                }),
              ],
            },
          ],
        },
      },
    }),
  ]);

  const exported = buildAiometadataCatalogsOnlyExport(config, '2026-03-26T17:33:20.949Z');
  assert.deepEqual(
    exported.catalogs.map((catalog) => catalog.name),
    ['[Fallback Widget] Popular Documentaries', '[Collection] Item Label All']
  );
});

test('buildAiometadataCatalogsOnlyExport numbers repeated item-based trakt fallback names', () => {
  const config = buildConfig([
    buildCollectionWidget({
      title: 'Collections',
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
                buildTraktDataSource({
                  listName: '',
                  listSlug: '',
                  traktId: 100,
                }),
                buildTraktDataSource({
                  listName: '',
                  listSlug: '',
                  traktId: 101,
                }),
              ],
            },
          ],
        },
      },
    }),
  ]);

  const exported = buildAiometadataCatalogsOnlyExport(config, '2026-03-26T17:33:20.949Z');
  assert.deepEqual(
    exported.catalogs.map((catalog) => catalog.name),
    ['[Collections] Hunger Games All', '[Collections] Hunger Games All 2']
  );
});

test('bridge export fails with a precise error when traktId is missing', () => {
  const config = buildConfig([
    buildCollectionWidget({
      title: 'Problem Widget',
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'broken-item',
              name: 'Broken Item',
              hideTitle: false,
              layout: 'Poster',
              backgroundImageURL: '',
              dataSources: [buildTraktDataSource({ traktId: null })],
            },
          ],
        },
      },
    }),
  ]);

  assert.throws(
    () => buildAiometadataCatalogsOnlyExport(config),
    /collection item "Broken Item" in widget "Problem Widget" is missing a traktId/
  );
});

test('hasNativeTraktSources and fingerprint reflect tracked native catalogs only', () => {
  const baseConfig = buildConfig([buildRowWidget({ dataSource: buildTraktDataSource({ traktId: 1 }) })]);
  const changedConfig = buildConfig([buildRowWidget({ dataSource: buildTraktDataSource({ traktId: 2 }) })]);
  const noNativeConfig = buildConfig([buildRowWidget()]);

  assert.equal(hasNativeTraktSources(baseConfig), true);
  assert.equal(hasNativeTraktSources(noNativeConfig), false);
  assert.notEqual(
    getNativeTraktBridgeFingerprint(baseConfig),
    getNativeTraktBridgeFingerprint(changedConfig)
  );
  assert.equal(
    getNativeTraktBridgeFingerprint(baseConfig),
    getNativeTraktBridgeFingerprint(baseConfig)
  );
  assert.notEqual(
    getNativeTraktBridgeFingerprint(baseConfig),
    getNativeTraktBridgeFingerprint(baseConfig, {
      manifestCatalogs: [{ id: 'trakt.list.1', name: 'One', type: 'all', displayType: 'all' }],
      onlyNewAgainstManifest: true,
    })
  );
});

test('bridgeNativeTraktSourcesForOmni converts native trakt sources only in the copied export payload', () => {
  const config = buildConfig([
    buildRowWidget({
      dataSource: buildTraktDataSource({
        listName: 'Bridged Row',
        traktId: 42,
      }),
    }),
    buildCollectionWidget({
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'mixed-item',
              name: 'Mixed Item',
              hideTitle: false,
              layout: 'Wide',
              backgroundImageURL: '',
              dataSources: [
                buildAioDataSource({ catalogId: 'movie::catalog-two' }),
                buildTraktDataSource({
                  listName: 'Bridged Item',
                  traktId: 43,
                }),
              ],
            },
          ],
        },
      },
    }),
  ]);

  const bridged = bridgeNativeTraktSourcesForOmni(config, 'https://example.com/manifest.json');
  const row = bridged.widgets[0];
  const collection = bridged.widgets[1];

  if (!row || row.type !== 'row.classic' || collection?.type !== 'collection.row') {
    throw new Error('Expected bridged row and collection widgets.');
  }

  assert.equal(row.dataSource.sourceType, 'aiometadata');
  assert.equal(row.dataSource.payload.catalogId, 'all::trakt.list.42');
  assert.equal(row.dataSource.payload.catalogType, 'all');
  assert.equal(collection.dataSource.payload.items[0]?.dataSources[0]?.sourceType, 'aiometadata');
  assert.equal(collection.dataSource.payload.items[0]?.dataSources[1]?.sourceType, 'aiometadata');
  assert.equal(collection.dataSource.payload.items[0]?.dataSources[1]?.payload.catalogId, 'all::trakt.list.43');
  assert.equal(collection.dataSource.payload.items[0]?.dataSources[1]?.payload.catalogType, 'all');

  const originalRow = config.widgets[0];
  if (!originalRow || originalRow.type !== 'row.classic') {
    throw new Error('Expected original row widget.');
  }
  assert.equal(originalRow.dataSource.sourceType, 'trakt-native');
});

test('convertFusionToOmni rejects native trakt by default and bridges them when requested', () => {
  const config = buildConfig([
    buildRowWidget({
      title: 'Bridged Native',
      dataSource: buildTraktDataSource({
        listName: 'Bridge Me',
        traktId: 1248149,
      }),
    }),
  ]);

  assert.throws(
    () => convertFusionToOmni(config, { nativeTraktStrategy: 'reject' }),
    /does not support native Trakt/
  );

  const snapshot = convertFusionToOmni(config, { nativeTraktStrategy: 'bridge' });
  const selectedCatalogs = decodeSnapshotValue<string[]>(snapshot.values.selected_catalogs);
  const customNames = decodeSnapshotValue<Record<string, string>>(snapshot.values.custom_catalog_names);

  assert.deepEqual(selectedCatalogs, ['all:trakt.list.1248149']);
  assert.equal(customNames['all:trakt.list.1248149'], 'Bridged Native');
});

test('convertFusionToOmni bridges native trakt collection items alongside existing AIOMetadata catalogs', () => {
  const config = buildConfig([
    buildRowWidget({
      id: 'row-one',
      title: 'Existing Catalog',
      dataSource: buildAioDataSource({ catalogId: 'movie::catalog-one' }),
    }),
    buildRowWidget({
      id: 'row-two',
      title: 'Native Catalog',
      dataSource: buildTraktDataSource({
        listName: 'Native Catalog',
        traktId: 197,
      }),
    }),
    buildCollectionWidget({
      title: 'Collection',
      dataSource: {
        kind: 'collection',
        payload: {
          items: [
            {
              id: 'mixed-item',
              name: 'Mixed Item',
              hideTitle: false,
              layout: 'Wide',
              backgroundImageURL: '',
              dataSources: [
                buildAioDataSource({ catalogId: 'movie::catalog-one' }),
                buildTraktDataSource({
                  listName: 'Native Catalog',
                  traktId: 197,
                }),
              ],
            },
          ],
        },
      },
    }),
  ]);

  const snapshot = convertFusionToOmni(config, { nativeTraktStrategy: 'bridge' });
  const roundTrip = convertOmniToFusion(snapshot);
  const collection = roundTrip.widgets.find((widget) => widget.type === 'collection.row');

  if (!collection || collection.type !== 'collection.row') {
    throw new Error('Expected collection widget after Omni round-trip.');
  }

  const itemSources = collection.dataSource.payload.items[0]?.dataSources || [];
  assert.equal(itemSources.length, 2);
  assert.equal(itemSources[0]?.sourceType, 'aiometadata');
  assert.equal(itemSources[0]?.payload.catalogId, 'movie::catalog-one');
  assert.equal(itemSources[1]?.sourceType, 'aiometadata');
  assert.equal(itemSources[1]?.payload.catalogId, 'all::trakt.list.197');
});
