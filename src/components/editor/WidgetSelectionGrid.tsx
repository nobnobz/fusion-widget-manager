"use client";

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useConfig } from '@/context/ConfigContext';
import { SortableWidget } from './SortableWidget';
import { Button } from '@/components/ui/button';
import { Plus, Download, Check, Copy, Search, FileJson2, Trash2, RotateCcw, Globe, AlertTriangle, Pencil, Info, ChevronRight } from 'lucide-react';
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
  buildAiometadataSelectionExport,
  collectAiometadataExportInventory,
  type ExportableCatalogDefinition,
} from '@/lib/aiometadata-export-inventory';
import { buildAiometadataMdblistCatalogsOnlyExport, hasUsedMdblistCatalogs } from '@/lib/mdblist-catalog-export';
import {
  buildAiometadataCatalogsOnlyExport,
  getNativeTraktBridgeFingerprint,
  hasNativeTraktSources,
} from '@/lib/native-trakt-bridge';
import {
  collectUsedAiometadataCatalogKeys,
  type FusionInvalidCatalogExportMode,
  MANIFEST_PLACEHOLDER,
  processConfigWithManifest,
  sanitizeFusionConfigForExport,
} from '@/lib/config-utils';
import type { FusionWidgetsConfig } from '@/lib/types/widget';
import { isAIOMetadataDataSource } from '@/lib/widget-domain';
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
  | 'fusion-needs-appletv-catalog-warning'
  | 'fusion-needs-appletv-device-check'
  | 'fusion-needs-invalid-catalog-confirmation'
  | 'fusion-needs-aiom-sync'
  | 'fusion-preview'
  | 'omni-needs-aiom-bridge'
  | 'omni-ready';

const FUSION_SYNC_REQUIRED_MESSAGE =
  'Sync your AIOMetadata manifest before Fusion export so the AIOMetadata URL can be embedded in your Fusion setup.';
const APPLE_TV_FUSION_CATALOG_LIMIT = 200;
const APPLE_TV_FIXED_CATALOG_COUNT = 34;
const APPLE_TV_RECOMMENDED_CUSTOM_CATALOG_LIMIT = APPLE_TV_FUSION_CATALOG_LIMIT - APPLE_TV_FIXED_CATALOG_COUNT;

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
  const [copiedTraktBridgeFingerprint, setCopiedTraktBridgeFingerprint] = useState<string | null>(null);
  const [confirmedBridgeFingerprint, setConfirmedBridgeFingerprint] = useState<string | null>(null);
  const [confirmedFusionInvalidCatalogDecision, setConfirmedFusionInvalidCatalogDecision] = useState<{
    fingerprint: string;
    mode: FusionInvalidCatalogExportMode;
  } | null>(null);
  const [appleTvDeviceDecision, setAppleTvDeviceDecision] = useState<{ fingerprint: string; usesAppleTv: boolean } | null>(null);
  const [confirmedAppleTvCatalogWarningFingerprint, setConfirmedAppleTvCatalogWarningFingerprint] = useState<string | null>(null);
  const [aiometadataSearchQuery, setAiometadataSearchQuery] = useState('');
  const [selectedAiometadataCatalogKeys, setSelectedAiometadataCatalogKeys] = useState<string[]>([]);
  const [hasCustomizedAiometadataSelection, setHasCustomizedAiometadataSelection] = useState(false);
  const [expandedAiometadataWidgetKeys, setExpandedAiometadataWidgetKeys] = useState<string[]>([]);
  const [expandedAiometadataItemKeys, setExpandedAiometadataItemKeys] = useState<string[]>([]);
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    if (expandedWidgetId && !widgets.some((widget) => widget.id === expandedWidgetId)) {
      onExpandedWidgetChange(null);
    }
  }, [expandedWidgetId, onExpandedWidgetChange, widgets]);

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

  const usedAiometadataCatalogKeys = useMemo(
    () => (basePreviewState.config ? collectUsedAiometadataCatalogKeys(basePreviewState.config) : []),
    [basePreviewState.config]
  );

  const fusionAppleTvCatalogRiskFingerprint = useMemo(() => {
    if (
      !showPreview
      || !basePreviewState.config
      || !isManifestSynced
      || manifestCatalogs.length <= APPLE_TV_FUSION_CATALOG_LIMIT
      || usedAiometadataCatalogKeys.length === 0
    ) {
      return null;
    }

    return JSON.stringify({
      manifestUrl,
      manifestCatalogCount: manifestCatalogs.length,
      usedAiometadataCatalogCount: usedAiometadataCatalogKeys.length,
    });
  }, [
    basePreviewState.config,
    isManifestSynced,
    manifestCatalogs.length,
    manifestUrl,
    showPreview,
    usedAiometadataCatalogKeys.length,
  ]);

  const appleTvCatalogDecisionForCurrentSetup =
    appleTvDeviceDecision?.fingerprint === fusionAppleTvCatalogRiskFingerprint
      ? appleTvDeviceDecision.usesAppleTv
      : null;
  const requiresFusionAppleTvDeviceCheck =
    !!fusionAppleTvCatalogRiskFingerprint && appleTvCatalogDecisionForCurrentSetup === null;
  const requiresFusionAppleTvCatalogWarning =
    !!fusionAppleTvCatalogRiskFingerprint
    && appleTvCatalogDecisionForCurrentSetup === true
    && confirmedAppleTvCatalogWarningFingerprint !== fusionAppleTvCatalogRiskFingerprint;

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
      return null as ReturnType<typeof buildAiometadataSelectionExport> | null;
    }

    if (isManifestSynced) {
      return buildAiometadataSelectionExport(
        aiometadataInventory,
        aiometadataSelectableCatalogKeys
      );
    }

    return nativeTraktBridgeState.catalogsExport;
  }, [
    aiometadataInventory,
    aiometadataSelectableCatalogKeys,
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
    () => buildAiometadataSelectionExport(aiometadataInventory, selectedAiometadataCatalogKeys),
    [aiometadataInventory, selectedAiometadataCatalogKeys]
  );

  const aiometadataFullSetupExport = useMemo(
    () => buildAiometadataSelectionExport(aiometadataInventory, aiometadataInventory.catalogs.map((catalog) => catalog.key)),
    [aiometadataInventory]
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
              return left.itemIndex - right.itemIndex;
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

  const selectableAiometadataCatalogCount = useMemo(
    () => aiometadataInventory.catalogs.filter((catalog) => aiometadataSelectableCatalogKeys.has(catalog.key)).length,
    [aiometadataInventory.catalogs, aiometadataSelectableCatalogKeys]
  );

  const existingAiometadataCatalogCount = useMemo(
    () => aiometadataInventory.catalogs.filter((catalog) => catalog.isAlreadyInManifest).length,
    [aiometadataInventory.catalogs]
  );

  const selectableAiometadataCatalogKeysBySource = useMemo(() => {
    const grouped = {
      trakt: [] as string[],
      mdblist: [] as string[],
      streaming: [] as string[],
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
      if (requiresFusionAppleTvDeviceCheck) {
        return 'fusion-needs-appletv-device-check';
      }
      if (requiresFusionAppleTvCatalogWarning) {
        return 'fusion-needs-appletv-catalog-warning';
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
    requiresFusionAppleTvCatalogWarning,
    requiresFusionAppleTvDeviceCheck,
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

    if (exportMode === 'fusion' && requiresFusionAppleTvDeviceCheck) {
      return [
        'Do you plan to use this Fusion setup on an Apple TV?',
      ].join('\n');
    }

    if (exportMode === 'fusion' && requiresFusionAppleTvCatalogWarning) {
      if (usedAiometadataCatalogKeys.length <= APPLE_TV_RECOMMENDED_CUSTOM_CATALOG_LIMIT) {
        return [
          `Your synced AIOMetadata setup currently contains a large number of catalogs, but this Fusion setup uses only ${usedAiometadataCatalogKeys.length} of them.`,
          '',
          `Fusion has an Apple TV bug that can cause the app to crash when AIOMetadata setups are too large. It is recommended to stay below ${APPLE_TV_FUSION_CATALOG_LIMIT} total catalogs.`,
          '',
          'This Fusion setup is already within that limit, but your AIOMetadata setup still contains unused catalogs. It is recommended to delete your existing AIOMetadata catalogs and use the AIOMetadata section to export only the used catalogs into AIOMetadata.',
          '',
          'Before installing this setup on Apple TV, delete the Fusion app and install it again.',
        ].join('\n');
      }

      const recommendedCatalogRemovals =
        usedAiometadataCatalogKeys.length - APPLE_TV_RECOMMENDED_CUSTOM_CATALOG_LIMIT;
      return [
        `Your synced AIOMetadata setup currently contains a large number of catalogs. Fusion has an Apple TV bug that can cause the app to crash when AIOMetadata setups are too large. It is recommended to stay below ${APPLE_TV_FUSION_CATALOG_LIMIT} total catalogs.`,
        '',
        `This Fusion setup is over that recommendation, and it is recommended to delete at least ${recommendedCatalogRemovals} catalogs in the manager to reduce the risk of the Apple TV app crashing.`,
        '',
        'Then delete all existing catalogs in AIOMetadata and use the AIOMetadata tab in the top right to copy the catalogs from this Fusion setup to your clipboard. To import the catalogs, go to AIOMetadata, open Catalogs > Import Setup, and paste the copied catalogs.',
        '',
        'Before installing this setup on Apple TV, delete the Fusion app and install it again.',
      ].join('\n');
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
    requiresFusionAppleTvCatalogWarning,
    requiresFusionAppleTvDeviceCheck,
    requiresFusionAiometadataSync,
    requiresTraktBridgeImport,
    requiresFusionInvalidCatalogConfirmation,
    nativeTraktBridgeState.hasNativeTrakt,
    showPreview,
    usedAiometadataCatalogKeys.length,
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
    if (!fusionAppleTvCatalogRiskFingerprint) {
      if (appleTvDeviceDecision !== null) {
        setAppleTvDeviceDecision(null);
      }
      if (confirmedAppleTvCatalogWarningFingerprint !== null) {
        setConfirmedAppleTvCatalogWarningFingerprint(null);
      }
      return;
    }

    if (
      appleTvDeviceDecision
      && appleTvDeviceDecision.fingerprint !== fusionAppleTvCatalogRiskFingerprint
    ) {
      setAppleTvDeviceDecision(null);
    }

    if (
      confirmedAppleTvCatalogWarningFingerprint
      && confirmedAppleTvCatalogWarningFingerprint !== fusionAppleTvCatalogRiskFingerprint
    ) {
      setConfirmedAppleTvCatalogWarningFingerprint(null);
    }
  }, [
    appleTvDeviceDecision,
    confirmedAppleTvCatalogWarningFingerprint,
    fusionAppleTvCatalogRiskFingerprint,
  ]);

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

  const copyText = (text: string, action: 'preview' | 'missing-catalogs' | 'full-aiometadata') => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(action);
  };

  const downloadText = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    copyText(previewContent, 'preview');
  };

  const handleCopyMissingCatalogs = () => {
    if (!omniMissingCatalogsExport || !nativeTraktBridgeState.fingerprint) {
      return;
    }

    copyText(JSON.stringify(omniMissingCatalogsExport, null, 2), 'missing-catalogs');
    setCopiedTraktBridgeFingerprint(nativeTraktBridgeState.fingerprint);
  };

  const handleCopyFullAiometadataCatalogSetup = () => {
    copyText(JSON.stringify(aiometadataFullSetupExport, null, 2), 'full-aiometadata');
  };

  const handleDownloadFullAiometadataCatalogSetup = () => {
    downloadText(JSON.stringify(aiometadataFullSetupExport, null, 2), 'aiometadata-full-catalog-setup.json');
  };

  const handleDownload = () => {
    downloadText(
      previewContent,
      exportMode === 'fusion'
        ? 'fusion-widgets.json'
        : exportMode === 'aiometadata'
          ? 'aiometadata-selected-catalogs.json'
          : 'omni-snapshot.json'
    );
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
              "mb-4 rounded-[1.75rem] px-5 shadow-sm max-sm:mb-3 max-sm:rounded-[1.3rem] max-sm:px-4",
              isManifestSynced
                ? "border border-emerald-200/75 bg-emerald-50/65 py-3.5 shadow-[0_12px_32px_-28px_rgba(15,23,42,0.16)] dark:border-emerald-500/22 dark:bg-emerald-500/[0.08]"
                : "border border-amber-200/65 bg-amber-50/50 py-4 shadow-[0_12px_32px_-28px_rgba(15,23,42,0.12)] dark:border-amber-500/18 dark:bg-amber-500/[0.06]"
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
                    {isManifestSynced ? 'AIOMetadata synced' : manifestAutoSyncIssue ? 'AIOMetadata sync issue' : 'AIOMetadata not synced'}
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
                        ? 'Sync an AIOMetadata manifest before Fusion export to replace placeholders and add new catalogs.'
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
                      className="h-9 shrink-0 rounded-2xl border border-emerald-300/75 bg-white/80 px-4 text-[10px] font-black uppercase tracking-wider text-stone-900/80 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.2)] transition-all hover:bg-emerald-50/90 hover:border-emerald-400/60 hover:text-stone-900/88 max-sm:w-full dark:border-emerald-500/24 dark:bg-zinc-950/60 dark:text-emerald-200/90 dark:hover:bg-emerald-500/12 dark:hover:border-emerald-500/34"
                    >
                      <RotateCcw className={cn("size-4 mr-2 text-emerald-700/90 dark:text-emerald-300/92", isRefreshingManifest && "animate-spin")} />
                      Refresh
                    </Button>
                    <Button
                      onClick={onSyncManifest}
                      variant="secondary"
                      className="h-9 shrink-0 rounded-2xl border border-border/45 bg-white/65 px-4 text-[10px] font-black uppercase tracking-wider text-foreground/78 shadow-sm transition-all hover:bg-muted/40 hover:border-border/65 max-sm:w-full dark:border-white/10 dark:bg-zinc-950/60 dark:text-zinc-300/80 dark:hover:bg-zinc-900/85"
                    >
                      <Pencil className="size-4 mr-2" />
                      Edit
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={onSyncManifest}
                    variant="secondary"
                    className="h-10 shrink-0 rounded-2xl border border-amber-300/70 bg-white/80 px-4 text-[10px] font-black uppercase tracking-wider text-stone-900/80 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.2)] transition-all hover:bg-amber-50/90 hover:border-amber-400/60 hover:text-stone-900/88 max-sm:w-full max-sm:col-span-2 dark:border-amber-500/24 dark:bg-zinc-950/60 dark:text-amber-200/90 dark:hover:bg-amber-500/12 dark:hover:border-amber-500/34"
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
                className="h-10 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 text-[10px] font-black uppercase tracking-wider text-destructive shadow-sm transition-all hover:bg-destructive/15 hover:shadow-destructive/10 max-sm:h-10 max-sm:w-full max-sm:justify-center dark:border-destructive/25 dark:bg-destructive/12 dark:hover:bg-destructive/16"
                title="Trash"
              >
                <Trash2 className="mr-2 size-4 opacity-90" />
                Trash ({trashCount})
              </Button>
            </div>
          )}

          <div className="p-2 max-sm:p-3 rounded-[2.5rem] max-sm:rounded-[1.6rem] bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-border/10 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.05)] max-sm:shadow-[0_10px_30px_-20px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 max-sm:gap-3">
              {/* Left Group: Search */}
              <div className="relative flex-1 group min-w-0 rounded-[2rem] max-sm:rounded-[1.25rem]">
                <Search className="pointer-events-none absolute left-5 max-sm:left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
                <Input
                  data-testid="widget-search"
                  placeholder="Search for widgets..."
                  className="w-full h-12 max-sm:h-11 pl-12 max-sm:pl-10 pr-10 rounded-[2rem] max-sm:rounded-[1.25rem] border-none bg-transparent shadow-none focus-visible:ring-0 text-base sm:text-sm font-semibold tracking-tight"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-muted/50 text-muted-foreground/20 hover:text-muted-foreground transition-all"
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
                  className="h-11 max-sm:h-12 px-6 max-sm:px-4 rounded-2xl max-sm:rounded-xl font-black uppercase tracking-wider text-[10px] shadow-xl shadow-primary/20 bg-primary hover:bg-primary/95 text-primary-foreground transition-all active:scale-95 flex-1 md:flex-none order-1"
                >
                  <Plus className="size-4 mr-2" />
                  <span className="sm:hidden">New</span>
                  <span className="hidden sm:inline">New Widget</span>
                </Button>

                <Button
                  data-testid="merge-import-button"
                  onClick={() => setShowImportMergeDialog(true)}
                  variant="secondary"
                  className="h-11 max-sm:h-12 px-6 max-sm:px-4 rounded-2xl max-sm:rounded-xl font-black uppercase tracking-wider text-[10px] border border-border/40 bg-muted/20 text-muted-foreground hover:bg-muted/30 transition-all shadow-sm order-2 flex-1 md:flex-none dark:border-white/10 dark:bg-zinc-950/65 dark:text-zinc-300/80 dark:hover:bg-zinc-900/85"
                  title="Import JSON"
                >
                  <FileJson2 className="size-4 mr-2 opacity-60" />
                  Import
                </Button>

                <Button
                  data-testid="export-button"
                  onClick={() => {
                    setShowPreview(true);
                    onDownload?.();
                  }}
                  variant="secondary"
                  className="h-11 max-sm:h-12 px-6 max-sm:px-4 rounded-2xl max-sm:rounded-xl font-black uppercase tracking-wider text-[10px] border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 transition-all shadow-sm order-3 flex-1 md:flex-none dark:border-primary/25 dark:bg-primary/12 dark:hover:bg-primary/18"
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
                    onExpandedWidgetChange(expandedWidgetId === id ? null : id)
                  }
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
              <Button onClick={handleCreateWidget} className="rounded-xl max-sm:w-full max-sm:h-11">
                <Plus className="size-4 mr-2" />
                New widget
              </Button>
              <Button onClick={() => setShowTrash(true)} variant="outline" className="rounded-xl max-sm:w-full max-sm:h-11">
                <Trash2 className="size-4 mr-2" />
                Open trash
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
        onCreated={(id) => onExpandedWidgetChange(id)}
      />

      <Dialog
        open={showPreview}
        onOpenChange={(open) => {
          setShowPreview(open);
          setCopiedAction(null);
        }}
      >
        <DialogContent className="flex sm:max-h-[92vh] max-w-2xl flex-col overflow-hidden rounded-[2.5rem] border border-border/40 bg-background/95 p-0 shadow-2xl backdrop-blur-2xl">
          <div className="flex min-h-0 flex-1 flex-col p-8 pt-10 max-sm:p-5 max-sm:pt-6">
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
            <DialogHeader className="space-y-4 items-start text-left">
              <div className="size-14 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary shadow-sm max-sm:size-12 max-sm:rounded-[1rem]">
                <FileJson2 className="size-7 max-sm:size-6" />
              </div>
              <DialogTitle className="text-2xl font-black tracking-tight max-sm:text-xl">Export JSON</DialogTitle>
            </DialogHeader>

            <div className="mt-6 flex justify-end max-sm:mt-5 max-sm:justify-start">
              <div className="flex flex-wrap rounded-2xl border border-border/10 bg-muted/20 p-1">
                <button
                  onClick={() => handleExportModeChange('fusion')}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                    exportMode === 'fusion' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground/45 hover:text-muted-foreground/80'
                  )}
                >
                  Fusion
                </button>
                <button
                  onClick={() => handleExportModeChange('omni')}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                    exportMode === 'omni' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground/45 hover:text-muted-foreground/80'
                  )}
                >
                  Omni
                </button>
                <button
                  onClick={() => handleExportModeChange('aiometadata')}
                  disabled={aiometadataInventory.catalogs.length === 0}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                    exportMode === 'aiometadata'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground/45 hover:text-muted-foreground/80',
                    aiometadataInventory.catalogs.length === 0 && 'cursor-not-allowed opacity-45 hover:text-muted-foreground/45'
                  )}
                >
                  AIOMETADATA
                </button>
              </div>
            </div>

            {exportMode === 'aiometadata' && (
              <div className="mt-5 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-background/75 text-primary">
                    <Info className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/85">
                      Custom AIOMetadata export
                    </p>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-foreground/72">
                      Select catalogs to build a catalogs-only AIOMetadata export. Copy the exported catalogs into AIOMetadata under Catalogs &gt; Import Setup, then save your changes.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {exportMode === 'aiometadata' && isManifestSynced && existingAiometadataCatalogCount > 0 && (
              <div className="mt-4 rounded-2xl border border-border/12 bg-background/45 px-4 py-3 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.16)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-foreground/58">
                      Export Full Catalog Setup
                    </p>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground/72">
                      Export every linked catalog, including the {existingAiometadataCatalogCount} already in the synced manifest.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:flex-col">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-9 rounded-xl border-border/20 bg-background/70 px-4 text-[10px] font-black uppercase tracking-widest text-foreground/78 sm:w-56"
                      onClick={handleDownloadFullAiometadataCatalogSetup}
                    >
                      <Download className="mr-1.5 size-3.5" />
                      Download All Catalogs
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-9 rounded-xl border-border/20 bg-background/70 px-4 text-[10px] font-black uppercase tracking-widest text-foreground/78 sm:w-56"
                      onClick={handleCopyFullAiometadataCatalogSetup}
                    >
                      {copiedAction === 'full-aiometadata' ? <Check className="mr-1.5 size-3.5" /> : <Copy className="mr-1.5 size-3.5" />}
                      {copiedAction === 'full-aiometadata' ? 'Copied' : 'Copy All Catalogs'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {exportMode === 'aiometadata' ? (
              <div className="mt-5 flex min-h-0 flex-col gap-4">
                <div className="min-h-0 rounded-2xl border border-border/10 bg-muted/20 p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-foreground/55">
                          Select Sources
                        </p>
                        <p className="mt-1 text-xs font-medium text-muted-foreground/75">
                          {selectedAiometadataCatalogCount} of {selectableAiometadataCatalogCount} new catalogs selected
                        </p>
                      </div>
                    </div>

                    <div className="relative">
                      <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/35" />
                      <Input
                        value={aiometadataSearchQuery}
                        onChange={(event) => setAiometadataSearchQuery(event.target.value)}
                        placeholder="Filter catalogs, widgets, or items..."
                        className="h-11 rounded-2xl border-border/30 bg-background/70 pl-11 text-base sm:text-sm font-medium"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest"
                        onClick={() => replaceAiometadataSelection(Array.from(aiometadataSelectableCatalogKeys))}
                        disabled={aiometadataSelectableCatalogKeys.size === 0}
                      >
                        All
                      </Button>
                      {selectableAiometadataCatalogKeysBySource.trakt.length > 0 && (
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-9 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest"
                          onClick={() => replaceAiometadataSelection(selectableAiometadataCatalogKeysBySource.trakt)}
                        >
                          Trakt
                        </Button>
                      )}
                      {selectableAiometadataCatalogKeysBySource.mdblist.length > 0 && (
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-9 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest"
                          onClick={() => replaceAiometadataSelection(selectableAiometadataCatalogKeysBySource.mdblist)}
                        >
                          MDBList
                        </Button>
                      )}
                      {selectableAiometadataCatalogKeysBySource.streaming.length > 0 && (
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-9 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest"
                          onClick={() => replaceAiometadataSelection(selectableAiometadataCatalogKeysBySource.streaming)}
                        >
                          Streaming Services
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest"
                        onClick={() => replaceAiometadataSelection([])}
                        disabled={selectedAiometadataCatalogCount === 0}
                      >
                        Clear
                      </Button>
                    </div>

                  </div>

                  <div className="mt-4 max-h-[320px] min-h-0 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
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
                              'scroll-mt-4 rounded-2xl border p-4 shadow-sm',
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
                                      {widget.widgetType === 'row.classic' ? 'Standalone row' : 'Collection'}
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
                                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
                                            )}>
                                              {catalog.source}
                                            </span>
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
                                    <div className="mt-3 space-y-3">
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
                                              'rounded-xl border p-3',
                                              itemIsSyncedOnly
                                                ? 'border-border/10 bg-muted/5 opacity-80'
                                                : 'border-border/15 bg-muted/10'
                                            )}
                                          >
                                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 flex-1 items-start gap-3">
                                <input
                                  type="checkbox"
                                  className="mt-1 size-4 rounded border-border/60"
                                  checked={itemAllSelected}
                                                  disabled={itemSelectableCatalogKeys.length === 0}
                                                  ref={(node) => {
                                                    if (node) {
                                                      node.indeterminate = itemPartiallySelected;
                                                    }
                                                  }}
                                                  onChange={(event) => toggleAiometadataCatalogGroup(itemSelectableCatalogKeys, event.target.checked)}
                                                />
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
                                                      Collection item
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
                                                  <div className="mt-3 space-y-2">
                                                    {item.catalogKeys.map((catalogKey) => {
                                                      const catalog = aiometadataCatalogMap.get(catalogKey) as ExportableCatalogDefinition | undefined;
                                                      if (!catalog) return null;
                                                      const checked = selectedAiometadataCatalogKeySet.has(catalogKey);
                                                      const disabled = isManifestSynced && catalog.isAlreadyInManifest;
                                                      return (
                                                        <label
                                                          key={catalogKey}
                                                          className={cn(
                                                            'flex items-center gap-3 rounded-xl border border-border/15 bg-background/65 px-3 py-2.5',
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
                                                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
                                                          )}>
                                                            {catalog.source}
                                                          </span>
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
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-foreground/55">
                        Export Preview
                      </p>
                      <p className="mt-1 text-xs font-medium text-muted-foreground/75">
                        {aiometadataPreviewExport.catalogs.length} catalogs in the current export
                      </p>
                    </div>
                    <span className="rounded-full bg-background/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/70">
                      AIOMETADATA
                    </span>
                  </div>
                  <div className="mt-4 relative group overflow-hidden rounded-2xl border border-border/10 bg-background/50 p-1">
                    <Textarea
                      data-testid="export-preview-textarea"
                      readOnly
                      value={previewContent}
                      className="h-[320px] w-full resize-none overflow-y-auto border-none bg-transparent p-5 font-mono text-base sm:text-xs leading-relaxed focus-visible:ring-0 custom-scrollbar"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <div className="relative group rounded-2xl border border-border/10 bg-muted/20 p-1 overflow-hidden">
                {exportStage === 'fusion-needs-invalid-catalog-confirmation'
                || exportStage === 'fusion-needs-appletv-catalog-warning'
                || exportStage === 'fusion-needs-appletv-device-check'
                || exportStage === 'omni-needs-aiom-bridge' ? (
                  <div className="min-h-[320px] p-5">
                    <div
                      className={cn(
                        'flex size-9 items-center justify-center rounded-xl border bg-background/75 shadow-[0_8px_24px_-18px_rgba(245,158,11,0.5)]',
                        exportStage === 'fusion-needs-appletv-device-check'
                          ? 'border-primary/15 text-primary shadow-[0_8px_24px_-18px_rgba(37,99,235,0.35)]'
                          : 'border-amber-500/15 text-amber-600 dark:text-amber-300'
                      )}
                    >
                      {exportStage === 'fusion-needs-appletv-device-check' ? (
                        <Info className="size-4" />
                      ) : (
                        <AlertTriangle className="size-4" />
                      )}
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
                    className="h-[320px] w-full resize-none overflow-y-auto border-none bg-transparent p-5 font-mono text-base sm:text-xs leading-relaxed focus-visible:ring-0 custom-scrollbar"
                  />
                )}
                </div>
              </div>
            )}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              {exportStage === 'fusion-needs-invalid-catalog-confirmation' ? (
                <>
                  <Button
                    variant="secondary"
                    className="h-11 rounded-xl max-sm:rounded-[1rem] px-6 text-[11px] font-bold uppercase tracking-wider transition-all sm:w-44"
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
                      className="h-11 rounded-xl max-sm:rounded-[1rem] px-6 text-[11px] font-bold uppercase tracking-wider shadow-lg shadow-primary/20 transition-all sm:w-52"
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
              ) : exportStage === 'fusion-needs-appletv-device-check' ? (
                <>
                  <Button
                    className="h-11 rounded-xl max-sm:rounded-[1rem] px-6 text-[11px] font-bold uppercase tracking-wider shadow-lg shadow-primary/20 transition-all sm:w-40"
                    onClick={() => {
                      if (fusionAppleTvCatalogRiskFingerprint) {
                        setAppleTvDeviceDecision({
                          fingerprint: fusionAppleTvCatalogRiskFingerprint,
                          usesAppleTv: false,
                        });
                        setCopiedAction(null);
                      }
                    }}
                  >
                    No
                  </Button>
                  <Button
                    className="h-11 rounded-xl max-sm:rounded-[1rem] px-6 text-[11px] font-bold uppercase tracking-wider shadow-lg shadow-primary/20 transition-all sm:w-40"
                    onClick={() => {
                      if (fusionAppleTvCatalogRiskFingerprint) {
                        setAppleTvDeviceDecision({
                          fingerprint: fusionAppleTvCatalogRiskFingerprint,
                          usesAppleTv: true,
                        });
                        setCopiedAction(null);
                      }
                    }}
                  >
                    Yes
                  </Button>
                </>
              ) : exportStage === 'fusion-needs-appletv-catalog-warning' ? (
                <Button
                  className="h-11 rounded-xl max-sm:rounded-[1rem] px-6 text-[11px] font-bold uppercase tracking-wider shadow-lg shadow-primary/20 transition-all sm:w-44"
                  onClick={() => {
                    if (fusionAppleTvCatalogRiskFingerprint) {
                      setConfirmedAppleTvCatalogWarningFingerprint(fusionAppleTvCatalogRiskFingerprint);
                      setCopiedAction(null);
                    }
                  }}
                >
                  Understood
                </Button>
              ) : exportStage === 'fusion-needs-aiom-sync' ? (
                <Button
                  className="h-11 rounded-xl max-sm:rounded-[1rem] px-6 text-[11px] font-bold uppercase tracking-wider shadow-lg shadow-primary/20 transition-all sm:w-52"
                  onClick={handleOpenSyncManifestFromPreview}
                >
                  <Globe className="size-3.5 mr-1.5" />
                  Sync AIOMetadata
                </Button>
              ) : exportStage === 'omni-needs-aiom-bridge' ? (
                <>
                  <Button
                    className="h-11 rounded-xl max-sm:rounded-[1rem] px-6 text-[11px] font-bold uppercase tracking-wider shadow-lg shadow-primary/20 transition-all sm:w-52"
                    onClick={handleCopyMissingCatalogs}
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
                    className="h-11 rounded-xl max-sm:rounded-[1rem] px-6 text-[11px] font-bold uppercase tracking-wider transition-all sm:w-36"
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
                    className="h-11 rounded-xl max-sm:rounded-[1rem] px-6 text-[11px] font-bold uppercase tracking-wider transition-all sm:w-44"
                    onClick={handleDownload}
                  >
                    <Download className="size-3.5 mr-1.5" />
                    Download JSON
                  </Button>
                  <Button
                    className="h-11 rounded-xl max-sm:rounded-[1rem] px-6 text-[11px] font-bold uppercase tracking-wider shadow-lg shadow-primary/20 transition-all sm:w-52"
                    onClick={handleCopy}
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
                    className="h-11 rounded-xl max-sm:rounded-[1rem] px-6 text-[11px] font-bold uppercase tracking-wider transition-all sm:w-44"
                    onClick={handleDownload}
                  >
                    <Download className="size-3.5 mr-1.5" />
                    Download JSON
                  </Button>
                  <Button
                    className="h-11 rounded-xl max-sm:rounded-[1rem] px-6 text-[11px] font-bold uppercase tracking-wider shadow-lg shadow-primary/20 transition-all sm:w-44"
                    onClick={handleCopy}
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
      <ImportMergeDialog
        open={showImportMergeDialog}
        onOpenChange={setShowImportMergeDialog}
      />

      <Dialog open={showTrash} onOpenChange={setShowTrash}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden border-border/40 shadow-2xl backdrop-blur-xl bg-background/95 dark:border-white/10 dark:bg-zinc-950/95">
          <DialogHeader className="p-8 pb-4 max-sm:p-5 max-sm:pt-6 max-sm:pb-3">
            <div className="flex flex-col gap-1">
              <div className="mb-2 flex size-14 items-center justify-center self-start rounded-2xl border border-destructive/10 bg-destructive/10 text-destructive shadow-sm transition-all animate-in zoom-in-75 duration-300 dark:border-destructive/15 dark:bg-destructive/15 max-sm:size-12 max-sm:rounded-[1rem]">
                <Trash2 className="size-7 max-sm:size-6" />
              </div>
              <DialogTitle className="text-2xl font-black tracking-tight max-sm:text-xl">
                Trash
              </DialogTitle>
              <DialogDescription className="text-[13px] font-medium leading-relaxed text-muted-foreground/72 max-w-md mt-1 max-sm:text-[12px]">
                Deleted widgets and collection items stay here in local storage until you restore them or empty the trash.
              </DialogDescription>
            </div>
          </DialogHeader>

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
                    className="group flex items-center justify-between gap-4 rounded-3xl border border-border/40 bg-muted/5 px-6 py-5 hover:bg-muted/10 hover:border-border/60 transition-all duration-300 backdrop-blur-sm dark:border-white/10 dark:bg-zinc-900/50 dark:hover:bg-zinc-900/75 dark:hover:border-white/15"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.15em] shadow-sm dark:shadow-none",
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
                        "rounded-2xl shrink-0 h-9 px-5 border-border/60 bg-background/50 text-[11px] font-black uppercase tracking-widest transition-all shadow-sm dark:border-white/10 dark:bg-zinc-950/75 dark:text-zinc-100",
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
    </div>
  );
}

export const WidgetSelectionGrid = memo(WidgetSelectionGridComponent);
