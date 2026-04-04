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
  Layers, 
  RectangleHorizontal,
  RectangleVertical,
  Square,
  AlertTriangle,
  ChevronRight,
  Pencil,
  Copy,
  Check,
  Settings2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemo, useRef, useState } from 'react';
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
} from './editorActionButtonStyles';
import { editorActionButtonClass, editorPanelClass } from './editorSurfaceStyles';

const SKIP_NATIVE_TRAKT_DELETE_WARNING_KEY = 'fusion-widget-manager.skip-native-trakt-delete-warning';

export function CollectionItemEditor({ 
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

  return (
    <>
      <div ref={setNodeRef} style={style} className={cn(isDragging && "z-50")}>
        <Card className={cn(
          editorPanelClass,
          "group bg-background/40 dark:bg-white/[0.02] dark:border-white/5 dark:shadow-none max-sm:rounded-[1.15rem] overflow-hidden transition-[border,box-shadow,transform,opacity] duration-300",
          !isExpanded && "hover:bg-background/60 dark:hover:bg-white/[0.05] hover:border-primary/30"
        )}>
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
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

              <div className="h-6 w-px bg-border/40 shrink-0 mx-2" />

              <div className="flex-1 min-w-0 flex items-center gap-2">
                {hasInvalidCatalog && (
                  <AlertTriangle className="size-3.5 text-amber-500 animate-pulse shrink-0" />
                )}
                
                <div 
                  className="min-w-0 group/title flex-1 flex items-center gap-2"
                >
                  {isEditing ? (
                    <Input 
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={handleTitleSubmit}
                      onKeyDown={handleTitleKeyDown}
                      className="h-6 py-0 px-2 text-base sm:text-xs font-bold tracking-tight bg-background border-primary/30 focus:border-primary/50 focus-visible:ring-0 rounded-md w-full max-w-[200px]"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div 
                      className="flex items-center gap-2 group/text overflow-hidden"
                    >
                      <span className="text-sm font-bold tracking-tight text-foreground/90 truncate">
                        {itemDisplayName}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 self-center">
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn("size-9", editorHeaderIconButtonClass)}
                onClick={(e) => {
                  e.stopPropagation();
                  startEditing(e);
                }}
                title="Rename item"
              >
                <Pencil className="size-3.5" />
              </Button>

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
                <div className="flex items-center gap-2 pt-0.5">
                  {hasInvalidCatalog && (
                    <AlertTriangle className="size-4 text-amber-500 animate-pulse shrink-0 self-center" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex w-full items-center justify-between gap-2.5 overflow-hidden text-left">
                      <span className="truncate text-[15px] font-bold tracking-tight text-foreground/92 leading-tight">
                        {itemDisplayName}
                      </span>
                    </div>
                  </div>

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
                <div className="p-4 max-sm:p-3 flex flex-col gap-6 max-sm:gap-4 bg-white dark:bg-black/20 border-t border-border">
                  {/* Configuration Area */}
                  <div className="space-y-6 max-sm:space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2.5 max-sm:space-y-2">
                          <div className="text-xs max-sm:text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 ml-1 flex items-center gap-1.5">
                            <Settings2 className="size-3" />
                            Configuration & Preview
                          </div>
                        <div className="flex flex-col gap-5 max-sm:gap-4 lg:gap-4 p-5 max-sm:p-3.5 lg:py-4 bg-white dark:bg-muted/10 rounded-2xl max-sm:rounded-[1.15rem] border border-zinc-200 dark:border-border/40 backdrop-blur-sm">
                          <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50/72 dark:border-white/8 dark:bg-white/[0.035]">
                            <div className="flex items-center gap-3 px-3.5 py-3">
                              <div className="min-w-0 flex-1">
                                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/58">
                                  Item Title
                                </div>
                                {isEditing ? (
                                  <Input
                                    autoFocus
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onBlur={handleTitleSubmit}
                                    onKeyDown={handleTitleKeyDown}
                                    className="mt-1.5 h-9 w-full rounded-xl border-zinc-200/80 bg-white/80 px-3 text-base sm:text-sm font-bold tracking-tight text-foreground/88 focus:border-primary/40 focus-visible:ring-0 dark:border-white/10 dark:bg-zinc-950/45"
                                  />
                                ) : (
                                  <div className="mt-1 truncate text-[15px] font-bold tracking-tight text-foreground/88">
                                    {itemDisplayName}
                                  </div>
                                )}
                              </div>

                              {!isEditing ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={cn("size-9 shrink-0", editorHeaderIconButtonClass)}
                                  onClick={startEditing}
                                  title="Rename item"
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                              ) : null}
                            </div>

                            <div className="flex items-center justify-between gap-3 border-t border-zinc-200/70 px-3.5 py-3 dark:border-white/8">
                              <div className="min-w-0 text-[13px] font-medium tracking-tight text-muted-foreground/68">
                                Hide title in Fusion
                              </div>

                              <button
                                type="button"
                                role="switch"
                                aria-checked={item.hideTitle}
                                aria-label="Hide item title"
                                onClick={() => onUpdate({ hideTitle: !item.hideTitle })}
                                className={cn(
                                  "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-0.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
                                  item.hideTitle
                                    ? "border-primary/20 bg-primary text-primary dark:border-primary/30"
                                    : "border-zinc-200/85 bg-white hover:border-primary/16 dark:border-white/10 dark:bg-zinc-950/55"
                                )}
                                title={item.hideTitle ? "Show title" : "Hide title"}
                              >
                                <span
                                  className={cn(
                                    "size-5 rounded-full bg-white shadow-sm transition-transform",
                                    item.hideTitle ? "translate-x-5" : "translate-x-0"
                                  )}
                                />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-center">
                            <div className="flex w-full max-w-[18rem] flex-col items-center">
                              <div className={cn(
                                "rounded-[1.35rem] border border-zinc-200/70 bg-zinc-50/70 dark:border-white/8 dark:bg-zinc-950/65 flex items-center justify-center relative overflow-hidden shrink-0 transition-all duration-500 shadow-inner shadow-black/[0.03]",
                                item.layout === 'Poster' ? "aspect-[2/3] w-[11rem] sm:w-28 lg:w-36" :
                                item.layout === 'Wide' ? "aspect-video w-full max-w-[18rem] sm:max-w-[10rem] lg:max-w-[13rem]" :
                                "aspect-square w-[12rem] sm:w-28 lg:w-36"
                                )}>
                                {item.hideTitle && (
                                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
                                    <div className="rounded-full bg-black/60 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white shadow-lg ring-1 ring-white/20">
                                      Title Hidden
                                    </div>
                                  </div>
                                )}
                                {item.backgroundImageURL ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img 
                                    src={item.backgroundImageURL} 
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <ImageIcon className="size-8 text-muted-foreground/14" />
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex-1 flex flex-col gap-3.5 lg:gap-3 w-full min-w-0">
                            <div className="flex items-center justify-center">
                              <div className="grid w-full grid-cols-3 gap-1 rounded-2xl border border-zinc-200/80 bg-zinc-100/75 p-1 dark:border-white/8 dark:bg-white/[0.04] sm:w-auto">
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
                                      "flex min-h-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] transition-all sm:min-w-[86px] sm:flex-row sm:gap-2 sm:px-3.5 sm:py-2",
                                      item.layout === opt.id 
                                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                                        : "text-muted-foreground/66 hover:bg-background/45 hover:text-foreground"
                                    )}
                                  >
                                    <opt.icon className="size-3.5" />
                                    <span className="leading-none">{opt.label}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
 
                            <div className="relative group/url w-full">
                              {item.backgroundImageURL ? (
                                <div className="flex items-center gap-1.5 w-full">
                                  <div 
                                    role="button"
                                    tabIndex={0}
                                    onMouseDown={(event) => { void handleCopy(event); }}
                                    className={cn(
                                      "flex min-w-0 flex-1 items-center rounded-2xl border px-4 h-11 sm:h-10 transition-all active:scale-[0.98] cursor-pointer select-none animate-in fade-in duration-300",
                                      isCopied 
                                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                                        : "border-zinc-200/80 bg-zinc-100/88 text-foreground/80 hover:border-primary/30 hover:bg-primary/[0.07] dark:border-white/8 dark:bg-white/[0.045]"
                                    )}
                                  >
                                    <div className="flex w-full min-w-0 items-center justify-between gap-3">
                                      <div className="flex min-w-0 items-center gap-3">
                                        <ImageIcon 
                                          className={cn(
                                            "size-4 shrink-0 transition-colors",
                                            isCopied ? "text-emerald-600 dark:text-emerald-400" : "text-primary/70"
                                          )} 
                                          strokeWidth={2.25} 
                                        />
                                        <span className="truncate text-[11.5px] font-medium tracking-tight sm:text-[11px]">
                                          {isCopied ? "Link Copied!" : item.backgroundImageURL}
                                        </span>
                                      </div>
                                      {isCopied ? <Check className="size-3.5 shrink-0" /> : <Copy className="size-3.5 shrink-0 opacity-45" />}
                                    </div>
                                  </div>

                                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-100/88 dark:border-white/8 dark:bg-white/[0.045] sm:size-10">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-9 rounded-xl text-destructive/55 transition-all hover:bg-destructive/8 hover:text-destructive hover:border-destructive/20 dark:text-destructive/75 dark:hover:bg-destructive/12 sm:size-8"
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        handleClearBackgroundImageUrl(); 
                                      }}
                                      title="Clear URL"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 w-full">
                                  <div className="group/url-input flex h-11 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-zinc-200/80 bg-zinc-100/88 px-4 transition-all focus-within:border-primary/45 backdrop-blur-sm dark:border-white/8 dark:bg-white/[0.045] sm:h-10">
                                    <ImageIcon className="size-4 shrink-0 text-muted-foreground/52 transition-colors group-focus-within/url-input:text-foreground/76" strokeWidth={2.25} />
                                    <input 
                                      autoFocus
                                      ref={backgroundImageUrlInputRef}
                                      placeholder="Paste Image URL (https://...)" 
                                      className="h-full min-w-0 flex-1 bg-transparent border-none text-base font-bold text-foreground/82 placeholder:text-muted-foreground/36 focus:outline-none focus:ring-0 sm:text-[11px]"
                                      value={item.backgroundImageURL || ''}
                                      onChange={(e) => onUpdate({ backgroundImageURL: e.target.value })}
                                    />
                                  </div>

                                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-100/88 dark:border-white/8 dark:bg-white/[0.045] sm:size-10">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-9 rounded-xl text-destructive/55 transition-all hover:bg-destructive/8 hover:text-destructive hover:border-destructive/20 dark:text-destructive/75 dark:hover:bg-destructive/12 sm:size-8"
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        handleClearBackgroundImageUrl(); 
                                      }}
                                      title="Clear URL"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
 
                    <div className="space-y-2">
                      <div className="flex items-center justify-between max-sm:gap-3">
                        <div className="text-xs max-sm:text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 ml-1 flex items-center gap-1.5">
                          <Layers className="size-3" /> Data Sources
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
                              className={cn(editorActionButtonClass, "h-9 px-2.5 text-[10px] gap-1 border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 dark:bg-zinc-900/40 dark:text-muted-foreground/60 dark:hover:text-primary dark:hover:bg-primary/5 dark:hover:border-primary/20 backdrop-blur-sm")}
                              disabled={!canAddAnotherDataSource}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Plus className="size-2.5" /> New
                            </Button>
                          }
                        />
                      </div>
                      <div className="p-4 max-sm:p-3 bg-white dark:bg-muted/10 rounded-2xl max-sm:rounded-[1.15rem] border border-zinc-200 dark:border-border/40  backdrop-blur-sm space-y-2">
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
                            <TraktSourceCard
                              key={dsIndex}
                              dataSource={ds}
                              compact
                              onDelete={() => handleDeleteNativeTraktDataSource(dsIndex)}
                            />
                          )
                        ))}
                        {item.dataSources.length === 0 && (
                          <div className="flex items-center justify-center py-8 border border-dashed border-border/20 rounded-2xl bg-muted/5">
                            <p className="text-[10px] text-muted-foreground/30 font-bold uppercase tracking-widest">No catalogs added</p>
                          </div>
                        )}
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
}
