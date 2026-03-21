"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  AIOMetadataCatalog,
  CollectionItem,
  FusionWidgetsConfig,
  TrashCollectionItemEntry,
  TrashWidgetEntry,
  Widget,
} from '@/lib/types/widget';
import {
  exportConfigToFusion,
  processConfigWithManifest,
  processWidgetWithManifest,
} from '@/lib/config-utils';
import { convertFusionToOmni } from '@/lib/omni-converter';
import {
  AppState,
  IdRepairSummary,
  mergeWidgetLists,
  normalizeFusionConfigDetailed,
  normalizeLoadedState,
  parseManifest,
} from '@/lib/widget-domain';

interface MergeResult {
  added: number;
  skippedExisting: number;
  skippedInPayload: number;
  repairedIds: IdRepairSummary;
}

interface ConfigContextType {
  widgets: Widget[];
  trash: TrashWidgetEntry[];
  itemTrash: TrashCollectionItemEntry[];
  manifestUrl: string;
  setManifestUrl: (url: string) => void;
  replacePlaceholder: boolean;
  setReplacePlaceholder: (replace: boolean) => void;
  replaceConfig: (config: FusionWidgetsConfig) => void;
  importConfig: (config: unknown) => void;
  mergeConfig: (config: unknown) => MergeResult;
  exportConfig: () => unknown;
  addWidget: (widget: Widget) => void;
  updateWidgetMeta: (id: string, updates: Partial<Widget>) => void;
  deleteWidget: (id: string) => void;
  restoreWidget: (id: string) => void;
  emptyTrash: () => void;
  duplicateWidget: (id: string) => void;
  reorderWidgets: (startIndex: number, endIndex: number) => void;
  addCollectionItem: (widgetId: string, item: CollectionItem) => void;
  updateCollectionItem: (widgetId: string, itemId: string, updates: Partial<CollectionItem>) => void;
  removeCollectionItem: (widgetId: string, itemId: string) => void;
  restoreCollectionItem: (widgetId: string, itemId: string) => void;
  reorderCollectionItems: (widgetId: string, startIndex: number, endIndex: number) => void;
  syncManifest: (providedCatalogs?: AIOMetadataCatalog[], providedUrl?: string, providedReplace?: boolean) => void;
  disconnectManifest: () => void;
  clearConfig: () => void;
  isDragging: boolean;
  setIsDragging: (isDragging: boolean) => void;
  manifestCatalogs: AIOMetadataCatalog[];
  importManifest: (json: unknown) => AIOMetadataCatalog[];
  manifestContent: string;
  setManifestContent: (content: string) => void;
  fetchManifest: (url: string) => Promise<AIOMetadataCatalog[]>;
  exportOmniConfig: () => unknown;
  view: 'welcome' | 'selection' | 'editor';
  setView: (view: 'welcome' | 'selection' | 'editor') => void;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

function buildStoredState(state: AppState) {
  return {
    widgets: state.widgets,
    trash: state.trash,
    itemTrash: state.itemTrash,
    manifestUrl: state.manifestUrl,
    replacePlaceholder: state.replacePlaceholder,
    manifestCatalogs: state.manifestCatalogs,
    manifestContent: state.manifestContent,
  };
}

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [trash, setTrash] = useState<TrashWidgetEntry[]>([]);
  const [itemTrash, setItemTrash] = useState<TrashCollectionItemEntry[]>([]);
  const [manifestUrl, setManifestUrl] = useState('');
  const [replacePlaceholder, setReplacePlaceholder] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [manifestCatalogs, setManifestCatalogs] = useState<AIOMetadataCatalog[]>([]);
  const [manifestContent, setManifestContent] = useState('');
  const [view, setView] = useState<'welcome' | 'selection' | 'editor'>('welcome');

  useEffect(() => {
    const saved = localStorage.getItem('fusion-widgets-config');
    if (!saved) return;

    try {
      const normalized = normalizeLoadedState(JSON.parse(saved));
      setWidgets(normalized.widgets);
      setTrash(normalized.trash);
      setItemTrash(normalized.itemTrash);
      setManifestUrl(normalized.manifestUrl);
      setReplacePlaceholder(normalized.replacePlaceholder);
      if (normalized.widgets.length > 0 || normalized.trash.length > 0 || normalized.itemTrash.length > 0) {
        setView('selection');
      }
    } catch (error) {
      console.error('Failed to parse config from storage:', error);
    }

    const savedCatalogs = localStorage.getItem('fusion-widget-manifest-catalogs');
    if (savedCatalogs) {
      try {
        setManifestCatalogs(parseManifest({ catalogs: JSON.parse(savedCatalogs) }));
      } catch (error) {
        console.error('Failed to load catalogs from storage:', error);
      }
    }

    const savedContent = localStorage.getItem('fusion-widget-manifest-content');
    if (savedContent) {
      setManifestContent(savedContent);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      'fusion-widgets-config',
      JSON.stringify(
        buildStoredState({
          widgets,
          trash,
          itemTrash,
          manifestUrl,
          replacePlaceholder,
          manifestCatalogs: [],
          manifestContent: '',
        })
      )
    );
  }, [widgets, trash, itemTrash, manifestUrl, replacePlaceholder]);

  useEffect(() => {
    localStorage.setItem('fusion-widget-manifest-catalogs', JSON.stringify(manifestCatalogs));
  }, [manifestCatalogs]);

  useEffect(() => {
    localStorage.setItem('fusion-widget-manifest-content', manifestContent);
  }, [manifestContent]);

  const normalizeIncomingConfig = useCallback(
    (config: unknown) =>
      normalizeFusionConfigDetailed(config, {
        manifestUrl,
        replacePlaceholder,
        catalogs: manifestCatalogs,
        sanitize: true,
      }),
    [manifestCatalogs, manifestUrl, replacePlaceholder]
  );

  const replaceConfig = useCallback((config: FusionWidgetsConfig) => {
    setWidgets(config.widgets);
    setView(config.widgets.length > 0 || trash.length > 0 || itemTrash.length > 0 ? 'selection' : 'welcome');
  }, [itemTrash.length, trash.length]);

  const importConfig = useCallback(
    (config: unknown) => {
      const normalized = normalizeIncomingConfig(config);
      replaceConfig(normalized.config);
    },
    [normalizeIncomingConfig, replaceConfig]
  );

  const mergeConfig = useCallback(
    (config: unknown): MergeResult => {
      const normalized = normalizeIncomingConfig(config);
      const merged = mergeWidgetLists(widgets, normalized.config.widgets);

      if (merged.added === 0) {
        return {
          added: 0,
          skippedExisting: merged.skippedExisting,
          skippedInPayload: merged.skippedInPayload,
          repairedIds: normalized.repairedIds,
        };
      }

      const repairedMerge = normalizeFusionConfigDetailed(
        {
          exportType: 'fusionWidgets',
          exportVersion: normalized.config.exportVersion,
          widgets: merged.widgets,
        },
        {
          manifestUrl,
          replacePlaceholder,
          catalogs: manifestCatalogs,
          sanitize: true,
        }
      );

      setWidgets(repairedMerge.config.widgets);
      setView('selection');

      return {
        added: merged.added,
        skippedExisting: merged.skippedExisting,
        skippedInPayload: merged.skippedInPayload,
        repairedIds: {
          widgetIds: [...normalized.repairedIds.widgetIds, ...repairedMerge.repairedIds.widgetIds],
          itemIds: [...normalized.repairedIds.itemIds, ...repairedMerge.repairedIds.itemIds],
        },
      };
    },
    [manifestCatalogs, manifestUrl, normalizeIncomingConfig, replacePlaceholder, widgets]
  );

  const exportConfig = useCallback(() => {
    const normalized = processConfigWithManifest(
      {
        exportType: 'fusionWidgets',
        exportVersion: 1,
        widgets,
      },
      manifestUrl,
      replacePlaceholder,
      manifestCatalogs,
      true
    );

    return exportConfigToFusion(normalized, manifestUrl);
  }, [widgets, manifestUrl, replacePlaceholder, manifestCatalogs]);

  const exportOmniConfig = useCallback(() => {
    const normalized = processConfigWithManifest(
      {
        exportType: 'fusionWidgets',
        exportVersion: 1,
        widgets,
      },
      manifestUrl,
      replacePlaceholder,
      manifestCatalogs,
      true
    );

    return convertFusionToOmni(normalized);
  }, [widgets, manifestUrl, replacePlaceholder, manifestCatalogs]);

  const addWidget = useCallback(
    (widget: Widget) => {
      const normalizedWidget = processWidgetWithManifest(
        widget,
        manifestUrl,
        replacePlaceholder,
        manifestCatalogs,
        true
      );
      setWidgets((prev) => [...prev, normalizedWidget]);
      setView('selection');
    },
    [manifestCatalogs, manifestUrl, replacePlaceholder]
  );

  const updateWidgetMeta = useCallback((id: string, updates: Partial<Widget>) => {
    setWidgets((prev) =>
      prev.map((widget) => (widget.id === id ? ({ ...widget, ...updates } as Widget) : widget))
    );
  }, []);

  const deleteWidget = useCallback((id: string) => {
    const originalIndex = widgets.findIndex((widget) => widget.id === id);
    if (originalIndex === -1) return;

    const widgetToTrash = widgets[originalIndex];
    if (!widgetToTrash) return;

    setWidgets((prev) => prev.filter((widget) => widget.id !== id));
    setTrash((prev) => [
      {
        widget: widgetToTrash,
        deletedAt: new Date().toISOString(),
        originalIndex,
      },
      ...prev.filter((entry) => entry.widget.id !== id),
    ]);
    setView('selection');
  }, [widgets]);

  const restoreWidget = useCallback((id: string) => {
    const entry = trash.find((item) => item.widget.id === id);
    if (!entry) return;

    const restoredWidget = widgets.some((widget) => widget.id === entry.widget.id)
      ? { ...entry.widget, id: crypto.randomUUID() }
      : entry.widget;

    setWidgets((prev) => {
      const insertAt = Math.min(entry.originalIndex, prev.length);
      const next = [...prev];
      next.splice(insertAt, 0, restoredWidget);
      return next;
    });
    setTrash((prev) => prev.filter((item) => item.widget.id !== id));
    setView('selection');
  }, [trash, widgets]);

  const emptyTrash = useCallback(() => {
    setTrash([]);
    setItemTrash([]);
    setView((current) => (widgets.length > 0 ? current : 'welcome'));
  }, [widgets.length]);

  const duplicateWidget = useCallback((id: string) => {
    setWidgets((prev) => {
      const index = prev.findIndex((widget) => widget.id === id);
      if (index === -1) return prev;

      const copy = processWidgetWithManifest(
        {
          ...prev[index],
          id: crypto.randomUUID(),
          title: `${prev[index].title} (Copy)`,
        },
        manifestUrl,
        replacePlaceholder,
        manifestCatalogs,
        true
      );

      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }, [manifestCatalogs, manifestUrl, replacePlaceholder]);

  const reorderWidgets = useCallback((startIndex: number, endIndex: number) => {
    if (startIndex < 0 || endIndex < 0 || startIndex === endIndex) {
      return;
    }

    setWidgets((prev) => {
      if (startIndex >= prev.length || endIndex >= prev.length) {
        return prev;
      }

      const next = [...prev];
      const [removed] = next.splice(startIndex, 1);
      if (!removed) return prev;
      next.splice(endIndex, 0, removed);
      return next;
    });
  }, []);

  const addCollectionItem = useCallback((widgetId: string, item: CollectionItem) => {
    setWidgets((prev) =>
      prev.map((widget) => {
        if (widget.id !== widgetId || widget.type !== 'collection.row') {
          return widget;
        }

        return {
          ...widget,
          dataSource: {
            ...widget.dataSource,
            payload: {
              ...widget.dataSource.payload,
              items: [...widget.dataSource.payload.items, item],
            },
          },
        };
      })
    );
  }, []);

  const updateCollectionItem = useCallback((widgetId: string, itemId: string, updates: Partial<CollectionItem>) => {
    setWidgets((prev) =>
      prev.map((widget) => {
        if (widget.id !== widgetId || widget.type !== 'collection.row') {
          return widget;
        }

        return {
          ...widget,
          dataSource: {
            ...widget.dataSource,
            payload: {
              ...widget.dataSource.payload,
              items: widget.dataSource.payload.items.map((item) =>
                item.id === itemId ? { ...item, ...updates } : item
              ),
            },
          },
        };
      })
    );
  }, []);

  const removeCollectionItem = useCallback((widgetId: string, itemId: string) => {
    const widget = widgets.find((entry) => entry.id === widgetId && entry.type === 'collection.row');
    if (!widget || widget.type !== 'collection.row') return;

    const originalIndex = widget.dataSource.payload.items.findIndex((item) => item.id === itemId);
    if (originalIndex === -1) return;

    const itemToTrash = widget.dataSource.payload.items[originalIndex];
    if (!itemToTrash) return;

    setWidgets((prev) =>
      prev.map((entry) => {
        if (entry.id !== widgetId || entry.type !== 'collection.row') {
          return entry;
        }

        return {
          ...entry,
          dataSource: {
            ...entry.dataSource,
            payload: {
              ...entry.dataSource.payload,
              items: entry.dataSource.payload.items.filter((item) => item.id !== itemId),
            },
          },
        };
      })
    );
    setItemTrash((prev) => [
      {
        widgetId,
        widgetTitle: widget.title,
        item: itemToTrash,
        deletedAt: new Date().toISOString(),
        originalIndex,
      },
      ...prev.filter((entry) => !(entry.widgetId === widgetId && entry.item.id === itemId)),
    ]);
    setView('selection');
  }, [widgets]);

  const restoreCollectionItem = useCallback((widgetId: string, itemId: string) => {
    const entry = itemTrash.find((item) => item.widgetId === widgetId && item.item.id === itemId);
    if (!entry) return;

    const parentWidget = widgets.find((widget) => widget.id === widgetId && widget.type === 'collection.row');
    if (!parentWidget || parentWidget.type !== 'collection.row') return;

    const restoredItem = parentWidget.dataSource.payload.items.some((item) => item.id === entry.item.id)
      ? { ...entry.item, id: crypto.randomUUID() }
      : entry.item;

    setWidgets((prev) =>
      prev.map((widget) => {
        if (widget.id !== widgetId || widget.type !== 'collection.row') {
          return widget;
        }

        const insertAt = Math.min(entry.originalIndex, widget.dataSource.payload.items.length);
        const items = [...widget.dataSource.payload.items];
        items.splice(insertAt, 0, restoredItem);

        return {
          ...widget,
          dataSource: {
            ...widget.dataSource,
            payload: {
              ...widget.dataSource.payload,
              items,
            },
          },
        };
      })
    );
    setItemTrash((prev) => prev.filter((item) => !(item.widgetId === widgetId && item.item.id === itemId)));
    setView('selection');
  }, [itemTrash, widgets]);

  const reorderCollectionItems = useCallback((widgetId: string, startIndex: number, endIndex: number) => {
    if (startIndex < 0 || endIndex < 0 || startIndex === endIndex) {
      return;
    }

    setWidgets((prev) =>
      prev.map((widget) => {
        if (widget.id !== widgetId || widget.type !== 'collection.row') {
          return widget;
        }

        if (
          startIndex >= widget.dataSource.payload.items.length ||
          endIndex >= widget.dataSource.payload.items.length
        ) {
          return widget;
        }

        const items = [...widget.dataSource.payload.items];
        const [removed] = items.splice(startIndex, 1);
        if (!removed) return widget;
        items.splice(endIndex, 0, removed);

        return {
          ...widget,
          dataSource: {
            ...widget.dataSource,
            payload: {
              ...widget.dataSource.payload,
              items,
            },
          },
        };
      })
    );
  }, []);

  const syncManifest = useCallback(
    (providedCatalogs?: AIOMetadataCatalog[], providedUrl?: string, providedReplace?: boolean) => {
      const catalogsToUse = providedCatalogs || manifestCatalogs;
      const urlToUse = providedUrl ?? manifestUrl;
      const replaceToUse = providedReplace ?? replacePlaceholder;

      if (catalogsToUse.length === 0) {
        throw new Error('No AIOMetadata manifest loaded. Please sync a manifest first.');
      }

      setWidgets((prev) =>
        prev.map((widget) =>
          processWidgetWithManifest(widget, urlToUse, replaceToUse, catalogsToUse, true)
        )
      );
    },
    [manifestCatalogs, manifestUrl, replacePlaceholder]
  );

  const fetchManifest = useCallback(
    async (url: string) => {
      if (!url) return [];

      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const json = await response.json();
        setManifestContent(JSON.stringify(json, null, 2));
        const catalogs = parseManifest(json);
        setManifestCatalogs(catalogs);
        return catalogs;
      } catch (error) {
        console.error('Failed to fetch manifest:', error);
        throw error;
      }
    },
    []
  );

  const importManifest = useCallback((data: unknown) => {
    const catalogs = parseManifest(data);
    setManifestCatalogs(catalogs);
    if (typeof data !== 'string') {
      setManifestContent(JSON.stringify(data, null, 2));
    }
    return catalogs;
  }, []);

  const disconnectManifest = useCallback(() => {
    setManifestUrl('');
    setManifestCatalogs([]);
    setManifestContent('');
    setReplacePlaceholder(false);
  }, []);

  const clearConfig = useCallback(() => {
    setWidgets([]);
    setTrash([]);
    setItemTrash([]);
    setReplacePlaceholder(false);
    setManifestContent('');
    setView('welcome');
  }, []);

  return (
    <ConfigContext.Provider
      value={{
        widgets,
        trash,
        itemTrash,
        manifestUrl,
        setManifestUrl,
        replacePlaceholder,
        setReplacePlaceholder,
        replaceConfig,
        importConfig,
        mergeConfig,
        exportConfig,
        addWidget,
        updateWidgetMeta,
        deleteWidget,
        restoreWidget,
        emptyTrash,
        duplicateWidget,
        reorderWidgets,
        addCollectionItem,
        updateCollectionItem,
        removeCollectionItem,
        restoreCollectionItem,
        reorderCollectionItems,
        syncManifest,
        disconnectManifest,
        clearConfig,
        isDragging,
        setIsDragging,
        manifestCatalogs,
        importManifest,
        manifestContent,
        setManifestContent,
        fetchManifest,
        exportOmniConfig,
        view,
        setView,
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}
