"use client";

import { CollectionItem, AIOMetadataDataSource } from '@/lib/types/widget';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { useConfig } from '@/context/ConfigContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Trash2,
  GripVertical,
  Plus,
  Image as ImageIcon,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  AlertTriangle,
  ChevronRight,
  Pencil,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemo, useRef, useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DataSourceEditor } from './DataSourceEditor';
import { CatalogCombobox } from './CatalogCombobox';
import { MANIFEST_PLACEHOLDER, resolveFusionCatalogType } from '@/lib/config-utils';
import { countInvalidCatalogsInItem } from '@/lib/catalog-validation';
import { isAIOMetadataDataSource } from '@/lib/widget-domain';
import { TraktSourceCard } from './TraktSourceCard';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { copyTextToClipboard } from '@/lib/browser-transfer';
import {
  editorHeaderIconButtonActiveClass,
  editorHeaderChevronButtonClass,
  editorHeaderIconButtonClass,
  editorHeaderIconButtonDangerClass,
  editorDeleteButtonClass,
} from './editorActionButtonStyles';
import { editorPanelClass } from './editorSurfaceStyles';
import { useMobile } from '@/hooks/use-mobile';

const SKIP_NATIVE_TRAKT_DELETE_WARNING_KEY = 'fusion-widget-manager.skip-native-trakt-delete-warning';

export const CollectionItemEditor = memo(function CollectionItemEditor({
  item,
  onUpdate,
  onDelete,
  isExpanded,
  onToggleExpand
}: {
  item: CollectionItem,
  index: number,
  onUpdate: (updates: Partial<CollectionItem>) => void,
  onDelete: () => void,
  isExpanded: boolean,
  onToggleExpand: () => void
}) {
  const isMobile = useMobile();
  const { manifestCatalogs } = useConfig();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [showNativeTraktDeleteConfirm, setShowNativeTraktDeleteConfirm] = useState(false);
  const [pendingNativeTraktDeleteIndex, setPendingNativeTraktDeleteIndex] = useState<number | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const backgroundImageUrlInputRef = useRef<HTMLInputElement | null>(null);
  const [skipNativeTraktDeleteWarning, setSkipNativeTraktDeleteWarning] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.localStorage.getItem(SKIP_NATIVE_TRAKT_DELETE_WARNING_KEY) === 'true';
  });
  const [rememberNativeTraktDeleteChoice, setRememberNativeTraktDeleteChoice] = useState(false);
  const selectedCatalogIds = useMemo(
    () =>
      item.dataSources
        .filter(isAIOMetadataDataSource)
        .map((ds) => ds.payload.catalogId)
        .filter(Boolean),
    [item.dataSources]
  );

  const invalidCatalogCount = useMemo(
    () => countInvalidCatalogsInItem(item, manifestCatalogs),
    [item, manifestCatalogs]
  );
  const hasInvalidCatalog = invalidCatalogCount > 0;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleAddDataSource = (combinedId: string) => {
    const selected = manifestCatalogs.find(c => `${c.type}::${c.id}` === combinedId);
    if (!selected) return;

    const catalogType = resolveFusionCatalogType(combinedId, selected.displayType || selected.type || 'movie');

    const newDS: AIOMetadataDataSource = {
      sourceType: 'aiometadata',
      kind: 'addonCatalog',
      payload: {
        addonId: MANIFEST_PLACEHOLDER,
        catalogId: combinedId,
        catalogType: catalogType
      }
    };
    onUpdate({
      dataSources: [...item.dataSources, newDS],
    });
  };

  const handleDeleteDataSource = (dsIndex: number) => {
    onUpdate({ dataSources: item.dataSources.filter((_, i) => i !== dsIndex) });
  };

  const handleUpdateDataSource = (dsIndex: number, updates: Partial<AIOMetadataDataSource['payload']>) => {
    const currentDataSource = item.dataSources[dsIndex];
    if (!currentDataSource || !isAIOMetadataDataSource(currentDataSource)) {
      return;
    }

    const nextCatalogId = updates.catalogId?.trim();
    if (
      nextCatalogId &&
      item.dataSources.some(
        (ds, i) => i !== dsIndex && isAIOMetadataDataSource(ds) && ds.payload.catalogId === nextCatalogId
      )
    ) {
      return;
    }

    onUpdate({
      dataSources: item.dataSources.map((ds, i) =>
        i === dsIndex && isAIOMetadataDataSource(ds) ? { ...ds, payload: { ...ds.payload, ...updates } } : ds
      )
    });
  };

  const handleChangeDataSource = (dsIndex: number, combinedId: string) => {
    const selected = manifestCatalogs.find(c => `${c.type}::${c.id}` === combinedId);
    if (!selected) return;

    const catalogType = resolveFusionCatalogType(combinedId, selected.displayType || selected.type || 'movie');

    const newDS: AIOMetadataDataSource = {
      sourceType: 'aiometadata',
      kind: 'addonCatalog',
      payload: {
        addonId: MANIFEST_PLACEHOLDER,
        catalogId: combinedId,
        catalogType: catalogType
      }
    };

    onUpdate({
      dataSources: item.dataSources.map((ds, i) => i === dsIndex ? newDS : ds)
    });
  };

  const canAddAnotherDataSource =
    manifestCatalogs.length === 0 || selectedCatalogIds.length < manifestCatalogs.length;
  const itemDisplayName = item.name || "Untitled Item";

  const handleClearBackgroundImageUrl = () => {
    onUpdate({ backgroundImageURL: '' });

    requestAnimationFrame(() => {
      backgroundImageUrlInputRef.current?.focus();
    });
  };

  const handleTitleSubmit = () => {
    if (editName.trim() && editName !== item.name) {
      onUpdate({ name: editName.trim() });
    }
    setIsEditing(false);
  };

  const cancelTitleEditing = () => {
    setEditName(item.name);
    setIsEditing(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleTitleSubmit();
    }

    if (e.key === 'Escape') {
      cancelTitleEditing();
    }
  };

  const handleCopy = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!item.backgroundImageURL) return;

    try {
      await copyTextToClipboard(item.backgroundImageURL);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      setIsCopied(false);
    }
  };

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(item.name);
    setIsEditing(true);
  };

  const handleDeleteNativeTraktDataSource = (dsIndex: number) => {
    if (skipNativeTraktDeleteWarning) {
      handleDeleteDataSource(dsIndex);
      return;
    }

    setPendingNativeTraktDeleteIndex(dsIndex);
    setRememberNativeTraktDeleteChoice(false);
    setShowNativeTraktDeleteConfirm(true);
  };

  const handleNativeTraktDeleteDialogChange = (isOpen: boolean) => {
    setShowNativeTraktDeleteConfirm(isOpen);

    if (!isOpen) {
      setPendingNativeTraktDeleteIndex(null);
      setRememberNativeTraktDeleteChoice(false);
    }
  };

  const catalogsSectionContent = (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-0.5">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/42 flex items-center h-8">
          Catalogs
        </div>
        <CatalogCombobox
          options={manifestCatalogs}
          value=""
          disabledValues={selectedCatalogIds}
          onChange={handleAddDataSource}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="group h-8 px-4 rounded-full border border-primary/20 bg-primary/10 text-[10px] font-black uppercase tracking-[0.16em] text-primary transition-all duration-300 hover:bg-primary/[0.18] hover:text-primary hover:scale-[1.02] active:scale-[0.98] dark:border-primary/25 dark:bg-primary/12 dark:hover:bg-primary/[0.18]"
              disabled={!canAddAnotherDataSource}
            >
              <Plus className="size-3.5 mr-1.5 transition-colors group-hover:text-primary" /> Add Catalog
            </Button>
          }
        />
      </div>
      <div className="space-y-1.5">
        {item.dataSources.map((ds, dsIndex) => (
          isAIOMetadataDataSource(ds) ? (
            <DataSourceEditor
              key={dsIndex}
              dataSource={ds}
              disabledCatalogIds={item.dataSources
                .filter((_, index) => index !== dsIndex)
                .filter(isAIOMetadataDataSource)
                .map((source) => source.payload.catalogId)
                .filter(Boolean)}
              onUpdate={(updates) => handleUpdateDataSource(dsIndex, updates)}
              onDelete={() => handleDeleteDataSource(dsIndex)}
            />
          ) : (
            <CatalogCombobox
              key={dsIndex}
              options={manifestCatalogs}
              value=""
              disabledValues={selectedCatalogIds}
              onChange={(combinedId) => handleChangeDataSource(dsIndex, combinedId)}
              trigger={
                <div className="group/trakt cursor-pointer outline-none">
                  <TraktSourceCard
                    dataSource={ds}
                    compact
                    onDelete={() => handleDeleteNativeTraktDataSource(dsIndex)}
                  />
                </div>
              }
            />
          )
        ))}
        {item.dataSources.length === 0 && (
          <div className="flex items-center justify-center py-6 border border-dashed border-zinc-200/60 dark:border-white/10 rounded-2xl bg-zinc-100/30 dark:bg-zinc-950/20">
            <p className="text-[10px] font-black text-muted-foreground/25 uppercase tracking-[0.2em]">No catalogs configured</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div ref={setNodeRef} style={style} className={cn(isDragging && "z-50")}>
        <Card className={cn(
          editorPanelClass,
          "group bg-background/40 dark:bg-white/[0.02] dark:border-white/5 dark:shadow-none max-sm:rounded-[1.15rem] overflow-hidden transition-[border,box-shadow,transform,opacity] duration-300",
          !isExpanded && "hover:bg-background/60 dark:hover:bg-white/[0.05] hover:border-primary/30"
        )}>
          <div className="flex-1 flex flex-col min-w-0">
            {/* Desktop Header */}
            <div
              className="hidden sm:flex items-center justify-between p-2.5 border-b border-border/40 bg-primary/[0.01] cursor-pointer"
              onClick={onToggleExpand}
              data-testid="item-editor-header"
            >
              <div className="flex-1 flex items-center gap-3 min-w-0">
                <div
                  {...attributes}
                  {...listeners}
                  className="h-8 w-8 flex items-center justify-center rounded-xl bg-muted/20 text-muted-foreground/30 active:bg-primary/10 active:text-primary transition-all shrink-0 cursor-grab active:cursor-grabbing grow-0 touch-none select-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="size-4" />
                </div>
                <div className="flex items-center gap-2 pt-0.5 min-w-0 flex-1">
                  {hasInvalidCatalog && (
                    <AlertTriangle className="size-4 text-amber-500 animate-pulse shrink-0 self-center" />
                  )}
                  <span className="flex-1 min-w-0 truncate text-sm font-bold tracking-tight text-foreground/80 leading-tight">
                    {itemDisplayName}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "size-9 shrink-0",
                    editorHeaderIconButtonClass,
                    editorHeaderChevronButtonClass,
                    isExpanded && `rotate-90 ${editorHeaderIconButtonActiveClass}`
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpand();
                  }}
                  title={isExpanded ? "Collapse item" : "Expand item"}
                >
                  <ChevronRight className="size-4" />
                </Button>

                <div className="w-px h-4 bg-border/40 mx-1.5 shrink-0" />

                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("size-9", editorHeaderIconButtonClass, editorHeaderIconButtonDangerClass)}
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  title="Delete Item"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>

            {/* Mobile Header */}
            <div
              className="sm:hidden border-b border-border/40 bg-primary/[0.01] px-2.5 py-2"
              onClick={onToggleExpand}
              data-testid="item-editor-header-mobile"
            >
              <div className="flex items-start gap-2">
                <div
                  {...attributes}
                  {...listeners}
                  className="mt-0.5 flex size-[2.125rem] items-center justify-center rounded-xl border border-transparent bg-background/30 text-muted-foreground/34 transition-all cursor-grab active:cursor-grabbing shrink-0 touch-none select-none hover:border-primary/10 hover:text-primary hover:bg-primary/[0.08]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="size-3.5" />
                </div>

                <div className="mt-1.5 h-6 w-px shrink-0 bg-border/40" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 pt-0.5 min-w-0 flex-1">
                    {hasInvalidCatalog && (
                      <AlertTriangle className="size-4 text-amber-500 animate-pulse shrink-0 self-center" />
                    )}

                    <span className="flex-1 min-w-0 truncate text-sm font-bold tracking-tight text-foreground/80 leading-tight">
                      {itemDisplayName}
                    </span>

                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "size-9",
                        editorHeaderIconButtonClass,
                        editorHeaderChevronButtonClass,
                        isExpanded && `rotate-90 ${editorHeaderIconButtonActiveClass}`
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleExpand();
                      }}
                      title={isExpanded ? "Collapse Item" : "Expand Item"}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "size-9",
                        editorHeaderIconButtonClass,
                        editorHeaderIconButtonDangerClass
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                      }}
                      title="Delete Item"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  layout
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="p-4 max-sm:p-3 flex flex-col bg-white dark:bg-black/20 border-t border-border">
                    <div className="flex items-center justify-between gap-4 px-3.5 py-2.5 mb-6 max-sm:mb-4 bg-zinc-500/[0.04] dark:bg-white/[0.02] rounded-xl border border-zinc-200/30 dark:border-white/5 backdrop-blur-sm transition-all duration-300">
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <Input
                            autoFocus={!isMobile}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={handleTitleSubmit}
                            onKeyDown={handleTitleKeyDown}
                            className="h-9 w-full rounded-xl border-zinc-200/80 bg-white/70 px-3 text-base sm:text-sm font-bold tracking-tight text-foreground focus:border-primary/40 focus-visible:ring-0 dark:border-white/10 dark:bg-zinc-900/40"
                          />
                        ) : (
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate text-base sm:text-sm font-bold tracking-tight text-foreground/90 leading-tight">
                              {itemDisplayName}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 shrink-0 text-muted-foreground/35 hover:text-primary hover:bg-primary/5 transition-colors rounded-lg"
                              onClick={startEditing}
                              title="Rename item"
                            >
                              <Pencil className="size-3" />
                            </Button>
                            {item.hideTitle && (
                              <span className="h-4.5 px-1.5 rounded-md bg-zinc-500/[0.08] text-[8px] font-black tracking-[0.14em] uppercase text-zinc-500/70 border border-zinc-500/[0.08] dark:bg-zinc-500/10 dark:text-zinc-500/80 dark:border-zinc-500/10 transition-colors shrink-0 flex items-center justify-center">
                                Hidden
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/35 flex items-center select-none">
                          Hide
                        </div>

                        <button
                          type="button"
                          role="switch"
                          aria-label="Hide item title"
                          aria-checked={item.hideTitle}
                          onClick={() => onUpdate({ hideTitle: !item.hideTitle })}
                          className={cn(
                            "relative inline-flex h-4.5 w-8.5 shrink-0 items-center rounded-full border p-0.5 transition-all outline-none",
                            item.hideTitle
                              ? "border-primary/20 bg-primary text-white"
                              : "border-zinc-200/85 bg-zinc-200/60 dark:border-white/10 dark:bg-white/10"
                          )}
                        >
                          <span
                            className={cn(
                              "size-3 rounded-full bg-white shadow-sm transition-transform",
                              item.hideTitle ? "translate-x-3.5" : "translate-x-0"
                            )}
                          />
                        </button>
                      </div>
                    </div>

                    <div className="lg:grid lg:grid-cols-[1fr_1.2fr] lg:gap-6 p-4 max-sm:p-3 bg-zinc-50/50 dark:bg-white/[0.02] rounded-2xl border border-zinc-200/80 dark:border-white/5 backdrop-blur-sm">
                      {/* Right Column: Visuals */}
                      <motion.div
                        layout
                        className="flex flex-col gap-4 max-sm:gap-3.5 max-lg:mt-4 max-lg:pt-4 max-sm:mt-3.5 max-sm:pt-3.5 max-lg:border-t max-lg:border-zinc-100 max-lg:dark:border-white/5 lg:min-w-[380px]"
                      >
                        <div className="flex flex-col gap-2.5">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/42 flex items-center h-8 px-0.5">
                            Image URL
                          </div>
                          <div className="flex items-center gap-1.5 w-full">
                            {item.backgroundImageURL ? (
                              <div className="flex items-center gap-1.5 w-full">
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onMouseDown={(event) => { void handleCopy(event); }}
                                  className={cn(
                                    "flex min-w-0 flex-1 items-center rounded-xl border px-3.5 h-11 transition-all active:scale-[0.98] cursor-pointer select-none shadow-sm",
                                    isCopied
                                      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 shadow-sm"
                                      : "border-zinc-200/80 bg-white/70 text-foreground/80 hover:border-primary/30 hover:bg-white dark:border-white/10 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/60 shadow-sm"
                                  )}
                                >
                                  <div className="flex w-full min-w-0 items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                      <span className="truncate text-[12px] font-bold tracking-tight text-foreground/70">
                                        {isCopied ? "Link Copied!" : item.backgroundImageURL}
                                      </span>
                                    </div>
                                    {isCopied ? <Check className="size-4 shrink-0" /> : <Copy className="size-3.5 shrink-0 opacity-30" />}
                                  </div>
                                </div>

                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(editorDeleteButtonClass)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleClearBackgroundImageUrl();
                                    }}
                                    title="Clear URL"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                              </div>
                            ) : (
                              <div className="group/url-input flex h-11 min-w-0 flex-1 items-center gap-3 rounded-xl border border-zinc-200/80 bg-white/70 px-4 transition-all focus-within:border-primary/40 focus-within:bg-white dark:border-white/10 dark:bg-zinc-900/40 dark:focus-within:bg-zinc-900/60 shadow-sm">
                                <ImageIcon className="size-4 text-muted-foreground/30 group-focus-within/url-input:text-primary transition-colors" />
                                  <input
                                    autoFocus={!isMobile}
                                    ref={backgroundImageUrlInputRef}
                                    placeholder="Paste Image URL..."
                                    className="h-full min-w-0 flex-1 bg-transparent border-none text-base sm:text-[12px] font-bold tracking-tight text-foreground/80 placeholder:text-muted-foreground/30 focus:outline-none focus:ring-0"
                                    value={item.backgroundImageURL || ''}
                                    onChange={(e) => onUpdate({ backgroundImageURL: e.target.value })}
                                  />
                                </div>
                            )}
                          </div>
                        </div>

                        {/* Combined Visuals & Layout Selector Row */}
                        <motion.div
                          layout
                          className="flex flex-col sm:flex-row items-center justify-center gap-5 sm:gap-7 w-full"
                        >
                          {/* Left/Top: Preview Area */}
                          <motion.div
                            layout
                            className="flex-1 flex flex-col items-center justify-center min-h-[180px] sm:min-h-[220px] relative w-full"
                          >
                            <motion.div
                              layout
                              transition={{
                                layout: { type: "spring", stiffness: 300, damping: 30, restDelta: 0.01 },
                                opacity: { duration: 0.2 }
                              }}
                              className={cn(
                                "rounded-xl border border-zinc-200/60 bg-white/40 dark:border-white/8 dark:bg-zinc-950/45 flex items-center justify-center relative overflow-hidden shadow-sm max-w-full",
                                item.layout === 'Poster' ? "aspect-[2/3] h-52 max-sm:h-44" :
                                  item.layout === 'Wide' ? "aspect-video w-64 max-sm:w-[min(100%,240px)]" :
                                    "aspect-square w-44 max-sm:w-40"
                              )}>

                              {item.backgroundImageURL ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={item.backgroundImageURL}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ImageIcon className="size-6 text-muted-foreground/10" />
                              )}
                            </motion.div>
                          </motion.div>

                          {/* Right/Bottom: Horizontal/Vertical Segmented Layout Selector */}
                          <motion.div
                            layout
                            className="flex flex-row sm:flex-col gap-1 p-1 rounded-2xl border border-zinc-200/50 bg-white/40 dark:border-white/5 dark:bg-zinc-950/45 shrink-0 self-center backdrop-blur-sm shadow-sm"
                          >
                            {[
                              { id: 'Wide', label: 'Wide', icon: RectangleHorizontal },
                              { id: 'Poster', label: 'Poster', icon: RectangleVertical },
                              { id: 'Square', label: 'Square', icon: Square }
                            ].map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => onUpdate({ layout: opt.id as CollectionItem['layout'] })}
                                className={cn(
                                  "flex flex-col items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 sm:px-3 sm:py-3 min-w-[72px] sm:min-w-[68px] transition-all duration-300 select-none active:scale-[0.96] group/layout relative",
                                  item.layout === opt.id
                                    ? "bg-white dark:bg-white/[0.08] text-primary shadow-sm ring-1 ring-zinc-950/5 dark:ring-white/10"
                                    : "text-muted-foreground/35 hover:text-foreground/60 hover:bg-white/40 dark:hover:bg-white/5"
                                )}
                              >
                                <opt.icon className={cn(
                                  "size-4 transition-colors",
                                  item.layout === opt.id ? "text-primary/80" : "text-muted-foreground/30 group-hover/layout:text-foreground/40"
                                )} />
                                <span className={cn(
                                  "text-[9px] font-bold uppercase tracking-[0.14em] transition-colors",
                                  item.layout === opt.id ? "text-primary/90" : "text-muted-foreground/45 group-hover/layout:text-foreground/50"
                                )}>
                                  {opt.label}
                                </span>
                              </button>
                            ))}
                          </motion.div>
                        </motion.div>
                      </motion.div>

                      {/* Left Column: Config */}
                      <div className="flex flex-col gap-4 max-sm:gap-3 lg:border-l lg:border-zinc-200/40 lg:dark:border-white/5 lg:pl-6">
                        {/* Catalogs Section: Left Column on Desktop */}
                        <div className="hidden lg:block">
                          {catalogsSectionContent}
                        </div>

                        {/* Catalogs Section: Bottom on Mobile */}
                        <div className="lg:hidden">
                          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-white/5">
                            {catalogsSectionContent}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Card>
      </div>

      <ConfirmationDialog
        isOpen={showNativeTraktDeleteConfirm}
        onOpenChange={handleNativeTraktDeleteDialogChange}
        title="Delete native Trakt catalog?"
        description="Native Trakt catalogs can only be added again in Fusion."
        details={(
          <div>
            <label className="flex items-center gap-3 px-1 py-1">
              <input
                type="checkbox"
                className="size-4 rounded border-border/60"
                checked={rememberNativeTraktDeleteChoice}
                onChange={(event) => setRememberNativeTraktDeleteChoice(event.target.checked)}
              />
              <p className="min-w-0 text-sm font-semibold text-foreground/72">
                Don&apos;t show again
              </p>
            </label>
          </div>
        )}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          if (rememberNativeTraktDeleteChoice && typeof window !== 'undefined') {
            window.localStorage.setItem(SKIP_NATIVE_TRAKT_DELETE_WARNING_KEY, 'true');
            setSkipNativeTraktDeleteWarning(true);
          }

          if (pendingNativeTraktDeleteIndex !== null) {
            handleDeleteDataSource(pendingNativeTraktDeleteIndex);
          }

          setPendingNativeTraktDeleteIndex(null);
          setRememberNativeTraktDeleteChoice(false);
        }}
      />
    </>
  );
});
