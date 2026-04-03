"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  type FusionInvalidCatalogExportMode,
  processConfigWithManifest,
  processWidgetWithManifest,
} from '@/lib/config-utils';
import { convertFusionToOmni } from '@/lib/omni-converter';
import {
  analyzeAiometadataManifestDetection,
  getAiometadataManifestDetectionSignature,
} from '@/lib/aiometadata-manifest-detection';
import { convertAiometadataImportToFusion, isAiometadataImportPayload } from '@/lib/aiometadata-import';
import {
  AppState,
  extractImportedManifestState,
  ImportIssue,
  IdRepairSummary,
  mergeWidgetLists,
  normalizeFusionConfigDetailed,
  normalizeLoadedState,
  parseManifest,
} from '@/lib/widget-domain';

interface ImportResult {
  importedWidgets: number;
  repairedIds: IdRepairSummary;
  importIssues: ImportIssue[];
}

interface MergeResult {
  added: number;
  skippedExisting: number;
  skippedInPayload: number;
  repairedIds: IdRepairSummary;
  importIssues: ImportIssue[];
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
  importConfig: (config: unknown) => ImportResult;
  mergeConfig: (config: unknown) => MergeResult;
  exportConfig: (options?: {
    skipInvalidAiometadataSources?: boolean;
    invalidAiometadataMode?: FusionInvalidCatalogExportMode;
  }) => unknown;
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
  manifestAutoSyncIssue: string | null;
  exportOmniConfig: (options?: { nativeTraktStrategy?: 'reject' | 'bridge' }) => unknown;
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
  const [manifestAutoSyncIssue, setManifestAutoSyncIssue] = useState<string | null>(null);
  const [view, setView] = useState<'welcome' | 'selection' | 'editor'>('welcome');
  const [hasHydrated, setHasHydrated] = useState(false);
  const autoRefreshedManifestUrlRef = useRef<string | null>(null);
  const lastManifestDetectionSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('fusion-widgets-config');
    if (saved) {
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

    setHasHydrated(true);
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
    (
      config: unknown,
      overrides?: {
        manifestUrl?: string | null;
        replacePlaceholder?: boolean;
        catalogs?: AIOMetadataCatalog[];
      }
    ) => {
      const normalizedInput = isAiometadataImportPayload(config)
        ? convertAiometadataImportToFusion(config)
        : config;
      return normalizeFusionConfigDetailed(normalizedInput, {
        manifestUrl: overrides?.manifestUrl ?? manifestUrl,
        replacePlaceholder: overrides?.replacePlaceholder ?? replacePlaceholder,
        catalogs: overrides?.catalogs ?? manifestCatalogs,
        sanitize: true,
        allowPartialImport: true,
      });
    },
    [manifestCatalogs, manifestUrl, replacePlaceholder]
  );

  const applyImportedManifestState = useCallback((config: unknown, importedWidgets: Widget[]) => {
    const importedManifest = extractImportedManifestState(config);

    if (importedManifest.hasExplicitManifest) {
      autoRefreshedManifestUrlRef.current =
        importedManifest.manifestUrl && importedManifest.manifestCatalogs.length > 0
          ? importedManifest.manifestUrl
          : null;
      setManifestUrl(importedManifest.manifestUrl);
      setReplacePlaceholder(importedManifest.replacePlaceholder);
      setManifestCatalogs(importedManifest.manifestCatalogs);
      setManifestContent(importedManifest.manifestContent);
      setManifestAutoSyncIssue(null);
      return;
    }

    const detection = analyzeAiometadataManifestDetection(importedWidgets);
    if (!detection.hasSingleValidDetectedUrl) {
      return;
    }

    const detectedUrl = detection.detectedUrls[0] || '';
    autoRefreshedManifestUrlRef.current = null;
    setManifestUrl(detectedUrl);
    setReplacePlaceholder(true);
    setManifestCatalogs([]);
    setManifestContent('');
    setManifestAutoSyncIssue(null);
  }, []);

  const replaceConfig = useCallback((config: FusionWidgetsConfig) => {
    setWidgets(config.widgets);
    setView(config.widgets.length > 0 || trash.length > 0 || itemTrash.length > 0 ? 'selection' : 'welcome');
  }, [itemTrash.length, trash.length]);

  const importConfig = useCallback(
    (config: unknown) => {
      const importedManifest = extractImportedManifestState(config);
      const normalized =
        importedManifest.hasExplicitManifest
          ? normalizeIncomingConfig(config, {
              manifestUrl: importedManifest.manifestUrl,
              replacePlaceholder: importedManifest.replacePlaceholder,
              catalogs: importedManifest.manifestCatalogs,
            })
          : (() => {
              const importedNormalization = normalizeIncomingConfig(config, {
                manifestUrl: '',
                replacePlaceholder: false,
                catalogs: [],
              });
              const detection = analyzeAiometadataManifestDetection(importedNormalization.config.widgets);
              return detection.hasSingleValidDetectedUrl ? importedNormalization : normalizeIncomingConfig(config);
            })();

      if (normalized.config.widgets.length === 0 && normalized.importIssues.length > 0) {
        throw new Error(
          `No supported widgets could be imported. First issue: ${normalized.importIssues[0]?.path} - ${normalized.importIssues[0]?.message}`
        );
      }
      replaceConfig(normalized.config);
      applyImportedManifestState(config, normalized.config.widgets);
      return {
        importedWidgets: normalized.config.widgets.length,
        repairedIds: normalized.repairedIds,
        importIssues: normalized.importIssues,
      };
    },
    [applyImportedManifestState, normalizeIncomingConfig, replaceConfig]
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
          importIssues: normalized.importIssues,
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
          importIssues: normalized.importIssues,
        };
      },
    [manifestCatalogs, manifestUrl, normalizeIncomingConfig, replacePlaceholder, widgets]
  );

  const exportConfig = useCallback((options?: {
    skipInvalidAiometadataSources?: boolean;
    invalidAiometadataMode?: FusionInvalidCatalogExportMode;
  }) => {
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

    return exportConfigToFusion(normalized, manifestUrl, {
      skipInvalidAiometadataSources: options?.skipInvalidAiometadataSources ?? false,
      invalidAiometadataMode: options?.invalidAiometadataMode ?? 'skip',
      catalogs: manifestCatalogs,
    });
  }, [widgets, manifestUrl, replacePlaceholder, manifestCatalogs]);

  const exportOmniConfig = useCallback((options?: { nativeTraktStrategy?: 'reject' | 'bridge' }) => {
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

    return convertFusionToOmni(normalized, {
      nativeTraktStrategy: options?.nativeTraktStrategy ?? 'reject',
      manifestUrl: manifestUrl || null,
    });
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

      setManifestAutoSyncIssue(null);
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
          throw new Error(`Failed to load manifest (HTTP ${response.status}). Please check if the URL is correct.`);
        }
        const json = await response.json();
        setManifestContent(JSON.stringify(json, null, 2));
        const catalogs = parseManifest(json);
        setManifestCatalogs(catalogs);
        return catalogs;
      } catch (error) {
        throw error;
      }
    },
    []
  );

  useEffect(() => {
    if (!hasHydrated || !manifestUrl || manifestUrl.startsWith('manual://')) {
      return;
    }

    if (autoRefreshedManifestUrlRef.current === manifestUrl) {
      return;
    }

    autoRefreshedManifestUrlRef.current = manifestUrl;

    let cancelled = false;

    void fetchManifest(manifestUrl)
      .then((catalogs) => {
        if (cancelled) {
          return;
        }

        syncManifest(catalogs, manifestUrl, replacePlaceholder);
      })
      .catch((error) => {
        console.error('Failed to auto-refresh AIOMetadata manifest:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchManifest, hasHydrated, manifestUrl, replacePlaceholder, syncManifest]);

  useEffect(() => {
    if (!hasHydrated || manifestUrl) {
      return;
    }

    const detectionSignature = getAiometadataManifestDetectionSignature(widgets);
    if (lastManifestDetectionSignatureRef.current === detectionSignature) {
      return;
    }
    lastManifestDetectionSignatureRef.current = detectionSignature;

    const detection = analyzeAiometadataManifestDetection(widgets);
    if (!detection.hasAiometadataSources || detection.detectedUrls.length === 0) {
      setManifestAutoSyncIssue(null);
      return;
    }

    if (detection.detectedUrls.length > 1) {
      setManifestAutoSyncIssue('Multiple AIOMetadata URLs detected. Sync one manifest manually.');
      return;
    }

    const [detectedUrl] = detection.detectedUrls;

    void fetchManifest(detectedUrl)
      .then((catalogs) => {
        autoRefreshedManifestUrlRef.current = detectedUrl;
        setManifestUrl(detectedUrl);
        setManifestAutoSyncIssue(null);
        syncManifest(catalogs, detectedUrl, true);
      })
      .catch((error) => {
        console.error('Failed to auto-detect AIOMetadata manifest:', error);
        setManifestAutoSyncIssue('Detected AIOMetadata URL could not be synced. Check Sync Manifest.');
      });
  }, [fetchManifest, hasHydrated, manifestUrl, syncManifest, widgets]);

  const importManifest = useCallback((data: unknown) => {
    const catalogs = parseManifest(data);
    setManifestCatalogs(catalogs);
    if (typeof data !== 'string') {
      setManifestContent(JSON.stringify(data, null, 2));
    }
    return catalogs;
  }, []);

  const disconnectManifest = useCallback(() => {
    lastManifestDetectionSignatureRef.current = getAiometadataManifestDetectionSignature(widgets);
    autoRefreshedManifestUrlRef.current = null;
    setManifestUrl('');
    setManifestCatalogs([]);
    setManifestContent('');
    setManifestAutoSyncIssue(null);
    setReplacePlaceholder(false);
  }, [widgets]);

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
        manifestAutoSyncIssue,
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
