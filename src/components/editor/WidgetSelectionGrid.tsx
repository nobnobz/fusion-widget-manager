"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useConfig } from '@/context/ConfigContext';
import { SortableWidget } from './SortableWidget';
import { Button } from '@/components/ui/button';
import { Plus, Download, Check, Copy, Search, FileJson2, Trash2, RotateCcw, Globe, AlertTriangle, Pencil, Info, ChevronRight, SlidersHorizontal, WandSparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NewWidgetDialog } from './NewWidgetDialog';
import { ImportMergeDialog } from './ImportMergeDialog';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { AnimatePresence, motion } from 'framer-motion';
import {
  collectAiometadataExportInventory,
  type ExportableCatalogDefinition,
  type ExportableCatalogItemGroup,
  type ExportableCatalogWidgetGroup,
} from '@/lib/aiometadata-export-inventory';
import {
  buildAiometadataCatalogExport,
  getDefaultAiometadataExportOverrides,
  getResolvedAiometadataTargetSettings,
  sanitizeAiometadataExportOverrides,
} from '@/lib/aiometadata-export';
import { AIOMetadataExportSettingsDialog, type AIOMetadataSettingsDialogTarget } from './AIOMetadataExportSettingsDialog';
import { EMPTY_AIOMETADATA_EXPORT_OVERRIDE_STATE, type AIOMetadataExportOverrideState } from '@/lib/aiometadata-export-settings';
import {
  editorActionButtonClass,
  editorFooterPrimaryButtonClass,
  editorFooterSecondaryButtonClass,
  editorPanelClass,
} from './editorSurfaceStyles';
import { buildAiometadataMdblistCatalogsOnlyExport, hasUsedMdblistCatalogs } from '@/lib/mdblist-catalog-export';
import {
  buildAiometadataCatalogsOnlyExport,
  getNativeTraktBridgeFingerprint,
  hasNativeTraktSources,
} from '@/lib/native-trakt-bridge';
import {
  type FusionInvalidCatalogExportMode,
  MANIFEST_PLACEHOLDER,
  processConfigWithManifest,
  sanitizeFusionConfigForExport,
} from '@/lib/config-utils';
import type { FusionWidgetsConfig } from '@/lib/types/widget';
import { isAIOMetadataDataSource } from '@/lib/widget-domain';
import { copyTextToClipboard, downloadTextFile } from '@/lib/browser-transfer';
import { getErrorMessage } from '@/lib/error-utils';
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

interface WidgetSelectionGridProps {
  onNewWidget?: () => void;
  onDownload?: () => void;
  onSyncManifest?: () => void;
  expandedWidgetId: string | null;
  onExpandedWidgetChange: (id: string | null) => void;
}

type ExportPreviewStage =
  | 'aiometadata-catalogs-preview'
  | 'fusion-needs-invalid-catalog-confirmation'
  | 'fusion-needs-aiom-sync'
  | 'fusion-preview'
  | 'omni-needs-aiom-bridge'
  | 'omni-ready';

const FUSION_SYNC_REQUIRED_MESSAGE =
  'Sync your AIOMetadata manifest before Fusion export so the AIOMetadata URL can be embedded in your Fusion setup.';

const UME_SORTING_EXPLANATION_SECTIONS = [
  {
    groups: ['Streaming Services', 'Decades', 'Genres', 'Directors', 'Actors', 'IMDb Top Shows', 'Oscars 2026', 'Trending'],
    summary: 'Popularity',
    refresh: 'Refreshes every 12 hours',
  },
  {
    groups: ['Collections', 'Latest'],
    summary: 'Release date',
    detail: 'Newest first',
    refresh: 'Refreshes every 12 hours',
  },
  {
    groups: ['IMDb Top Movies'],
    summary: 'Random order',
    refresh: 'Refreshes every 12 hours',
  },
  {
    groups: ['Academy Awards', 'Emmy Awards', 'Golden Globe Awards', 'Cannes Film Festival', 'Marvel', 'DC', 'DC Universe'],
    summary: 'Release date',
    detail: 'Oldest first',
    refresh: 'Refreshes every 12 hours',
  },
  {
    groups: ['Trakt Watchlist'],
    summary: 'Added date',
    detail: 'Oldest first',
    refresh: 'Refreshes every 30 minutes',
  },
];

const aiometadataSectionTitleClass =
  'text-[11px] font-black uppercase tracking-[0.18em] text-foreground/60';

const aiometadataSectionDescriptionClass =
  'mt-1.5 max-w-3xl text-sm font-medium leading-6 text-muted-foreground/78 sm:text-[15px]';

function formatCountLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function setsMatch(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function sortCatalogKeys(
  catalogKeys: string[],
  catalogMap: Map<string, ExportableCatalogDefinition>
) {
  return [...catalogKeys].sort((left, right) => {
    const leftCatalog = catalogMap.get(left);
    const rightCatalog = catalogMap.get(right);
    const leftRank = leftCatalog?.isAlreadyInManifest ? 1 : 0;
    const rightRank = rightCatalog?.isAlreadyInManifest ? 1 : 0;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return (leftCatalog?.entry.name || '').localeCompare(rightCatalog?.entry.name || '');
  });
}

function WidgetSelectionGridComponent({
  onNewWidget,
  onDownload,
  onSyncManifest,
  expandedWidgetId,
  onExpandedWidgetChange,
}: WidgetSelectionGridProps) {
  const {
    widgets,
    trash,
    itemTrash,
    manifestUrl,
    manifestCatalogs,
    manifestAutoSyncIssue,
    replacePlaceholder,
    fetchManifest,
    syncManifest,
    exportConfig,
    exportOmniConfig,
    reorderWidgets,
    restoreWidget,
    restoreCollectionItem,
    emptyTrash,
  } = useConfig();
  const [exportMode, setExportMode] = useState<'fusion' | 'omni' | 'aiometadata'>('fusion');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showNewWidgetDialog, setShowNewWidgetDialog] = useState(false);
  const [showImportMergeDialog, setShowImportMergeDialog] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [copiedAction, setCopiedAction] = useState<'preview' | 'missing-catalogs' | 'full-aiometadata' | null>(null);
  const [isRefreshingManifest, setIsRefreshingManifest] = useState(false);
  const [manifestActionError, setManifestActionError] = useState<string | null>(null);
  const [exportActionError, setExportActionError] = useState<string | null>(null);
  const [copiedTraktBridgeFingerprint, setCopiedTraktBridgeFingerprint] = useState<string | null>(null);
  const [confirmedBridgeFingerprint, setConfirmedBridgeFingerprint] = useState<string | null>(null);
  const [confirmedFusionInvalidCatalogDecision, setConfirmedFusionInvalidCatalogDecision] = useState<{
    fingerprint: string;
    mode: FusionInvalidCatalogExportMode;
  } | null>(null);
  const [aiometadataSearchQuery, setAiometadataSearchQuery] = useState('');
  const [selectedAiometadataCatalogKeys, setSelectedAiometadataCatalogKeys] = useState<string[]>([]);
  const [hasCustomizedAiometadataSelection, setHasCustomizedAiometadataSelection] = useState(false);
  const [expandedAiometadataWidgetKeys, setExpandedAiometadataWidgetKeys] = useState<string[]>([]);
  const [expandedAiometadataItemKeys, setExpandedAiometadataItemKeys] = useState<string[]>([]);
  const [aiometadataUseUmeSorting, setAiometadataUseUmeSorting] = useState(true);
  const [isUmeSortingDialogOpen, setIsUmeSortingDialogOpen] = useState(false);
  const [aiometadataExportOverrides, setAiometadataExportOverrides] = useState<AIOMetadataExportOverrideState>(
    EMPTY_AIOMETADATA_EXPORT_OVERRIDE_STATE
  );
  const [aiometadataSettingsTarget, setAiometadataSettingsTarget] = useState<AIOMetadataSettingsDialogTarget | null>(null);
  const [isAiometadataSettingsDialogOpen, setIsAiometadataSettingsDialogOpen] = useState(false);
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const widgetNodeMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingScrollAnchorRef = useRef<{ id: string; top: number } | null>(null);
  const trashCount = trash.length + itemTrash.length;
  const hasTrash = trashCount > 0;
  const isManifestSynced = Boolean(manifestUrl);
  const isManualManifest = manifestUrl.startsWith('manual://');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const filteredWidgets = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return widgets.filter((widget) => {
      if (widget.title.toLowerCase().includes(query) || widget.type.toLowerCase().includes(query)) {
        return true;
      }

      if (widget.type === 'collection.row') {
        return widget.dataSource.payload.items.some(
          (item) => item.name.toLowerCase().includes(query) || item.id.toLowerCase().includes(query)
        );
      }

      return false;
    });
  }, [widgets, searchQuery]);

  const registerWidgetNode = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) {
      widgetNodeMapRef.current.set(id, node);
      return;
    }

    widgetNodeMapRef.current.delete(id);
  }, []);

  const handleExpandedWidgetChange = useCallback((nextId: string | null) => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 639px)').matches &&
      expandedWidgetId &&
      nextId &&
      expandedWidgetId !== nextId
    ) {
      const targetNode = widgetNodeMapRef.current.get(nextId);
      pendingScrollAnchorRef.current = targetNode
        ? { id: nextId, top: targetNode.getBoundingClientRect().top }
        : null;
    } else {
      pendingScrollAnchorRef.current = null;
    }

    onExpandedWidgetChange(nextId);
  }, [expandedWidgetId, onExpandedWidgetChange]);

  useEffect(() => {
    if (expandedWidgetId && !widgets.some((widget) => widget.id === expandedWidgetId)) {
      onExpandedWidgetChange(null);
    }
  }, [expandedWidgetId, onExpandedWidgetChange, widgets]);

  useLayoutEffect(() => {
    const pendingAnchor = pendingScrollAnchorRef.current;
    if (!pendingAnchor || expandedWidgetId !== pendingAnchor.id || typeof window === 'undefined') {
      return;
    }

    const adjustScroll = () => {
      const targetNode = widgetNodeMapRef.current.get(pendingAnchor.id);
      if (!targetNode) return;

      const offset = targetNode.getBoundingClientRect().top - pendingAnchor.top;
      if (Math.abs(offset) > 1) {
        window.scrollTo({ top: window.scrollY + offset, behavior: 'auto' });
      }
    };

    const frameA = window.requestAnimationFrame(() => {
      adjustScroll();
      window.requestAnimationFrame(adjustScroll);
    });
    const timeout = window.setTimeout(() => {
      adjustScroll();
      pendingScrollAnchorRef.current = null;
    }, 320);

    return () => {
      window.cancelAnimationFrame(frameA);
      window.clearTimeout(timeout);
    };
  }, [expandedWidgetId]);

  const hasUnsyncedAiometadataSources = useMemo(
    () =>
      widgets.some((widget) => {
        if (widget.type === 'row.classic') {
          return isAIOMetadataDataSource(widget.dataSource) && widget.dataSource.payload.addonId === MANIFEST_PLACEHOLDER;
        }

        return widget.dataSource.payload.items.some((item) =>
          item.dataSources.some(
            (dataSource) => isAIOMetadataDataSource(dataSource) && dataSource.payload.addonId === MANIFEST_PLACEHOLDER
          )
        );
      }),
    [widgets]
  );

  const basePreviewState = useMemo(() => {
    if (!showPreview) {
      return {
        config: null as FusionWidgetsConfig | null,
        error: null as string | null,
      };
    }

    try {
      return {
        config: processConfigWithManifest(
          {
            exportType: 'fusionWidgets',
            exportVersion: 1,
            widgets,
          },
          manifestUrl,
          replacePlaceholder,
          manifestCatalogs,
          true
        ),
        error: null,
      };
    } catch (error) {
      return {
        config: null,
        error: error instanceof Error ? error.message : 'Export failed.',
      };
    }
  }, [manifestCatalogs, manifestUrl, replacePlaceholder, showPreview, widgets]);

  const fusionInvalidCatalogState = useMemo(() => {
    if (!showPreview || !basePreviewState.config) {
      return {
        fingerprint: null as string | null,
        skippedDataSources: 0,
        skippedItems: 0,
        skippedWidgets: 0,
        emptiedItems: 0,
        widgetsStillSkippedInEmptyMode: 0,
      };
    }

    const sanitized = sanitizeFusionConfigForExport(basePreviewState.config, manifestCatalogs);
    const emptyItemsSanitized = sanitizeFusionConfigForExport(basePreviewState.config, manifestCatalogs, {
      invalidAiometadataMode: 'empty-items',
    });
    const fingerprint = sanitized.issues.length > 0
      ? JSON.stringify(sanitized.issues.map((issue) => `${issue.path}:${issue.reason}`))
      : null;

    return {
      fingerprint,
      skippedDataSources: sanitized.skippedDataSources,
      skippedItems: sanitized.skippedItems,
      skippedWidgets: sanitized.skippedWidgets,
      emptiedItems: emptyItemsSanitized.emptiedItems,
      widgetsStillSkippedInEmptyMode: emptyItemsSanitized.skippedWidgets,
    };
  }, [basePreviewState.config, manifestCatalogs, showPreview]);
  const fusionInvalidCatalogSkippedItems = fusionInvalidCatalogState.skippedItems;
  const fusionInvalidCatalogSkippedWidgets = fusionInvalidCatalogState.skippedWidgets;
  const fusionInvalidCatalogEmptiedItems = fusionInvalidCatalogState.emptiedItems;
  const fusionInvalidCatalogWidgetsStillSkippedInEmptyMode =
    fusionInvalidCatalogState.widgetsStillSkippedInEmptyMode;

  const requiresFusionInvalidCatalogConfirmation =
    !!fusionInvalidCatalogState.fingerprint
    && (
      fusionInvalidCatalogState.skippedDataSources > 0
      || fusionInvalidCatalogState.skippedItems > 0
      || fusionInvalidCatalogState.skippedWidgets > 0
      || fusionInvalidCatalogState.emptiedItems > 0
    );
  const selectedFusionInvalidCatalogMode =
    confirmedFusionInvalidCatalogDecision?.fingerprint === fusionInvalidCatalogState.fingerprint
      ? confirmedFusionInvalidCatalogDecision.mode
      : null;
  const isFusionInvalidCatalogConfirmed =
    !!fusionInvalidCatalogState.fingerprint
    && selectedFusionInvalidCatalogMode !== null;
  const fusionPreviewState = useMemo(() => {
    if (!showPreview) {
      return {
        config: null as FusionWidgetsConfig | null,
        error: null as string | null,
      };
    }

    if (requiresFusionInvalidCatalogConfirmation && !isFusionInvalidCatalogConfirmed) {
      return {
        config: null as FusionWidgetsConfig | null,
        error: null as string | null,
      };
    }

    try {
      return {
        config: exportConfig({
          skipInvalidAiometadataSources: requiresFusionInvalidCatalogConfirmation,
          invalidAiometadataMode: selectedFusionInvalidCatalogMode ?? 'skip',
        }) as FusionWidgetsConfig,
        error: null,
      };
    } catch (error) {
      return {
        config: null,
        error: error instanceof Error ? error.message : 'Export failed.',
      };
    }
  }, [
    exportConfig,
    isFusionInvalidCatalogConfirmed,
    selectedFusionInvalidCatalogMode,
    requiresFusionInvalidCatalogConfirmation,
    showPreview,
  ]);

  const requiresFusionAiometadataSync =
    exportMode === 'fusion' && fusionPreviewState.error === FUSION_SYNC_REQUIRED_MESSAGE;

  const nativeTraktBridgeState = useMemo(() => {
    if (!showPreview || !basePreviewState.config) {
      return {
        hasNativeTrakt: false,
        fingerprint: null as string | null,
        catalogsExport: null as ReturnType<typeof buildAiometadataCatalogsOnlyExport> | null,
        error: null as string | null,
      };
    }

    const nativePresent = hasNativeTraktSources(basePreviewState.config);
    if (!nativePresent) {
      return {
        hasNativeTrakt: false,
        fingerprint: null,
        catalogsExport: null,
        error: null,
      };
    }

    try {
      return {
        hasNativeTrakt: true,
        fingerprint: getNativeTraktBridgeFingerprint(basePreviewState.config, {
          manifestCatalogs,
          onlyNewAgainstManifest: isManifestSynced,
        }),
        catalogsExport: buildAiometadataCatalogsOnlyExport(basePreviewState.config, undefined, {
          manifestCatalogs,
          onlyNewAgainstManifest: isManifestSynced,
        }),
        error: null,
      };
    } catch (error) {
      return {
        hasNativeTrakt: true,
        fingerprint: null,
        catalogsExport: null,
        error: error instanceof Error ? error.message : 'Failed to build AIOMetadata bridge export.',
      };
    }
  }, [basePreviewState.config, isManifestSynced, manifestCatalogs, showPreview]);

  const omniMissingMdblistState = useMemo(() => {
    if (!showPreview || !basePreviewState.config) {
      return {
        hasMdblistCatalogs: false,
        missingCatalogCount: 0,
        catalogsExport: null as ReturnType<typeof buildAiometadataMdblistCatalogsOnlyExport> | null,
      };
    }

    const hasMdblistCatalogs = hasUsedMdblistCatalogs(basePreviewState.config);
    if (!hasMdblistCatalogs || !isManifestSynced) {
      return {
        hasMdblistCatalogs,
        missingCatalogCount: 0,
        catalogsExport: null,
      };
    }

    const catalogsExport = buildAiometadataMdblistCatalogsOnlyExport(
      basePreviewState.config,
      manifestCatalogs,
      undefined,
      { onlyNewAgainstManifest: true }
    );

    return {
      hasMdblistCatalogs: true,
      missingCatalogCount: catalogsExport.catalogs.length,
      catalogsExport,
    };
  }, [basePreviewState.config, isManifestSynced, manifestCatalogs, showPreview]);

  const aiometadataInventory = useMemo(() => {
    if (!showPreview || !basePreviewState.config) {
      return collectAiometadataExportInventory(
        { exportType: 'fusionWidgets', exportVersion: 1, widgets: [] },
        { manifestCatalogs: [], onlyNewAgainstManifest: false }
      );
    }

    return collectAiometadataExportInventory(basePreviewState.config, {
      manifestCatalogs,
      onlyNewAgainstManifest: false,
    });
  }, [basePreviewState.config, manifestCatalogs, showPreview]);

  const sanitizedAiometadataExportOverrides = useMemo(
    () => sanitizeAiometadataExportOverrides(aiometadataInventory, aiometadataExportOverrides),
    [aiometadataExportOverrides, aiometadataInventory]
  );

  const effectiveAiometadataExportOverrides = useMemo(
    () => aiometadataUseUmeSorting
      ? getDefaultAiometadataExportOverrides({
        inventory: aiometadataInventory,
        currentOverrides: sanitizedAiometadataExportOverrides,
      })
      : sanitizedAiometadataExportOverrides,
    [aiometadataInventory, aiometadataUseUmeSorting, sanitizedAiometadataExportOverrides]
  );

  const aiometadataDialogResolvedValues = useMemo(
    () => getResolvedAiometadataTargetSettings({
      inventory: aiometadataInventory,
      target: aiometadataSettingsTarget,
      exportSettingsOverrides: effectiveAiometadataExportOverrides,
    }),
    [aiometadataInventory, aiometadataSettingsTarget, effectiveAiometadataExportOverrides]
  );

  const aiometadataSelectableCatalogKeys = useMemo(
    () =>
      new Set(
        aiometadataInventory.catalogs
          .filter((catalog) => !(isManifestSynced && catalog.isAlreadyInManifest))
          .map((catalog) => catalog.key)
      ),
    [aiometadataInventory.catalogs, isManifestSynced]
  );

  const omniMissingCatalogsExport = useMemo(() => {
    if (!showPreview) {
      return null as ReturnType<typeof buildAiometadataCatalogExport> | null;
    }

    if (isManifestSynced) {
      return buildAiometadataCatalogExport({
        inventory: aiometadataInventory,
        selectedCatalogKeys: aiometadataSelectableCatalogKeys,
        exportSettingsOverrides: effectiveAiometadataExportOverrides,
      });
    }

    return nativeTraktBridgeState.catalogsExport;
  }, [
    aiometadataInventory,
    aiometadataSelectableCatalogKeys,
    effectiveAiometadataExportOverrides,
    isManifestSynced,
    nativeTraktBridgeState.catalogsExport,
    showPreview,
  ]);

  const aiometadataCatalogMap = useMemo(
    () => new Map(aiometadataInventory.catalogs.map((catalog) => [catalog.key, catalog])),
    [aiometadataInventory.catalogs]
  );

  const selectedAiometadataCatalogKeySet = useMemo(
    () => new Set(selectedAiometadataCatalogKeys),
    [selectedAiometadataCatalogKeys]
  );

  const aiometadataPreviewExport = useMemo(
    () => buildAiometadataCatalogExport({
      inventory: aiometadataInventory,
      selectedCatalogKeys: selectedAiometadataCatalogKeys,
      exportSettingsOverrides: effectiveAiometadataExportOverrides,
    }),
    [aiometadataInventory, effectiveAiometadataExportOverrides, selectedAiometadataCatalogKeys]
  );

  const aiometadataFullSetupExport = useMemo(
    () => buildAiometadataCatalogExport({
      inventory: aiometadataInventory,
      includeAll: true,
      exportSettingsOverrides: effectiveAiometadataExportOverrides,
    }),
    [aiometadataInventory, effectiveAiometadataExportOverrides]
  );

  const filteredAiometadataWidgets = useMemo(() => {
    const search = aiometadataSearchQuery.trim().toLowerCase();

    return aiometadataInventory.widgets
      .map((widget) => {
        const widgetTitleMatches = search
          ? (widget.widgetTitle || '').toLowerCase().includes(search)
          : false;

        const rowCatalogKeys = widget.rowCatalogKeys.filter((catalogKey) => {
          const catalog = aiometadataCatalogMap.get(catalogKey);
          if (!catalog || !aiometadataSelectableCatalogKeys.has(catalogKey)) return false;
          if (!search) return true;
          if (widgetTitleMatches) return true;
          return [widget.widgetTitle, catalog.entry.name, catalog.entry.id, catalog.entry.type, catalog.source]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(search);
        });

        const items = widget.items
          .map((item) => {
            const itemNameMatches = search
              ? (item.itemName || '').toLowerCase().includes(search)
              : false;

            const catalogKeys = item.catalogKeys.filter((catalogKey) => {
              const catalog = aiometadataCatalogMap.get(catalogKey);
              if (!catalog || !aiometadataSelectableCatalogKeys.has(catalogKey)) return false;
              if (!search) return true;
              if (widgetTitleMatches || itemNameMatches) return true;
              return [widget.widgetTitle, item.itemName, catalog.entry.name, catalog.entry.id, catalog.entry.type, catalog.source]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(search);
            });

            return {
              ...item,
              catalogKeys,
            };
          })
          .filter((item) => widgetTitleMatches || item.catalogKeys.length > 0);

        const catalogKeys = Array.from(new Set([...rowCatalogKeys, ...items.flatMap((item) => item.catalogKeys)]));
        return {
          ...widget,
          rowCatalogKeys: sortCatalogKeys(rowCatalogKeys, aiometadataCatalogMap),
          items: items
            .map((item) => ({
              ...item,
              catalogKeys: sortCatalogKeys(item.catalogKeys, aiometadataCatalogMap),
            }))
            .sort((left, right) => {
              const leftHasSelectable = left.catalogKeys.some((catalogKey) => aiometadataSelectableCatalogKeys.has(catalogKey));
              const rightHasSelectable = right.catalogKeys.some((catalogKey) => aiometadataSelectableCatalogKeys.has(catalogKey));
              if (leftHasSelectable !== rightHasSelectable) {
                return leftHasSelectable ? -1 : 1;
              }
              return left.itemName.localeCompare(right.itemName, undefined, { sensitivity: 'base' });
            }),
          catalogKeys: sortCatalogKeys(catalogKeys, aiometadataCatalogMap),
        };
      })
      .filter((widget) => widget.catalogKeys.length > 0)
      .sort((left, right) => {
        const leftHasSelectable = left.catalogKeys.some((catalogKey) => aiometadataSelectableCatalogKeys.has(catalogKey));
        const rightHasSelectable = right.catalogKeys.some((catalogKey) => aiometadataSelectableCatalogKeys.has(catalogKey));
        if (leftHasSelectable !== rightHasSelectable) {
          return leftHasSelectable ? -1 : 1;
        }
        return left.widgetIndex - right.widgetIndex;
      });
  }, [
    aiometadataCatalogMap,
    aiometadataInventory.widgets,
    aiometadataSearchQuery,
    aiometadataSelectableCatalogKeys,
  ]);

  const selectedAiometadataCatalogCount = useMemo(
    () => selectedAiometadataCatalogKeys.filter((catalogKey) => aiometadataSelectableCatalogKeys.has(catalogKey)).length,
    [aiometadataSelectableCatalogKeys, selectedAiometadataCatalogKeys]
  );



  const existingAiometadataCatalogCount = useMemo(
    () => aiometadataInventory.catalogs.filter((catalog) => catalog.isAlreadyInManifest).length,
    [aiometadataInventory.catalogs]
  );

  const fullAiometadataSetupDescription = useMemo(() => {
    if (existingAiometadataCatalogCount > 0) {
      return `Includes ${existingAiometadataCatalogCount} synced catalogs and exports everything linked in this setup.`;
    }

    return 'Exports everything linked in this setup.';
  }, [existingAiometadataCatalogCount]);

  const selectableAiometadataCatalogKeysBySource = useMemo(() => {
    const grouped = {
      trakt: [] as string[],
      mdblist: [] as string[],
      streaming: [] as string[],
      simkl: [] as string[],
      letterboxd: [] as string[],
    };

    aiometadataInventory.catalogs.forEach((catalog) => {
      if (!aiometadataSelectableCatalogKeys.has(catalog.key)) {
        return;
      }

      grouped[catalog.source].push(catalog.key);
    });

    return grouped;
  }, [aiometadataInventory.catalogs, aiometadataSelectableCatalogKeys]);

  const isBridgeConfirmed =
    !!nativeTraktBridgeState.fingerprint
    && confirmedBridgeFingerprint === nativeTraktBridgeState.fingerprint;

  const requiresTraktBridgeImport =
    nativeTraktBridgeState.hasNativeTrakt
    && (nativeTraktBridgeState.catalogsExport?.catalogs.length || 0) > 0;
  const hasCopiedRequiredTraktCatalogs =
    !!nativeTraktBridgeState.fingerprint
    && copiedTraktBridgeFingerprint === nativeTraktBridgeState.fingerprint;

  const exportStage: ExportPreviewStage = useMemo(() => {
    if (exportMode === 'aiometadata') {
      return 'aiometadata-catalogs-preview';
    }

    if (exportMode === 'fusion') {
      if (requiresFusionInvalidCatalogConfirmation && !isFusionInvalidCatalogConfirmed) {
        return 'fusion-needs-invalid-catalog-confirmation';
      }
      if (requiresFusionAiometadataSync) {
        return 'fusion-needs-aiom-sync';
      }
      return 'fusion-preview';
    }

    if (!nativeTraktBridgeState.hasNativeTrakt || !requiresTraktBridgeImport) {
      return 'omni-ready';
    }

    if (isBridgeConfirmed) {
      return 'omni-ready';
    }

    return 'omni-needs-aiom-bridge';
  }, [
    exportMode,
    isBridgeConfirmed,
    requiresFusionAiometadataSync,
    isFusionInvalidCatalogConfirmed,
    nativeTraktBridgeState.hasNativeTrakt,
    requiresFusionInvalidCatalogConfirmation,
    requiresTraktBridgeImport,
  ]);

  const previewContent = useMemo(() => {
    if (!showPreview) return '';

    if (exportMode === 'fusion' && requiresFusionInvalidCatalogConfirmation && !isFusionInvalidCatalogConfirmed) {
      const skipSummaryParts = [
        fusionInvalidCatalogSkippedItems > 0
          ? formatCountLabel(fusionInvalidCatalogSkippedItems, 'collection item', 'collection items')
          : null,
        fusionInvalidCatalogSkippedWidgets > 0
          ? formatCountLabel(fusionInvalidCatalogSkippedWidgets, 'widget', 'widgets')
          : null,
      ].filter((value): value is string => Boolean(value));

      const emptyItemSummary =
        fusionInvalidCatalogEmptiedItems > 0
          ? `${formatCountLabel(fusionInvalidCatalogEmptiedItems, 'collection item', 'collection items')} will remain in the export without catalogs so you can assign them manually in Fusion.`
          : null;
      const emptyModeRowSummary =
        fusionInvalidCatalogWidgetsStillSkippedInEmptyMode > 0
          ? `${formatCountLabel(fusionInvalidCatalogWidgetsStillSkippedInEmptyMode, 'classic row', 'classic rows')} will still be skipped because Fusion requires a valid catalog.`
          : null;

      return [
        'Some AIOMetadata catalogs in this setup are missing or invalid.',
        '',
        'Fix or remove catalogs marked with a warning triangle first. If you are unsure whether all required catalogs are included in your AIOMetadata setup, update the catalogs in the AIOMetadata section first.',
        '',
        skipSummaryParts.length > 0
          ? `If you skip invalid entries, ${skipSummaryParts.join(' and ')} will be removed from the Fusion export.`
          : 'If you skip invalid entries, the affected parts of this setup will be removed from the Fusion export.',
        '',
        emptyItemSummary
          ? `If you export invalid items as empty items, ${emptyItemSummary}${emptyModeRowSummary ? ` ${emptyModeRowSummary}` : ''}`
          : 'Only skipping is available for this export because the affected entries cannot be kept as empty items.',
      ].join('\n');
    }

    if (exportMode === 'fusion' && requiresFusionAiometadataSync) {
      return FUSION_SYNC_REQUIRED_MESSAGE;
    }

    if (exportMode === 'fusion' && fusionPreviewState.error) {
      return `Error: ${fusionPreviewState.error}`;
    }

    if (exportMode !== 'fusion' && basePreviewState.error) {
      return `Error: ${basePreviewState.error}`;
    }

    try {
      if (exportMode === 'aiometadata') {
        return JSON.stringify(aiometadataPreviewExport, null, 2);
      }

      if (exportMode === 'fusion') {
        return JSON.stringify(fusionPreviewState.config, null, 2);
      }

      if (requiresTraktBridgeImport && !isBridgeConfirmed) {
        if (isManifestSynced) {
          return [
            'Some catalogs must be added to AIOMetadata before they will work in Omni.',
            '',
            'How to add the missing catalogs:',
            '1. Copy the missing catalogs with the button below.',
            '2. Import them in AIOMetadata under Catalogs > Import Setup and save your changes.',
            '3. Continue to generate the Omni snapshot.',
          ].join('\n');
        }

        const lines = [
          'Native Trakt catalogs must be added to AIOMetadata before they will work in Omni.',
          '',
          '1. Copy the Trakt catalogs.',
          '2. Import them in AIOMetadata under Catalogs > Import Setup and save your changes.',
          '3. Continue to generate the Omni snapshot.',
        ];

        if (omniMissingMdblistState.hasMdblistCatalogs) {
          lines.push(
            '',
            'Sync AIOMetadata first if you want to check whether MDBList catalogs are already present.'
          );
        }

        return lines.join('\n');
      }

      const config = nativeTraktBridgeState.hasNativeTrakt
        ? exportOmniConfig({ nativeTraktStrategy: 'bridge' })
        : exportOmniConfig();
      return JSON.stringify(config, null, 2);
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : 'Export failed.'}`;
    }
  }, [
    aiometadataPreviewExport,
    basePreviewState.error,
    exportMode,
    exportOmniConfig,
    fusionPreviewState.config,
    fusionPreviewState.error,
    fusionInvalidCatalogEmptiedItems,
    fusionInvalidCatalogSkippedItems,
    fusionInvalidCatalogSkippedWidgets,
    fusionInvalidCatalogWidgetsStillSkippedInEmptyMode,
    isBridgeConfirmed,
    isFusionInvalidCatalogConfirmed,
    isManifestSynced,
    omniMissingMdblistState.hasMdblistCatalogs,
    requiresFusionAiometadataSync,
    requiresTraktBridgeImport,
    requiresFusionInvalidCatalogConfirmation,
    nativeTraktBridgeState.hasNativeTrakt,
    showPreview,
  ]);

  useEffect(() => {
    if (!fusionInvalidCatalogState.fingerprint) {
      if (confirmedFusionInvalidCatalogDecision !== null) {
        setConfirmedFusionInvalidCatalogDecision(null);
      }
      return;
    }

    if (
      confirmedFusionInvalidCatalogDecision
      && confirmedFusionInvalidCatalogDecision.fingerprint !== fusionInvalidCatalogState.fingerprint
    ) {
      setConfirmedFusionInvalidCatalogDecision(null);
    }
  }, [confirmedFusionInvalidCatalogDecision, fusionInvalidCatalogState.fingerprint]);

  useEffect(() => {
    if (!nativeTraktBridgeState.hasNativeTrakt) {
      if (copiedTraktBridgeFingerprint !== null) {
        setCopiedTraktBridgeFingerprint(null);
      }
      if (confirmedBridgeFingerprint !== null) {
        setConfirmedBridgeFingerprint(null);
      }
      return;
    }

    if (
      copiedTraktBridgeFingerprint
      && nativeTraktBridgeState.fingerprint
      && copiedTraktBridgeFingerprint !== nativeTraktBridgeState.fingerprint
    ) {
      setCopiedTraktBridgeFingerprint(null);
    }

    if (
      confirmedBridgeFingerprint
      && nativeTraktBridgeState.fingerprint
      && confirmedBridgeFingerprint !== nativeTraktBridgeState.fingerprint
    ) {
      setConfirmedBridgeFingerprint(null);
    }
  }, [
    copiedTraktBridgeFingerprint,
    confirmedBridgeFingerprint,
    nativeTraktBridgeState.fingerprint,
    nativeTraktBridgeState.hasNativeTrakt,
  ]);

  useEffect(() => () => {
    if (copyResetTimeoutRef.current) {
      clearTimeout(copyResetTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (exportMode === 'aiometadata' && aiometadataInventory.catalogs.length === 0) {
      setExportMode('fusion');
    }
  }, [aiometadataInventory.catalogs.length, exportMode]);

  useEffect(() => {
    if (!showPreview) {
      setHasCustomizedAiometadataSelection(false);
      setAiometadataSearchQuery('');
      setExpandedAiometadataWidgetKeys([]);
      setExpandedAiometadataItemKeys([]);
      return;
    }

    setSelectedAiometadataCatalogKeys((previous) => {
      const selectable = aiometadataSelectableCatalogKeys;
      if (selectable.size === 0) {
        return [];
      }

      if (!hasCustomizedAiometadataSelection) {
        return Array.from(selectable);
      }

      const next = new Set(previous.filter((key) => selectable.has(key)));
      if (setsMatch(next, new Set(previous))) {
        return previous;
      }
      return Array.from(next);
    });
  }, [aiometadataSelectableCatalogKeys, hasCustomizedAiometadataSelection, showPreview]);

  useEffect(() => {
    if (!showPreview || exportMode !== 'aiometadata') {
      return;
    }

    const visibleWidgetKeys = new Set(filteredAiometadataWidgets.map((widget) => widget.key));
    const visibleItemKeys = new Set(
      filteredAiometadataWidgets.flatMap((widget) => widget.items.map((item) => item.key))
    );

    setExpandedAiometadataWidgetKeys((previous) =>
      previous.filter((key) => visibleWidgetKeys.has(key))
    );
    setExpandedAiometadataItemKeys((previous) =>
      previous.filter((key) => visibleItemKeys.has(key))
    );
  }, [exportMode, filteredAiometadataWidgets, showPreview]);

  const trashEntries = useMemo(() => {
    const widgetEntries = trash.map((entry) => ({
      kind: 'widget' as const,
      key: `widget-${entry.widget.id}-${entry.deletedAt}`,
      deletedAt: entry.deletedAt,
      typeLabel: 'widget',
      typeClassName: "bg-indigo-500/10 text-indigo-500 border border-indigo-500/20",
      title: entry.widget.title,
      subtitle: '',
      canRestore: true,
      restoreLabel: 'Restore',
      onRestore: () => restoreWidget(entry.widget.id),
    }));

    const itemEntries = itemTrash.map((entry) => {
      const parentExists = widgets.some((widget) => widget.id === entry.widgetId && widget.type === 'collection.row');
      return {
        kind: 'item' as const,
        key: `item-${entry.widgetId}-${entry.item.id}-${entry.deletedAt}`,
        deletedAt: entry.deletedAt,
        typeLabel: 'item',
        typeClassName: "bg-primary/10 text-primary border border-primary/20",
        title: entry.item.name,
        subtitle: `From ${entry.widgetTitle}`,
        canRestore: parentExists,
        restoreLabel: parentExists ? 'Restore' : 'Restore widget first',
        onRestore: () => restoreCollectionItem(entry.widgetId, entry.item.id),
      };
    });

    return [...widgetEntries, ...itemEntries].sort((a, b) => {
      const kindRank = a.kind === b.kind ? 0 : a.kind === 'widget' ? -1 : 1;
      if (kindRank !== 0) {
        return kindRank;
      }

      return new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime();
    });
  }, [itemTrash, restoreCollectionItem, restoreWidget, trash, widgets]);

  const handleCreateWidget = () => {
    if (onNewWidget) {
      onNewWidget();
      return;
    }
    setShowNewWidgetDialog(true);
  };

  const setCopyFeedback = (action: 'preview' | 'missing-catalogs' | 'full-aiometadata') => {
    setCopiedAction(action);
    if (copyResetTimeoutRef.current) {
      clearTimeout(copyResetTimeoutRef.current);
    }
    copyResetTimeoutRef.current = setTimeout(() => {
      setCopiedAction(null);
      copyResetTimeoutRef.current = null;
    }, 2000);
  };

  const copyText = async (text: string, action: 'preview' | 'missing-catalogs' | 'full-aiometadata') => {
    await copyTextToClipboard(text);
    setCopyFeedback(action);
  };

  const downloadText = (text: string, filename: string) => {
    downloadTextFile(text, filename, 'application/octet-stream');
  };

  const handleCopy = async () => {
    try {
      await copyText(previewContent, 'preview');
    } catch (error) {
      setExportActionError(getErrorMessage(error, 'The export could not be copied to your clipboard.'));
    }
  };

  const handleCopyMissingCatalogs = async () => {
    if (!omniMissingCatalogsExport || !nativeTraktBridgeState.fingerprint) {
      return;
    }

    try {
      await copyText(JSON.stringify(omniMissingCatalogsExport, null, 2), 'missing-catalogs');
      setCopiedTraktBridgeFingerprint(nativeTraktBridgeState.fingerprint);
    } catch (error) {
      setExportActionError(getErrorMessage(error, 'The missing catalogs could not be copied.'));
    }
  };

  const handleCopyFullAiometadataCatalogSetup = async () => {
    try {
      await copyText(JSON.stringify(aiometadataFullSetupExport, null, 2), 'full-aiometadata');
    } catch (error) {
      setExportActionError(getErrorMessage(error, 'The full AIOMetadata setup could not be copied.'));
    }
  };

  const handleDownloadFullAiometadataCatalogSetup = () => {
    try {
      downloadText(JSON.stringify(aiometadataFullSetupExport, null, 2), 'aiometadata-full-catalog-setup.json');
    } catch (error) {
      setExportActionError(getErrorMessage(error, 'The full AIOMetadata setup could not be downloaded.'));
    }
  };

  const handleDownload = () => {
    try {
      downloadText(
        previewContent,
        exportMode === 'fusion'
          ? 'fusion-widgets.json'
          : exportMode === 'aiometadata'
            ? 'aiometadata-selected-catalogs.json'
            : 'omni-snapshot.json'
      );
    } catch (error) {
      setExportActionError(getErrorMessage(error, 'The export could not be downloaded.'));
    }
  };

  const handleExportModeChange = (mode: 'fusion' | 'omni' | 'aiometadata') => {
    setExportMode(mode);
    setCopiedAction(null);
  };

  const updateSelectedAiometadataCatalogKeys = (next: Set<string>) => {
    setHasCustomizedAiometadataSelection(true);
    setSelectedAiometadataCatalogKeys(Array.from(next));
    setCopiedAction(null);
  };

  const toggleAiometadataCatalogKey = (catalogKey: string) => {
    if (!aiometadataSelectableCatalogKeys.has(catalogKey)) {
      return;
    }

    const next = new Set(selectedAiometadataCatalogKeySet);
    if (next.has(catalogKey)) {
      next.delete(catalogKey);
    } else {
      next.add(catalogKey);
    }
    updateSelectedAiometadataCatalogKeys(next);
  };

  const toggleAiometadataCatalogGroup = (catalogKeys: string[], checked: boolean) => {
    const next = new Set(selectedAiometadataCatalogKeySet);
    catalogKeys.forEach((catalogKey) => {
      if (!aiometadataSelectableCatalogKeys.has(catalogKey)) {
        return;
      }

      if (checked) {
        next.add(catalogKey);
      } else {
        next.delete(catalogKey);
      }
    });
    updateSelectedAiometadataCatalogKeys(next);
  };

  const replaceAiometadataSelection = (catalogKeys: string[]) => {
    updateSelectedAiometadataCatalogKeys(new Set(catalogKeys));
  };

  const widgetHasEditableAiometadataSources = (widget: ExportableCatalogWidgetGroup) =>
    widget.catalogKeys.some((catalogKey) => {
      const source = aiometadataCatalogMap.get(catalogKey)?.source;
      return source === 'mdblist' || source === 'trakt' || source === 'streaming' || source === 'letterboxd';
    });

  const itemHasEditableAiometadataSources = (item: ExportableCatalogItemGroup) =>
    item.catalogKeys.some((catalogKey) => {
      const source = aiometadataCatalogMap.get(catalogKey)?.source;
      return source === 'mdblist' || source === 'trakt' || source === 'streaming' || source === 'letterboxd';
    });

  const catalogHasEditableAiometadataSettings = (catalogKey: string) => {
    const source = aiometadataCatalogMap.get(catalogKey)?.source;
    return source === 'mdblist' || source === 'trakt' || source === 'streaming' || source === 'letterboxd';
  };

  const openAiometadataSettings = (target: AIOMetadataSettingsDialogTarget) => {
    setAiometadataSettingsTarget(target);
    setIsAiometadataSettingsDialogOpen(true);
  };

  const toggleAiometadataWidgetExpanded = (widgetKey: string) => {
    setExpandedAiometadataWidgetKeys((previous) =>
      previous.includes(widgetKey)
        ? previous.filter((key) => key !== widgetKey)
        : [...previous, widgetKey]
    );
  };

  const toggleAiometadataItemExpanded = (itemKey: string) => {
    setExpandedAiometadataItemKeys((previous) =>
      previous.includes(itemKey)
        ? previous.filter((key) => key !== itemKey)
        : [...previous, itemKey]
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (searchQuery) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = widgets.findIndex((widget) => widget.id === active.id);
    const newIndex = widgets.findIndex((widget) => widget.id === over.id);
    reorderWidgets(oldIndex, newIndex);
  };

  const handleRefreshManifest = async () => {
    if (!manifestUrl) {
      onSyncManifest?.();
      return;
    }

    if (isManualManifest) {
      onSyncManifest?.();
      return;
    }

    setIsRefreshingManifest(true);
    try {
      const [catalogs] = await Promise.all([
        fetchManifest(manifestUrl),
        new Promise((resolve) => setTimeout(resolve, 650)),
      ]);
      syncManifest(catalogs, manifestUrl, true);
    } catch {
      setManifestActionError('The manifest could not be refreshed. Check the URL or reconnect the sync.');
    } finally {
      setIsRefreshingManifest(false);
    }
  };

  const handleOpenSyncManifestFromPreview = () => {
    setShowPreview(false);
    setCopiedAction(null);
    onSyncManifest?.();
  };

  return (
    <div className="flex-1 flex flex-col bg-transparent">
      <main className="max-w-5xl mx-auto w-full px-6 max-sm:px-4 py-12 max-sm:py-6 max-sm:pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <div className="flex flex-col gap-3 mb-10 max-sm:mb-6 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start max-sm:justify-start">
            <h1 className="text-4xl max-sm:text-[1.9rem] font-black tracking-tight text-foreground leading-none">Fusion Widget Manager</h1>
          </div>
          <p className="text-[15px] max-sm:text-[13px] text-muted-foreground/80 font-medium max-w-2xl leading-relaxed max-sm:text-left">
            Organize and manage your library of Fusion widgets.
          </p>
        </div>

        <div className="mb-12 max-sm:mb-7">
          <div
            className={cn(
              "mb-4 rounded-3xl px-5 max-sm:mb-3 max-sm:px-4",
              isManifestSynced
                ? "border border-emerald-200/75 bg-emerald-50/65 py-4 dark:border-emerald-500/22 dark:bg-emerald-500/[0.08]"
                : "border border-amber-200/65 bg-amber-50/50 py-4 dark:border-amber-500/18 dark:bg-amber-500/[0.06]"
            )}
          >
            <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-stretch">
              <div className="flex items-start gap-3">
                {isManifestSynced ? (
                  <div className="flex size-10 items-center justify-center rounded-xl border border-emerald-200/65 bg-emerald-100/62 dark:border-emerald-500/16 dark:bg-emerald-500/12">
                    <span className="size-2 rounded-full bg-emerald-600/85 dark:bg-emerald-300/88" />
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200/60 bg-amber-100/62 p-2 text-amber-700/80 dark:border-amber-500/16 dark:bg-amber-500/12 dark:text-amber-300/85">
                    <AlertTriangle className="size-4" />
                  </div>
                )}

                <div className="min-w-0 max-w-[36rem]">
                  <p
                    className={cn(
                      "text-[11px] font-black uppercase tracking-[0.16em]",
                      isManifestSynced
                        ? "text-emerald-800/85 dark:text-emerald-200/92"
                        : "text-stone-900/72 dark:text-amber-100/82"
                    )}
                  >
                    {isManifestSynced ? 'AIOMetadata synced' : manifestAutoSyncIssue ? 'AIOMetadata sync alert' : 'AIOMetadata not synced'}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-[13px] font-normal leading-[1.55] max-sm:text-[12px]",
                      isManifestSynced
                        ? "text-stone-900/72 dark:text-zinc-300/80"
                        : "text-stone-900/64 dark:text-zinc-300/74"
                    )}
                  >
                    {isManifestSynced
                      ? 'Catalog validation and placeholder replacement are active.'
                      : manifestAutoSyncIssue
                        ? manifestAutoSyncIssue
                      : hasUnsyncedAiometadataSources
                        ? 'Sync your AIOMetadata manifest to replace placeholders and add new catalogs.'
                        : 'Add your AIOMetadata manifest URL for catalog validation and automatic placeholder replacement.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 max-sm:grid max-sm:grid-cols-2 max-sm:w-full">
                {isManifestSynced ? (
                  <>
                    <Button
                      onClick={handleRefreshManifest}
                      variant="secondary"
                      disabled={isRefreshingManifest}
                      className={cn(editorActionButtonClass, "h-10 shrink-0 border border-emerald-300/75 bg-white/80 px-4 text-[10px] text-stone-900/80 hover:bg-emerald-50/90 hover:border-emerald-400/60 hover:text-stone-900/88 max-sm:w-full dark:border-emerald-500/24 dark:bg-zinc-950/60 dark:text-emerald-200/90 dark:hover:bg-emerald-500/12 dark:hover:border-emerald-500/34")}
                    >
                      <RotateCcw className={cn("size-4 mr-2 text-emerald-700/90 dark:text-emerald-300/92", isRefreshingManifest && "animate-spin")} />
                      Refresh
                    </Button>
                    <Button
                      onClick={onSyncManifest}
                      variant="secondary"
                      className={cn(editorActionButtonClass, "h-10 shrink-0 border border-emerald-200/50 bg-white/70 px-4 text-[10px] text-stone-900/70 hover:bg-emerald-50/60 hover:border-emerald-300/60 hover:text-stone-900/85 max-sm:w-full dark:border-white/5 dark:bg-zinc-950/60 dark:text-zinc-300/80 dark:hover:bg-zinc-900/85")}
                    >
                      <Pencil className="size-4 mr-2 opacity-70" />
                      Edit
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={onSyncManifest}
                    variant="secondary"
                    className={cn(editorActionButtonClass, "h-11 shrink-0 border border-amber-300/70 bg-white/80 px-4 text-[10px] text-stone-900/80 hover:bg-amber-50/90 hover:border-amber-400/60 hover:text-stone-900/88 max-sm:w-full max-sm:col-span-2 dark:border-amber-500/24 dark:bg-zinc-950/60 dark:text-amber-200/90 dark:hover:bg-amber-500/12 dark:hover:border-amber-500/34")}
                  >
                    <Globe className="size-4 mr-2 text-amber-700/90 dark:text-amber-300/92" />
                    Sync Manifest
                  </Button>
                )}
              </div>
            </div>
          </div>

          {hasTrash && (
            <div className="mb-4 flex justify-end pr-2 max-sm:mb-3 max-sm:pr-3">
              <Button
                onClick={() => setShowTrash(true)}
                variant="secondary"
                className={cn(editorActionButtonClass, "h-11 border border-destructive/20 bg-destructive/10 px-4 text-[10px] text-destructive hover:bg-destructive/15 max-sm:h-11 max-sm:w-full max-sm:justify-center dark:border-destructive/25 dark:bg-destructive/12 dark:hover:bg-destructive/16")}
                title="Trash"
              >
                <Trash2 className="mr-2 size-4 opacity-90" />
                Trash ({trashCount})
              </Button>
            </div>
          )}

          <div className={cn(editorPanelClass, "p-4 max-sm:p-3 rounded-3xl max-sm:rounded-[1.5rem] bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-200/70 dark:border-border/10 backdrop-blur-2xl")}>
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 max-sm:gap-3">
              {/* Left Group: Search */}
              <div className="relative flex-1 group min-w-0 rounded-xl">
                <Search className="pointer-events-none absolute left-5 max-sm:left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
                <Input
                  data-testid="widget-search"
                  placeholder="Search for widgets..."
                  className="w-full h-11 max-sm:h-10 pl-11 max-sm:pl-9 pr-10 rounded-xl border-none bg-transparent shadow-none focus-visible:ring-0 text-sm sm:text-[13px] font-medium tracking-tight placeholder:text-muted-foreground/40"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl hover:bg-muted/50 text-muted-foreground/20 hover:text-muted-foreground transition-all"
                  >
                    <Plus className="size-4 rotate-45" />
                  </button>
                )}
              </div>

              {/* Right Group: Priorities & Utilities */}
              <div className="flex flex-wrap items-center gap-2 p-1 md:p-0 max-sm:grid max-sm:grid-cols-3 max-sm:w-full max-sm:gap-2 max-sm:p-0">
                <Button
                  data-testid="new-widget-button"
                  onClick={handleCreateWidget}
                  className={cn(editorActionButtonClass, "h-11 max-sm:h-11 px-6 max-sm:px-4 text-[10px] bg-primary hover:bg-primary/95 text-primary-foreground flex-1 md:flex-none order-1")}
                >
                  <Plus className="size-4 mr-2" />
                  <span className="sm:hidden">New</span>
                  <span className="hidden sm:inline">New Widget</span>
                </Button>

                <Button
                  data-testid="merge-import-button"
                  onClick={() => setShowImportMergeDialog(true)}
                  variant="secondary"
                  className={cn(editorActionButtonClass, "h-11 max-sm:h-11 px-6 max-sm:px-4 text-[10px] border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 order-2 flex-1 md:flex-none dark:border-primary/25 dark:bg-primary/12 dark:hover:bg-primary/18")}
                  title="Import JSON"
                >
                  <FileJson2 className="size-4 mr-2" />
                  Import
                </Button>

                <Button
                  data-testid="export-button"
                  onClick={() => {
                    setShowPreview(true);
                    onDownload?.();
                  }}
                  variant="secondary"
                  className={cn(editorActionButtonClass, "h-11 max-sm:h-11 px-6 max-sm:px-4 text-[10px] border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 order-3 flex-1 md:flex-none dark:border-primary/25 dark:bg-primary/12 dark:hover:bg-primary/18")}
                  title="Export JSON"
                >
                  <Download className="size-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </div>
        </div>

        {searchQuery && (
          <p className="mb-4 text-xs font-medium text-muted-foreground/70 max-sm:px-1">
            Reordering is disabled while search is active.
          </p>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={searchQuery ? filteredWidgets.map((widget) => widget.id) : widgets.map((widget) => widget.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3 max-sm:gap-2.5">
              {filteredWidgets.map((widget) => (
                <SortableWidget
                  key={widget.id}
                  widget={widget}
                  isSelected={expandedWidgetId === widget.id}
                  onSelect={(id) =>
                    handleExpandedWidgetChange(expandedWidgetId === id ? null : id)
                  }
                  onNodeChange={registerWidgetNode}
                  searchQuery={searchQuery}
                />
              ))}

              {widgets.length > 0 && (
                <button
                  onClick={handleCreateWidget}
                  className="w-full h-16 max-sm:h-14 border-2 border-dashed border-border/40 rounded-2xl max-sm:rounded-xl flex items-center justify-center gap-3 text-muted-foreground/40 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all group mt-2 bg-muted/5"
                >
                  <Plus className="size-4 group-hover:scale-110 transition-transform opacity-50 group-hover:opacity-100" />
                  <span className="text-xs font-bold uppercase tracking-widest">Add another widget</span>
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>

        {widgets.length === 0 && !searchQuery && (
          <div className="py-20 max-sm:py-12 text-center space-y-4 max-sm:space-y-3">
            <p className="text-muted-foreground font-medium">
              No active widgets. Create a new one or restore one from trash.
            </p>
            <div className="flex items-center justify-center gap-3 max-sm:flex-col">
              <Button onClick={handleCreateWidget} className="rounded-2xl max-sm:w-full max-sm:h-11">
                <Plus className="size-4 mr-2" /> Add Widget
              </Button>
              <Button onClick={() => setShowTrash(true)} variant="outline" className="rounded-2xl max-sm:w-full max-sm:h-11">
                <Trash2 className="size-4 mr-2" /> Trash
              </Button>
            </div>
          </div>
        )}

        {filteredWidgets.length === 0 && searchQuery && (
          <div className="py-20 text-center">
            <p className="text-muted-foreground font-medium">No widgets match your search.</p>
          </div>
        )}
      </main>

      <NewWidgetDialog
        isOpen={showNewWidgetDialog}
        onOpenChange={setShowNewWidgetDialog}
        onCreated={(id) => handleExpandedWidgetChange(id)}
      />

      <Dialog
        open={showPreview}
        onOpenChange={(open) => {
          setShowPreview(open);
          setCopiedAction(null);
        }}
      >
        <DialogContent className="flex sm:max-h-[92vh] max-w-2xl flex-col overflow-hidden rounded-3xl border border-border/40 bg-background/95 p-0  backdrop-blur-2xl">
          <DialogTitle className="sr-only">Export JSON</DialogTitle>
          <div className="flex min-h-0 flex-1 flex-col p-8 pt-10 max-sm:p-5 max-sm:pt-6">
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
            <DialogHeader className="space-y-6 items-start text-left">
              <div className="size-14 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary  max-sm:size-12">
                <FileJson2 className="size-7 max-sm:size-6" />
              </div>
              <DialogTitle className="text-2xl font-black tracking-tight max-sm:text-xl">Export JSON</DialogTitle>
            </DialogHeader>

            <div className="mt-8 flex justify-end max-sm:mt-5 max-sm:justify-start">
              <div className="flex flex-wrap rounded-2xl border border-border/10 bg-muted/20 p-1.5">
                <button
                  onClick={() => handleExportModeChange('fusion')}
                  className={cn(
                    'px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                    exportMode === 'fusion' 
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' 
                      : 'text-muted-foreground/65 hover:text-foreground hover:bg-background/40'
                  )}
                >
                  Fusion
                </button>
                <button
                  onClick={() => handleExportModeChange('omni')}
                  className={cn(
                    'px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                    exportMode === 'omni' 
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' 
                      : 'text-muted-foreground/65 hover:text-foreground hover:bg-background/40'
                  )}
                >
                  Omni
                </button>
                <button
                  onClick={() => handleExportModeChange('aiometadata')}
                  disabled={aiometadataInventory.catalogs.length === 0}
                  className={cn(
                    'px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                    exportMode === 'aiometadata'
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                      : 'text-muted-foreground/65 hover:text-foreground hover:bg-background/40',
                    aiometadataInventory.catalogs.length === 0 && 'cursor-not-allowed opacity-30 hover:text-muted-foreground/65'
                  )}
                >
                  AIOMETADATA
                </button>
              </div>
            </div>

            {exportMode === 'aiometadata' ? (
              <div className="mt-5 flex min-h-0 flex-col gap-4">
                <div className="flex flex-col gap-3">
                  <div className="rounded-3xl border border-zinc-200/80 bg-white/40 px-5 py-5 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="flex h-full flex-col justify-between gap-4">
                      <div className="min-w-0">
                        <p className={aiometadataSectionTitleClass}>
                          Full Catalog Setup
                        </p>
                        <p className={aiometadataSectionDescriptionClass}>
                          {fullAiometadataSetupDescription}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 w-full rounded-2xl border border-zinc-200 bg-white/80 px-5 text-[10px] font-black uppercase tracking-widest text-foreground/80 transition-all hover:bg-zinc-50 hover:text-foreground dark:border-white/10 dark:bg-zinc-800/80 dark:hover:bg-zinc-700"
                          onClick={handleDownloadFullAiometadataCatalogSetup}
                        >
                          <Download className="mr-2 size-3.5" />
                          Download All Catalogs
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 w-full rounded-2xl border border-primary/20 bg-primary/10 px-5 text-[10px] font-black uppercase tracking-widest text-primary transition-all hover:bg-primary/20 dark:border-primary/30 dark:bg-primary/15 dark:hover:bg-primary/25"
                          onClick={() => { void handleCopyFullAiometadataCatalogSetup(); }}
                        >
                          {copiedAction === 'full-aiometadata' ? <Check className="mr-2 size-3.5" /> : <Copy className="mr-2 size-3.5" />}
                          {copiedAction === 'full-aiometadata' ? 'Copied' : 'Copy All Catalogs'}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-zinc-200/80 bg-white/40 px-5 py-4 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={aiometadataSectionTitleClass}>
                              UME Sorting
                            </p>
                            <button
                              type="button"
                              className="flex size-6 items-center justify-center rounded-full border border-border/10 bg-background/70 text-muted-foreground/65 transition-all hover:border-primary/20 hover:text-primary"
                              onClick={() => setIsUmeSortingDialogOpen(true)}
                              aria-label="Show UME sorting details"
                            >
                              <Info className="size-3.5" />
                            </button>
                          </div>
                          <p className={aiometadataSectionDescriptionClass}>
                            Automatic sorting for your AIOMetadata catalogs.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAiometadataUseUmeSorting((current) => !current)}
                        className="group inline-flex items-center"
                        aria-pressed={aiometadataUseUmeSorting}
                        aria-label={aiometadataUseUmeSorting ? 'Disable UME Sorting' : 'Enable UME Sorting'}
                      >
                        <span
                          className={cn(
                            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                            aiometadataUseUmeSorting ? 'bg-primary/90' : 'bg-foreground/15'
                          )}
                        >
                          <span
                            className={cn(
                              'size-5 rounded-full bg-white shadow-sm transition-transform',
                              aiometadataUseUmeSorting ? 'translate-x-5' : 'translate-x-0.5'
                            )}
                          />
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 rounded-3xl border border-zinc-200/80 bg-white/40 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.03] shadow-sm overflow-hidden">
                  <div className="border-b border-zinc-200/60 px-5 py-4 dark:border-border/5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div className="min-w-0">
                        <p className={aiometadataSectionTitleClass}>
                          New Catalogs
                        </p>
                        <p className={aiometadataSectionDescriptionClass}>
                          {isManifestSynced ? 'Only catalogs not yet in AIOMetadata' : 'Current AIOMetadata catalog selection'}
                        </p>
                      </div>
                      <div className="rounded-full border border-primary/15 bg-primary/[0.08] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
                        {selectedAiometadataCatalogCount} Selected
                      </div>
                    </div>
                  </div>
                  {/* Header Stack: Tabs + Action Dock */}
                  <div className="shrink-0 border-b border-zinc-200/60 dark:border-border/5 relative z-50">
                    {/* Header with Search */}
                    <div className="p-4 border-b border-zinc-200/60 dark:border-border/5 bg-black/[0.015] dark:bg-black/10">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/35" />
                        <Input
                          value={aiometadataSearchQuery}
                          onChange={(event) => setAiometadataSearchQuery(event.target.value)}
                          placeholder="Filter catalogs, widgets, or items..."
                          className="h-10 rounded-xl border-border/30 bg-background/70 pl-11 text-sm sm:text-xs font-medium"
                        />
                      </div>
                    </div>

                    {/* Integrated Action Dock */}
                    <div className="px-5 max-sm:px-3 py-3 bg-black/[0.02] dark:bg-black/5">
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                        <button
                          type="button"
                          onClick={() => replaceAiometadataSelection(Array.from(aiometadataSelectableCatalogKeys))}
                          disabled={aiometadataSelectableCatalogKeys.size === 0}
                          className="h-7.5 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest text-foreground/65 border border-border/10 bg-white/95 dark:bg-white/[0.06] hover:bg-white dark:hover:bg-white/[0.12] hover:border-primary/20 hover:text-primary transition-all active:scale-95 shadow-sm dark:shadow-none shrink-0"
                        >
                          All
                        </button>
                        {selectableAiometadataCatalogKeysBySource.trakt.length > 0 && (
                          <button
                            type="button"
                            onClick={() => replaceAiometadataSelection(selectableAiometadataCatalogKeysBySource.trakt)}
                            className="h-7.5 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest text-foreground/65 border border-border/10 bg-white/95 dark:bg-white/[0.06] hover:bg-white dark:hover:bg-white/[0.12] hover:border-primary/20 hover:text-primary transition-all active:scale-95 shadow-sm dark:shadow-none shrink-0"
                          >
                            Trakt
                          </button>
                        )}
                        {selectableAiometadataCatalogKeysBySource.mdblist.length > 0 && (
                          <button
                            type="button"
                            onClick={() => replaceAiometadataSelection(selectableAiometadataCatalogKeysBySource.mdblist)}
                            className="h-7.5 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest text-foreground/65 border border-border/10 bg-white/95 dark:bg-white/[0.06] hover:bg-white dark:hover:bg-white/[0.12] hover:border-primary/20 hover:text-primary transition-all active:scale-95 shadow-sm dark:shadow-none shrink-0"
                          >
                            MDBList
                          </button>
                        )}
                        {selectableAiometadataCatalogKeysBySource.streaming.length > 0 && (
                          <button
                            type="button"
                            onClick={() => replaceAiometadataSelection(selectableAiometadataCatalogKeysBySource.streaming)}
                            className="h-7.5 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest text-foreground/65 border border-border/10 bg-white/95 dark:bg-white/[0.06] hover:bg-white dark:hover:bg-white/[0.12] hover:border-primary/20 hover:text-primary transition-all active:scale-95 shadow-sm dark:shadow-none shrink-0"
                          >
                            Streaming
                          </button>
                        )}
                        {selectableAiometadataCatalogKeysBySource.simkl.length > 0 && (
                          <button
                            type="button"
                            onClick={() => replaceAiometadataSelection(selectableAiometadataCatalogKeysBySource.simkl)}
                            className="h-7.5 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest text-foreground/65 border border-border/10 bg-white/95 dark:bg-white/[0.06] hover:bg-white dark:hover:bg-white/[0.12] hover:border-primary/20 hover:text-primary transition-all active:scale-95 shadow-sm dark:shadow-none shrink-0"
                          >
                            Simkl
                          </button>
                        )}
                        {selectableAiometadataCatalogKeysBySource.letterboxd.length > 0 && (
                          <button
                            type="button"
                            onClick={() => replaceAiometadataSelection(selectableAiometadataCatalogKeysBySource.letterboxd)}
                            className="h-7.5 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest text-foreground/65 border border-border/10 bg-white/95 dark:bg-white/[0.06] hover:bg-white dark:hover:bg-white/[0.12] hover:border-primary/20 hover:text-primary transition-all active:scale-95 shadow-sm dark:shadow-none shrink-0"
                          >
                            Letterboxd
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => replaceAiometadataSelection([])}
                          disabled={selectedAiometadataCatalogCount === 0}
                          className="h-7.5 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest text-foreground/65 border border-border/10 bg-white/95 dark:bg-white/[0.06] hover:bg-white dark:hover:bg-white/[0.12] hover:border-destructive/20 hover:text-destructive transition-all active:scale-95 shadow-sm dark:shadow-none shrink-0"
                        >
                          None
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 max-h-[400px] min-h-0 space-y-3 overflow-y-auto pr-1 custom-scrollbar bg-zinc-50/20 dark:bg-zinc-950/10">
                    {filteredAiometadataWidgets.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/30 bg-background/40 px-4 py-8 text-center">
                        <p className="text-sm font-semibold text-muted-foreground/60">
                          No exportable catalogs match the current search.
                        </p>
                      </div>
                    ) : (
                      filteredAiometadataWidgets.map((widget) => {
                        const widgetSelectedCount = widget.catalogKeys.filter((catalogKey) =>
                          selectedAiometadataCatalogKeySet.has(catalogKey)
                        ).length;
                        const widgetSelectableCatalogKeys = widget.catalogKeys.filter((catalogKey) =>
                          aiometadataSelectableCatalogKeys.has(catalogKey)
                        );
                        const widgetIsSyncedOnly = widgetSelectableCatalogKeys.length === 0;
                        const widgetAllSelected =
                          widgetSelectableCatalogKeys.length > 0 && widgetSelectedCount === widgetSelectableCatalogKeys.length;
                        const widgetPartiallySelected = widgetSelectedCount > 0 && !widgetAllSelected;
                        const widgetHasSearchMatch = aiometadataSearchQuery.trim().length > 0;
                        const widgetExpanded =
                          widgetHasSearchMatch
                          || widgetPartiallySelected
                          || expandedAiometadataWidgetKeys.includes(widget.key);

                        return (
                          <div
                            key={widget.key}
                            className={cn(
                              'scroll-mt-4 rounded-xl border p-4 ',
                              widgetIsSyncedOnly
                                ? 'border-border/10 bg-background/35 opacity-80'
                                : 'border-border/20 bg-background/55'
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 flex-1 items-start gap-3">
                                <input
                                  type="checkbox"
                                  className="mt-1 size-4 rounded border-border/60"
                                  checked={widgetAllSelected}
                                  disabled={widgetSelectableCatalogKeys.length === 0}
                                  ref={(node) => {
                                    if (node) {
                                      node.indeterminate = widgetPartiallySelected;
                                    }
                                  }}
                                  onChange={(event) => toggleAiometadataCatalogGroup(widgetSelectableCatalogKeys, event.target.checked)}
                                />
                                <div
                                  className="min-w-0 flex-1 cursor-pointer"
                                  onClick={() => toggleAiometadataWidgetExpanded(widget.key)}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      toggleAiometadataWidgetExpanded(widget.key);
                                    }
                                  }}
                                  aria-label={widgetExpanded ? 'Collapse widget catalogs' : 'Expand widget catalogs'}
                                >
                                  <button
                                    type="button"
                                    className="inline-block max-w-full text-left"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      toggleAiometadataCatalogGroup(widgetSelectableCatalogKeys, !widgetAllSelected);
                                    }}
                                    aria-label={widgetAllSelected ? 'Clear widget selection' : 'Select widget catalogs'}
                                    disabled={widgetSelectableCatalogKeys.length === 0}
                                  >
                                    <p className={cn(
                                      'truncate text-sm font-bold tracking-tight',
                                      widgetIsSyncedOnly ? 'text-foreground/55' : 'text-foreground'
                                    )}>
                                      {widget.widgetTitle || `Widget ${widget.widgetIndex + 1}`}
                                    </p>
                                    <p className={cn(
                                      'mt-1 text-[10px] font-black uppercase tracking-[0.16em]',
                                      widgetIsSyncedOnly ? 'text-muted-foreground/35' : 'text-muted-foreground/50'
                                    )}>
                                      {widget.widgetType === 'row.classic' ? 'Classic Row' : 'Collection'}
                                    </p>
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/70">
                                  {widgetSelectableCatalogKeys.length > 0
                                    ? `${widgetSelectedCount}/${widgetSelectableCatalogKeys.length}`
                                    : 'Synced'}
                                </span>
                                {widgetHasEditableAiometadataSources(widget) && (
                                  <button
                                    type="button"
                                    className={cn(
                                      'flex size-8 items-center justify-center rounded-xl border transition-all',
                                      widgetIsSyncedOnly
                                        ? 'border-border/10 bg-background/45 text-muted-foreground/35'
                                        : 'border-border/15 bg-background/70 text-muted-foreground/55 hover:border-primary/20 hover:bg-primary/5 hover:text-primary'
                                    )}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openAiometadataSettings({ kind: 'widget', widgetId: widget.id });
                                    }}
                                    aria-label={`Open export settings for ${widget.widgetTitle || `Widget ${widget.widgetIndex + 1}`}`}
                                  >
                                    <SlidersHorizontal className="size-4" />
                                  </button>
                                )}
                                {(widget.rowCatalogKeys.length > 0 || widget.items.length > 0) && (
                                  <button
                                    type="button"
                                    className={cn(
                                      'flex size-8 items-center justify-center rounded-xl border transition-all',
                                      widgetIsSyncedOnly
                                        ? 'border-border/10 bg-background/45 text-muted-foreground/35'
                                        : 'border-border/15 bg-background/70 text-muted-foreground/55 hover:border-primary/20 hover:bg-primary/5 hover:text-primary'
                                    )}
                                    onClick={() => toggleAiometadataWidgetExpanded(widget.key)}
                                    aria-label={widgetExpanded ? 'Collapse widget catalogs' : 'Expand widget catalogs'}
                                  >
                                    <ChevronRight className={cn('size-4 transition-transform', widgetExpanded && 'rotate-90')} />
                                  </button>
                                )}
                              </div>
                            </div>

                            <AnimatePresence initial={false}>
                              {widgetExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                                  className="overflow-hidden"
                                >
                                  {widget.rowCatalogKeys.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                      {widget.rowCatalogKeys.map((catalogKey) => {
                                        const catalog = aiometadataCatalogMap.get(catalogKey) as ExportableCatalogDefinition | undefined;
                                        if (!catalog) return null;
                                        const checked = selectedAiometadataCatalogKeySet.has(catalogKey);
                                        const disabled = isManifestSynced && catalog.isAlreadyInManifest;
                                        return (
                                          <label
                                            key={catalogKey}
                                            className={cn(
                                              'flex items-center gap-3 rounded-xl border border-border/15 bg-muted/15 px-3 py-2.5',
                                              disabled && 'opacity-55'
                                            )}
                                          >
                                            <input
                                              type="checkbox"
                                              className="size-4 rounded border-border/60"
                                              checked={checked}
                                              disabled={disabled}
                                              onChange={() => toggleAiometadataCatalogKey(catalogKey)}
                                            />
                                            <div className="min-w-0 flex-1">
                                              <p className="truncate text-sm font-semibold text-foreground">{catalog.entry.name}</p>
                                              <p className="truncate text-[11px] font-medium text-muted-foreground/65">
                                                {catalog.entry.type} / {catalog.entry.id}
                                              </p>
                                            </div>
                                            <span className={cn(
                                              'rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]',
                                              catalog.source === 'trakt'
                                                ? 'bg-sky-500/10 text-sky-600 dark:text-sky-300'
                                                : catalog.source === 'mdblist'
                                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                                                  : catalog.source === 'letterboxd'
                                                    ? 'bg-orange-500/10 text-orange-600 dark:text-orange-300'
                                                  : catalog.source === 'simkl'
                                                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300'
                                                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
                                            )}>
                                              {catalog.source}
                                            </span>
                                            {catalogHasEditableAiometadataSettings(catalogKey) && (
                                              <button
                                                type="button"
                                                className="flex size-8 items-center justify-center rounded-xl border border-border/15 bg-background/70 text-muted-foreground/55 transition-all hover:border-primary/20 hover:bg-primary/5 hover:text-primary active:scale-90"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  openAiometadataSettings({ kind: 'catalog', catalogKey });
                                                }}
                                                aria-label={`Open export settings for ${catalog.entry.name}`}
                                              >
                                                <SlidersHorizontal className="size-4" />
                                              </button>
                                            )}
                                            {disabled && (
                                              <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/70">
                                                Synced
                                              </span>
                                            )}
                                          </label>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {widget.items.length > 0 && (
                                    <div className="mt-2 rounded-xl border border-zinc-200/60 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900/30 overflow-hidden">
                                      {widget.items.map((item) => {
                                        const itemSelectedCount = item.catalogKeys.filter((catalogKey) =>
                                          selectedAiometadataCatalogKeySet.has(catalogKey)
                                        ).length;
                                        const itemSelectableCatalogKeys = item.catalogKeys.filter((catalogKey) =>
                                          aiometadataSelectableCatalogKeys.has(catalogKey)
                                        );
                                        const itemIsSyncedOnly = itemSelectableCatalogKeys.length === 0;
                                        const itemAllSelected =
                                          itemSelectableCatalogKeys.length > 0 && itemSelectedCount === itemSelectableCatalogKeys.length;
                                        const itemPartiallySelected = itemSelectedCount > 0 && !itemAllSelected;
                                        const itemExpanded =
                                          widgetHasSearchMatch
                                          || itemPartiallySelected
                                          || expandedAiometadataItemKeys.includes(item.key);

                                        return (
                                          <div
                                            key={item.key}
                                            className={cn(
                                              'p-3.5 transition-all border-b border-zinc-200/60 dark:border-white/5 last:border-0 bg-white/40 dark:bg-white/[0.008] hover:bg-white/60 dark:hover:bg-white/[0.015]',
                                              itemIsSyncedOnly
                                                ? 'dark:bg-white/[0.002] opacity-60'
                                                : 'relative'
                                            )}
                                          >
                                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 flex-1 items-start gap-3">
                                  <div className="mt-1 shrink-0">
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleAiometadataCatalogGroup(itemSelectableCatalogKeys, !itemAllSelected);
                                      }}
                                      className={cn(
                                        "size-[1.125rem] rounded-[0.35rem] border-2 transition-all cursor-pointer flex items-center justify-center shrink-0",
                                        itemAllSelected || itemPartiallySelected
                                          ? "bg-primary border-primary "
                                          : "bg-zinc-950/40 border-white/10 hover:border-primary/40",
                                        itemIsSyncedOnly && "opacity-30 cursor-not-allowed"
                                      )}
                                    >
                                      {itemPartiallySelected
                                        ? <div className="w-2.5 h-0.5 bg-primary-foreground rounded-full" />
                                        : itemAllSelected && <Check className="size-3 text-primary-foreground stroke-[3.5px]" />
                                      }
                                    </div>
                                  </div>
                                                <div
                                                  className="min-w-0 flex-1 cursor-pointer"
                                                  onClick={() => toggleAiometadataItemExpanded(item.key)}
                                                  role="button"
                                                  tabIndex={0}
                                                  onKeyDown={(event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                      event.preventDefault();
                                                      toggleAiometadataItemExpanded(item.key);
                                                    }
                                                  }}
                                                  aria-label={itemExpanded ? 'Collapse item catalogs' : 'Expand item catalogs'}
                                                >
                                                  <button
                                                    type="button"
                                                    className="inline-block max-w-full text-left"
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      toggleAiometadataCatalogGroup(itemSelectableCatalogKeys, !itemAllSelected);
                                                    }}
                                                    aria-label={itemAllSelected ? 'Clear item selection' : 'Select item catalogs'}
                                                    disabled={itemSelectableCatalogKeys.length === 0}
                                                  >
                                                    <p className={cn(
                                                      'truncate text-sm font-semibold',
                                                      itemIsSyncedOnly ? 'text-foreground/55' : 'text-foreground'
                                                    )}>
                                                      {item.itemName}
                                                    </p>
                                                    <p className={cn(
                                                      'mt-1 text-[10px] font-black uppercase tracking-[0.16em]',
                                                      itemIsSyncedOnly ? 'text-muted-foreground/35' : 'text-muted-foreground/50'
                                                    )}>
                                                      Item
                                                    </p>
                                                  </button>
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-2 shrink-0">
                                                <span className="rounded-full bg-background/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/70">
                                                  {itemSelectableCatalogKeys.length > 0
                                                    ? `${itemSelectedCount}/${itemSelectableCatalogKeys.length}`
                                                    : 'Synced'}
                                                </span>
                                                {itemHasEditableAiometadataSources(item) && (
                                                  <button
                                                    type="button"
                                                    className={cn(
                                                      'flex size-8 items-center justify-center rounded-xl border transition-all',
                                                      itemIsSyncedOnly
                                                        ? 'border-border/10 bg-background/45 text-muted-foreground/35'
                                                        : 'border-border/15 bg-background/70 text-muted-foreground/55 hover:border-primary/20 hover:bg-primary/5 hover:text-primary'
                                                    )}
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      openAiometadataSettings({ kind: 'item', itemKey: item.id });
                                                    }}
                                                    aria-label={`Open export settings for ${item.itemName}`}
                                                  >
                                                    <SlidersHorizontal className="size-4" />
                                                  </button>
                                                )}
                                                <button
                                                  type="button"
                                                  className={cn(
                                                    'flex size-8 items-center justify-center rounded-xl border transition-all',
                                                    itemIsSyncedOnly
                                                      ? 'border-border/10 bg-background/45 text-muted-foreground/35'
                                                      : 'border-border/15 bg-background/70 text-muted-foreground/55 hover:border-primary/20 hover:bg-primary/5 hover:text-primary'
                                                  )}
                                                  onClick={() => toggleAiometadataItemExpanded(item.key)}
                                                  aria-label={itemExpanded ? 'Collapse item catalogs' : 'Expand item catalogs'}
                                                >
                                                  <ChevronRight className={cn('size-4 transition-transform', itemExpanded && 'rotate-90')} />
                                                </button>
                                              </div>
                                            </div>

                                            <AnimatePresence initial={false}>
                                              {itemExpanded && (
                                                <motion.div
                                                  initial={{ height: 0, opacity: 0 }}
                                                  animate={{ height: 'auto', opacity: 1 }}
                                                  exit={{ height: 0, opacity: 0 }}
                                                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                                                  className="overflow-hidden"
                                                >
                                                  <div className="mt-3.5 p-3.5 rounded-xl bg-zinc-100/80 dark:bg-zinc-900/30 border border-zinc-200/60 dark:border-white/5 space-y-2">
                                                    {item.catalogKeys.map((catalogKey) => {
                                                      const catalog = aiometadataCatalogMap.get(catalogKey) as ExportableCatalogDefinition | undefined;
                                                      if (!catalog) return null;
                                                      const checked = selectedAiometadataCatalogKeySet.has(catalogKey);
                                                      const disabled = isManifestSynced && catalog.isAlreadyInManifest;
                                                      return (
                                                          <label
                                                            key={catalogKey}
                                                            className={cn(
                                                              'flex items-center gap-3 rounded-xl border border-zinc-200/60 dark:border-white/5 bg-white/80 dark:bg-white/[0.015] px-3 py-2.5 transition-all hover:bg-zinc-50 dark:hover:bg-white/[0.03]',
                                                              disabled && 'opacity-55'
                                                            )}
                                                          >
                                                          <div
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              if (!disabled) toggleAiometadataCatalogKey(catalogKey);
                                                            }}
                                                            className={cn(
                                                              "size-[1.125rem] rounded-[0.35rem] border-2 transition-all cursor-pointer flex items-center justify-center shrink-0",
                                                              checked
                                                                ? "bg-primary border-primary "
                                                                : "bg-zinc-950/40 border-white/10 hover:border-primary/40",
                                                              disabled && "opacity-30 cursor-not-allowed"
                                                            )}
                                                          >
                                                            {checked && <Check className="size-3 text-primary-foreground stroke-[3.5px]" />}
                                                          </div>
                                                          <div className="min-w-0 flex-1">
                                                            <p className="truncate text-sm font-semibold text-foreground">{catalog.entry.name}</p>
                                                            <p className="truncate text-[11px] font-medium text-muted-foreground/65">
                                                              {catalog.entry.type} / {catalog.entry.id}
                                                            </p>
                                                          </div>
                                                          <span className={cn(
                                                            'rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]',
                                                            catalog.source === 'trakt'
                                                              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-300'
                                                              : catalog.source === 'mdblist'
                                                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                                                                : catalog.source === 'letterboxd'
                                                                  ? 'bg-orange-500/10 text-orange-600 dark:text-orange-300'
                                                                : catalog.source === 'simkl'
                                                                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300'
                                                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
                                                          )}>
                                                            {catalog.source}
                                                          </span>
                                                          {catalogHasEditableAiometadataSettings(catalogKey) && (
                                                            <button
                                                              type="button"
                                                              className="flex size-8 items-center justify-center rounded-xl border border-border/15 bg-background/70 text-muted-foreground/55 transition-all hover:border-primary/20 hover:bg-primary/5 hover:text-primary active:scale-90"
                                                              onClick={(event) => {
                                                                event.stopPropagation();
                                                                openAiometadataSettings({ kind: 'catalog', catalogKey });
                                                              }}
                                                              aria-label={`Open export settings for ${catalog.entry.name}`}
                                                            >
                                                              <SlidersHorizontal className="size-4" />
                                                            </button>
                                                          )}
                                                          {disabled && (
                                                            <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/70">
                                                              Synced
                                                            </span>
                                                          )}
                                                        </label>
                                                      );
                                                    })}
                                                  </div>
                                                </motion.div>
                                              )}
                                            </AnimatePresence>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="min-h-0 rounded-2xl border border-border/10 bg-muted/20 p-4">
                  <div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-foreground/55">
                        Export Preview
                      </p>
                      <p className="mt-1 text-xs font-medium text-muted-foreground/75">
                        {aiometadataPreviewExport.catalogs.length} catalogs in the current export
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 relative group overflow-hidden rounded-xl border border-border/10 bg-background/50 p-1">
                    <Textarea
                      data-testid="export-preview-textarea"
                      readOnly
                      value={previewContent}
                      className="h-[320px] max-sm:h-[20vh] w-full resize-none overflow-y-auto border-none bg-transparent p-5 max-sm:p-3 font-mono text-base max-sm:text-[10px] sm:text-xs leading-relaxed focus-visible:ring-0 custom-scrollbar"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <div className="relative group rounded-2xl border border-border/10 bg-muted/20 p-1 overflow-hidden">
                {exportStage === 'fusion-needs-invalid-catalog-confirmation'
                || exportStage === 'omni-needs-aiom-bridge' ? (
                  <div className="min-h-[320px] max-sm:min-h-[20vh] p-5 max-sm:p-4">
                    <div
                      className={cn(
                        'flex size-9 items-center justify-center rounded-xl border bg-background/75 ',
                        'border-amber-500/15 text-amber-600 dark:text-amber-300'
                      )}
                    >
                      <AlertTriangle className="size-4" />
                    </div>
                    <div className="mt-4 max-w-4xl whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
                      {typeof previewContent === 'string' && previewContent.includes('AIOMetadata section') ? (
                        <>
                          {previewContent.split('AIOMetadata section')[0]}
                          <button
                            type="button"
                            onClick={() => handleExportModeChange('aiometadata')}
                            className="text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:text-primary/80 hover:decoration-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-sm font-semibold"
                          >
                            AIOMetadata section
                          </button>
                          {previewContent.split('AIOMetadata section')[1]}
                        </>
                      ) : (
                        previewContent
                      )}
                    </div>
                  </div>
                ) : (
                  <Textarea
                    data-testid="export-preview-textarea"
                    readOnly
                    value={previewContent}
                    className="h-[320px] max-sm:h-[20vh] w-full resize-none overflow-y-auto border-none bg-transparent p-5 max-sm:p-3 font-mono text-base max-sm:text-[10px] sm:text-xs leading-relaxed focus-visible:ring-0 custom-scrollbar"
                  />
                )}
                </div>
              </div>
            )}
            </div>

            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
              {exportStage === 'fusion-needs-invalid-catalog-confirmation' ? (
                <>
                  <Button
                    variant="secondary"
                    className={cn(editorActionButtonClass, editorFooterSecondaryButtonClass, "max-sm:rounded-[1rem] px-6 sm:w-44")}
                    onClick={() => {
                      if (fusionInvalidCatalogState.fingerprint) {
                        setConfirmedFusionInvalidCatalogDecision({
                          fingerprint: fusionInvalidCatalogState.fingerprint,
                          mode: 'skip',
                        });
                        setCopiedAction(null);
                      }
                    }}
                  >
                    Skip Invalid
                  </Button>
                  {fusionInvalidCatalogState.emptiedItems > 0 ? (
                    <Button
                      className={cn(editorActionButtonClass, editorFooterPrimaryButtonClass, "max-sm:rounded-[1rem] px-6 sm:w-52")}
                      onClick={() => {
                        if (fusionInvalidCatalogState.fingerprint) {
                          setConfirmedFusionInvalidCatalogDecision({
                            fingerprint: fusionInvalidCatalogState.fingerprint,
                            mode: 'empty-items',
                          });
                          setCopiedAction(null);
                        }
                      }}
                    >
                      Export Empty Items
                    </Button>
                  ) : null}
                </>
              ) : exportStage === 'fusion-needs-aiom-sync' ? (
                <Button
                  className={cn(editorActionButtonClass, editorFooterPrimaryButtonClass, "max-sm:rounded-[1rem] px-6 sm:w-52")}
                  onClick={handleOpenSyncManifestFromPreview}
                >
                  <Globe className="size-3.5 mr-1.5" />
                  Sync AIOMetadata
                </Button>
              ) : exportStage === 'omni-needs-aiom-bridge' ? (
                <>
                  <Button
                    className={cn(editorActionButtonClass, editorFooterPrimaryButtonClass, "max-sm:rounded-[1rem] px-6 sm:w-52")}
                    onClick={() => { void handleCopyMissingCatalogs(); }}
                  >
                    {copiedAction === 'missing-catalogs' ? <Check className="size-3.5 mr-1.5" /> : <Copy className="size-3.5 mr-1.5" />}
                    {copiedAction === 'missing-catalogs'
                      ? 'Copied'
                      : isManifestSynced
                        ? 'Copy Missing Catalogs'
                        : 'Copy Trakt Catalogs'}
                  </Button>
                  <Button
                    variant={hasCopiedRequiredTraktCatalogs && !!nativeTraktBridgeState.fingerprint ? 'default' : 'secondary'}
                    className={cn(editorActionButtonClass, editorFooterSecondaryButtonClass, "max-sm:rounded-[1rem] px-6 sm:w-36", hasCopiedRequiredTraktCatalogs && !!nativeTraktBridgeState.fingerprint && editorFooterPrimaryButtonClass)}
                    onClick={() => {
                      if (hasCopiedRequiredTraktCatalogs && nativeTraktBridgeState.fingerprint) {
                        setConfirmedBridgeFingerprint(nativeTraktBridgeState.fingerprint);
                        setCopiedAction(null);
                      } else {
                        setShowPreview(false);
                      }
                    }}
                  >
                    {hasCopiedRequiredTraktCatalogs && !!nativeTraktBridgeState.fingerprint ? 'Continue' : 'Skip'}
                  </Button>
                </>
              ) : exportMode === 'aiometadata' ? (
                <>
                  <Button
                    variant="secondary"
                    className={cn(editorActionButtonClass, editorFooterSecondaryButtonClass, "max-sm:rounded-[1rem] px-6 sm:w-44")}
                    onClick={handleDownload}
                  >
                    <Download className="size-3.5 mr-1.5" />
                    Download JSON
                  </Button>
                  <Button
                    className={cn(editorActionButtonClass, editorFooterPrimaryButtonClass, "max-sm:rounded-[1rem] px-6 sm:w-52")}
                    onClick={() => { void handleCopy(); }}
                    disabled={previewContent.startsWith('Error:')}
                  >
                    {copiedAction === 'preview' ? <Check className="size-3.5 mr-1.5" /> : <Copy className="size-3.5 mr-1.5" />}
                    {copiedAction === 'preview' ? 'Copied' : 'Copy Catalogs'}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    className={cn(editorActionButtonClass, editorFooterSecondaryButtonClass, "max-sm:rounded-[1rem] px-6 sm:w-44")}
                    onClick={handleDownload}
                  >
                    <Download className="size-3.5 mr-1.5" />
                    Download JSON
                  </Button>
                  <Button
                    className={cn(editorActionButtonClass, editorFooterPrimaryButtonClass, "max-sm:rounded-[1rem] px-6 sm:w-44")}
                    onClick={() => { void handleCopy(); }}
                    disabled={previewContent.startsWith('Error:')}
                  >
                    {copiedAction === 'preview' ? <Check className="size-3.5 mr-1.5" /> : <Copy className="size-3.5 mr-1.5" />}
                    {copiedAction === 'preview' ? 'Copied' : 'Copy JSON'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isUmeSortingDialogOpen} onOpenChange={setIsUmeSortingDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden rounded-3xl border border-border/40 bg-background/95 p-0 backdrop-blur-2xl">
          <div className="max-h-[85vh] overflow-y-auto px-8 pb-8 pt-10 max-sm:px-5 max-sm:pb-5 max-sm:pt-6 custom-scrollbar">
            <div className="mx-auto w-full max-w-[860px]">
              <DialogHeader className="space-y-6 items-start text-left">
                <div className="flex size-14 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary shadow-sm shadow-primary/5 max-sm:size-12">
                  <WandSparkles className="size-6 max-sm:size-5" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black tracking-tight max-sm:text-xl">
                    UME Sorting
                  </DialogTitle>
                </div>
              </DialogHeader>

              <div className="mt-6 space-y-4 px-1 sm:px-2">
                {UME_SORTING_EXPLANATION_SECTIONS.map((section) => (
                  <div
                    key={section.groups.join('|')}
                    className="rounded-3xl border border-zinc-200/70 bg-white/55 px-5 py-5 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.03] sm:px-6"
                  >
                    <div className="grid gap-4 md:grid-cols-[minmax(0,_1fr)_minmax(14rem,_18rem)] md:items-start md:gap-6">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-foreground/48">
                          Applies To
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {section.groups.map((group) => (
                            <span
                              key={group}
                              className="rounded-full border border-zinc-200/85 bg-zinc-50/95 px-3 py-1.5 text-sm font-semibold text-foreground/84 shadow-sm shadow-black/[0.035] ring-1 ring-black/[0.02] dark:border-white/12 dark:bg-white/[0.07] dark:ring-white/[0.03] dark:shadow-none"
                            >
                              {group}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-foreground/48 md:text-right">
                          Sorting
                        </p>
                        <div className="mt-3 space-y-1 md:text-right">
                          <p className="text-base font-semibold leading-relaxed text-foreground/86">
                            {section.summary}
                          </p>
                          {section.detail && (
                            <p className="text-sm font-medium leading-relaxed text-muted-foreground/78">
                              {section.detail}
                            </p>
                          )}
                          {section.refresh && (
                            <p className="text-sm font-medium leading-relaxed text-muted-foreground/72">
                              {section.refresh}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AIOMetadataExportSettingsDialog
        key={
          aiometadataSettingsTarget
            ? `${isAiometadataSettingsDialogOpen ? 'open' : 'closed'}:${aiometadataSettingsTarget.kind}:${aiometadataSettingsTarget.kind === 'widget'
              ? aiometadataSettingsTarget.widgetId
              : aiometadataSettingsTarget.kind === 'item'
                ? aiometadataSettingsTarget.itemKey
                : aiometadataSettingsTarget.catalogKey}`
            : 'aiometadata-settings-dialog'
        }
        open={isAiometadataSettingsDialogOpen}
        onOpenChange={setIsAiometadataSettingsDialogOpen}
        target={aiometadataSettingsTarget}
        inventory={aiometadataInventory}
        overrides={sanitizedAiometadataExportOverrides}
        resolvedValues={aiometadataDialogResolvedValues}
        onSave={setAiometadataExportOverrides}
      />
      <ImportMergeDialog
        open={showImportMergeDialog}
        onOpenChange={setShowImportMergeDialog}
      />

      <Dialog open={showTrash} onOpenChange={setShowTrash}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden border-border/40  backdrop-blur-xl bg-background/95 dark:border-white/10 dark:bg-zinc-950/95">
          <DialogTitle className="sr-only">Trash</DialogTitle>
          <div className="p-8 pt-10 max-sm:p-5 max-sm:pt-6">
            <DialogHeader className="space-y-6 items-start text-left">
              <div className="size-14 rounded-xl border border-destructive/10 bg-destructive/10 text-destructive  flex items-center justify-center transition-all animate-in zoom-in-75 duration-300 dark:border-destructive/15 dark:bg-destructive/15 max-sm:size-12">
                <Trash2 className="size-7 max-sm:size-6" />
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-2xl font-black tracking-tight max-sm:text-xl">
                  Trash
                </DialogTitle>
                <DialogDescription className="text-muted-foreground/60 text-xs font-medium leading-relaxed max-sm:text-[11px]">
                  Deleted widgets and collection items stay here in local storage until you restore them or empty the trash.
                </DialogDescription>
              </div>
            </DialogHeader>
          </div>

          <div className="px-8 pb-8 max-sm:px-5 max-sm:pb-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
                Deleted ({trashCount})
              </h3>
              {hasTrash && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest text-destructive hover:bg-destructive/10 hover:text-destructive transition-all active:scale-95 dark:hover:bg-destructive/12"
                  onClick={emptyTrash}
                >
                  <Trash2 className="size-3 mr-1.5 opacity-70" />
                  Empty trash
                </Button>
              )}
            </div>

            {!hasTrash ? (
              <div className="rounded-3xl border border-dashed border-border/40 bg-muted/5 py-16 text-center dark:border-white/10 dark:bg-zinc-900/55">
                <div className="flex flex-col items-center gap-4">
                  <div className="rounded-2xl bg-muted/10 p-4 dark:bg-white/[0.04]">
                    <Trash2 className="size-8 text-muted-foreground/20 dark:text-zinc-500/40" />
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground/40 uppercase tracking-widest dark:text-zinc-500/70">
                    Trash is empty
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex max-h-[440px] flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar">
                {trashEntries.map((entry) => (
                  <div
                    key={entry.key}
                    className="group flex items-center justify-between gap-4 rounded-xl border border-border/40 bg-muted/5 px-6 py-5 hover:bg-muted/10 hover:border-border/60 transition-all duration-300 backdrop-blur-sm dark:border-white/10 dark:bg-zinc-900/50 dark:hover:bg-zinc-900/75 dark:hover:border-white/15"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.15em]  dark:shadow-none",
                          entry.typeClassName
                        )}>
                          {entry.typeLabel}
                        </span>
                        {entry.subtitle && (
                          <>
                            <div className="size-1 rounded-full bg-border" />
                            <span className="truncate text-[9px] font-bold text-muted-foreground/60 dark:text-zinc-400/75">
                              {entry.subtitle}
                            </span>
                          </>
                        )}
                      </div>
                      <p className="truncate text-base font-bold text-foreground tracking-tight group-hover:text-primary transition-colors dark:text-zinc-100 dark:group-hover:text-primary/90">
                        {entry.title}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn(
                        "rounded-xl shrink-0 h-9 px-5 border-border/60 bg-background/50 text-[11px] font-black uppercase tracking-widest transition-all  dark:border-white/10 dark:bg-zinc-950/75 dark:text-zinc-100",
                        entry.canRestore
                          ? "hover:bg-primary hover:text-primary-foreground hover:border-primary active:scale-95 dark:hover:bg-primary dark:hover:text-primary-foreground dark:hover:border-primary"
                          : "text-muted-foreground/40 dark:text-zinc-500/60"
                      )}
                      onClick={entry.onRestore}
                      disabled={!entry.canRestore}
                    >
                      <RotateCcw className="size-3.5 mr-2" />
                      {entry.restoreLabel}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        isOpen={!!manifestActionError}
        onOpenChange={(open) => !open && setManifestActionError(null)}
        title="Manifest Refresh Failed"
        description={manifestActionError || ''}
        variant="danger"
        confirmText="Retry"
        onConfirm={() => {
          setManifestActionError(null);
          void handleRefreshManifest();
        }}
      />
      <ConfirmationDialog
        isOpen={!!exportActionError}
        onOpenChange={(open) => !open && setExportActionError(null)}
        title="Export Action Failed"
        description={exportActionError || ''}
        variant="danger"
        confirmText="Close"
        cancelText=""
        onConfirm={() => {
          setExportActionError(null);
        }}
      />
    </div>
  );
}

export const WidgetSelectionGrid = memo(WidgetSelectionGridComponent);
