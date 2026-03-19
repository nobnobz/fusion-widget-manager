import test from 'node:test';
import assert from 'node:assert/strict';
import { exportConfigToFusion } from './config-utils';
import { convertFusionToOmni, validateOmniExport } from './omni-converter';
import {
  MANIFEST_PLACEHOLDER,
  mergeWidgetLists,
  normalizeFusionConfigDetailed,
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
