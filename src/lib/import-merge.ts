import type {
  CollectionItem,
  CollectionRowWidget,
  RowClassicWidget,
  Widget,
  WidgetDataSource,
} from './types/widget';
import { createWidgetDuplicateKey } from './widget-domain';

export type ImportApplyMode = 'merge' | 'reconcile';
export type ImportChangeField = 'name' | 'catalogs' | 'image';
export type ItemDiffStatus = 'new' | 'updated' | 'moved' | 'unchanged' | 'ambiguous';
export type WidgetMatchStrategy = 'id' | 'duplicate-key';

export interface ItemDiff {
  status: ItemDiffStatus;
  changes: Set<ImportChangeField>;
  matchedExistingItem?: CollectionItem;
  matchedExistingWidget?: CollectionRowWidget;
  matchStrategy?: 'item-id' | 'catalog-fingerprint' | 'name';
  ambiguousMatchCount?: number;
}

export interface WidgetDiff {
  status: 'new' | 'existing' | 'unchanged';
  changes: Set<ImportChangeField>;
  itemDiffs: Record<string, ItemDiff>;
  existingWidget?: Widget;
  matchStrategy?: WidgetMatchStrategy;
  reconcileRemovals?: string[];
}

export interface ImportReviewState {
  widgetDiffs: Record<string, WidgetDiff>;
  widgetSelected: Record<string, boolean>;
  itemSelected: Record<string, boolean>;
  widgetFieldUpdates: Record<string, { name: boolean; catalogs: boolean; image: boolean }>;
  itemFieldUpdates: Record<string, { name: boolean; catalogs: boolean; image: boolean }>;
}

export interface ApplyImportSelectionState {
  widgetSelected: Record<string, boolean>;
  itemSelected: Record<string, boolean>;
  widgetFieldUpdates: Record<string, { name: boolean; catalogs: boolean; image: boolean }>;
  itemFieldUpdates: Record<string, { name: boolean; catalogs: boolean; image: boolean }>;
  keepExistingCatalogs: boolean;
  applyMode: ImportApplyMode;
}

export interface ApplyImportResult {
  widgets: Widget[];
  widgetsAdded: number;
  widgetsUpdated: number;
  itemsAdded: number;
  itemsUpdated: number;
}

interface ExistingCollectionItemRef {
  key: string;
  item: CollectionItem;
  widget: CollectionRowWidget;
}

interface ItemMatchResult {
  kind: 'matched' | 'ambiguous' | 'none';
  match?: ExistingCollectionItemRef;
  strategy?: 'item-id' | 'catalog-fingerprint' | 'name';
  ambiguousCount?: number;
}

function cloneWidget<T extends Widget>(widget: T): T {
  return structuredClone(widget);
}

function cloneItem<T extends CollectionItem>(item: T): T {
  return structuredClone(item);
}

export function getImportItemSelectionKey(widgetId: string, itemId: string): string {
  return `${widgetId}::${itemId}`;
}

export function getCatalogFingerprint(dataSources: WidgetDataSource[]): string {
  return JSON.stringify(
    dataSources
      .map((ds) =>
        ds.sourceType === 'aiometadata'
          ? `${ds.payload.addonId}::${ds.payload.catalogId}::${ds.payload.catalogType}`
          : `trakt::${ds.payload.listSlug}`
      )
      .sort()
  );
}

export function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function getItemImageChanged(left: CollectionItem, right: CollectionItem): boolean {
  return (left.backgroundImageURL || '') !== (right.backgroundImageURL || '')
    || (left.layout || 'Wide') !== (right.layout || 'Wide');
}

export function diffRowClassic(
  incoming: Widget,
  existing: Widget
): { changes: Set<ImportChangeField>; unchanged: boolean } {
  const changes = new Set<ImportChangeField>();

  if (incoming.type !== 'row.classic' || existing.type !== 'row.classic') {
    return { changes, unchanged: true };
  }

  const incomingFP = getCatalogFingerprint([incoming.dataSource]);
  const existingFP = getCatalogFingerprint([existing.dataSource]);

  if (normalizeNameKey(incoming.title) !== normalizeNameKey(existing.title)) {
    changes.add('name');
  }
  if (incomingFP !== existingFP) {
    changes.add('catalogs');
  }

  const incomingImage = incoming.presentation?.backgroundImageURL || '';
  const existingImage = existing.presentation?.backgroundImageURL || '';
  const layoutChanged = (incoming.presentation?.aspectRatio || 'poster') !== (existing.presentation?.aspectRatio || 'poster');
  if (incomingImage !== existingImage || layoutChanged) {
    changes.add('image');
  }

  return { changes, unchanged: changes.size === 0 };
}

function buildExistingCollectionItemRefs(existingWidgets: Widget[]): ExistingCollectionItemRef[] {
  return existingWidgets.flatMap((widget) => {
    if (widget.type !== 'collection.row') {
      return [];
    }

    return widget.dataSource.payload.items.map((item) => ({
      key: getImportItemSelectionKey(widget.id, item.id),
      item,
      widget,
    }));
  });
}

function buildIndex(
  refs: ExistingCollectionItemRef[],
  selector: (ref: ExistingCollectionItemRef) => string
): Map<string, ExistingCollectionItemRef[]> {
  const index = new Map<string, ExistingCollectionItemRef[]>();

  refs.forEach((ref) => {
    const key = selector(ref);
    if (!key) {
      return;
    }

    const bucket = index.get(key);
    if (bucket) {
      bucket.push(ref);
      return;
    }

    index.set(key, [ref]);
  });

  return index;
}

function resolveItemMatch(
  incomingItem: CollectionItem,
  indices: {
    byId: Map<string, ExistingCollectionItemRef[]>;
    byFingerprint: Map<string, ExistingCollectionItemRef[]>;
    byName: Map<string, ExistingCollectionItemRef[]>;
  },
  claimedExistingItemKeys: Set<string>
): ItemMatchResult {
  const strategies: Array<{
    key: string;
    index: Map<string, ExistingCollectionItemRef[]>;
    strategy: 'item-id' | 'catalog-fingerprint' | 'name';
  }> = [
    { key: incomingItem.id, index: indices.byId, strategy: 'item-id' },
    { key: getCatalogFingerprint(incomingItem.dataSources), index: indices.byFingerprint, strategy: 'catalog-fingerprint' },
    { key: normalizeNameKey(incomingItem.name), index: indices.byName, strategy: 'name' },
  ];

  for (const candidate of strategies) {
    if (!candidate.key) {
      continue;
    }

    const matches = candidate.index.get(candidate.key) || [];
    if (matches.length > 1) {
      return {
        kind: 'ambiguous',
        strategy: candidate.strategy,
        ambiguousCount: matches.length,
      };
    }

    if (matches.length === 1) {
      const match = matches[0];
      if (!match || claimedExistingItemKeys.has(match.key)) {
        return {
          kind: 'ambiguous',
          strategy: candidate.strategy,
          ambiguousCount: 1,
        };
      }

      return {
        kind: 'matched',
        strategy: candidate.strategy,
        match,
      };
    }
  }

  return { kind: 'none' };
}

function computeCollectionItemDiff(
  incomingItem: CollectionItem,
  matchedWidget: CollectionRowWidget | undefined,
  indices: {
    byId: Map<string, ExistingCollectionItemRef[]>;
    byFingerprint: Map<string, ExistingCollectionItemRef[]>;
    byName: Map<string, ExistingCollectionItemRef[]>;
  },
  claimedExistingItemKeys: Set<string>
): ItemDiff {
  const matchResult = resolveItemMatch(incomingItem, indices, claimedExistingItemKeys);

  if (matchResult.kind === 'none') {
    return {
      status: 'new',
      changes: new Set<ImportChangeField>(),
    };
  }

  if (matchResult.kind === 'ambiguous') {
    return {
      status: 'ambiguous',
      changes: new Set<ImportChangeField>(),
      matchStrategy: matchResult.strategy,
      ambiguousMatchCount: matchResult.ambiguousCount,
    };
  }

  const matchedRef = matchResult.match;
  if (!matchedRef) {
    return {
      status: 'new',
      changes: new Set<ImportChangeField>(),
    };
  }

  claimedExistingItemKeys.add(matchedRef.key);

  const changes = new Set<ImportChangeField>();
  if (normalizeNameKey(matchedRef.item.name) !== normalizeNameKey(incomingItem.name)) {
    changes.add('name');
  }
  if (getItemImageChanged(matchedRef.item, incomingItem)) {
    changes.add('image');
  }
  if (getCatalogFingerprint(matchedRef.item.dataSources) !== getCatalogFingerprint(incomingItem.dataSources)) {
    changes.add('catalogs');
  }

  const status = matchedWidget && matchedRef.widget.id === matchedWidget.id
    ? (changes.size === 0 ? 'unchanged' : 'updated')
    : 'moved';

  return {
    status,
    changes,
    matchedExistingItem: matchedRef.item,
    matchedExistingWidget: matchedRef.widget,
    matchStrategy: matchResult.strategy,
  };
}

function findMatchedExistingWidget(
  incomingWidget: Widget,
  existingWidgets: Widget[],
  matchedExistingWidgetIds: Set<string>
): { widget?: Widget; strategy?: WidgetMatchStrategy } {
  const idMatch = existingWidgets.find((widget) => widget.id === incomingWidget.id && !matchedExistingWidgetIds.has(widget.id));
  if (idMatch) {
    return { widget: idMatch, strategy: 'id' };
  }

  const duplicateKey = createWidgetDuplicateKey(incomingWidget);
  const duplicateMatches = existingWidgets.filter(
    (widget) => createWidgetDuplicateKey(widget) === duplicateKey && !matchedExistingWidgetIds.has(widget.id)
  );

  if (duplicateMatches.length === 1) {
    return { widget: duplicateMatches[0], strategy: 'duplicate-key' };
  }

  return {};
}

export function buildImportReviewState(existingWidgets: Widget[], incomingWidgets: Widget[]): ImportReviewState {
  const widgetDiffs: Record<string, WidgetDiff> = {};
  const widgetSelected: Record<string, boolean> = {};
  const itemSelected: Record<string, boolean> = {};
  const widgetFieldUpdates: Record<string, { name: boolean; catalogs: boolean; image: boolean }> = {};
  const itemFieldUpdates: Record<string, { name: boolean; catalogs: boolean; image: boolean }> = {};

  const existingRefs = buildExistingCollectionItemRefs(existingWidgets);
  const indices = {
    byId: buildIndex(existingRefs, (ref) => ref.item.id),
    byFingerprint: buildIndex(existingRefs, (ref) => getCatalogFingerprint(ref.item.dataSources)),
    byName: buildIndex(existingRefs, (ref) => normalizeNameKey(ref.item.name)),
  };

  const matchedExistingWidgetIds = new Set<string>();
  const claimedExistingItemKeys = new Set<string>();

  incomingWidgets.forEach((incomingWidget) => {
    const matchedWidgetResult = findMatchedExistingWidget(incomingWidget, existingWidgets, matchedExistingWidgetIds);
    const matchedWidget = matchedWidgetResult.widget;
    if (matchedWidget) {
      matchedExistingWidgetIds.add(matchedWidget.id);
    }

    if (!matchedWidget) {
      const itemDiffs: Record<string, ItemDiff> = {};
      if (incomingWidget.type === 'collection.row') {
        incomingWidget.dataSource.payload.items.forEach((item) => {
          const itemDiff = computeCollectionItemDiff(item, undefined, indices, claimedExistingItemKeys);
          const itemKey = getImportItemSelectionKey(incomingWidget.id, item.id);
          itemDiffs[item.id] = itemDiff;
          itemSelected[itemKey] = false;
          itemFieldUpdates[itemKey] = {
            name: false,
            catalogs: false,
            image: false,
          };
        });
      }

      widgetDiffs[incomingWidget.id] = {
        status: 'new',
        changes: new Set<ImportChangeField>(),
        itemDiffs,
      };
      widgetSelected[incomingWidget.id] = false;
      return;
    }

    if (incomingWidget.type === 'collection.row' && matchedWidget.type === 'collection.row') {
      const itemDiffs: Record<string, ItemDiff> = {};
      const matchedExistingItemIdsInTarget = new Set<string>();
      incomingWidget.dataSource.payload.items.forEach((item) => {
        const itemDiff = computeCollectionItemDiff(item, matchedWidget, indices, claimedExistingItemKeys);
        itemDiffs[item.id] = itemDiff;
        if (itemDiff.matchedExistingItem && itemDiff.matchedExistingWidget?.id === matchedWidget.id) {
          matchedExistingItemIdsInTarget.add(itemDiff.matchedExistingItem.id);
        }

        const itemKey = getImportItemSelectionKey(incomingWidget.id, item.id);
        itemSelected[itemKey] = false;
        itemFieldUpdates[itemKey] = {
          name: false,
          catalogs: false,
          image: false,
        };
      });

      const reconcileRemovals = matchedWidget.dataSource.payload.items
        .filter((item) => !matchedExistingItemIdsInTarget.has(item.id))
        .map((item) => item.id);
      const hasActionableItems = Object.values(itemDiffs).some((itemDiff) => itemDiff.status !== 'unchanged')
        || reconcileRemovals.length > 0;
      widgetDiffs[incomingWidget.id] = {
        status: hasActionableItems ? 'existing' : 'unchanged',
        changes: new Set<ImportChangeField>(),
        itemDiffs,
        existingWidget: matchedWidget,
        matchStrategy: matchedWidgetResult.strategy,
        reconcileRemovals,
      };
      widgetSelected[incomingWidget.id] = false;
      return;
    }

    if (incomingWidget.type === 'row.classic' && matchedWidget.type === 'row.classic') {
      const { changes, unchanged } = diffRowClassic(incomingWidget, matchedWidget);
      widgetDiffs[incomingWidget.id] = {
        status: unchanged ? 'unchanged' : 'existing',
        changes,
        itemDiffs: {},
        existingWidget: matchedWidget,
        matchStrategy: matchedWidgetResult.strategy,
      };
      widgetSelected[incomingWidget.id] = false;
      widgetFieldUpdates[incomingWidget.id] = {
        name: false,
        catalogs: false,
        image: false,
      };
      return;
    }

    const itemDiffs: Record<string, ItemDiff> = {};
    if (incomingWidget.type === 'collection.row') {
      incomingWidget.dataSource.payload.items.forEach((item) => {
        const itemDiff = computeCollectionItemDiff(item, undefined, indices, claimedExistingItemKeys);
        const itemKey = getImportItemSelectionKey(incomingWidget.id, item.id);
        itemDiffs[item.id] = itemDiff;
        itemSelected[itemKey] = false;
        itemFieldUpdates[itemKey] = {
          name: false,
          catalogs: false,
          image: false,
        };
      });
    }

    widgetDiffs[incomingWidget.id] = {
      status: 'new',
      changes: new Set<ImportChangeField>(),
      itemDiffs,
    };
    widgetSelected[incomingWidget.id] = false;
  });

  return {
    widgetDiffs,
    widgetSelected,
    itemSelected,
    widgetFieldUpdates,
    itemFieldUpdates,
  };
}

function updateMovedOrExistingItem(
  baseItem: CollectionItem,
  incomingItem: CollectionItem,
  diff: ItemDiff,
  updates: { name: boolean; catalogs: boolean; image: boolean } | undefined,
  keepExistingCatalogs: boolean
): CollectionItem {
  const nextItem = cloneItem(baseItem);

  if (updates?.name && diff.changes.has('name')) {
    nextItem.name = incomingItem.name;
  }

  if (updates?.image && diff.changes.has('image')) {
    nextItem.backgroundImageURL = incomingItem.backgroundImageURL;
    nextItem.layout = incomingItem.layout || 'Wide';
  }

  if (updates?.catalogs && diff.changes.has('catalogs')) {
    if (keepExistingCatalogs) {
      const existingKeys = new Set(
        (nextItem.dataSources || []).map((ds: WidgetDataSource) =>
          ds.sourceType === 'aiometadata'
            ? `${ds.sourceType}::${ds.payload?.catalogId}::${ds.payload?.catalogType}`
            : `${ds.sourceType}::${JSON.stringify(ds.payload)}`
        )
      );
      const toAdd = (incomingItem.dataSources || []).filter((ds: WidgetDataSource) => {
        const key = ds.sourceType === 'aiometadata'
          ? `${ds.sourceType}::${ds.payload?.catalogId}::${ds.payload?.catalogType}`
          : `${ds.sourceType}::${JSON.stringify(ds.payload)}`;
        return !existingKeys.has(key);
      });
      if (toAdd.length > 0) {
        nextItem.dataSources = [...(nextItem.dataSources || []), ...toAdd];
      }
    } else {
      nextItem.dataSources = cloneItem(incomingItem).dataSources;
    }
  }

  return nextItem;
}

function ensureCollectionWidget(widget: Widget): CollectionRowWidget {
  if (widget.type !== 'collection.row') {
    throw new Error('Expected collection widget.');
  }

  return widget;
}

function removeItemFromWidget(widget: CollectionRowWidget, itemId: string): boolean {
  const nextItems = widget.dataSource.payload.items.filter((item) => item.id !== itemId);
  if (nextItems.length === widget.dataSource.payload.items.length) {
    return false;
  }

  widget.dataSource.payload.items = nextItems;
  return true;
}

function upsertItemInWidget(widget: CollectionRowWidget, item: CollectionItem): { changed: boolean; inserted: boolean } {
  const existingIndex = widget.dataSource.payload.items.findIndex((candidate) => candidate.id === item.id);
  if (existingIndex === -1) {
    widget.dataSource.payload.items.push(item);
    return { changed: true, inserted: true };
  }

  widget.dataSource.payload.items[existingIndex] = item;
  return { changed: true, inserted: false };
}

export function applyImportReview(
  existingWidgets: Widget[],
  incomingWidgets: Widget[],
  widgetDiffs: Record<string, WidgetDiff>,
  selection: ApplyImportSelectionState
): ApplyImportResult {
  const finalWidgets = existingWidgets.map((widget) => cloneWidget(widget));
  const widgetIndexById = new Map(finalWidgets.map((widget, index) => [widget.id, index]));
  const changedExistingWidgetIds = new Set<string>();
  let widgetsAdded = 0;
  let itemsAdded = 0;
  let itemsUpdated = 0;

  incomingWidgets.forEach((incomingWidget) => {
    if (!selection.widgetSelected[incomingWidget.id]) {
      return;
    }

    const diff = widgetDiffs[incomingWidget.id];
    if (!diff) {
      return;
    }

    if (incomingWidget.type === 'row.classic') {
      if (diff.status === 'new') {
        finalWidgets.push(cloneWidget(incomingWidget));
        widgetIndexById.set(incomingWidget.id, finalWidgets.length - 1);
        widgetsAdded += 1;
        return;
      }

      if (diff.status !== 'existing' || !diff.existingWidget) {
        return;
      }

      const existingIdx = widgetIndexById.get(diff.existingWidget.id);
      if (existingIdx === undefined) {
        return;
      }

      const existingWidget = cloneWidget(finalWidgets[existingIdx] as RowClassicWidget);
      const updates = selection.widgetFieldUpdates[incomingWidget.id];
      let widgetChanged = false;

      if (updates?.name && diff.changes.has('name')) {
        existingWidget.title = incomingWidget.title;
        widgetChanged = true;
      }
      if (updates?.image && diff.changes.has('image')) {
        existingWidget.presentation = {
          ...(existingWidget.presentation || {}),
          backgroundImageURL: incomingWidget.presentation?.backgroundImageURL,
          aspectRatio: incomingWidget.presentation?.aspectRatio || 'poster',
        };
        widgetChanged = true;
      }
      if (updates?.catalogs && diff.changes.has('catalogs') && !selection.keepExistingCatalogs) {
        existingWidget.dataSource = cloneWidget(incomingWidget as RowClassicWidget).dataSource;
        widgetChanged = true;
      }

      if (widgetChanged) {
        finalWidgets[existingIdx] = existingWidget;
        changedExistingWidgetIds.add(existingWidget.id);
      }
      return;
    }

    const incomingCollectionWidget = incomingWidget;
    if (diff.status === 'new') {
      const nextWidget = cloneWidget(incomingCollectionWidget);
      nextWidget.dataSource.payload.items = [];

      incomingCollectionWidget.dataSource.payload.items.forEach((incomingItem) => {
        const itemKey = getImportItemSelectionKey(incomingCollectionWidget.id, incomingItem.id);
        if (!selection.itemSelected[itemKey]) {
          return;
        }

        const itemDiff = diff.itemDiffs[incomingItem.id];
        if (!itemDiff) {
          return;
        }

        if (itemDiff.status === 'moved' && itemDiff.matchedExistingItem && itemDiff.matchedExistingWidget) {
          const sourceIdx = widgetIndexById.get(itemDiff.matchedExistingWidget.id);
          if (sourceIdx !== undefined) {
            const sourceWidget = ensureCollectionWidget(finalWidgets[sourceIdx]!);
            if (removeItemFromWidget(sourceWidget, itemDiff.matchedExistingItem.id)) {
              changedExistingWidgetIds.add(sourceWidget.id);
            }
          }

          const movedItem = updateMovedOrExistingItem(
            itemDiff.matchedExistingItem,
            incomingItem,
            itemDiff,
            selection.itemFieldUpdates[itemKey],
            selection.keepExistingCatalogs
          );
          nextWidget.dataSource.payload.items.push(movedItem);
          itemsUpdated += 1;
          return;
        }

        nextWidget.dataSource.payload.items.push(cloneItem(incomingItem));
        itemsAdded += 1;
      });

      if (nextWidget.dataSource.payload.items.length > 0) {
        finalWidgets.push(nextWidget);
        widgetIndexById.set(nextWidget.id, finalWidgets.length - 1);
        widgetsAdded += 1;
      }
      return;
    }

    if (diff.status !== 'existing' || !diff.existingWidget || diff.existingWidget.type !== 'collection.row') {
      return;
    }

    const targetWidgetIdx = widgetIndexById.get(diff.existingWidget.id);
    if (targetWidgetIdx === undefined) {
      return;
    }

    const targetWidget = ensureCollectionWidget(finalWidgets[targetWidgetIdx]!);
    const targetOriginalItemIds = new Set(targetWidget.dataSource.payload.items.map((item) => item.id));
    const reconcileKeepIds = new Set<string>();

    incomingCollectionWidget.dataSource.payload.items.forEach((incomingItem) => {
      const itemDiff = diff.itemDiffs[incomingItem.id];
      if (!itemDiff) {
        return;
      }

      if (itemDiff.matchedExistingItem && itemDiff.matchedExistingWidget?.id === targetWidget.id) {
        reconcileKeepIds.add(itemDiff.matchedExistingItem.id);
      }
    });

    incomingCollectionWidget.dataSource.payload.items.forEach((incomingItem) => {
      const itemKey = getImportItemSelectionKey(incomingCollectionWidget.id, incomingItem.id);
      if (!selection.itemSelected[itemKey]) {
        return;
      }

      const itemDiff = diff.itemDiffs[incomingItem.id];
      if (!itemDiff || itemDiff.status === 'unchanged') {
        return;
      }

      if (itemDiff.status === 'new' || itemDiff.status === 'ambiguous') {
        const insertedItem = cloneItem(incomingItem);
        const upsertResult = upsertItemInWidget(targetWidget, insertedItem);
        if (upsertResult.changed) {
          changedExistingWidgetIds.add(targetWidget.id);
          if (upsertResult.inserted) {
            itemsAdded += 1;
          }
        }
        return;
      }

      if (!itemDiff.matchedExistingItem || !itemDiff.matchedExistingWidget) {
        return;
      }

      const updatedItem = updateMovedOrExistingItem(
        itemDiff.matchedExistingItem,
        incomingItem,
        itemDiff,
        selection.itemFieldUpdates[itemKey],
        selection.keepExistingCatalogs
      );

      if (itemDiff.matchedExistingWidget.id !== targetWidget.id) {
        const sourceIdx = widgetIndexById.get(itemDiff.matchedExistingWidget.id);
        if (sourceIdx !== undefined) {
          const sourceWidget = ensureCollectionWidget(finalWidgets[sourceIdx]!);
          if (removeItemFromWidget(sourceWidget, itemDiff.matchedExistingItem.id)) {
            changedExistingWidgetIds.add(sourceWidget.id);
          }
        }

        upsertItemInWidget(targetWidget, updatedItem);
        changedExistingWidgetIds.add(targetWidget.id);
        itemsUpdated += 1;
        return;
      }

      const upsertResult = upsertItemInWidget(targetWidget, updatedItem);
      if (upsertResult.changed) {
        changedExistingWidgetIds.add(targetWidget.id);
        itemsUpdated += 1;
      }
    });

    if (selection.applyMode === 'reconcile') {
      targetWidget.dataSource.payload.items = targetWidget.dataSource.payload.items.filter((item) => {
        if (!targetOriginalItemIds.has(item.id)) {
          return true;
        }
        return reconcileKeepIds.has(item.id);
      });
      changedExistingWidgetIds.add(targetWidget.id);
    }
  });

  return {
    widgets: finalWidgets,
    widgetsAdded,
    widgetsUpdated: changedExistingWidgetIds.size,
    itemsAdded,
    itemsUpdated,
  };
}
