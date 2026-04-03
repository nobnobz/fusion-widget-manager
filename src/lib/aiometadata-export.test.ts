import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiometadataCatalogExport,
  getResolvedAiometadataTargetSettings,
  sanitizeAiometadataExportOverrides,
  getDefaultAiometadataExportOverrides,
} from './aiometadata-export';
import { collectAiometadataExportInventory } from './aiometadata-export-inventory';
import { 
  type AIOMetadataExportOverrideState,
  EMPTY_AIOMETADATA_EXPORT_OVERRIDE_STATE,
} from './aiometadata-export-settings';
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
      catalogId: 'movie::mdblist.1',
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
      listName: 'Watchlist',
      listSlug: 'watchlist',
      traktId: 42,
      username: 'fixture-user',
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
            dataSources: [buildTraktDataSource()],
          },
          {
            id: 'item-2',
            name: 'Item Two',
            hideTitle: false,
            layout: 'Poster',
            backgroundImageURL: '',
            dataSources: [buildAioDataSource({ catalogId: 'movie::streaming.sta', catalogType: 'movie' })],
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

test('sanitizeAiometadataExportOverrides removes stale keys and invalid source fields', () => {
  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildRowWidget(),
      buildCollectionWidget(),
    ])
  );

  const mdblistCatalogKey = inventory.catalogs.find((catalog) => catalog.source === 'mdblist')?.key;
  const traktCatalogKey = inventory.catalogs.find((catalog) => catalog.source === 'trakt')?.key;
  const streamingCatalogKey = inventory.catalogs.find((catalog) => catalog.source === 'streaming')?.key;

  assert.ok(mdblistCatalogKey);
  assert.ok(traktCatalogKey);
  assert.ok(streamingCatalogKey);

  const invalidOverrides = {
    widgets: {
      'row-1': {
        mdblist: {
          sort: 'rank',
          order: 'desc',
          cacheTTL: 1200,
        },
        trakt: {
          sort: 'not-a-real-sort' as never,
          sortDirection: 'sideways' as never,
          cacheTTL: 10,
        },
      },
      'missing-widget': {
        mdblist: {
          sort: 'random',
        },
      },
    },
    items: {
      'collection-1::item-1': {
        trakt: {
          sort: 'added',
          sortDirection: 'desc',
          cacheTTL: 1800,
        },
        streaming: {
          sort: 'not-real' as never,
          sortDirection: 'desc',
        },
      },
      'collection-1::missing-item': {
        trakt: {
          sort: 'added',
        },
      },
    },
    catalogs: {
      [mdblistCatalogKey]: {
        sort: 'title',
        order: 'asc',
        cacheTTL: 3600,
        sortDirection: 'desc',
      },
      [traktCatalogKey]: {
        sort: 'released',
        sortDirection: 'desc',
        cacheTTL: 2400,
        order: 'asc',
      },
      [streamingCatalogKey]: {
        sort: 'release_date',
        sortDirection: 'asc',
        cacheTTL: 999,
      },
      'missing::catalog': {
        sort: 'random',
      },
    },
  } as unknown as AIOMetadataExportOverrideState;

  const sanitized = sanitizeAiometadataExportOverrides(inventory, invalidOverrides);

  assert.deepEqual(sanitized.widgets, {
    'row-1': {
      mdblist: {
        sort: 'rank',
        order: 'desc',
        cacheTTL: 1200,
      },
    },
  });
  assert.deepEqual(sanitized.items, {
    'collection-1::item-1': {
      streaming: {
        sortDirection: 'desc',
      },
      trakt: {
        sort: 'added',
        sortDirection: 'desc',
        cacheTTL: 1800,
      },
    },
  });
  assert.deepEqual(sanitized.catalogs, {
    [mdblistCatalogKey]: {
      sort: 'title',
      order: 'asc',
      cacheTTL: 3600,
    },
    [traktCatalogKey]: {
      sort: 'released',
      sortDirection: 'desc',
      cacheTTL: 2400,
    },
    [streamingCatalogKey]: {
      sort: 'release_date',
      sortDirection: 'asc',
    },
  });
});

test('getResolvedAiometadataTargetSettings resolves widget, item, and catalog overrides with defaults', () => {
  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildRowWidget(),
      buildCollectionWidget(),
    ])
  );

  const traktItem = inventory.widgets
    .flatMap((widget) => widget.items)
    .find((item) => item.catalogKeys.some((catalogKey) => inventory.catalogs.find((catalog) => catalog.key === catalogKey)?.source === 'trakt'));
  const mdblistCatalogKey = inventory.catalogs.find((catalog) => catalog.source === 'mdblist')?.key;

  assert.ok(traktItem);
  assert.ok(mdblistCatalogKey);

  const overrides = {
    widgets: {
      'row-1': {
        mdblist: {
          sort: 'rank' as const,
        },
      },
    },
    items: {
      [traktItem.id]: {
        trakt: {
          sort: 'added' as const,
          sortDirection: 'desc' as const,
        },
      },
    },
    catalogs: {
      [mdblistCatalogKey]: {
        order: 'desc' as const,
      },
    },
  };

  assert.deepEqual(
    getResolvedAiometadataTargetSettings({
      inventory,
      target: { kind: 'widget', widgetId: 'row-1' },
      exportSettingsOverrides: overrides,
    }),
    {
      mdblist: {
        sort: 'rank',
        order: 'desc',
        cacheTTL: 43200,
      },
    }
  );

  assert.deepEqual(
    getResolvedAiometadataTargetSettings({
      inventory,
      target: { kind: 'item', itemKey: traktItem.id },
      exportSettingsOverrides: overrides,
    }),
    {
      trakt: {
        sort: 'added',
        sortDirection: 'desc',
        cacheTTL: 43200,
      },
    }
  );

  assert.deepEqual(
    getResolvedAiometadataTargetSettings({
      inventory,
      target: { kind: 'catalog', catalogKey: mdblistCatalogKey },
      exportSettingsOverrides: overrides,
    }),
    {
      mdblist: {
        sort: 'rank',
        order: 'desc',
        cacheTTL: 43200,
      },
    }
  );
});

test('letterboxd export settings keep only cache TTL and default to 12 hours', () => {
  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildRowWidget({
        id: 'row-letterboxd',
        title: 'Letterboxd Row',
        dataSource: buildAioDataSource({ catalogId: 'movie::letterboxd.nVqt6', catalogType: 'movie' }),
      }),
    ])
  );

  const letterboxdCatalogKey = inventory.catalogs.find((catalog) => catalog.source === 'letterboxd')?.key;
  assert.ok(letterboxdCatalogKey);

  const sanitized = sanitizeAiometadataExportOverrides(
    inventory,
    {
      widgets: {
        'row-letterboxd': {
          letterboxd: {
            cacheTTL: 7200,
            sortDirection: 'desc' as never,
          },
        },
      },
      items: {},
      catalogs: {
        [letterboxdCatalogKey]: {
          cacheTTL: 5400,
          sort: 'title' as never,
          order: 'desc' as never,
          sortDirection: 'asc' as never,
        },
      },
    } as AIOMetadataExportOverrideState
  );

  assert.deepEqual(sanitized, {
    widgets: {
      'row-letterboxd': {
        letterboxd: {
          cacheTTL: 7200,
        },
      },
    },
    items: {},
    catalogs: {
      [letterboxdCatalogKey]: {
        cacheTTL: 5400,
      },
    },
  });

  assert.deepEqual(
    getResolvedAiometadataTargetSettings({
      inventory,
      target: { kind: 'catalog', catalogKey: letterboxdCatalogKey },
      exportSettingsOverrides: {
        widgets: {},
        items: {},
        catalogs: {
          [letterboxdCatalogKey]: {
            cacheTTL: 5400,
          },
        },
      },
    }),
    {
      letterboxd: {
        cacheTTL: 5400,
      },
    }
  );

  const exported = buildAiometadataCatalogExport({
    inventory,
    includeAll: true,
    exportedAt: '2026-04-02T10:00:00.000Z',
  });

  assert.deepEqual(exported.catalogs, [
    {
      id: 'letterboxd.nVqt6',
      type: 'movie',
      name: '[Classic Row] Letterboxd Row',
      enabled: true,
      source: 'letterboxd',
      displayType: 'movie',
      cacheTTL: 43200,
    },
  ]);
});

test('getDefaultAiometadataExportOverrides applies letterboxd-group rules from UME template', () => {
  const inventory = collectAiometadataExportInventory(
    buildConfig([
      buildRowWidget({
        id: 'row-genres',
        title: 'Genre',
        dataSource: buildAioDataSource({ catalogId: 'movie::letterboxd.nVqt6', catalogType: 'movie' }),
      }),
    ])
  );

  const letterboxdCatalogKey = inventory.catalogs.find((catalog) => catalog.source === 'letterboxd')?.key;
  assert.ok(letterboxdCatalogKey);

  const overrides = getDefaultAiometadataExportOverrides({
    inventory,
    currentOverrides: EMPTY_AIOMETADATA_EXPORT_OVERRIDE_STATE,
  });

  const resolved = getResolvedAiometadataTargetSettings({
    inventory,
    target: { kind: 'catalog', catalogKey: letterboxdCatalogKey },
    exportSettingsOverrides: overrides,
  });

  assert.equal(resolved.letterboxd?.cacheTTL, 43200);
});
