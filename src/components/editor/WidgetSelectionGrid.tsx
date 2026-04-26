"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import Image from 'next/image';
import { useConfig } from '@/context/ConfigContext';
import { SortableWidget } from './SortableWidget';
import { Button } from '@/components/ui/button';
import {
  Plus,
  Download,
  Check,
  Copy,
  Search,
  FileJson2,
  FileCode,
  Trash2,
  RotateCcw,
  Globe,
  AlertTriangle,
  Pencil,
  Info,
  Play,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  WandSparkles,
  XCircle,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { ImportMergeDialog } from './ImportMergeDialog';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { useMobile } from '@/hooks/use-mobile';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
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
  editorFormSurfaceClass,
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
  findCatalog,
  MANIFEST_PLACEHOLDER,
  convertEditorDataSourceToFusionDataSource,
  mapLayoutToImageAspect,
  processConfigWithManifest,
  sanitizeFusionConfigForExport,
} from '@/lib/config-utils';
import type { FusionWidgetsConfig, CollectionItem, CollectionRowWidget, WidgetDataSource } from '@/lib/types/widget';
import { isAIOMetadataDataSource } from '@/lib/widget-domain';
import { copyTextToClipboard, downloadTextFile } from '@/lib/browser-transfer';
import { getErrorMessage } from '@/lib/error-utils';
import FormatterPreviewImage from '@/../public/branding/aios-ume-formatter-preview.jpg';
import {
  fetchAnimatedCoverPacks,
  fetchAnimatedCoverWidgetBlueprints,
  type AnimatedCoverPack,
  type AnimatedCoverWidgetBlueprint,
} from '@/lib/animated-covers';
import {
  fetchRegexPatternPacks,
  type RegexPatternPack,
  type RegexPatternVisualFilter,
} from '@/lib/regex-patterns';
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
  onOpenFormatter?: () => void;
  onInitialSectionFocusHandled?: () => void;
  expandedWidgetId: string | null;
  onExpandedWidgetChange: (id: string | null) => void;
  initialSectionFocus?: {
    section: 'animated' | 'regex';
    packSlug: string;
    nonce: number;
  } | null;
}

interface PreparedAnimatedWidgetInstall {
  catalogPayload: FusionWidgetsConfig;
  jsonText: string;
  keptAiometadataSources: number;
  removedBecauseMissingCatalog: number;
  removedBecauseNoManifest: number;
  totalAiometadataSources: number;
  widgetCount: number;
  widgetTitles: string[];
}


const FUSION_SYNC_REQUIRED_MESSAGE =
  'Sync your AIOMetadata manifest before Fusion export so the AIOMetadata URL can be embedded in your Fusion setup.';

const REGEX_PREVIEW_PAGE_SIZE = 9;

const UME_SORTING_EXPLANATION_SECTIONS = [
  {
    groups: ['Streaming Services', 'Studios', 'Decades', 'Genres', 'Directors', 'Actors', 'IMDb Top Shows', 'Oscars 2026', 'Trending'],
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
  'text-[10px] font-black uppercase tracking-[0.18em] text-foreground/55';

const aiometadataSectionDescriptionClass =
  'mt-1.5 max-w-2xl text-[12px] font-medium leading-5 text-muted-foreground/70 sm:text-[13px]';

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

function normalizeFusionColor(value: string | undefined, fallback: string): string {
  if (!value || !value.trim()) {
    return fallback;
  }

  const trimmed = value.trim();
  if (/^#[\da-fA-F]{3}$/.test(trimmed) || /^#[\da-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^#[\da-fA-F]{8}$/.test(trimmed)) {
    // Fusion exports ARGB hex values; CSS expects RRGGBBAA for 8-digit hex.
    const hex = trimmed.slice(1);
    return `#${hex.slice(2)}${hex.slice(0, 2)}`;
  }

  return fallback;
}

function buildRegexTagVisualStyle(filter: RegexPatternVisualFilter): CSSProperties {
  const tagStyle = filter.tagStyle.toLowerCase();
  const isFilled = tagStyle.includes('filled');
  const hasBorder = tagStyle.includes('border');
  const isBorderOnly = hasBorder && !isFilled;
  const fallbackTextColor = isFilled ? '#FFFFFF' : '#D4D4D8';
  const fallbackSurfaceColor = isFilled ? '#1F2937' : 'transparent';

  return {
    backgroundColor: isBorderOnly ? 'transparent' : normalizeFusionColor(filter.tagColor, fallbackSurfaceColor),
    borderColor: hasBorder
      ? normalizeFusionColor(filter.borderColor || filter.textColor || filter.tagColor, '#D4D4D8')
      : 'transparent',
    borderStyle: 'solid',
    borderWidth: hasBorder ? (tagStyle.includes('filled and bordered') ? 1.5 : 1.35) : 0,
    color: normalizeFusionColor(filter.textColor, fallbackTextColor),
    opacity: filter.isEnabled ? 1 : 0.55,
  };
}

function WidgetSelectionGridComponent({
  onNewWidget,
  onDownload,
  onSyncManifest,
  onOpenFormatter,
  onInitialSectionFocusHandled,
  expandedWidgetId,
  onExpandedWidgetChange,
  initialSectionFocus,
}: WidgetSelectionGridProps) {
  const isMobile = useMobile();
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
  const [animatedCoverPacks, setAnimatedCoverPacks] = useState<AnimatedCoverPack[]>([]);
  const [selectedAnimatedCoverPackSlug, setSelectedAnimatedCoverPackSlug] = useState<string>('');
  const [isLoadingAnimatedCovers, setIsLoadingAnimatedCovers] = useState(false);
  const [animatedCoversError, setAnimatedCoversError] = useState<string | null>(null);
  const [copiedAnimatedCoverSlug, setCopiedAnimatedCoverSlug] = useState<string | null>(null);
  const [copiedAnimatedCoverWidgetSlug, setCopiedAnimatedCoverWidgetSlug] = useState<string | null>(null);
  const [copiedAnimatedCoverCatalogsSlug, setCopiedAnimatedCoverCatalogsSlug] = useState<string | null>(null);
  const [animatedCoverWidgetBlueprints, setAnimatedCoverWidgetBlueprints] = useState<Record<string, AnimatedCoverWidgetBlueprint>>({});
  const [animatedPreviewIndex, setAnimatedPreviewIndex] = useState(0);
  const [isAnimatedPreviewPlaying, setIsAnimatedPreviewPlaying] = useState(false);
  const [activeAnimatedCoverPackSlug, setActiveAnimatedCoverPackSlug] = useState<string | null>(null);
  const [isAnimatedInstallDialogOpen, setIsAnimatedInstallDialogOpen] = useState(false);
  const [animatedInstallStep, setAnimatedInstallStep] = useState<'cover' | 'widget-prompt' | 'widget'>('cover');
  const [widgetCatalogInstallStep, setWidgetCatalogInstallStep] = useState<'copy' | 'connect'>('copy');
  const [regexPatternPacks, setRegexPatternPacks] = useState<RegexPatternPack[]>([]);
  const [selectedRegexPatternPackSlug, setSelectedRegexPatternPackSlug] = useState<string>('');
  const [isLoadingRegexPatterns, setIsLoadingRegexPatterns] = useState(false);
  const [regexPatternsError, setRegexPatternsError] = useState<string | null>(null);
  const [copiedRegexPatternSlug, setCopiedRegexPatternSlug] = useState<string | null>(null);
  const [regexPreviewPageIndex, setRegexPreviewPageIndex] = useState(0);
  const [animatedCoverDetectedLayouts, setAnimatedCoverDetectedLayouts] = useState<Record<string, CollectionItem['layout']>>({});


  const [showPreview, setShowPreview] = useState(false);
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
  const animatedCoverCopyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animatedCoverWidgetCopyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animatedCoverCatalogCopyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regexPatternCopyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animatedPreviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const animatedPreviewAutoplayRef = useRef(false);
  const animatedCoverDetectedLayoutsRef = useRef<Map<string, CollectionItem['layout']>>(new Map());
  const animatedCoversSectionRef = useRef<HTMLElement | null>(null);
  const regexPatternsSectionRef = useRef<HTMLElement | null>(null);
  const lastInitialSectionFocusNonceRef = useRef<number | null>(null);
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

  const selectedAnimatedCoverPack = useMemo(
    () => animatedCoverPacks.find((pack) => pack.slug === selectedAnimatedCoverPackSlug) ?? animatedCoverPacks[0] ?? null,
    [animatedCoverPacks, selectedAnimatedCoverPackSlug]
  );

  const selectedAnimatedCoverWidgetBlueprint = useMemo(
    () => (selectedAnimatedCoverPack ? animatedCoverWidgetBlueprints[selectedAnimatedCoverPack.slug] ?? null : null),
    [animatedCoverWidgetBlueprints, selectedAnimatedCoverPack]
  );

  const detectAnimatedCoverLayout = useCallback(async (imageUrl: string): Promise<CollectionItem['layout']> => {
    if (typeof window === 'undefined') {
      return 'Poster';
    }

    return new Promise((resolve) => {
      const image = new window.Image();
      image.decoding = 'async';
      image.onload = () => {
        const width = image.naturalWidth || 0;
        const height = image.naturalHeight || 0;
        if (!width || !height) {
          resolve('Poster');
          return;
        }

        const ratio = width / height;
        if (ratio > 1.4) {
          resolve('Wide');
          return;
        }

        if (ratio < 0.75) {
          resolve('Poster');
          return;
        }

        resolve('Square');
      };
      image.onerror = () => resolve('Poster');
      image.src = imageUrl;
    });
  }, []);

  const selectedAnimatedPreviewCover = useMemo(() => {
    if (!selectedAnimatedCoverPack || selectedAnimatedCoverPack.covers.length === 0) {
      return null;
    }

    const boundedIndex = Math.max(0, Math.min(animatedPreviewIndex, selectedAnimatedCoverPack.covers.length - 1));
    return selectedAnimatedCoverPack.covers[boundedIndex] ?? null;
  }, [animatedPreviewIndex, selectedAnimatedCoverPack]);

  const selectedAnimatedPreviewCoverLayout = useMemo(() => {
    const backgroundUrl = selectedAnimatedPreviewCover?.backgroundURL;
    if (!backgroundUrl) {
      return undefined;
    }

    return animatedCoverDetectedLayouts[backgroundUrl];
  }, [animatedCoverDetectedLayouts, selectedAnimatedPreviewCover?.backgroundURL]);

  const activeAnimatedCoverPack = useMemo(
    () => animatedCoverPacks.find((pack) => pack.slug === activeAnimatedCoverPackSlug) ?? selectedAnimatedCoverPack,
    [activeAnimatedCoverPackSlug, animatedCoverPacks, selectedAnimatedCoverPack]
  );

  const activeAnimatedCoverWidgetBlueprint = useMemo(
    () => (activeAnimatedCoverPack ? animatedCoverWidgetBlueprints[activeAnimatedCoverPack.slug] ?? null : null),
    [activeAnimatedCoverPack, animatedCoverWidgetBlueprints]
  );

  const selectedRegexPatternPack = useMemo(
    () => regexPatternPacks.find((pack) => pack.slug === selectedRegexPatternPackSlug) ?? regexPatternPacks[0] ?? null,
    [regexPatternPacks, selectedRegexPatternPackSlug]
  );

  const regexPreviewPageCount = useMemo(() => {
    if (!selectedRegexPatternPack) {
      return 1;
    }

    return Math.max(1, Math.ceil(selectedRegexPatternPack.filters.length / REGEX_PREVIEW_PAGE_SIZE));
  }, [selectedRegexPatternPack]);

  const selectedRegexPreviewPageFilters = useMemo(() => {
    if (!selectedRegexPatternPack) {
      return [];
    }

    const startIndex = regexPreviewPageIndex * REGEX_PREVIEW_PAGE_SIZE;
    return selectedRegexPatternPack.filters.slice(startIndex, startIndex + REGEX_PREVIEW_PAGE_SIZE);
  }, [regexPreviewPageIndex, selectedRegexPatternPack]);

  const loadAnimatedCoverPacks = useCallback(async () => {
    setIsLoadingAnimatedCovers(true);
    setAnimatedCoversError(null);
    try {
      const packs = await fetchAnimatedCoverPacks();
      const widgetBlueprintBundle = await fetchAnimatedCoverWidgetBlueprints(packs);
      setAnimatedCoverPacks(packs);
      setAnimatedCoverWidgetBlueprints(widgetBlueprintBundle.blueprints);
      setSelectedAnimatedCoverPackSlug((previous) =>
        previous && packs.some((pack) => pack.slug === previous) ? previous : (packs[0]?.slug ?? '')
      );
    } catch (error) {
      setAnimatedCoverPacks([]);
      setAnimatedCoverWidgetBlueprints({});
      setSelectedAnimatedCoverPackSlug('');
      setAnimatedCoversError(getErrorMessage(error, 'Animated covers could not be loaded right now.'));
    } finally {
      setIsLoadingAnimatedCovers(false);
    }
  }, []);

  const prepareAnimatedWidgetInstall = useCallback((blueprint: AnimatedCoverWidgetBlueprint): PreparedAnimatedWidgetInstall => {
    const matchedCoverBackgroundUrls = blueprint.matchedCoverBackgroundUrls ?? [];
    const catalogGroupedItems = new Map<string, CollectionItem[]>();
    const fusionGroupedItems = new Map<string, CollectionItem[]>();
    const widgetTitleOrder: string[] = [];

    const registerWidgetTitle = (title: string) => {
      const normalizedTitle = title.trim();
      const effectiveTitle = normalizedTitle || blueprint.widget.title;
      if (!catalogGroupedItems.has(effectiveTitle)) {
        catalogGroupedItems.set(effectiveTitle, []);
        fusionGroupedItems.set(effectiveTitle, []);
        widgetTitleOrder.push(effectiveTitle);
      }
      return effectiveTitle;
    };

    let totalAiometadataSources = 0;
    let removedBecauseNoManifest = 0;
    let removedBecauseMissingCatalog = 0;
    let keptAiometadataSources = 0;

    blueprint.matchedItems.forEach(({ item, sourceWidgetTitle }, index) => {
      const backgroundImageURL = matchedCoverBackgroundUrls[index] ?? item.backgroundImageURL;
      const detectedLayout = backgroundImageURL ? animatedCoverDetectedLayouts[backgroundImageURL] : undefined;
      const widgetTitle = registerWidgetTitle(sourceWidgetTitle);
      const baseItem: CollectionItem = {
        ...item,
        backgroundImageURL,
        layout: detectedLayout ?? item.layout,
        dataSources: item.dataSources.map((dataSource) => ({
          ...dataSource,
          payload: { ...dataSource.payload },
        })) as WidgetDataSource[],
      };

      const catalogItems = catalogGroupedItems.get(widgetTitle);
      if (catalogItems) {
        catalogItems.push(baseItem);
      }

      const nextDataSources = baseItem.dataSources.filter((dataSource) => {
        if (!isAIOMetadataDataSource(dataSource)) {
          return true;
        }

        totalAiometadataSources += 1;

        if (!manifestUrl) {
          removedBecauseNoManifest += 1;
          return false;
        }

        const hasCatalogValidationSet = manifestCatalogs.length > 0;
        if (hasCatalogValidationSet && !findCatalog(manifestCatalogs, dataSource.payload.catalogId)) {
          removedBecauseMissingCatalog += 1;
          return false;
        }

        keptAiometadataSources += 1;
        return true;
      });

      const fusionItem: CollectionItem = {
        ...baseItem,
        dataSources: nextDataSources as WidgetDataSource[],
      };

      const fusionItems = fusionGroupedItems.get(widgetTitle);
      if (fusionItems) {
        fusionItems.push(fusionItem);
      }

    });

    const orderedWidgetTitles = widgetTitleOrder.length > 0
      ? widgetTitleOrder
      : [blueprint.widget.title];

    const catalogWidgets: CollectionRowWidget[] = orderedWidgetTitles.map((title) => ({
      id: `collection.${crypto.randomUUID()}`,
      title,
      type: 'collection.row',
      dataSource: {
        kind: 'collection',
        payload: {
          items: catalogGroupedItems.get(title) ?? [],
        },
      },
    }));

    const fusionWidgets: CollectionRowWidget[] = orderedWidgetTitles.map((title) => ({
      id: `collection.${crypto.randomUUID()}`,
      title,
      type: 'collection.row',
      dataSource: {
        kind: 'collection',
        payload: {
          items: fusionGroupedItems.get(title) ?? [],
        },
      },
    }));

    const catalogPayload: FusionWidgetsConfig = {
      exportType: 'fusionWidgets',
      exportVersion: 1,
      widgets: catalogWidgets,
    };

    const fusionPayload = {
      exportType: 'fusionWidgets' as const,
      exportVersion: 1,
      widgets: fusionWidgets.map((widget) => ({
        id: widget.id,
        title: widget.title,
        type: 'collection.row' as const,
        dataSource: {
          kind: 'collection' as const,
          payload: {
            items: widget.dataSource.payload.items.map((item) => {
              const fusionItem = {
                id: item.id,
                title: item.name,
                hideTitle: item.hideTitle,
                imageAspect: mapLayoutToImageAspect(item.layout),
                dataSources: item.dataSources.map((dataSource) =>
                  convertEditorDataSourceToFusionDataSource(dataSource, manifestUrl)
                ),
              } as {
                id: string;
                title: string;
                hideTitle: boolean;
                imageAspect: 'wide' | 'poster' | 'square';
                dataSources: ReturnType<typeof convertEditorDataSourceToFusionDataSource>[];
                imageURL?: string;
              };

              if (item.backgroundImageURL) {
                fusionItem.imageURL = item.backgroundImageURL;
              }

              return fusionItem;
            }),
          },
        },
      })),
    };

    return {
      catalogPayload,
      jsonText: JSON.stringify(fusionPayload, null, 2),
      keptAiometadataSources,
      removedBecauseMissingCatalog,
      removedBecauseNoManifest,
      totalAiometadataSources,
      widgetCount: fusionWidgets.length,
      widgetTitles: fusionWidgets.map((widget) => widget.title),
    };
  }, [animatedCoverDetectedLayouts, manifestCatalogs, manifestUrl]);

  const loadRegexPatternPacks = useCallback(async () => {
    setIsLoadingRegexPatterns(true);
    setRegexPatternsError(null);
    try {
      const packs = await fetchRegexPatternPacks();
      setRegexPatternPacks(packs);
      setSelectedRegexPatternPackSlug((previous) =>
        previous && packs.some((pack) => pack.slug === previous) ? previous : (packs[0]?.slug ?? '')
      );
    } catch (error) {
      setRegexPatternPacks([]);
      setSelectedRegexPatternPackSlug('');
      setRegexPatternsError(getErrorMessage(error, 'Regex pattern packs could not be loaded right now.'));
    } finally {
      setIsLoadingRegexPatterns(false);
    }
  }, []);

  const preparedSelectedAnimatedWidgetInstall = useMemo(() => {
    if (!selectedAnimatedCoverWidgetBlueprint) {
      return null;
    }

    return prepareAnimatedWidgetInstall(selectedAnimatedCoverWidgetBlueprint);
  }, [prepareAnimatedWidgetInstall, selectedAnimatedCoverWidgetBlueprint]);

  const preparedActiveAnimatedWidgetInstall = useMemo(() => {
    if (!activeAnimatedCoverPack || activeAnimatedCoverPack.slug === selectedAnimatedCoverPack?.slug) {
      return preparedSelectedAnimatedWidgetInstall;
    }

    const blueprint = activeAnimatedCoverWidgetBlueprint;
    if (!blueprint) {
      return null;
    }
    return prepareAnimatedWidgetInstall(blueprint);
  }, [
    activeAnimatedCoverPack,
    activeAnimatedCoverWidgetBlueprint,
    preparedSelectedAnimatedWidgetInstall,
    prepareAnimatedWidgetInstall,
    selectedAnimatedCoverPack?.slug,
  ]);

  const activeAnimatedWidgetCatalogExport = useMemo(() => {
    if (!preparedActiveAnimatedWidgetInstall) {
      return null;
    }

    const widgetInventory = collectAiometadataExportInventory(
      preparedActiveAnimatedWidgetInstall.catalogPayload,
      {
        manifestCatalogs,
        onlyNewAgainstManifest: isManifestSynced,
      }
    );

    return buildAiometadataCatalogExport({
      inventory: widgetInventory,
      includeAll: true,
    });
  }, [isManifestSynced, manifestCatalogs, preparedActiveAnimatedWidgetInstall]);

  const registerWidgetNode = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) {
      widgetNodeMapRef.current.set(id, node);
      return;
    }

    widgetNodeMapRef.current.delete(id);
  }, []);

  const handleExpandedWidgetChange = useCallback((nextId: string | null) => {
    if (typeof window !== 'undefined' && nextId) {
      const targetNode = widgetNodeMapRef.current.get(nextId);
      if (targetNode) {
        pendingScrollAnchorRef.current = { 
          id: nextId, 
          top: targetNode.getBoundingClientRect().top 
        };
      }
    } else {
      pendingScrollAnchorRef.current = null;
    }

    onExpandedWidgetChange(nextId);
  }, [onExpandedWidgetChange]);

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

      const rect = targetNode.getBoundingClientRect();
      const offset = rect.top - pendingAnchor.top;
      
      if (Math.abs(offset) > 0.5) {
        window.scrollTo({ top: window.scrollY + offset, behavior: 'auto' });
      }
    };

    let frameId: number;
    const runAdjust = () => {
      adjustScroll();
      frameId = window.requestAnimationFrame(runAdjust);
    };
    
    frameId = window.requestAnimationFrame(runAdjust);

    const timeout = window.setTimeout(() => {
      window.cancelAnimationFrame(frameId);
      
      const targetNode = widgetNodeMapRef.current.get(pendingAnchor.id);
      if (targetNode) {
        const rect = targetNode.getBoundingClientRect();
        // If the box header is not in a comfortable position, focus it
        if (rect.top < 10 || rect.top > window.innerHeight * 0.4) {
          window.scrollTo({
            top: window.scrollY + rect.top - 20,
            behavior: 'smooth'
          });
        }
      }
      
      pendingScrollAnchorRef.current = null;
    }, 400);

    return () => {
      window.cancelAnimationFrame(frameId);
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







  const isBridgeConfirmed =
    !!nativeTraktBridgeState.fingerprint
    && confirmedBridgeFingerprint === nativeTraktBridgeState.fingerprint;

  const requiresTraktBridgeImport =
    nativeTraktBridgeState.hasNativeTrakt
    && (nativeTraktBridgeState.catalogsExport?.catalogs.length || 0) > 0;


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
          ? `${formatCountLabel(fusionInvalidCatalogWidgetsStillSkippedInEmptyMode, 'classic row', 'classic rows')} will still be skipped because Fusion requires a valid catalog for an export.`
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
          ? `If you include invalid items they will be exported as empty items. This means ${emptyItemSummary}${emptyModeRowSummary ? ` ${emptyModeRowSummary}` : ''}`
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
    if (animatedCoverCopyResetTimeoutRef.current) {
      clearTimeout(animatedCoverCopyResetTimeoutRef.current);
    }
    if (animatedCoverWidgetCopyResetTimeoutRef.current) {
      clearTimeout(animatedCoverWidgetCopyResetTimeoutRef.current);
    }
    if (regexPatternCopyResetTimeoutRef.current) {
      clearTimeout(regexPatternCopyResetTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    void loadAnimatedCoverPacks();
  }, [loadAnimatedCoverPacks]);

  useEffect(() => {
    void loadRegexPatternPacks();
  }, [loadRegexPatternPacks]);

  useEffect(() => {
    if (!initialSectionFocus) {
      return;
    }

    if (lastInitialSectionFocusNonceRef.current === initialSectionFocus.nonce) {
      return;
    }

    lastInitialSectionFocusNonceRef.current = initialSectionFocus.nonce;

    const focusTarget = initialSectionFocus.section === 'animated'
      ? animatedCoversSectionRef.current
      : regexPatternsSectionRef.current;

    if (!focusTarget) {
      return;
    }

    const nextAnimatedSlug = initialSectionFocus.section === 'animated'
      ? (animatedCoverPacks.find((pack) => pack.slug === initialSectionFocus.packSlug)?.slug ?? animatedCoverPacks[0]?.slug ?? '')
      : animatedCoverPacks[0]?.slug ?? '';
    const nextRegexSlug = initialSectionFocus.section === 'regex'
      ? (regexPatternPacks.find((pack) => pack.slug === initialSectionFocus.packSlug)?.slug ?? regexPatternPacks[0]?.slug ?? '')
      : regexPatternPacks[0]?.slug ?? '';

    if (initialSectionFocus.section === 'animated' && nextAnimatedSlug) {
      setSelectedAnimatedCoverPackSlug(nextAnimatedSlug);
      setActiveAnimatedCoverPackSlug(nextAnimatedSlug);
    }

    if (initialSectionFocus.section === 'regex' && nextRegexSlug) {
      setSelectedRegexPatternPackSlug(nextRegexSlug);
    }

    const frame = window.requestAnimationFrame(() => {
      focusTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
      onInitialSectionFocusHandled?.();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [animatedCoverPacks, initialSectionFocus, onInitialSectionFocusHandled, regexPatternPacks]);

  useEffect(() => {
    if (!selectedAnimatedCoverPack) {
      setAnimatedPreviewIndex(0);
      setIsAnimatedPreviewPlaying(false);
      animatedPreviewAutoplayRef.current = false;
      return;
    }

    const nextIndex = Math.max(0, Math.min(selectedAnimatedCoverPack.defaultPreviewIndex, selectedAnimatedCoverPack.covers.length - 1));
    setAnimatedPreviewIndex(nextIndex);
    setIsAnimatedPreviewPlaying(animatedPreviewAutoplayRef.current);
    animatedPreviewAutoplayRef.current = false;
  }, [selectedAnimatedCoverPack]);

  useEffect(() => {
    const matchedCoverBackgroundUrls = selectedAnimatedCoverWidgetBlueprint?.matchedCoverBackgroundUrls ?? [];
    if (matchedCoverBackgroundUrls.length === 0) {
      setAnimatedCoverDetectedLayouts({});
      return;
    }

    let cancelled = false;
    const unresolvedUrls = matchedCoverBackgroundUrls.filter((url) => !animatedCoverDetectedLayoutsRef.current.has(url));

    const syncLayouts = () => {
      const nextLayouts: Record<string, CollectionItem['layout']> = {};
      matchedCoverBackgroundUrls.forEach((url) => {
        const layout = animatedCoverDetectedLayoutsRef.current.get(url);
        if (layout) {
          nextLayouts[url] = layout;
        }
      });
      setAnimatedCoverDetectedLayouts(nextLayouts);
    };

    if (unresolvedUrls.length === 0) {
      syncLayouts();
      return undefined;
    }

    void Promise.all(unresolvedUrls.map(async (url) => [url, await detectAnimatedCoverLayout(url)] as const))
      .then((results) => {
        if (cancelled) {
          return;
        }

        results.forEach(([url, layout]) => {
          animatedCoverDetectedLayoutsRef.current.set(url, layout);
        });
        syncLayouts();
      });

    return () => {
      cancelled = true;
    };
  }, [detectAnimatedCoverLayout, selectedAnimatedCoverWidgetBlueprint?.matchedCoverBackgroundUrls]);

  useEffect(() => {
    setRegexPreviewPageIndex(0);
  }, [selectedRegexPatternPack?.slug]);

  useEffect(() => {
    if (!isAnimatedPreviewPlaying && animatedPreviewVideoRef.current) {
      animatedPreviewVideoRef.current.pause();
    }
  }, [animatedPreviewIndex, isAnimatedPreviewPlaying, selectedAnimatedCoverPack]);

  useEffect(() => {
    if (!isAnimatedPreviewPlaying || !animatedPreviewVideoRef.current) {
      return;
    }

    const playPromise = animatedPreviewVideoRef.current.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        setIsAnimatedPreviewPlaying(false);
      });
    }
  }, [isAnimatedPreviewPlaying, selectedAnimatedPreviewCover?.videoURL]);

  useEffect(() => {
    if (animatedPreviewVideoRef.current) {
      animatedPreviewVideoRef.current.currentTime = 0;
    }
  }, [selectedAnimatedPreviewCover?.videoURL]);

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
    onNewWidget?.();
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

  const selectAnimatedCoverPack = (pack: AnimatedCoverPack) => {
    setSelectedAnimatedCoverPackSlug(pack.slug);
    setActiveAnimatedCoverPackSlug(pack.slug);
  };

  const handlePreviewCardActivate = (pack: AnimatedCoverPack) => {
    if (selectedAnimatedCoverPack?.slug === pack.slug) {
      setIsAnimatedPreviewPlaying(true);
      return;
    }

    animatedPreviewAutoplayRef.current = true;
    selectAnimatedCoverPack(pack);
  };

  const handlePreviewAreaToggle = async () => {
    if (isAnimatedPreviewPlaying) {
      const video = animatedPreviewVideoRef.current;
      video?.pause();
      setIsAnimatedPreviewPlaying(false);
      return;
    }

    await handlePreviewPlayToggle();
  };

  const handleOpenAnimatedPreviewPackGuide = (pack: AnimatedCoverPack) => {
    selectAnimatedCoverPack(pack);
    setAnimatedInstallStep('cover');
    setWidgetCatalogInstallStep('copy');
    setIsAnimatedInstallDialogOpen(true);
  };

  const handleCopyAnimatedCoverUrl = async (pack: AnimatedCoverPack) => {
    try {
      await copyTextToClipboard(pack.rawUrl);
      setCopiedAnimatedCoverSlug(pack.slug);
      if (animatedCoverCopyResetTimeoutRef.current) {
        clearTimeout(animatedCoverCopyResetTimeoutRef.current);
      }
      animatedCoverCopyResetTimeoutRef.current = setTimeout(() => {
        setCopiedAnimatedCoverSlug(null);
        animatedCoverCopyResetTimeoutRef.current = null;
      }, 2200);
      setAnimatedInstallStep('widget-prompt');
    } catch (error) {
      setExportActionError(getErrorMessage(error, 'The animated cover URL could not be copied.'));
    }
  };

  const handleCopyAnimatedWidgetCatalogs = async () => {
    if (!activeAnimatedCoverPack || !activeAnimatedWidgetCatalogExport) {
      return;
    }

    try {
      await copyTextToClipboard(JSON.stringify(activeAnimatedWidgetCatalogExport, null, 2));
      setCopiedAnimatedCoverCatalogsSlug(activeAnimatedCoverPack.slug);
      setWidgetCatalogInstallStep('connect');
      if (animatedCoverCatalogCopyResetTimeoutRef.current) {
        clearTimeout(animatedCoverCatalogCopyResetTimeoutRef.current);
      }
      animatedCoverCatalogCopyResetTimeoutRef.current = setTimeout(() => {
        setCopiedAnimatedCoverCatalogsSlug(null);
        animatedCoverCatalogCopyResetTimeoutRef.current = null;
      }, 2200);
    } catch (error) {
      setExportActionError(getErrorMessage(error, 'The widget catalogs could not be copied.'));
    }
  };

  const handleCopyAnimatedWidgetJson = async () => {
    if (!activeAnimatedCoverPack || !preparedActiveAnimatedWidgetInstall) {
      return;
    }

    try {
      await copyTextToClipboard(preparedActiveAnimatedWidgetInstall.jsonText);
      setCopiedAnimatedCoverWidgetSlug(activeAnimatedCoverPack.slug);
      if (animatedCoverWidgetCopyResetTimeoutRef.current) {
        clearTimeout(animatedCoverWidgetCopyResetTimeoutRef.current);
      }
      animatedCoverWidgetCopyResetTimeoutRef.current = setTimeout(() => {
        setCopiedAnimatedCoverWidgetSlug(null);
        animatedCoverWidgetCopyResetTimeoutRef.current = null;
      }, 2200);
    } catch (error) {
      setExportActionError(getErrorMessage(error, 'The widget JSON could not be copied.'));
    }
  };

  const handlePreviewCoverSelection = (index: number) => {
    if (!selectedAnimatedCoverPack) {
      return;
    }

    const boundedIndex = Math.max(0, Math.min(index, selectedAnimatedCoverPack.covers.length - 1));
    setAnimatedPreviewIndex(boundedIndex);
    setIsAnimatedPreviewPlaying(true);
  };

  const handlePreviewNext = () => {
    if (!selectedAnimatedCoverPack || selectedAnimatedCoverPack.covers.length === 0) {
      return;
    }

    setAnimatedPreviewIndex((previous) => (previous + 1) % selectedAnimatedCoverPack.covers.length);
    setIsAnimatedPreviewPlaying(true);
  };

  const handlePreviewPrevious = () => {
    if (!selectedAnimatedCoverPack || selectedAnimatedCoverPack.covers.length === 0) {
      return;
    }

    setAnimatedPreviewIndex((previous) =>
      (previous - 1 + selectedAnimatedCoverPack.covers.length) % selectedAnimatedCoverPack.covers.length
    );
    setIsAnimatedPreviewPlaying(true);
  };

  const handlePreviewPlayToggle = async () => {
    const video = animatedPreviewVideoRef.current;
    if (!video) {
      return;
    }

    if (isAnimatedPreviewPlaying) {
      video.pause();
      setIsAnimatedPreviewPlaying(false);
      return;
    }

    try {
      if (video.ended || video.currentTime >= (video.duration || Number.POSITIVE_INFINITY) - 0.05) {
        video.currentTime = 0;
      }
      await video.play();
      setIsAnimatedPreviewPlaying(true);
    } catch {
      setIsAnimatedPreviewPlaying(false);
    }
  };

  const handleCopyRegexPatternUrl = async (pack: RegexPatternPack) => {
    setSelectedRegexPatternPackSlug(pack.slug);
    try {
      await copyTextToClipboard(pack.rawUrl);
      setCopiedRegexPatternSlug(pack.slug);
      if (regexPatternCopyResetTimeoutRef.current) {
        clearTimeout(regexPatternCopyResetTimeoutRef.current);
      }
      regexPatternCopyResetTimeoutRef.current = setTimeout(() => {
        setCopiedRegexPatternSlug(null);
        regexPatternCopyResetTimeoutRef.current = null;
      }, 2200);
    } catch (error) {
      setExportActionError(getErrorMessage(error, 'The regex pattern URL could not be copied.'));
    }
  };

  const handleRegexPreviewNext = () => {
    if (!selectedRegexPatternPack || selectedRegexPatternPack.filters.length === 0) {
      return;
    }
    const nextPageIndex = (regexPreviewPageIndex + 1) % regexPreviewPageCount;
    setRegexPreviewPageIndex(nextPageIndex);
  };

  const handleRegexPreviewPrevious = () => {
    if (!selectedRegexPatternPack || selectedRegexPatternPack.filters.length === 0) {
      return;
    }
    const previousPageIndex = (regexPreviewPageIndex - 1 + regexPreviewPageCount) % regexPreviewPageCount;
    setRegexPreviewPageIndex(previousPageIndex);
  };

  const handleRegexPreviewPageForPack = (pack: RegexPatternPack, direction: 'previous' | 'next') => {
    if (pack.filters.length === 0) {
      return;
    }

    const pageCount = Math.max(1, Math.ceil(pack.filters.length / REGEX_PREVIEW_PAGE_SIZE));
    if (selectedRegexPatternPack?.slug === pack.slug) {
      if (direction === 'previous') {
        handleRegexPreviewPrevious();
      } else {
        handleRegexPreviewNext();
      }
      return;
    }

    setSelectedRegexPatternPackSlug(pack.slug);
    setRegexPreviewPageIndex(direction === 'previous' && pageCount > 1 ? pageCount - 1 : Math.min(1, pageCount - 1));
  };

  const ExportPreview = ({
    title,
    count,
    countLabel,
    content,
  }: {
    title: string;
    count: number;
    countLabel: string;
    content: string;
  }) => (
    <div className={cn("min-h-0 p-5 mt-3.5 w-full max-sm:px-4 max-sm:py-3 max-sm:mt-1.5 rounded-[2rem]", editorFormSurfaceClass)}>
      <div className="flex items-center justify-between mb-4 px-2 max-sm:px-1 max-sm:mb-3.5">
        <div className="flex items-center gap-2">
          <div className="size-1.5 rounded-full bg-primary/40 animate-pulse" />
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground/50 dark:text-foreground/60">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2 bg-zinc-100/50 dark:bg-white/5 px-2.5 py-1 rounded-lg border border-zinc-200/40 dark:border-white/5">
          <span className="text-[10px] font-bold text-primary/70 tabular-nums">
            {count} {countLabel}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground/30">•</span>
          <span className="text-[10px] font-bold text-muted-foreground/50 tabular-nums uppercase">
            {(content.length / 1024).toFixed(1)} KB
          </span>
        </div>
      </div>
      <div className="relative group overflow-hidden rounded-2xl border border-zinc-200/50 dark:border-white/5 bg-zinc-900 dark:bg-zinc-950 px-7 py-8 max-sm:px-5 max-sm:py-6 shadow-xl shadow-black/10">
        <textarea
          readOnly
          data-testid="export-preview-textarea"
          value={content}
          className="h-[380px] max-sm:h-[22vh] w-full resize-none overflow-y-auto border-none bg-transparent font-mono text-base max-sm:text-[10px] sm:text-xs leading-relaxed text-zinc-400 focus-visible:ring-0 custom-scrollbar"
        />
      </div>
    </div>
  );

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

  const renderAiometadataWidgetRow = (widget: ExportableCatalogWidgetGroup, keyPrefix: string = "", showOnlyNew: boolean = false) => {
    const itemCatalogKeys = new Set(widget.items.flatMap((i) => i.catalogKeys));
    const widgetSelectableCatalogKeys = widget.catalogKeys.filter((key) => aiometadataSelectableCatalogKeys.has(key));
    const topLevelOnlyCatalogKeys = widget.catalogKeys.filter((key) => !itemCatalogKeys.has(key));
    const widgetSelectedKeys = widgetSelectableCatalogKeys.filter((key) => selectedAiometadataCatalogKeySet.has(key));
    const widgetSelectedCount = widgetSelectedKeys.length;
    const widgetAllSelected = widgetSelectableCatalogKeys.length > 0 && widgetSelectedCount === widgetSelectableCatalogKeys.length;
    const widgetPartiallySelected = widgetSelectedCount > 0 && widgetSelectedCount < widgetSelectableCatalogKeys.length;
    const widgetExpanded = expandedAiometadataWidgetKeys.includes(widget.id);
    const widgetIsSyncedOnly = widgetSelectableCatalogKeys.length === 0;

    return (
      <div key={`${keyPrefix}${widget.id}`} className="rounded-3xl border border-zinc-200/80 bg-white/40 p-4 transition-all hover:bg-white/60 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.05]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (!widgetIsSyncedOnly) toggleAiometadataCatalogGroup(widgetSelectableCatalogKeys, !widgetAllSelected);
                }}
                className={cn(
                  "size-[1.125rem] rounded-[0.35rem] border-2 transition-all cursor-pointer flex items-center justify-center shrink-0",
                  widgetAllSelected || widgetPartiallySelected
                    ? "bg-primary border-primary"
                    : "bg-transparent border-zinc-300 dark:border-white/20 hover:border-primary/40",
                  widgetIsSyncedOnly && "opacity-30 cursor-not-allowed"
                )}
              >
              {widgetPartiallySelected
                ? <div className="w-2.5 h-0.5 bg-primary-foreground rounded-full" />
                : widgetAllSelected && <Check className="size-3 text-primary-foreground stroke-[3.5px]" />
              }
            </div>
            <div
              className="min-w-0 flex-1 cursor-pointer"
              onClick={() => toggleAiometadataWidgetExpanded(widget.id)}
            >
              <button
                type="button"
                className="inline-block max-w-full text-left"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleAiometadataCatalogGroup(widgetSelectableCatalogKeys, !widgetAllSelected);
                }}
                disabled={widgetSelectableCatalogKeys.length === 0}
              >
                <p className={cn(
                  'truncate text-sm font-semibold',
                  widgetIsSyncedOnly ? 'text-foreground/55' : 'text-foreground'
                )}>
                  {widget.widgetTitle}
                </p>
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/50">
                  {widget.widgetType === 'collection.row' ? 'Collection' : 'Classic Row'}
                </span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn(
              "rounded-full bg-background/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/70",
              widgetSelectableCatalogKeys.length === 0 && "max-sm:hidden"
            )}>
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
                aria-label={`Open export settings for ${widget.widgetTitle}`}
              >
                <SlidersHorizontal className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleAiometadataWidgetExpanded(widget.id);
              }}
              className={cn(
                "group flex items-center justify-center size-8 rounded-full transition-all hover:scale-110 active:scale-90",
                widgetIsSyncedOnly
                  ? "border border-border/10 bg-background/45 text-muted-foreground/35 cursor-not-allowed"
                  : "border border-border/15 bg-background/70 text-muted-foreground/55 hover:border-primary/20 hover:bg-primary/10 hover:text-primary"
              )}
              aria-expanded={widgetExpanded}
            >
              <ChevronRight className={cn('size-4 transition-transform', widgetExpanded && 'rotate-90')} />
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {widgetExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="mt-4 px-2 sm:px-4 pb-2 space-y-3">
                {topLevelOnlyCatalogKeys.length > 0 && (
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60 px-1">
                    Catalog
                  </p>
                )}
                {topLevelOnlyCatalogKeys
                  .filter((catalogKey) => !showOnlyNew || aiometadataSelectableCatalogKeys.has(catalogKey))
                  .map((catalogKey) => {
                    const catalog = aiometadataCatalogMap.get(catalogKey) as ExportableCatalogDefinition | undefined;
                    if (!catalog) return null;
                    const checked = selectedAiometadataCatalogKeySet.has(catalogKey);
                    const disabled = isManifestSynced && catalog.isAlreadyInManifest;

                    return (
                      <div
                        key={`${keyPrefix}${catalogKey}`}
                        onClick={() => {
                          if (!disabled) toggleAiometadataCatalogKey(catalogKey);
                        }}
                        className={cn(
                          'flex items-center gap-3 rounded-[1.25rem] border border-zinc-200/50 dark:border-white/5 bg-white/85 dark:bg-white/[0.03] p-3 transition-all hover:bg-white/95 dark:hover:bg-white/[0.05] shadow-sm backdrop-blur-sm cursor-pointer',
                          disabled && 'opacity-55 cursor-default'
                        )}
                      >
                        <div
                          className={cn(
                            "size-[1.125rem] rounded-[0.35rem] border-2 transition-all flex items-center justify-center shrink-0",
                            checked
                              ? "bg-primary border-primary"
                              : "bg-transparent border-zinc-300 dark:border-white/20",
                            disabled && "opacity-30"
                          )}
                        >
                          {checked && <Check className="size-3 text-primary-foreground stroke-[3.5px]" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-foreground">{catalog.entry.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <p className="truncate text-[10px] sm:text-[11px] font-bold text-muted-foreground/55 dark:text-muted-foreground/45">
                              {catalog.entry.type} / {catalog.entry.id}
                            </p>
                            <span className={cn(
                              'inline-flex shrink-0 items-center justify-center rounded-full px-2 py-0.5 sm:px-2.5 sm:py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.12em] sm:tracking-[0.16em]',
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
                          </div>
                        </div>
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
                          <span className="hidden sm:inline-flex rounded-full bg-muted px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/70">
                            Synced
                          </span>
                        )}
                      </div>
                    );
                  })}

                {/* Collection Items */}
                {widget.items.length > 0 && (
                  <div className="mt-4 mb-2 space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60 px-1">
                      Collection Items
                    </p>
                    {widget.items
                      .filter((item) => !showOnlyNew || item.catalogKeys.some((key) => aiometadataSelectableCatalogKeys.has(key)))
                      .map((item) => {
                        const itemSelectableCatalogKeys = item.catalogKeys.filter((key) => aiometadataSelectableCatalogKeys.has(key));
                        const itemSelectedKeys = itemSelectableCatalogKeys.filter((key) => selectedAiometadataCatalogKeySet.has(key));
                        const itemSelectedCount = itemSelectedKeys.length;
                        const itemAllSelected = itemSelectableCatalogKeys.length > 0 && itemSelectedCount === itemSelectableCatalogKeys.length;
                        const itemPartiallySelected = itemSelectedCount > 0 && itemSelectedCount < itemSelectableCatalogKeys.length;
                        const itemExpanded = expandedAiometadataItemKeys.includes(item.key);
                        const itemIsSyncedOnly = itemSelectableCatalogKeys.length === 0;

                        return (
                          <div key={`${keyPrefix}${item.key}`} className="rounded-[1.25rem] border border-zinc-200/40 bg-white/85 p-3 dark:border-white/5 dark:bg-white/[0.03] backdrop-blur-sm shadow-sm transition-all hover:bg-white/95 ring-offset-background focus-within:ring-2 focus-within:ring-primary/20">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!itemIsSyncedOnly) toggleAiometadataCatalogGroup(itemSelectableCatalogKeys, !itemAllSelected);
                                    }}
                                    className={cn(
                                      "size-[1.125rem] rounded-[0.35rem] border-2 transition-all cursor-pointer flex items-center justify-center shrink-0",
                                      itemAllSelected || itemPartiallySelected
                                        ? "bg-primary border-primary"
                                        : "bg-transparent border-zinc-300 dark:border-white/20 hover:border-primary/40",
                                      itemIsSyncedOnly && "opacity-30 cursor-not-allowed"
                                    )}
                                  >
                                  {itemPartiallySelected
                                    ? <div className="w-2.5 h-0.5 bg-primary-foreground rounded-full" />
                                    : itemAllSelected && <Check className="size-3 text-primary-foreground stroke-[3.5px]" />
                                  }
                                </div>
                                <div
                                  className="min-w-0 flex-1 cursor-pointer"
                                  onClick={() => toggleAiometadataItemExpanded(item.key)}
                                >
                                  <p className="truncate text-sm font-bold text-foreground">{item.itemName}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={cn(
                                  "rounded-full bg-background/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/60",
                                  itemSelectableCatalogKeys.length === 0 && "max-sm:hidden"
                                )}>
                                  {itemSelectableCatalogKeys.length > 0
                                    ? `${itemSelectedCount}/${itemSelectableCatalogKeys.length}`
                                    : 'Synced'}
                                </span>
                                {itemHasEditableAiometadataSources(item) && (
                                  <button
                                    type="button"
                                    className={cn(
                                      'flex size-7 items-center justify-center rounded-lg border transition-all',
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
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedAiometadataItemKeys((prev) =>
                                      prev.includes(item.key)
                                        ? prev.filter((k) => k !== item.key)
                                        : [...prev, item.key]
                                    );
                                  }}
                                  className="group flex items-center justify-center size-7 rounded-full hover:bg-primary/10 transition-all hover:scale-110 active:scale-90"
                                  aria-expanded={itemExpanded}
                                >
                                  <ChevronRight className={cn('size-4 transition-all group-hover:text-primary', itemExpanded && 'rotate-90 text-primary')} />
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
                                  <div className="mt-2.5 space-y-1.5 pt-1">
                                    {item.catalogKeys
                                      .filter((itemCatalogKey) => !showOnlyNew || aiometadataSelectableCatalogKeys.has(itemCatalogKey))
                                      .map((itemCatalogKey) => {
                                        const catalog = aiometadataCatalogMap.get(itemCatalogKey) as ExportableCatalogDefinition | undefined;
                                        if (!catalog) return null;
                                        const checked = selectedAiometadataCatalogKeySet.has(itemCatalogKey);
                                        const disabled = isManifestSynced && catalog.isAlreadyInManifest;

                                        return (
                                          <div
                                            key={`${keyPrefix}${itemCatalogKey}`}
                                            onClick={() => {
                                              if (!disabled) toggleAiometadataCatalogKey(itemCatalogKey);
                                            }}
                                            className={cn(
                                              'flex items-center gap-2.5 rounded-xl border border-zinc-200/50 bg-white/90 px-2.5 py-2 transition-all hover:bg-white dark:border-white/5 dark:bg-white/[0.025] dark:hover:bg-white/[0.045] shadow-xs cursor-pointer',
                                              disabled && 'opacity-55 cursor-default'
                                            )}
                                          >
                                              <div
                                                className={cn(
                                                  "size-[1rem] rounded-[0.3rem] border-2 transition-all flex items-center justify-center shrink-0",
                                                  checked
                                                    ? "bg-primary border-primary"
                                                    : "bg-transparent border-zinc-300 dark:border-white/20",
                                                  disabled && "opacity-30"
                                                )}
                                              >
                                                {checked && <Check className="size-2 text-primary-foreground stroke-[4.5px]" />}
                                              </div>
                                            <div className="min-w-0 flex-1">
                                              <p className="truncate text-[11px] font-bold text-foreground">{catalog.entry.name}</p>
                                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                                <p className="truncate text-[9px] font-bold text-muted-foreground/55 dark:text-muted-foreground/45">
                                                  {catalog.entry.type} / {catalog.entry.id}
                                                </p>
                                                <span className={cn(
                                                  'inline-flex shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em]',
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
                                              </div>
                                            </div>
                                            {catalogHasEditableAiometadataSettings(itemCatalogKey) && (
                                              <button
                                                type="button"
                                                className="flex size-7 items-center justify-center rounded-lg border border-border/10 bg-background/60 text-muted-foreground/50 transition-all hover:border-primary/20 hover:text-primary active:scale-95"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  openAiometadataSettings({ kind: 'catalog', catalogKey: itemCatalogKey });
                                                }}
                                                aria-label={`Open export settings for ${catalog.entry.name}`}
                                              >
                                                <SlidersHorizontal className="size-3" />
                                              </button>
                                            )}
                                            {disabled && (
                                              <span className="hidden sm:inline-flex rounded-full bg-muted/50 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-muted-foreground/50">
                                                Synced
                                              </span>
                                            )}
                                          </div>
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };


  const ExportContent = (
    <div className="flex h-[87dvh] sm:h-[700px] flex-col w-full overflow-hidden bg-transparent">
      <div className="flex-1 overflow-y-auto w-full custom-scrollbar p-8 pt-10 max-sm:px-5 max-sm:pt-6">
        <DialogHeader className="space-y-6 items-start text-left w-full overflow-x-hidden">
          <div className="size-14 shrink-0 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary max-sm:size-12">
            <FileJson2 className="size-7 max-sm:size-6" />
          </div>
          <div className="space-y-1">
            <DialogTitle className="text-2xl font-black tracking-tight max-sm:text-[1.35rem] truncate w-full">Export JSON</DialogTitle>
            <DialogDescription className="text-xs font-medium leading-relaxed text-muted-foreground/64 max-sm:text-[11px]">
              Choose a format and export your configuration for Fusion or Omni.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="mt-2.5 flex justify-end max-sm:mt-5 max-sm:justify-end w-full">
          <div className="flex flex-wrap sm:w-auto rounded-2xl border border-border/10 bg-muted/20 p-1.5">
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
          <div className="mt-5 flex min-h-0 flex-1 flex-col gap-6">
            <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/80">
                Install Note
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-foreground/85">
                1. Copy catalogs.
                {' '}
                2. AIOMetadata: Catalogs &gt; Import Setup &gt; paste &gt; Import &gt; Save.
              </p>
            </div>

            {/* Section 1: UME Sorting */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-foreground/60">
                  UME Sorting
                </h3>
              </div>
              <div className="rounded-3xl border border-zinc-200/80 bg-white/40 px-5 py-4 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={aiometadataSectionTitleClass}>
                          Automatic Sorting
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
                        Automatically sort AIOMetadata catalogs by rules like release date, popularity, and IMDb.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiometadataUseUmeSorting((current) => !current)}
                    className="group inline-flex items-center"
                    aria-pressed={aiometadataUseUmeSorting}
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

            {/* Section 2: All Catalogs */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-foreground/60">
                  All Catalogs
                </h3>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 px-1">
                <Button
                  variant="outline"
                  className="flex-1 rounded-2xl border-primary/20 bg-background/50 hover:bg-primary/10 hover:border-primary/30 transition-all h-11 text-[11px] font-bold uppercase tracking-widest"
                  onClick={handleDownloadFullAiometadataCatalogSetup}
                >
                  <Download className="size-3.5 mr-2" />
                  Download All Catalogs
                </Button>
                <Button
                  className="flex-1 rounded-2xl bg-primary shadow-lg shadow-primary/20 h-11 text-[11px] font-bold uppercase tracking-widest"
                  onClick={() => { void handleCopyFullAiometadataCatalogSetup(); }}
                >
                  {copiedAction === 'full-aiometadata' ? <Check className="size-3.5 mr-2" /> : <Copy className="size-3.5 mr-2" />}
                  {copiedAction === 'full-aiometadata' ? 'Copied' : 'Copy All Catalogs'}
                </Button>
              </div>
            </div>

            {/* Section 3: New Catalogs */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-foreground/60">
                  New Catalogs
                </h3>
              </div>
              <div className="flex flex-col gap-3">
                {(() => {
                  const newWidgets = aiometadataInventory.widgets.filter((widget) =>
                    widget.catalogKeys.some(key => !aiometadataCatalogMap.get(key)?.isAlreadyInManifest)
                  );

                  if (newWidgets.length === 0) {
                    return (
                      <div className="rounded-3xl border border-dashed border-emerald-500/20 bg-emerald-500/[0.02] py-8 text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600/40 dark:text-emerald-400/30">
                          All catalogs are already synced
                        </p>
                      </div>
                    );
                  }

                  return newWidgets.map((widget) => renderAiometadataWidgetRow(widget, "new-", true));
                })()}
              </div>
            </div>

            {/* Preview Section */}
            <ExportPreview
              title="Export Preview"
              count={aiometadataPreviewExport.catalogs.length}
              countLabel="catalogs"
              content={previewContent}
            />
          </div>
        ) : (
          <div className="mt-4 flex-1 min-h-0 flex flex-col">
            {exportMode === 'fusion' && requiresFusionInvalidCatalogConfirmation && !isFusionInvalidCatalogConfirmed ? (
              <div className="relative group flex flex-col flex-1 min-h-0">
                <div className="flex flex-col items-start justify-start py-6 px-6 max-sm:px-4 rounded-3xl border border-amber-200/50 dark:border-white/5 bg-amber-50/30 dark:bg-zinc-950 shadow-xl shadow-amber-500/5 dark:shadow-black/20 overflow-hidden">
                  <div className="flex items-center space-x-4 mb-4 text-left">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 shadow-lg shadow-amber-500/5">
                      <AlertTriangle className="size-5" />
                    </div>
                    <h4 className="text-sm font-bold text-amber-950 dark:text-zinc-100 leading-tight">
                      Some AIOMetadata catalogs in this setup are missing or invalid.
                    </h4>
                  </div>
                  <div className="space-y-2.5 max-w-2xl text-left">
                    {previewContent.split('\n\n').slice(1).map((line, idx) => (
                      <p key={idx} className="text-sm leading-relaxed text-amber-900/80 dark:text-zinc-400 font-medium">
                        {line.includes('AIOMetadata section') ? (
                          <>
                            {line.split('AIOMetadata section')[0]}
                            <button
                              type="button"
                              onClick={() => handleExportModeChange('aiometadata')}
                              className="font-black text-primary hover:underline underline-offset-4 transition-all decoration-primary/30 hover:decoration-primary"
                            >
                              AIOMetadata section
                            </button>
                            {line.split('AIOMetadata section')[1]}
                          </>
                        ) : (
                          line
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            ) : exportMode === 'fusion' && requiresFusionAiometadataSync ? (
              <div className="relative group flex flex-col flex-1 min-h-0">
                <div className="flex flex-col items-start justify-start py-6 px-6 max-sm:px-4 rounded-3xl border border-amber-200/50 dark:border-white/5 bg-amber-50/30 dark:bg-zinc-950 shadow-xl shadow-amber-500/5 dark:shadow-black/20 overflow-hidden">
                  <div className="flex items-center space-x-4 mb-4 text-left">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 shadow-lg shadow-amber-500/5">
                      <AlertTriangle className="size-5" />
                    </div>
                    <h4 className="text-sm font-bold text-amber-950 dark:text-zinc-100 leading-tight">
                      AIOMetadata Sync Required
                    </h4>
                  </div>
                  <div className="space-y-2.5 max-w-2xl text-left">
                    <p className="text-sm leading-relaxed text-amber-900/80 dark:text-zinc-400 font-medium">
                      {FUSION_SYNC_REQUIRED_MESSAGE}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center pt-8 pb-10 px-8 text-center space-y-8 max-sm:pt-3 max-sm:pb-5 max-sm:px-0 max-sm:space-y-3.5 flex-1 min-h-0 overflow-hidden">
                <div className="flex flex-col items-center space-y-5 max-sm:space-y-3">
                  <div className="size-16 rounded-[2rem] bg-primary/8 border border-primary/20 flex items-center justify-center text-primary shadow-2xl shadow-primary/10 max-sm:size-12 max-sm:rounded-2xl">
                    <FileCode className="size-8 max-sm:size-6" />
                  </div>
                  <div className="space-y-2 max-sm:space-y-1 max-w-sm">
                    <h3 className="text-2xl font-black tracking-tight text-foreground capitalize max-sm:text-lg">
                      {exportMode} Export Ready
                    </h3>
                    <p className="text-sm font-medium text-muted-foreground/65 leading-relaxed px-4 max-sm:px-2 max-sm:text-[11px]">
                      Your {exportMode === 'fusion' ? 'Fusion' : 'Omni'} JSON configuration has been generated and is ready for download or copy.
                    </p>
                  </div>
                </div>

                {exportMode === 'fusion' ? (
                  <div className="w-full max-w-3xl rounded-2xl border border-primary/15 bg-primary/5 p-4 text-left">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/80">
                      Install Note
                    </p>
                    <p className="mt-2 text-[12px] leading-relaxed text-foreground/85">
                      1. Copy JSON.
                      {' '}
                      2. Fusion &gt; Widgets &gt; Import Widgets &gt; Paste &gt; Import.
                    </p>
                  </div>
                ) : null}

                <ExportPreview
                  title={exportMode === 'omni' && requiresTraktBridgeImport && !isBridgeConfirmed ? "Omni Actions Required" : "JSON Preview"}
                  count={exportMode === 'fusion' ? widgets.length : widgets.length} 
                  countLabel={exportMode === 'fusion' ? 'widgets' : 'groups'}
                  content={previewContent}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-zinc-200/40 dark:border-white/5 bg-background/50 backdrop-blur-md p-6 max-sm:px-5 max-sm:py-4">
        <div className="grid grid-cols-2 sm:flex sm:justify-end gap-3 sm:gap-4">
          {exportMode === 'fusion' && requiresFusionInvalidCatalogConfirmation && !isFusionInvalidCatalogConfirmed ? (
            <>
              <Button
                variant="secondary"
                className={cn(editorActionButtonClass, editorFooterSecondaryButtonClass, "max-sm:rounded-[1rem] px-3 sm:px-6 sm:w-52 h-11 text-[13px] font-bold uppercase tracking-wider")}
                onClick={() => setConfirmedFusionInvalidCatalogDecision({
                  fingerprint: fusionInvalidCatalogState.fingerprint!,
                  mode: 'skip'
                })}
              >
                <XCircle className="size-3.5 mr-1.5 sm:hidden" />
                <span className="sm:hidden">Skip</span>
                <span className="hidden sm:inline">Skip Invalid</span>
              </Button>
              <Button
                disabled={fusionInvalidCatalogEmptiedItems === 0}
                className={cn(editorActionButtonClass, editorFooterPrimaryButtonClass, "max-sm:rounded-[1rem] px-3 sm:px-6 sm:w-52 h-11 text-[13px] font-bold uppercase tracking-wider")}
                onClick={() => setConfirmedFusionInvalidCatalogDecision({
                  fingerprint: fusionInvalidCatalogState.fingerprint!,
                  mode: 'empty-items'
                })}
              >
                <FileJson2 className="size-3.5 mr-1.5 sm:hidden" />
                <span className="sm:hidden">Include</span>
                <span className="hidden sm:inline">Include Invalid</span>
              </Button>
            </>
          ) : exportMode === 'fusion' && requiresFusionAiometadataSync ? (
            <Button
              className={cn(editorActionButtonClass, editorFooterPrimaryButtonClass, "col-span-2 sm:w-64 h-11 text-[13px] font-bold uppercase tracking-wider")}
              onClick={onSyncManifest}
            >
              <Globe className="size-4 mr-2" />
              Sync Manifest
            </Button>
          ) : exportMode === 'aiometadata' ? (
            <>
              <Button
                variant="secondary"
                className={cn(editorActionButtonClass, editorFooterSecondaryButtonClass, "max-sm:rounded-[1rem] px-3 sm:px-6 sm:w-52 h-11 text-[13px] font-bold uppercase tracking-wider")}
                onClick={handleDownload}
              >
                <Download className="size-3.5 mr-1.5" />
                <span className="sm:hidden">Download</span>
                <span className="hidden sm:inline">Download JSON</span>
              </Button>
              <Button
                className={cn(editorActionButtonClass, editorFooterPrimaryButtonClass, "max-sm:rounded-[1rem] px-3 sm:px-6 sm:w-52 h-11 text-[13px] font-bold uppercase tracking-wider")}
                onClick={() => { void handleCopy(); }}
              >
                {copiedAction === 'preview' ? <Check className="size-3.5 mr-1.5" /> : <Copy className="size-3.5 mr-1.5" />}
                <span className="sm:hidden">{copiedAction === 'preview' ? 'Copied' : 'Copy'}</span>
                <span className="hidden sm:inline">{copiedAction === 'preview' ? 'Copied' : 'Copy Catalogs'}</span>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                className={cn(editorActionButtonClass, editorFooterSecondaryButtonClass, "max-sm:rounded-[1rem] px-3 sm:px-6 sm:w-52 h-11 text-[13px] font-bold uppercase tracking-wider")}
                onClick={handleDownload}
              >
                <Download className="size-3.5 mr-1.5" />
                <span className="sm:hidden">Download</span>
                <span className="hidden sm:inline">Download JSON</span>
              </Button>
              <Button
                className={cn(editorActionButtonClass, editorFooterPrimaryButtonClass, "max-sm:rounded-[1rem] px-3 sm:px-6 sm:w-52 h-11 text-[13px] font-bold uppercase tracking-wider")}
                onClick={() => { void handleCopy(); }}
              >
                {copiedAction === 'preview' ? <Check className="size-3.5 mr-1.5" /> : <Copy className="size-3.5 mr-1.5" />}
                <span className="sm:hidden">{copiedAction === 'preview' ? 'Copied' : 'Copy'}</span>
                <span className="hidden sm:inline">{copiedAction === 'preview' ? 'Copied' : 'Copy JSON'}</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );


  const renderExportDialog = () => {
    if (isMobile) {
      return (
        <Drawer
          open={showPreview}
          onOpenChange={(open) => {
            setShowPreview(open);
            setCopiedAction(null);
          }}
        >
          <DrawerContent className="max-h-[94dvh] bg-white dark:bg-zinc-950 border-zinc-200/80 dark:border-white/10 rounded-t-[2.5rem]">
            <DrawerHeader className="sr-only">
              <DrawerTitle>Export JSON</DrawerTitle>
              <DrawerDescription>Export your widgets or catalogs to JSON format.</DrawerDescription>
            </DrawerHeader>
            {ExportContent}
            {renderUmeSortingDialog()}
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
          </DrawerContent>
        </Drawer>
      );
    }

    return (
      <Dialog
        open={showPreview}
        onOpenChange={(open) => {
          setShowPreview(open);
          setCopiedAction(null);
        }}
      >
        <DialogContent className="flex sm:max-h-[92vh] max-w-2xl flex-col overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/95 p-0 backdrop-blur-2xl dark:border-white/12 dark:bg-zinc-950/93 shadow-2xl">
          <DialogTitle className="sr-only">Export JSON</DialogTitle>
          {ExportContent}
          {renderUmeSortingDialog()}
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
        </DialogContent>
      </Dialog>
    );
  };

  const UmeSortingContent = (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="space-y-6 items-start text-left mb-8">
        <div className="flex size-14 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary shadow-sm shadow-primary/5 max-sm:size-12">
          <WandSparkles className="size-6 max-sm:size-5" />
        </div>
        <div>
          <h2 className="text-2xl font-black tracking-tight max-sm:text-xl">
            UME Sorting
          </h2>
        </div>
      </div>

      <div className="space-y-4 px-1 sm:px-2">
        {UME_SORTING_EXPLANATION_SECTIONS.map((section) => (
          <div
            key={section.groups.join('|')}
            className="rounded-3xl border border-zinc-200/70 bg-white/55 px-5 py-5 backdrop-blur-md dark:border-white/10 dark:bg-black sm:px-6 shadow-sm shadow-black/5"
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
  );

  const renderUmeSortingDialog = () => {
    if (isMobile) {
      return (
        <Drawer open={isUmeSortingDialogOpen} onOpenChange={setIsUmeSortingDialogOpen}>
          <DrawerContent className="max-h-[94dvh] bg-white dark:bg-zinc-950 border-zinc-200/80 dark:border-white/10 rounded-t-[2.5rem]">
            <DrawerHeader className="sr-only">
              <DrawerTitle>UME Sorting</DrawerTitle>
              <DrawerDescription>Automatic sorting for your AIOMetadata catalogs.</DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto px-6 pt-10 pb-12 custom-scrollbar h-[87dvh]">
              {UmeSortingContent}
            </div>
          </DrawerContent>
        </Drawer>
      );
    }
    return (
      <Dialog open={isUmeSortingDialogOpen} onOpenChange={setIsUmeSortingDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/95 p-0 backdrop-blur-2xl dark:border-white/12 dark:bg-zinc-950/93 shadow-2xl">
          <div className="max-h-[85vh] overflow-y-auto px-8 pb-8 pt-10 custom-scrollbar">
            {UmeSortingContent}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  const TrashContent = (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
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
  );

  const renderTrashDialog = () => {
    if (isMobile) {
      return (
        <Drawer open={showTrash} onOpenChange={setShowTrash}>
          <DrawerContent className="bg-background border-border/40 max-h-[94dvh] rounded-t-[2.5rem]">
            <DrawerHeader className="text-left px-6 pt-10 pb-4">
              <div className="size-14 rounded-xl border border-destructive/10 bg-destructive/10 text-destructive flex items-center justify-center mb-6">
                <Trash2 className="size-7" />
              </div>
              <DrawerTitle className="text-2xl font-black tracking-tight">Trash</DrawerTitle>
              <DrawerDescription>Deleted widgets and items stay here until restored or emptied.</DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto px-6 pb-12 custom-scrollbar h-[87dvh]">
              {TrashContent}
            </div>
          </DrawerContent>
        </Drawer>
      );
    }
    return (
      <Dialog open={showTrash} onOpenChange={setShowTrash}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden border-border/40 backdrop-blur-xl bg-background/95 dark:border-white/10 dark:bg-zinc-950/95">
          <div className="p-8 pt-10 max-sm:px-5 max-sm:pt-6">
            <DialogHeader className="space-y-6 items-start text-left">
              <div className="size-14 rounded-xl border border-destructive/10 bg-destructive/10 text-destructive  flex items-center justify-center max-sm:size-12">
                <Trash2 className="size-7 max-sm:size-6" />
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-2xl font-black tracking-tight max-sm:text-[1.35rem]">Trash</DialogTitle>
                <DialogDescription className="text-xs font-medium leading-relaxed text-muted-foreground/64 max-sm:text-[11px]">Deleted widgets and items stay here until restored or emptied.</DialogDescription>
              </div>
            </DialogHeader>
          </div>
          <div className="px-8 pb-8 max-sm:px-5 max-sm:pb-6">
            {TrashContent}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  const renderAnimatedCoversSection = () => {
    return (
      <section ref={animatedCoversSectionRef} className={cn(editorPanelClass, "mt-10 rounded-3xl border-zinc-200/70 bg-zinc-50/55 p-5 dark:border-border/20 dark:bg-zinc-900/50 max-sm:mt-7 max-sm:rounded-[1.5rem] max-sm:p-3.5")}>
        <div className="flex flex-wrap items-start justify-between gap-3 max-sm:gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/75 max-sm:text-[9px]">Animated Covers</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-foreground max-sm:text-[1.45rem]">Apple TV Preview Pack</h2>
          </div>
          <a
            href="https://github.com/nobnobz/Omni-Template-Bot-Bid-Raiser/tree/main/Other"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border/50 bg-background/70 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80 transition-colors hover:border-primary/35 hover:text-primary max-sm:px-2.5 max-sm:text-[9px]"
          >
            Source
            <ExternalLink className="size-3.5" />
          </a>
        </div>

        <div className="mt-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 max-sm:p-3.5">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/80 max-sm:text-[9px]">INSTALL NOTE</p>
          <p className="mt-2 text-[12px] leading-relaxed text-foreground/85 max-sm:text-[11.5px]">
            1. Install the widget.
            {' '}
            2. On your <strong>Apple TV</strong>: Paste the cover URL in
            {' '}
            <code>Fusion {'>'} Settings {'>'} Home {'>'} Preview Packs</code>
            {' '}
            and tap
            {' '}
            <code>Add</code>
            .
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/75 max-sm:text-[10.5px]">
            You need both the cover URL and the widget installed for the preview pack to work.
          </p>
        </div>

        {isLoadingAnimatedCovers ? (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border/50 bg-background/70 px-4 py-3 text-sm text-muted-foreground/75">
            <Loader2 className="size-4 animate-spin text-primary/80" />
            Loading animated covers...
          </div>
        ) : null}

        {!isLoadingAnimatedCovers && animatedCoversError ? (
          <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 p-4">
            <p className="text-sm text-destructive/85">{animatedCoversError}</p>
            <Button
              variant="outline"
              onClick={() => void loadAnimatedCoverPacks()}
              className={cn(editorActionButtonClass, "mt-3 h-9 rounded-xl border-destructive/25 bg-background/70 px-4 text-[10px] text-destructive hover:bg-destructive/10")}
            >
              Retry
            </Button>
          </div>
        ) : null}

        {!isLoadingAnimatedCovers && !animatedCoversError && animatedCoverPacks.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-3 max-sm:gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {animatedCoverPacks.map((pack) => {
              const isSelected = selectedAnimatedCoverPack?.slug === pack.slug;
              const previewCover = isSelected ? selectedAnimatedPreviewCover : null;
              return (
                <article
                  key={pack.path}
                  role="button"
                  tabIndex={0}
                  onClick={() => handlePreviewCardActivate(pack)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handlePreviewCardActivate(pack);
                    }
                  }}
                  className={cn(
                    "rounded-2xl border bg-background/85 p-2.5 transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isSelected
                      ? "border-primary/40 shadow-[0_10px_26px_-18px_rgba(37,99,235,0.75)]"
                      : "border-border/55 hover:border-primary/25"
                  )}
                >
                  <div
                    className={cn(
                      "group relative aspect-video overflow-hidden rounded-xl border border-border/45 bg-black/85"
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handlePreviewAreaToggle();
                    }}
                  >
                    {isSelected && previewCover ? (
                      <>
                        <video
                          ref={animatedPreviewVideoRef}
                          key={previewCover.videoURL}
                          src={previewCover.videoURL}
                          poster={previewCover.backgroundURL}
                          muted
                          playsInline
                          className={cn(
                            "h-full w-full",
                            isSelected && selectedAnimatedPreviewCoverLayout && selectedAnimatedPreviewCoverLayout !== 'Wide'
                              ? "object-contain object-center p-3 max-sm:p-2"
                              : "object-cover"
                          )}
                          onPlay={() => setIsAnimatedPreviewPlaying(true)}
                          onPause={() => setIsAnimatedPreviewPlaying(false)}
                          onEnded={() => setIsAnimatedPreviewPlaying(false)}
                        />
                        <button
                          type="button"
                          aria-label="Previous cover"
                          onClick={(event) => {
                            event.stopPropagation();
                            handlePreviewPrevious();
                          }}
                          className="absolute inset-y-0 left-0 z-20 flex w-10 items-center justify-start bg-gradient-to-r from-black/22 to-transparent pl-2 text-white/60 transition-colors hover:text-white/90"
                        >
                          <ChevronLeft className="size-5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Next cover"
                          onClick={(event) => {
                            event.stopPropagation();
                            handlePreviewNext();
                          }}
                          className="absolute inset-y-0 right-0 z-20 flex w-10 items-center justify-end bg-gradient-to-l from-black/22 to-transparent pr-2 text-white/60 transition-colors hover:text-white/90"
                        >
                          <ChevronRight className="size-5" />
                        </button>
                        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/65 to-transparent px-2.5 py-2">
                          <p className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-white/92">
                            {previewCover.title}
                          </p>
                          <p className="text-[10px] font-semibold text-white/72">
                            Cover {animatedPreviewIndex + 1} of {pack.covers.length}
                          </p>
                        </div>
                        <div className={cn(
                          "pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/10 opacity-0 transition-opacity duration-200",
                          !isAnimatedPreviewPlaying ? "group-hover:opacity-100 group-focus-within:opacity-100" : "group-hover:opacity-0"
                        )}>
                          <span className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-black/45 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white">
                            <Play className="size-3.5" />
                            Play
                          </span>
                        </div>
                      </>
                    ) : (
                      <div
                        className="group relative block h-full w-full text-left"
                      >
                        {pack.previewImageUrl ? (
                          <Image
                            src={pack.previewImageUrl}
                            alt={`${pack.title} preview`}
                            fill
                            sizes="(max-width: 640px) 100vw, 33vw"
                            className={cn(
                              "h-full w-full transition-transform duration-300 group-hover:scale-[1.02]",
                              isSelected && selectedAnimatedPreviewCoverLayout && selectedAnimatedPreviewCoverLayout !== 'Wide'
                                ? "object-contain object-center p-3 max-sm:p-2"
                                : "object-cover"
                            )}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
                            No preview image
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/12 opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-black/45 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white">
                            <Play className="size-3.5" />
                            Preview
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-2.5 py-2">
                      <p className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-white/90">
                        {pack.coverCount} Covers
                      </p>
                    </div>
                  </div>

                  <div className="px-1 pb-1 pt-2.5 max-sm:pt-2">
                    <p className="truncate text-sm font-bold text-foreground max-sm:text-[14px]">{pack.title}</p>
                    <p className={cn(
                      "mt-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                      isSelected ? "text-primary/85" : "text-muted-foreground/60"
                    )}>
                      {isSelected ? 'Live Preview Active' : 'Tap Preview To Start'}
                    </p>
                  </div>

                  {isSelected ? (
                    <>
                      <div className="mt-2 overflow-x-auto rounded-xl border border-border/35 bg-background/65 p-2 custom-scrollbar" onClick={(event) => event.stopPropagation()}>
                        <div className="flex min-w-max items-center gap-1.5">
                          {pack.covers.map((cover, index) => (
                            <button
                              key={`${pack.slug}-${cover.id}`}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handlePreviewCoverSelection(index);
                              }}
                              className={cn(
                                "inline-flex h-9 w-fit max-w-[11rem] shrink-0 items-center rounded-lg border px-3 text-left text-[10px] font-semibold transition-colors",
                                index === animatedPreviewIndex
                                  ? "border-primary/45 bg-primary/10 text-primary"
                                  : "border-border/45 bg-background/80 text-foreground/80 hover:border-primary/25 hover:text-primary"
                              )}
                            >
                              <span className="block truncate">{cover.title}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mt-2">
                        <Button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenAnimatedPreviewPackGuide(pack);
                          }}
                          className={cn(editorActionButtonClass, "h-10 w-full rounded-xl px-4 text-[10px] bg-primary/95 text-primary-foreground hover:bg-primary/85")}
                        >
                          <Copy className="mr-1.5 size-3.5" />
                          Install Preview Pack
                        </Button>
                      </div>
                    </>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}

      </section>
    );
  };

  const renderAnimatedInstallDialog = () => {
    if (!activeAnimatedCoverPack) {
      return null;
    }

    const widgetInstall = preparedActiveAnimatedWidgetInstall;
    const matchedCoverBackgroundUrls = activeAnimatedCoverWidgetBlueprint?.matchedCoverBackgroundUrls ?? [];
    const isAnimatedLayoutDetectionReady = matchedCoverBackgroundUrls.length === 0
      || matchedCoverBackgroundUrls.every((url) => Boolean(animatedCoverDetectedLayouts[url]));
    const canShowWidget = Boolean(activeAnimatedCoverWidgetBlueprint && preparedActiveAnimatedWidgetInstall && isAnimatedLayoutDetectionReady);
    const isCopiedCover = copiedAnimatedCoverSlug === activeAnimatedCoverPack.slug;
    const isCopiedWidget = copiedAnimatedCoverWidgetSlug === activeAnimatedCoverPack.slug;
    const removedBecauseNoManifest = widgetInstall?.removedBecauseNoManifest ?? 0;
    const removedBecauseMissingCatalog = widgetInstall?.removedBecauseMissingCatalog ?? 0;
    const hasCatalogWarning = removedBecauseNoManifest > 0 || removedBecauseMissingCatalog > 0;
    const widgetInstallTitles = widgetInstall?.widgetTitles ?? [];
    const widgetInstallName = widgetInstall?.widgetCount === 1
      ? (widgetInstallTitles[0] ?? activeAnimatedCoverPack.title)
      : `${widgetInstall?.widgetCount ?? 0} widgets`;
    const connectAiometadataLabel = isManifestSynced ? 'Refresh AIOMetadata' : 'Connect AIOMetadata';
    const isCopiedWidgetCatalogs = copiedAnimatedCoverCatalogsSlug === activeAnimatedCoverPack.slug;
    const shouldHighlightCatalogNextStep = hasCatalogWarning && widgetCatalogInstallStep === 'connect';
    const widgetCatalogsCopyClass = cn(
      editorActionButtonClass,
      editorFooterPrimaryButtonClass,
      "w-full sm:flex-1 h-11 text-[13px] font-bold uppercase tracking-wider",
      shouldHighlightCatalogNextStep
        ? "border border-zinc-200/70 bg-white/72 text-foreground/80 hover:bg-white/88 hover:border-zinc-300/75 dark:border-white/10 dark:bg-white/[0.045] dark:text-foreground/88 dark:hover:bg-white/[0.07]"
        : "bg-primary/[0.96] text-primary-foreground hover:bg-primary/90"
    );
    const widgetCatalogsNextStepClass = cn(
      editorActionButtonClass,
      "w-full sm:flex-1 h-11 text-[13px] font-bold uppercase tracking-wider",
      shouldHighlightCatalogNextStep
        ? "bg-primary/[0.96] text-primary-foreground hover:bg-primary/90"
        : "border border-zinc-200/70 bg-white/72 text-foreground/80 hover:bg-white/88 hover:border-zinc-300/75 dark:border-white/10 dark:bg-white/[0.045] dark:text-foreground/88 dark:hover:bg-white/[0.07]"
    );

    const coverContent = (
      <div className="mx-auto w-full max-w-[36rem]">
        <div className="space-y-3 text-left">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/75">Install Flow</p>
          <h2 className="text-2xl font-black tracking-tight">Install Animated Cover</h2>
          <p className="text-sm leading-relaxed text-muted-foreground/75">
            Copy the preview pack URL for
            {' '}
            <strong>{activeAnimatedCoverPack.title}</strong>
            {' '}
            and paste it on your <strong>Apple TV</strong>.
          </p>
        </div>

        <div className="mt-4 rounded-[1.5rem] border border-border/60 bg-white/75 p-4 shadow-sm shadow-black/[0.03] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/65">Preview Pack URL</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">
              On your <strong>Apple TV</strong>:
              {' '}
              Fusion
              {' '}
              <code>{'>'}</code>
              {' '}
              Settings
              {' '}
              <code>{'>'}</code>
              {' '}
              Home
              {' '}
              <code>{'>'}</code>
              {' '}
              Preview Packs
              {' '}
              <code>{'>'}</code>
              {' '}
              Add
            </p>
          </div>
          <code className="mt-3 block break-all rounded-2xl border border-border/45 bg-background/85 p-3 text-[11px] leading-relaxed text-foreground/80 dark:border-white/10 dark:bg-zinc-950/70">
            {activeAnimatedCoverPack.rawUrl}
          </code>
          <Button
            type="button"
            onClick={() => void handleCopyAnimatedCoverUrl(activeAnimatedCoverPack)}
            className={cn(editorActionButtonClass, "mt-3 h-10 w-full rounded-xl px-4 text-[10px] bg-primary/95 text-primary-foreground hover:bg-primary/85")}
          >
            {isCopiedCover ? <Check className="mr-1.5 size-3.5" /> : <Copy className="mr-1.5 size-3.5" />}
            {isCopiedCover ? 'Copied URL' : 'Copy Preview Pack URL'}
          </Button>
        </div>

        {animatedInstallStep === 'widget-prompt' ? (
          <div className="mt-4 rounded-[1.5rem] border border-primary/20 bg-primary/5 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/80">Next Step</p>
            <p className="mt-2 text-[12px] leading-relaxed text-foreground/85">
              Preview pack copied. Do you want the widget too?
            </p>
            <div className="mt-3 flex items-center gap-2 max-sm:flex-col max-sm:items-stretch">
              <Button
                type="button"
                onClick={() => setAnimatedInstallStep('widget')}
                className={cn(editorActionButtonClass, "h-10 rounded-xl px-4 text-[10px] bg-primary/95 text-primary-foreground hover:bg-primary/85 max-sm:w-full")}
                disabled={!canShowWidget}
              >
                <FileCode className="mr-1.5 size-3.5" />
                Install Widget
              </Button>
            </div>
          </div>
        ) : null}

      </div>
    );

    const widgetContent = (
      <div className="mx-auto flex w-full max-w-[48rem] flex-1 min-h-0 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar max-sm:pr-0">
          <div className="space-y-3 text-left">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/75">Install Flow</p>
            <h2 className="text-2xl font-black tracking-tight">
              Install
              {' '}
              {widgetInstall?.widgetCount === 1 ? 'Widget' : 'Widgets'}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground/75">
              Install
              {' '}
              <strong>{widgetInstallName}</strong>
              {' '}
              from the current UME snapshot.
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground/65">
              Fusion
              {' '}
              <code>{'>'}</code>
              {' '}
              Widgets
              {' '}
              <code>{'>'}</code>
              {' '}
              Import Widgets
              {' '}
              <code>{'>'}</code>
              {' '}
              Paste
              {' '}
              <code>{'>'}</code>
              {' '}
              Import
            </p>
          </div>

          <div className="mt-4 rounded-[1.5rem] border border-border/60 bg-white/75 p-4 shadow-sm shadow-black/[0.03] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
            <div className={cn(
              "rounded-2xl border p-3",
              hasCatalogWarning
                ? "border-amber-400/35 bg-amber-500/10 text-amber-900 dark:text-amber-200"
                : "border-emerald-400/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
            )}>
              <p className="text-[10px] font-black uppercase tracking-[0.14em]">
                {hasCatalogWarning ? 'Catalogs will be empty' : 'Catalogs ready'}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed">
                {removedBecauseNoManifest > 0
                  ? 'No AIOMetadata manifest is synced yet, so catalogs will be empty.'
                  : removedBecauseMissingCatalog > 0
                    ? `${removedBecauseMissingCatalog} catalog sources are missing from your synced manifest.`
                    : 'Catalog sources are synced and will be included automatically.'}
              </p>
              {hasCatalogWarning ? (
                <div className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-foreground/75 dark:text-foreground/80">
                  <p>1. Copy AIOM Catalogs.</p>
                  <p>2. AIOMetadata: Catalogs &gt; Import Setup &gt; paste &gt; Import &gt; Save.</p>
                  <p>3. {isManifestSynced ? 'Refresh AIOMetadata here.' : 'Connect AIOMetadata here.'}</p>
                </div>
              ) : null}
            </div>
            {hasCatalogWarning ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant={shouldHighlightCatalogNextStep ? "outline" : "default"}
                  onClick={() => void handleCopyAnimatedWidgetCatalogs()}
                  className={widgetCatalogsCopyClass}
                >
                  {isCopiedWidgetCatalogs ? '1. Copied AIOM Catalogs' : '1. Copy AIOM Catalogs'}
                </Button>
                <Button
                  type="button"
                  variant={shouldHighlightCatalogNextStep ? "default" : "outline"}
                  onClick={() => {
                    if (isManifestSynced) {
                      void handleRefreshManifest();
                      return;
                    }
                    onSyncManifest?.();
                  }}
                  className={widgetCatalogsNextStepClass}
                >
                  {`2. ${connectAiometadataLabel}`}
                </Button>
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-[1.5rem] border border-border/60 bg-white/75 p-4 shadow-sm shadow-black/[0.03] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/65">Widget JSON</p>
              <Button
                type="button"
                onClick={() => void handleCopyAnimatedWidgetJson()}
                className={cn(
                  editorActionButtonClass,
                  "hidden h-8 rounded-xl px-3 text-[10px] font-bold uppercase tracking-wider bg-primary/95 text-primary-foreground hover:bg-primary/85 sm:inline-flex"
                )}
              >
                {isCopiedWidget ? <Check className="mr-1.5 size-3.5" /> : <Copy className="mr-1.5 size-3.5" />}
                {isCopiedWidget ? 'Copied Widget JSON' : 'Copy Widget JSON'}
              </Button>
            </div>
            <div className="mt-3 rounded-2xl border border-border/45 bg-zinc-900 p-2">
              <textarea
                readOnly
                value={widgetInstall?.jsonText || ''}
                className="h-[20rem] w-full resize-none border-none bg-transparent font-mono text-[11px] leading-relaxed text-zinc-200 focus-visible:ring-0 max-sm:h-[38dvh]"
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-zinc-200/40 bg-zinc-50/30 px-8 pt-4 pb-8 max-sm:px-6 max-sm:pb-8 dark:border-white/5 dark:bg-zinc-950/10">
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => void handleCopyAnimatedWidgetJson()}
              className={cn(editorActionButtonClass, editorFooterPrimaryButtonClass, "w-full sm:hidden h-11 text-[13px] font-bold uppercase tracking-wider")}
            >
              {isCopiedWidget ? <Check className="mr-2 size-4" /> : <Copy className="mr-2 size-4" />}
              {isCopiedWidget ? 'Copied Widget JSON' : 'Copy Widget JSON'}
            </Button>
          </div>
        </div>
      </div>
    );

    const content = animatedInstallStep === 'widget' ? widgetContent : coverContent;

    if (isMobile) {
      return (
        <Drawer
          open={isAnimatedInstallDialogOpen}
          onOpenChange={(open) => {
            setIsAnimatedInstallDialogOpen(open);
            if (!open) {
              setAnimatedInstallStep('cover');
              setWidgetCatalogInstallStep('copy');
            }
          }}
        >
          <DrawerContent className="max-h-[94dvh] overflow-hidden bg-white dark:bg-zinc-950 border-zinc-200/80 dark:border-white/10 rounded-t-[2.5rem]">
            <DrawerHeader className="sr-only">
              <DrawerTitle>{animatedInstallStep === 'widget' ? 'Install Widget' : 'Install Animated Cover'}</DrawerTitle>
              <DrawerDescription>Install the preview pack cover URL and widget.</DrawerDescription>
            </DrawerHeader>
            <div className="flex h-[87dvh] min-h-0 flex-col px-6 pt-8 pb-0 max-sm:px-5">
              {content}
            </div>
          </DrawerContent>
        </Drawer>
      );
    }

    return (
      <Dialog
        open={isAnimatedInstallDialogOpen}
        onOpenChange={(open) => {
          setIsAnimatedInstallDialogOpen(open);
          if (!open) {
            setAnimatedInstallStep('cover');
            setWidgetCatalogInstallStep('copy');
          }
        }}
      >
        <DialogContent className="max-h-[85vh] flex flex-col overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/95 p-0 backdrop-blur-2xl dark:border-white/12 dark:bg-zinc-950/93 sm:max-w-[48rem]">
          <DialogTitle className="sr-only">{animatedInstallStep === 'widget' ? 'Install Widget' : 'Install Animated Cover'}</DialogTitle>
          <div className="flex min-h-0 flex-1 flex-col p-6 sm:p-8">
            {content}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  const renderRegexPatternsSection = () => {
    return (
      <section ref={regexPatternsSectionRef} className={cn(editorPanelClass, "mt-6 rounded-3xl border-zinc-200/70 bg-zinc-50/55 p-5 dark:border-border/20 dark:bg-zinc-900/50 max-sm:mt-5 max-sm:rounded-[1.5rem] max-sm:p-3.5")}>
        <div className="flex flex-wrap items-start justify-between gap-3 max-sm:gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/75 max-sm:text-[9px]">Regex Patterns</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-foreground max-sm:text-[1.45rem]">Fusion Filter Tags</h2>
          </div>
          <a
            href="https://github.com/nobnobz/Omni-Template-Bot-Bid-Raiser/tree/main/Other"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border/50 bg-background/70 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80 transition-colors hover:border-primary/35 hover:text-primary max-sm:px-2.5 max-sm:text-[9px]"
          >
            Source
            <ExternalLink className="size-3.5" />
          </a>
        </div>

        <div className="mt-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 max-sm:p-3.5">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/80 max-sm:text-[9px]">Install Note</p>
          <p className="mt-2 text-[12px] leading-relaxed text-foreground/85 max-sm:text-[11.5px]">
            1. Pick one variant and copy its URL.
            {' '}
            2. Paste it in
            {' '}
            <code>Fusion {'>'} Settings {'>'} Filters {'>'} Import Filters</code>.
          </p>
        </div>

        {isLoadingRegexPatterns ? (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border/50 bg-background/70 px-4 py-3 text-sm text-muted-foreground/75">
            <Loader2 className="size-4 animate-spin text-primary/80" />
            Loading regex pattern packs...
          </div>
        ) : null}

        {!isLoadingRegexPatterns && regexPatternsError ? (
          <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 p-4">
            <p className="text-sm text-destructive/85">{regexPatternsError}</p>
            <Button
              variant="outline"
              onClick={() => void loadRegexPatternPacks()}
              className={cn(editorActionButtonClass, "mt-3 h-9 rounded-xl border-destructive/25 bg-background/70 px-4 text-[10px] text-destructive hover:bg-destructive/10")}
            >
              Retry
            </Button>
          </div>
        ) : null}

        {!isLoadingRegexPatterns && !regexPatternsError && regexPatternPacks.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-3 max-sm:gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {regexPatternPacks.map((pack) => {
              const isSelected = selectedRegexPatternPack?.slug === pack.slug;
              const isCopied = copiedRegexPatternSlug === pack.slug;
              const previewPageCount = Math.max(1, Math.ceil(pack.filters.length / REGEX_PREVIEW_PAGE_SIZE));
              const previewPageIndex = isSelected ? regexPreviewPageIndex : 0;
              const previewPageFilters = isSelected
                ? selectedRegexPreviewPageFilters
                : pack.filters.slice(0, REGEX_PREVIEW_PAGE_SIZE);
              const canPage = pack.filters.length > REGEX_PREVIEW_PAGE_SIZE;
              const selectPack = () => setSelectedRegexPatternPackSlug(pack.slug);
              const handlePackKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectPack();
                }
              };
            return (
              <article
                key={pack.path}
                className={cn(
                    "overflow-hidden rounded-2xl border bg-background/85 p-2.5 transition-all",
                    isSelected
                      ? "border-primary/40 shadow-[0_10px_26px_-18px_rgba(37,99,235,0.75)]"
                      : "border-border/55 hover:border-primary/25"
                  )}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={selectPack}
                    onKeyDown={handlePackKeyDown}
                    className="w-full text-left outline-none"
                  >
                    <div className="group rounded-xl border border-border/45 bg-muted/30 p-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/80 max-sm:text-[9px]">
                            Preview
                          </p>
                          <div className="rounded-full border border-border/55 bg-background/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                            Page {previewPageIndex + 1} / {previewPageCount}
                          </div>
                        </div>
                      </div>

                      {previewPageFilters.length > 0 ? (
                        <div className="relative">
                          {canPage ? (
                            <>
                              <button
                                type="button"
                                aria-label="Previous preview page"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleRegexPreviewPageForPack(pack, 'previous');
                                }}
                                className={cn(
                                  "absolute left-1 top-1/2 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/55 transition-colors hover:text-primary md:size-7",
                                  isSelected ? "opacity-100" : "opacity-70"
                                )}
                              >
                                <ChevronLeft className="size-4 drop-shadow-sm md:size-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label="Next preview page"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleRegexPreviewPageForPack(pack, 'next');
                                }}
                                className={cn(
                                  "absolute right-1 top-1/2 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/55 transition-colors hover:text-primary md:size-7",
                                  isSelected ? "opacity-100" : "opacity-70"
                                )}
                              >
                                <ChevronRight className="size-4 drop-shadow-sm md:size-3.5" />
                              </button>
                            </>
                          ) : null}
                          <div className="grid grid-cols-3 gap-1.25 px-10 sm:px-11">
                            {previewPageFilters.map((filter) => (
                              <div
                                key={`${pack.slug}-${previewPageIndex}-${filter.id}`}
                                className="inline-flex h-7 w-full items-center justify-center rounded-[0.65rem] px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:h-8 sm:px-2.5"
                                style={buildRegexTagVisualStyle(filter)}
                              >
                                {filter.imageURL ? (
                                  <Image
                                    src={filter.imageURL}
                                    alt={`${filter.name} icon`}
                                    width={18}
                                    height={18}
                                    className="max-h-[0.95rem] w-auto shrink-0 object-contain sm:max-h-[1.05rem]"
                                  />
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex min-h-[3.8rem] items-center justify-center rounded-lg border border-border/45 bg-background/75 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
                          No preview tags
                        </div>
                      )}
                    </div>
                    <div className="px-1 pb-1 pt-2.5 max-sm:pt-2">
                      <p className="truncate text-sm font-bold text-foreground max-sm:text-[14px]">{pack.title}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 px-1 pb-1 max-sm:mt-1.5 max-sm:flex-col max-sm:items-stretch">
                    <Button
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => void handleCopyRegexPatternUrl(pack)}
                      className={cn(
                        editorActionButtonClass,
                        "mt-1 h-10 w-full rounded-xl px-4 text-[10px] max-sm:h-9 max-sm:text-[10.5px]",
                        isSelected
                          ? "bg-primary/95 text-primary-foreground hover:bg-primary/85"
                          : "border-border/60 bg-background/75 text-foreground/80 hover:border-primary/30 hover:text-primary dark:bg-white/[0.04]"
                      )}
                    >
                      {isCopied ? <Check className="mr-1.5 size-3.5" /> : <Copy className="mr-1.5 size-3.5" />}
                      {isCopied ? 'Copied URL' : 'Copy URL'}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    );
  };

  const renderFormatterSection = () => {
    const handleOpenFormatter = () => {
      if (onOpenFormatter) {
        onOpenFormatter();
      }
    };

    return (
      <section
        data-testid="manager-formatter-section"
        role="button"
        tabIndex={0}
        onClick={handleOpenFormatter}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleOpenFormatter();
          }
        }}
        className={cn(
          editorPanelClass,
          "group mt-6 cursor-pointer rounded-3xl border-zinc-200/70 bg-zinc-50/55 p-5 transition-all hover:border-primary/15 hover:bg-white/70 dark:border-border/20 dark:bg-zinc-900/50 max-sm:mt-5 max-sm:rounded-[1.5rem] max-sm:p-3.5"
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 max-sm:gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/75 max-sm:text-[9px]">Formatter</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-foreground max-sm:text-[1.45rem]">UME Formatter for AIOStreams</h2>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 max-sm:p-3.5">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/80 max-sm:text-[9px]">Install Note</p>
          <p className="mt-2 text-[12px] leading-relaxed text-foreground/85 max-sm:text-[11.5px]">
            In AIOStreams, go to Formatter, tap the import icon, and paste the URL there.
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-foreground/85 max-sm:text-[11.5px]">
            In Fusion, go to Settings &gt; Filters &gt; Source Card Fields and disable <strong>Show Title</strong> so you do not see the filename.
          </p>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-border/50 bg-black/90 sm:mx-1 max-sm:mt-3 max-sm:mx-0">
          <div className="relative h-44 bg-black sm:h-52">
            <Image
              src={FormatterPreviewImage}
              alt="AIOS UME Formatter preview"
              fill
              sizes="(max-width: 640px) 100vw, 33vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/5 to-black/20" />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
          <span>Install</span>
          <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
      </section>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-transparent">
      <main className="max-w-5xl mx-auto w-full px-6 max-sm:px-4 py-12 max-sm:py-6 max-sm:pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <div className="flex flex-col gap-3 mb-10 max-sm:hidden text-center sm:text-left">
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
                ? "border border-emerald-200/55 bg-white/80 py-3.5 shadow-sm shadow-emerald-950/[0.03] dark:border-emerald-500/14 dark:bg-zinc-950/35 dark:shadow-none"
                : "border border-amber-200/65 bg-amber-50/50 py-4 dark:border-amber-500/18 dark:bg-amber-500/[0.06]"
            )}
          >
            {isManifestSynced ? (
              <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-stretch">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-emerald-200/55 bg-emerald-100/55 dark:border-emerald-500/14 dark:bg-emerald-500/[0.10]">
                    <span className="size-2 rounded-full bg-emerald-600/80 dark:bg-emerald-300/85" />
                  </div>
                  <p className="truncate text-[11px] font-black uppercase tracking-[0.16em] text-emerald-800/85 dark:text-emerald-200/90 max-sm:text-[10px]">
                    AIOMetadata synced
                  </p>
                </div>

                <div className="flex items-center gap-2 max-sm:grid max-sm:grid-cols-2 max-sm:w-full">
                  <Button
                    onClick={handleRefreshManifest}
                    variant="secondary"
                    disabled={isRefreshingManifest}
                    className={cn(editorActionButtonClass, "group h-9 shrink-0 border border-emerald-300/35 bg-white/70 px-3.5 text-[10px] text-stone-900/68 transition-all duration-300 hover:bg-emerald-50/75 hover:border-emerald-400/45 hover:text-emerald-700 hover:scale-[1.01] active:scale-[0.98] max-sm:w-full dark:border-emerald-500/18 dark:bg-zinc-950/35 dark:text-emerald-300/80 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400")}
                  >
                    <RotateCcw className={cn("size-3.5 mr-2 text-emerald-700/60 transition-colors group-hover:text-emerald-700 dark:text-emerald-400/60 dark:group-hover:text-emerald-400", isRefreshingManifest && "animate-spin")} />
                    Refresh
                  </Button>
                  <Button
                    onClick={onSyncManifest}
                    variant="secondary"
                    data-testid="manifest-settings-button"
                    className={cn(editorActionButtonClass, "group h-9 shrink-0 border border-emerald-200/30 bg-white/70 px-3.5 text-[10px] text-stone-900/68 transition-all duration-300 hover:bg-emerald-50/75 hover:border-emerald-300/45 hover:text-emerald-700 hover:scale-[1.01] active:scale-[0.98] max-sm:w-full dark:border-white/5 dark:bg-zinc-950/35 dark:text-zinc-300/80 dark:hover:bg-zinc-900/80 dark:hover:text-primary")}
                  >
                    <Pencil className="size-3.5 mr-2 text-emerald-700/60 transition-colors group-hover:text-emerald-700 dark:text-zinc-400/60 dark:group-hover:text-primary" />
                    Edit
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-stretch">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl border border-amber-200/60 bg-amber-100/62 p-2 text-amber-700/80 dark:border-amber-500/16 dark:bg-amber-500/12 dark:text-amber-300/85">
                    <AlertTriangle className="size-4" />
                  </div>

                  <div className="min-w-0 max-w-[36rem]">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-stone-900/72 dark:text-amber-100/82">
                      {manifestAutoSyncIssue ? 'AIOMetadata sync alert' : 'AIOMetadata not synced'}
                    </p>
                    <p className="mt-1 text-[13px] font-normal leading-[1.55] text-stone-900/64 dark:text-zinc-300/74 max-sm:text-[12px]">
                      {manifestAutoSyncIssue
                        ? manifestAutoSyncIssue
                        : hasUnsyncedAiometadataSources
                          ? 'Sync your AIOMetadata manifest to replace placeholders and add new catalogs.'
                          : 'Add your AIOMetadata manifest URL for catalog validation and automatic placeholder replacement.'}
                    </p>
                  </div>
                </div>

                <Button
                  onClick={onSyncManifest}
                  variant="secondary"
                  data-testid="manifest-settings-button"
                  className={cn(editorActionButtonClass, "group h-11 shrink-0 border border-amber-300/50 bg-white/60 px-4 text-[10px] text-stone-900/70 transition-all duration-300 hover:bg-amber-50/80 hover:border-amber-400/50 hover:text-amber-700 hover:scale-[1.02] active:scale-[0.98] max-sm:w-full dark:border-amber-500/20 dark:bg-zinc-950/40 dark:text-amber-300/80 dark:hover:bg-amber-500/10 dark:hover:text-amber-400")}
                >
                  <Globe className="size-4 mr-2 text-amber-700/60 transition-colors group-hover:text-amber-700 dark:text-amber-400/60 dark:group-hover:text-amber-400" />
                  Sync Manifest
                </Button>
              </div>
            )}
          </div>

          {hasTrash && (
            <div className="mb-4 flex justify-end pr-2 max-sm:mb-3 max-sm:pr-3">
              <Button
                onClick={() => setShowTrash(true)}
                variant="secondary"
                className={cn(editorActionButtonClass, "h-11 border border-destructive/20 bg-destructive/10 px-4 text-[10px] text-destructive transition-all duration-300 hover:bg-destructive/15 hover:scale-[1.02] active:scale-[0.98] max-sm:h-11 max-sm:w-full max-sm:justify-center dark:border-destructive/25 dark:bg-destructive/12 dark:hover:bg-destructive/16")}
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
                  className="w-full h-11 max-sm:h-10 pl-11 max-sm:pl-9 pr-10 rounded-xl border-none bg-transparent shadow-none focus-visible:ring-0 text-base sm:text-[13px] font-medium tracking-tight placeholder:text-muted-foreground/40"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl hover:bg-muted/50 text-muted-foreground/20 hover:text-muted-foreground transition-all hover:scale-110 active:scale-90"
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
                  className={cn(editorActionButtonClass, "h-11 max-sm:h-11 px-6 max-sm:px-4 text-[10px] bg-primary hover:bg-primary/95 text-primary-foreground flex-1 md:flex-none order-1 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-primary/20")}
                >
                  <Plus className="size-4 mr-2" />
                  <span className="sm:hidden">New</span>
                  <span className="hidden sm:inline">New Widget</span>
                </Button>

                <Button
                  data-testid="merge-import-button"
                  onClick={() => setShowImportMergeDialog(true)}
                  variant="secondary"
                  className={cn(editorActionButtonClass, "h-11 max-sm:h-11 px-6 max-sm:px-4 text-[10px] border border-primary/20 bg-primary/10 text-primary transition-all duration-300 hover:bg-primary/20 hover:scale-[1.02] active:scale-[0.98] order-2 flex-1 md:flex-none dark:border-primary/25 dark:bg-primary/12 dark:hover:bg-primary/18")}
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

        {renderAnimatedCoversSection()}
        {renderRegexPatternsSection()}
        {renderFormatterSection()}

        {filteredWidgets.length === 0 && searchQuery && (
          <div className="py-20 text-center">
            <p className="text-muted-foreground font-medium">No widgets match your search.</p>
          </div>
        )}
      </main>



      {renderAnimatedInstallDialog()}
      {renderExportDialog()}
      <ImportMergeDialog
        open={showImportMergeDialog}
        onOpenChange={setShowImportMergeDialog}
      />

      {renderTrashDialog()}

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
