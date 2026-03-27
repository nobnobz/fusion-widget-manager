import type {
  AIOMetadataCatalog,
  AIOMetadataDataSource,
  CollectionItem,
  CollectionRowWidget,
  FusionWidgetsConfig,
  NativeTraktDataSource,
  RowClassicWidget,
  TrashCollectionItemEntry,
  TrashWidgetEntry,
  Widget,
  WidgetDataSource,
} from '../../src/lib/types/widget';

export const AUDIT_FIXTURE_MANIFEST_URL = 'https://fixtures.example/aiometadata/manifest.json';

export interface AuditFixture {
  name: string;
  config: FusionWidgetsConfig;
  manifestCatalogs: AIOMetadataCatalog[];
  manifestContent: string;
  manifestUrl: string;
  replacePlaceholder: boolean;
  trash: TrashWidgetEntry[];
  itemTrash: TrashCollectionItemEntry[];
}

interface AuditFixtureOptions {
  collectionRows: number;
  itemsPerCollection: number;
  classicRows: number;
  dataSourcesPerCollectionItem: number;
  includeTrash: boolean;
  manifestCatalogCount: number;
  name: string;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createCatalog(index: number): AIOMetadataCatalog {
  const type = index % 2 === 0 ? 'movie' : 'series';
  const suffix = String(index + 1).padStart(3, '0');

  return {
    id: `fixture-${type}-${suffix}`,
    name: `Fixture ${type === 'movie' ? 'Movie' : 'Series'} ${suffix}`,
    type,
    displayType: type,
  };
}

function createManifestCatalogs(count: number): AIOMetadataCatalog[] {
  return Array.from({ length: count }, (_, index) => createCatalog(index));
}

function createAiometadataDataSource(index: number, catalogs: AIOMetadataCatalog[], offset = 0): AIOMetadataDataSource {
  const catalog = catalogs[(index + offset) % catalogs.length];

  return {
    sourceType: 'aiometadata',
    kind: 'addonCatalog',
    payload: {
      addonId: AUDIT_FIXTURE_MANIFEST_URL,
      catalogId: `${catalog.type}::${catalog.id}`,
      catalogType: catalog.displayType || catalog.type,
    },
  };
}

function createNativeTraktDataSource(index: number): NativeTraktDataSource {
  const suffix = String(index + 1).padStart(3, '0');

  return {
    sourceType: 'trakt-native',
    kind: 'traktList',
    payload: {
      listName: `Fixture Trakt ${suffix}`,
      listSlug: `fixture-trakt-${suffix}`,
      traktId: 50_000 + index,
      username: 'fixture-user',
    },
  };
}

function createClassicRowWidget(index: number, catalogs: AIOMetadataCatalog[]): RowClassicWidget {
  const suffix = String(index + 1).padStart(3, '0');
  const dataSource = index % 4 === 3
    ? createNativeTraktDataSource(index)
    : createAiometadataDataSource(index, catalogs);

  return {
    id: `classic-widget-${suffix}`,
    title: `Audit Classic ${suffix}`,
    type: 'row.classic',
    cacheTTL: 1800 + index,
    limit: 20 + (index % 5),
    presentation: {
      aspectRatio: index % 3 === 0 ? 'poster' : index % 3 === 1 ? 'wide' : 'square',
      cardStyle: index % 2 === 0 ? 'medium' : 'large',
      badges: {
        providers: index % 2 === 0,
        ratings: true,
      },
    },
    dataSource,
  };
}

function createCollectionItem(
  widgetIndex: number,
  itemIndex: number,
  dataSourcesPerCollectionItem: number,
  catalogs: AIOMetadataCatalog[],
): CollectionItem {
  const suffix = `${String(widgetIndex + 1).padStart(3, '0')}-${String(itemIndex + 1).padStart(2, '0')}`;
  const dataSources: WidgetDataSource[] = Array.from(
    { length: dataSourcesPerCollectionItem },
    (_, dataSourceIndex) => createAiometadataDataSource(widgetIndex * 17 + itemIndex, catalogs, dataSourceIndex),
  );

  if (itemIndex % 4 === 3) {
    dataSources.push(createNativeTraktDataSource(widgetIndex * 100 + itemIndex));
  }

  return {
    id: `collection-item-${suffix}`,
    name: `Audit Item ${suffix}`,
    hideTitle: itemIndex % 2 === 0,
    layout: itemIndex % 3 === 0 ? 'Wide' : itemIndex % 3 === 1 ? 'Poster' : 'Square',
    backgroundImageURL: `https://images.example/${suffix}.jpg`,
    dataSources,
  };
}

function createCollectionRowWidget(
  index: number,
  itemCount: number,
  dataSourcesPerCollectionItem: number,
  catalogs: AIOMetadataCatalog[],
): CollectionRowWidget {
  const suffix = String(index + 1).padStart(3, '0');

  return {
    id: `collection-widget-${suffix}`,
    title: `Audit Collection ${suffix}`,
    type: 'collection.row',
    dataSource: {
      kind: 'collection',
      payload: {
        items: Array.from({ length: itemCount }, (_, itemIndex) =>
          createCollectionItem(index, itemIndex, dataSourcesPerCollectionItem, catalogs),
        ),
      },
    },
  };
}

export function buildAuditFixture(options: AuditFixtureOptions): AuditFixture {
  const manifestCatalogs = createManifestCatalogs(options.manifestCatalogCount);
  const widgets: Widget[] = [
    ...Array.from({ length: options.classicRows }, (_, index) => createClassicRowWidget(index, manifestCatalogs)),
    ...Array.from({ length: options.collectionRows }, (_, index) =>
      createCollectionRowWidget(index, options.itemsPerCollection, options.dataSourcesPerCollectionItem, manifestCatalogs),
    ),
  ];

  const trash: TrashWidgetEntry[] = [];
  const itemTrash: TrashCollectionItemEntry[] = [];

  if (options.includeTrash && widgets.length > 2) {
    trash.push({
      widget: cloneValue(widgets[widgets.length - 1]!),
      deletedAt: '2026-03-27T08:00:00.000Z',
      originalIndex: widgets.length - 1,
    });

    const collectionWidget = widgets.find(
      (widget): widget is CollectionRowWidget => widget.type === 'collection.row' && widget.dataSource.payload.items.length > 1,
    );

    if (collectionWidget) {
      itemTrash.push({
        widgetId: collectionWidget.id,
        widgetTitle: collectionWidget.title,
        item: cloneValue(collectionWidget.dataSource.payload.items[1]!),
        deletedAt: '2026-03-27T08:05:00.000Z',
        originalIndex: 1,
      });
    }
  }

  return {
    name: options.name,
    config: {
      exportType: 'fusionWidgets',
      exportVersion: 1,
      widgets,
    },
    manifestCatalogs,
    manifestContent: JSON.stringify({ catalogs: manifestCatalogs }, null, 2),
    manifestUrl: AUDIT_FIXTURE_MANIFEST_URL,
    replacePlaceholder: true,
    trash,
    itemTrash,
  };
}

export const auditFixtures = {
  small: buildAuditFixture({
    name: 'small',
    classicRows: 3,
    collectionRows: 2,
    itemsPerCollection: 4,
    dataSourcesPerCollectionItem: 2,
    manifestCatalogCount: 18,
    includeTrash: true,
  }),
  medium: buildAuditFixture({
    name: 'medium',
    classicRows: 8,
    collectionRows: 6,
    itemsPerCollection: 6,
    dataSourcesPerCollectionItem: 2,
    manifestCatalogCount: 28,
    includeTrash: true,
  }),
  large: buildAuditFixture({
    name: 'large',
    classicRows: 22,
    collectionRows: 14,
    itemsPerCollection: 8,
    dataSourcesPerCollectionItem: 3,
    manifestCatalogCount: 48,
    includeTrash: true,
  }),
  stress: buildAuditFixture({
    name: 'stress',
    classicRows: 42,
    collectionRows: 22,
    itemsPerCollection: 10,
    dataSourcesPerCollectionItem: 3,
    manifestCatalogCount: 72,
    includeTrash: true,
  }),
} as const;

export type AuditFixtureName = keyof typeof auditFixtures;

export function getAuditFixture(name: AuditFixtureName): AuditFixture {
  return auditFixtures[name];
}

export function serializeFixture(fixture: AuditFixture): string {
  return JSON.stringify(fixture.config, null, 2);
}

export function createMergeImportFixture(baseFixture: AuditFixture = auditFixtures.medium): FusionWidgetsConfig {
  const duplicatedWidget = cloneValue(baseFixture.config.widgets[0]!);
  const newWidget = createClassicRowWidget(999, baseFixture.manifestCatalogs);
  newWidget.id = 'classic-widget-merge-001';
  newWidget.title = 'Audit Merge Widget';

  return {
    exportType: 'fusionWidgets',
    exportVersion: 1,
    widgets: [duplicatedWidget, newWidget],
  };
}

export function createStoredAppState(fixture: AuditFixture, manifestSynced = true) {
  return {
    'fusion-widgets-config': JSON.stringify({
      widgets: fixture.config.widgets,
      trash: fixture.trash,
      itemTrash: fixture.itemTrash,
      manifestUrl: manifestSynced ? fixture.manifestUrl : '',
      replacePlaceholder: fixture.replacePlaceholder,
      manifestCatalogs: [],
      manifestContent: '',
    }),
    'fusion-widget-manifest-catalogs': manifestSynced ? JSON.stringify(fixture.manifestCatalogs) : '[]',
    'fusion-widget-manifest-content': manifestSynced ? fixture.manifestContent : '',
  };
}

export const malformedFixtures = {
  invalidJsonText: '{"exportType":"fusionWidgets","widgets":[',
  missingExportType: JSON.stringify(
    {
      widgets: cloneValue(auditFixtures.small.config.widgets.slice(0, 1)),
    },
    null,
    2,
  ),
  duplicateIds: JSON.stringify(
    {
      exportType: 'fusionWidgets',
      exportVersion: 1,
      widgets: [
        {
          ...cloneValue(auditFixtures.small.config.widgets[0]!),
          id: 'duplicate-widget-id',
          title: 'Duplicate A',
        },
        {
          ...cloneValue(auditFixtures.small.config.widgets[1]!),
          id: 'duplicate-widget-id',
          title: 'Duplicate B',
        },
      ],
    },
    null,
    2,
  ),
};
