import test from 'node:test';
import assert from 'node:assert/strict';
import { exportConfigToFusion } from './config-utils';
import { convertFusionToOmni, convertOmniToFusion, validateOmniExport } from './omni-converter';
import {
  MANIFEST_PLACEHOLDER,
  mergeWidgetLists,
  normalizeFusionConfigDetailed,
  normalizeLoadedState,
  parseFusionConfig,
} from './widget-domain';
import type { FusionWidgetsConfig, Widget } from './types/widget';

function buildCollectionWidget(overrides: Partial<Widget> = {}): Widget {
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
            dataSources: [
              {
                kind: 'addonCatalog',
                payload: {
                  addonId: 'https://example.com/manifest.json',
                  catalogId: 'movie::catalog-one',
                  catalogType: 'movie',
                },
              },
            ],
          },
        ],
      },
    },
    ...overrides,
  } as Widget;
}

function buildRowWidget(overrides: Partial<Widget> = {}): Widget {
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
    dataSource: {
      kind: 'addonCatalog',
      payload: {
        addonId: 'https://example.com/manifest.json',
        catalogId: 'movie::catalog-one',
        catalogType: 'movie',
      },
    },
    ...overrides,
  } as Widget;
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
                {
                  kind: 'addonCatalog',
                  payload: {
                    addonId: 'https://one.example/manifest.json',
                    catalogId: 'movie::catalog-one',
                    catalogType: 'movie',
                  },
                },
                {
                  kind: 'addonCatalog',
                  payload: {
                    addonId: 'https://two.example/manifest.json',
                    catalogId: 'series::catalog-two',
                    catalogType: 'series',
                  },
                },
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

test('ambiguous manifest suffix matches are rejected', () => {
  assert.throws(
    () =>
      parseFusionConfig(
        buildConfig([
          buildRowWidget({
            dataSource: {
              kind: 'addonCatalog',
              payload: {
                addonId: MANIFEST_PLACEHOLDER,
                catalogId: 'popular',
                catalogType: 'movie',
              },
            },
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

test('validateOmniExport rejects duplicate subgroup names', () => {
  assert.throws(
    () =>
      validateOmniExport(
        buildConfig([
          buildCollectionWidget(),
          buildCollectionWidget({
            id: 'collection-2',
            title: 'Second',
          }),
          buildRowWidget(),
        ])
      ),
    /(Duplicate subgroup name|mapped to multiple Collection items)/
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
