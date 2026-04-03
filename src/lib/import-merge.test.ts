import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyImportReview,
  buildImportReviewState,
  getImportItemSelectionKey,
} from './import-merge';
import type {
  AIOMetadataDataSource,
  CollectionItem,
  CollectionRowWidget,
  RowClassicWidget,
  Widget,
} from './types/widget';

function createDataSource(id: string): AIOMetadataDataSource {
  return {
    sourceType: 'aiometadata',
    kind: 'addonCatalog',
    payload: {
      addonId: 'https://fixtures.example/manifest.json',
      catalogId: `movie::${id}`,
      catalogType: 'movie',
    },
  };
}

function createItem(id: string, name: string, catalogId = id): CollectionItem {
  return {
    id,
    name,
    hideTitle: false,
    layout: 'Wide',
    backgroundImageURL: `https://images.example/${id}.jpg`,
    dataSources: [createDataSource(catalogId)],
  };
}

function createCollectionWidget(id: string, title: string, items: CollectionItem[]): CollectionRowWidget {
  return {
    id,
    title,
    type: 'collection.row',
    dataSource: {
      kind: 'collection',
      payload: {
        items,
      },
    },
  };
}

function createRowWidget(id: string, title: string, catalogId = id): RowClassicWidget {
  return {
    id,
    title,
    type: 'row.classic',
    cacheTTL: 3600,
    limit: 20,
    presentation: {
      aspectRatio: 'poster',
      cardStyle: 'medium',
      badges: {
        providers: false,
        ratings: true,
      },
    },
    dataSource: createDataSource(catalogId),
  };
}

function selectAll(review: ReturnType<typeof buildImportReviewState>) {
  const widgetSelected = { ...review.widgetSelected };
  const itemSelected = { ...review.itemSelected };
  const widgetFieldUpdates = { ...review.widgetFieldUpdates };
  const itemFieldUpdates = { ...review.itemFieldUpdates };

  Object.entries(review.widgetDiffs).forEach(([widgetId, diff]) => {
    if (diff.status === 'unchanged') {
      return;
    }

    widgetSelected[widgetId] = true;

    if (diff.changes.size > 0) {
      widgetFieldUpdates[widgetId] = {
        name: diff.changes.has('name'),
        catalogs: diff.changes.has('catalogs'),
        image: diff.changes.has('image'),
      };
    }

    Object.entries(diff.itemDiffs).forEach(([itemId, itemDiff]) => {
      if (itemDiff.status === 'unchanged') {
        return;
      }

      const itemKey = getImportItemSelectionKey(widgetId, itemId);
      itemSelected[itemKey] = true;
      itemFieldUpdates[itemKey] = {
        name: itemDiff.changes.has('name'),
        catalogs: itemDiff.changes.has('catalogs'),
        image: itemDiff.changes.has('image'),
      };
    });
  });

  return {
    widgetSelected,
    itemSelected,
    widgetFieldUpdates,
    itemFieldUpdates,
  };
}

test('buildImportReviewState matches renamed classic rows by id before title', () => {
  const existing: Widget[] = [createRowWidget('row-1', 'Original Title', 'catalog-a')];
  const incoming: Widget[] = [createRowWidget('row-1', 'Renamed Title', 'catalog-a')];

  const review = buildImportReviewState(existing, incoming);
  const diff = review.widgetDiffs['row-1'];

  assert.ok(diff);
  assert.equal(diff.status, 'existing');
  assert.equal(diff.matchStrategy, 'id');
  assert.equal(diff.changes.has('name'), true);
});

test('buildImportReviewState starts with no widgets or items selected', () => {
  const existing: Widget[] = [createCollectionWidget('collection-a', 'Collection A', [createItem('item-a', 'Original Item')])];
  const incoming: Widget[] = [
    createRowWidget('row-new', 'Brand New Row', 'catalog-new'),
    createCollectionWidget('collection-a', 'Collection A', [createItem('item-a', 'Renamed Item')]),
  ];

  const review = buildImportReviewState(existing, incoming);

  assert.equal(review.widgetSelected['row-new'], false);
  assert.equal(review.widgetSelected['collection-a'], false);
  assert.equal(review.itemSelected[getImportItemSelectionKey('collection-a', 'item-a')], false);
  assert.deepEqual(review.widgetFieldUpdates['row-new'], undefined);
  assert.deepEqual(review.itemFieldUpdates[getImportItemSelectionKey('collection-a', 'item-a')], {
    name: false,
    catalogs: false,
    image: false,
  });
});

test('applyImportReview moves an item into another existing widget without duplicating it', () => {
  const movedItem = createItem('item-1', 'Moved Item');
  const existing: Widget[] = [
    createCollectionWidget('collection-a', 'Collection A', [movedItem]),
    createCollectionWidget('collection-b', 'Collection B', [createItem('item-2', 'Keep Item')]),
  ];
  const incoming: Widget[] = [
    createCollectionWidget('collection-b', 'Collection B', [
      createItem('item-1', 'Moved Item'),
      createItem('item-2', 'Keep Item'),
    ]),
  ];

  const review = buildImportReviewState(existing, incoming);
  const movedDiff = review.widgetDiffs['collection-b']?.itemDiffs['item-1'];
  assert.ok(movedDiff);
  assert.equal(movedDiff.status, 'moved');

  const selected = selectAll(review);

  const applied = applyImportReview(existing, incoming, review.widgetDiffs, {
    widgetSelected: selected.widgetSelected,
    itemSelected: selected.itemSelected,
    widgetFieldUpdates: selected.widgetFieldUpdates,
    itemFieldUpdates: selected.itemFieldUpdates,
    keepExistingCatalogs: false,
    applyMode: 'merge',
  });

  const sourceWidget = applied.widgets.find((widget) => widget.id === 'collection-a');
  const targetWidget = applied.widgets.find((widget) => widget.id === 'collection-b');
  if (!sourceWidget || sourceWidget.type !== 'collection.row' || !targetWidget || targetWidget.type !== 'collection.row') {
    throw new Error('Expected collection widgets after apply.');
  }

  assert.equal(sourceWidget.dataSource.payload.items.some((item) => item.id === 'item-1'), false);
  assert.equal(targetWidget.dataSource.payload.items.some((item) => item.id === 'item-1'), true);
  assert.equal(applied.widgetsUpdated, 2);
  assert.equal(applied.itemsUpdated, 1);
});

test('applyImportReview can move an item into a new widget and preserve only selected items', () => {
  const movedItem = createItem('item-move', 'Moved Item');
  const newItem = createItem('item-new', 'New Item');
  const existing: Widget[] = [
    createCollectionWidget('collection-a', 'Collection A', [movedItem]),
  ];
  const incoming: Widget[] = [
    createCollectionWidget('collection-new', 'Collection New', [movedItem, newItem]),
  ];

  const review = buildImportReviewState(existing, incoming);
  const selected = selectAll(review);
  const selectedItems = {
    ...selected.itemSelected,
    [getImportItemSelectionKey('collection-new', 'item-new')]: false,
  };

  const applied = applyImportReview(existing, incoming, review.widgetDiffs, {
    widgetSelected: selected.widgetSelected,
    itemSelected: selectedItems,
    widgetFieldUpdates: selected.widgetFieldUpdates,
    itemFieldUpdates: selected.itemFieldUpdates,
    keepExistingCatalogs: false,
    applyMode: 'merge',
  });

  const sourceWidget = applied.widgets.find((widget) => widget.id === 'collection-a');
  const newWidget = applied.widgets.find((widget) => widget.id === 'collection-new');
  if (!sourceWidget || sourceWidget.type !== 'collection.row' || !newWidget || newWidget.type !== 'collection.row') {
    throw new Error('Expected collection widgets after apply.');
  }

  assert.equal(sourceWidget.dataSource.payload.items.length, 0);
  assert.deepEqual(newWidget.dataSource.payload.items.map((item) => item.id), ['item-move']);
  assert.equal(applied.widgetsAdded, 1);
  assert.equal(applied.itemsUpdated, 1);
});

test('buildImportReviewState marks ambiguous matches without auto-moving them', () => {
  const existing: Widget[] = [
    createCollectionWidget('collection-a', 'Collection A', [createItem('item-a', 'Shared Name', 'catalog-a')]),
    createCollectionWidget('collection-b', 'Collection B', [createItem('item-b', 'Shared Name', 'catalog-b')]),
  ];
  const incoming: Widget[] = [
    createCollectionWidget('collection-c', 'Collection C', [createItem('item-c', 'Shared Name', 'catalog-c')]),
  ];

  const review = buildImportReviewState(existing, incoming);
  const diff = review.widgetDiffs['collection-c']?.itemDiffs['item-c'];

  assert.ok(diff);
  assert.equal(diff.status, 'ambiguous');
});

test('applyImportReview reconcile removes missing local items only from matched widgets', () => {
  const keepItem = createItem('item-keep', 'Keep');
  const dropItem = createItem('item-drop', 'Drop');
  const untouchedItem = createItem('item-untouched', 'Untouched');
  const existing: Widget[] = [
    createCollectionWidget('collection-a', 'Collection A', [keepItem, dropItem]),
    createCollectionWidget('collection-b', 'Collection B', [untouchedItem]),
  ];
  const incoming: Widget[] = [
    createCollectionWidget('collection-a', 'Collection A', [createItem('item-keep', 'Keep')]),
  ];

  const review = buildImportReviewState(existing, incoming);
  const selected = selectAll(review);
  const applied = applyImportReview(existing, incoming, review.widgetDiffs, {
    widgetSelected: selected.widgetSelected,
    itemSelected: selected.itemSelected,
    widgetFieldUpdates: selected.widgetFieldUpdates,
    itemFieldUpdates: selected.itemFieldUpdates,
    keepExistingCatalogs: false,
    applyMode: 'reconcile',
  });

  const matchedWidget = applied.widgets.find((widget) => widget.id === 'collection-a');
  const untouchedWidget = applied.widgets.find((widget) => widget.id === 'collection-b');
  if (!matchedWidget || matchedWidget.type !== 'collection.row' || !untouchedWidget || untouchedWidget.type !== 'collection.row') {
    throw new Error('Expected collection widgets after apply.');
  }

  assert.deepEqual(matchedWidget.dataSource.payload.items.map((item) => item.id), ['item-keep']);
  assert.deepEqual(untouchedWidget.dataSource.payload.items.map((item) => item.id), ['item-untouched']);
});

test('applyImportReview merge keeps missing local items in matched widgets', () => {
  const keepItem = createItem('item-keep', 'Keep');
  const keepLocalOnly = createItem('item-local-only', 'Local Only');
  const existing: Widget[] = [
    createCollectionWidget('collection-a', 'Collection A', [keepItem, keepLocalOnly]),
  ];
  const incoming: Widget[] = [
    createCollectionWidget('collection-a', 'Collection A', [createItem('item-keep', 'Keep')]),
  ];

  const review = buildImportReviewState(existing, incoming);
  const selected = selectAll(review);
  const applied = applyImportReview(existing, incoming, review.widgetDiffs, {
    widgetSelected: selected.widgetSelected,
    itemSelected: selected.itemSelected,
    widgetFieldUpdates: selected.widgetFieldUpdates,
    itemFieldUpdates: selected.itemFieldUpdates,
    keepExistingCatalogs: false,
    applyMode: 'merge',
  });

  const matchedWidget = applied.widgets.find((widget) => widget.id === 'collection-a');
  if (!matchedWidget || matchedWidget.type !== 'collection.row') {
    throw new Error('Expected collection widget after apply.');
  }

  assert.deepEqual(matchedWidget.dataSource.payload.items.map((item) => item.id), ['item-keep', 'item-local-only']);
});
