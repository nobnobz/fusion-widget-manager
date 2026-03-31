"use client";

import { CollectionItem, AIOMetadataDataSource } from '@/lib/types/widget';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { useConfig } from '@/context/ConfigContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { 
  Trash2, 
  GripVertical, 
  Plus, 
  Eye, 
  EyeOff, 
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
import { countInvalidCatalogsInItem, countTraktWarningsInItem } from '@/lib/catalog-validation';
import { isAIOMetadataDataSource, isNativeTraktDataSource } from '@/lib/widget-domain';
import { TraktSourceCard } from './TraktSourceCard';
import { Badge } from '@/components/ui/badge';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';

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
  const traktWarningCount = useMemo(() => countTraktWarningsInItem(item), [item]);
  const hasTraktWarnings = traktWarningCount > 0;
  const hasNativeTraktSource = useMemo(
    () => item.dataSources.some(isNativeTraktDataSource),
    [item.dataSources]
  );

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

  const handleCopy = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!item.backgroundImageURL) return;

    navigator.clipboard.writeText(item.backgroundImageURL);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
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
          "group bg-background/40 dark:bg-white/[0.02] border border-zinc-200/80 dark:border-white/5 dark:shadow-none rounded-xl overflow-hidden transition-[border,box-shadow,transform,opacity] duration-300",
          !isExpanded && "hover:bg-background/60 dark:hover:bg-white/[0.05] hover:border-primary/30"
        )}>
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div 
            className="hidden sm:flex items-center justify-between p-2.5 border-b border-border/40 bg-primary/[0.01] cursor-pointer"
            onClick={onToggleExpand}
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
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleTitleSubmit();
                        if (e.key === 'Escape') {
                          setEditName(item.name);
                          setIsEditing(false);
                        }
                      }}
                      className="h-6 py-0 px-2 text-base sm:text-xs font-bold tracking-tight bg-background border-primary/30 focus:border-primary/50 focus-visible:ring-0 rounded-md w-full max-w-[200px]"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div 
                      className="flex items-center gap-2 group/text overflow-hidden"
                    >
                      <span className="text-sm font-bold tracking-tight text-foreground/90 truncate">
                        {item.name || "Untitled Item"}
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
                className="size-9 rounded-xl border border-border/40 bg-background/60 text-muted-foreground/60  transition-all hover:border-primary/20 hover:bg-primary/5 hover:text-primary dark:border-white/5 dark:bg-zinc-950/40"
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
                  "size-9 rounded-xl border border-border/40 bg-background/60 transition-all  shrink-0 hover:border-primary/20 hover:bg-primary/5 hover:text-primary dark:border-white/5 dark:bg-zinc-950/40",
                  isExpanded ? "rotate-90 bg-primary/10 text-primary border-primary/20 dark:bg-primary/12" : "text-muted-foreground/60"
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
                className={cn(
                  "size-9 rounded-xl border border-border/40 bg-background/60 transition-all hover:bg-primary/5 hover:border-primary/20 hover:text-primary dark:border-white/5 dark:bg-zinc-950/40",
                  item.hideTitle ? "text-muted-foreground/50" : "text-primary bg-primary/5 border-primary/20 dark:bg-primary/12 dark:border-primary/25"
                )}
                onClick={(e) => {
                   e.stopPropagation();
                   onUpdate({ hideTitle: !item.hideTitle });
                }}
                title={item.hideTitle ? "Show Title" : "Hide Title"}
              >
                  {item.hideTitle ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="size-9 rounded-xl border border-border/40 bg-background/60 text-destructive/55  transition-all hover:border-destructive/20 hover:text-destructive hover:bg-destructive/10 dark:border-white/5 dark:bg-zinc-950/40 dark:text-destructive/75 dark:hover:bg-destructive/12" 
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
          >
            <div className="flex items-start gap-2.5">
              <div 
                {...attributes} 
                {...listeners}
                className="mt-0.5 flex size-9 items-center justify-center rounded-xl bg-background/40 text-muted-foreground/40 transition-all cursor-grab active:cursor-grabbing shrink-0 touch-none select-none border border-transparent hover:border-primary/10 hover:text-primary hover:bg-primary/10"
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="size-4" />
              </div>

              <div className="h-6 w-px bg-border/40 mt-2 shrink-0" />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 pt-0.5">
                  {hasInvalidCatalog && (
                    <AlertTriangle className="mt-0.5 size-4 text-amber-500 animate-pulse shrink-0" />
                  )}

                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <Input 
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={handleTitleSubmit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleTitleSubmit();
                          if (e.key === 'Escape') {
                            setEditName(item.name);
                            setIsEditing(false);
                          }
                        }}
                        className="h-9 py-0 px-3 text-base font-bold tracking-tight bg-background/70 border-primary/30 focus:border-primary/50 focus-visible:ring-0 rounded-2xl w-full"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div
                        className="flex w-full items-center justify-between gap-2 overflow-hidden text-left"
                      >
                        <span className="truncate text-[15px] font-bold tracking-tight text-foreground/90 leading-tight">
                          {item.name || "Untitled Item"}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-9 rounded-xl border border-border/40 bg-background/60 text-muted-foreground/60 transition-all shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditing(e);
                          }}
                          title="Rename item"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {hasNativeTraktSource && (
                    <Badge className="shrink-0 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300">
                      Trakt
                    </Badge>
                  )}

                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={cn(
                      "size-9 rounded-xl border border-border/40 bg-background/60 transition-all shrink-0 hover:bg-primary/5 hover:border-primary/20 hover:text-primary",
                      isExpanded ? "bg-primary/10 text-primary rotate-90 border-primary/20 dark:bg-primary/15 dark:border-primary/25" : "text-muted-foreground/60"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleExpand();
                    }}
                    title={isExpanded ? "Collapse Item" : "Expand Item"}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/40 pt-2.5">
                  <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-background/50 border border-border/40  backdrop-blur-sm">
                    {isExpanded && (
                      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/50">
                        {item.dataSources.length} Source{item.dataSources.length === 1 ? '' : 's'}
                      </span>
                    )}
                    {hasInvalidCatalog && (
                      <>
                        <div className="size-1 rounded-full bg-amber-500/70" />
                        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-amber-500">
                          {invalidCatalogCount} Alert{invalidCatalogCount === 1 ? '' : 's'}
                        </span>
                      </>
                    )}
                    {hasTraktWarnings && (
                      <>
                        <div className="size-1 rounded-full bg-emerald-500/70" />
                        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-300">
                          {traktWarningCount} Trakt Warn
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={cn(
                        "size-9 rounded-xl border border-border/40 bg-background/60 transition-all  dark:border-white/10 dark:bg-zinc-950/70",
                        item.hideTitle ? "text-muted-foreground/50 hover:bg-primary/5 hover:text-primary dark:text-zinc-300/75 dark:hover:bg-primary/10 dark:hover:text-primary/90" : "text-primary bg-primary/5 border-primary/20 dark:bg-primary/12 dark:border-primary/25"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdate({ hideTitle: !item.hideTitle });
                      }}
                      title={item.hideTitle ? "Show Title" : "Hide Title"}
                    >
                        {item.hideTitle ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="size-9 rounded-xl border border-border/40 bg-background/60 text-destructive/55 hover:border-destructive/20 hover:text-destructive hover:bg-destructive/10 transition-all  dark:border-white/10 dark:bg-zinc-950/70 dark:text-destructive/75 dark:hover:border-destructive/20 dark:hover:bg-destructive/12" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete Item">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
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
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-6 max-sm:gap-4 p-5 max-sm:p-3.5 bg-white dark:bg-muted/10 rounded-2xl max-sm:rounded-[1.15rem] border border-zinc-200 dark:border-border/40  backdrop-blur-sm">
                          {/* Adaptive Thumbnail */}
                          <div className={cn(
                            "rounded-xl dark:bg-zinc-950 border border-border/40 flex items-center justify-center relative  overflow-hidden shrink-0 transition-all duration-500 mx-auto sm:mx-0",
                            item.layout === 'Poster' ? "aspect-[2/3] max-sm:w-20 sm:w-24" : 
                            item.layout === 'Wide' ? "aspect-video max-sm:w-32 sm:w-40" : 
                            "aspect-square max-sm:w-24 sm:w-28"
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
                          </div>

                          <div className="flex-1 flex flex-col gap-4 sm:gap-3 w-full min-w-0">
                            <div className="flex items-center justify-center sm:justify-start">
                              {/* Premium Segmented Control */}
                              <div className="grid grid-cols-3 sm:flex flex-wrap items-center justify-center sm:justify-start p-1.5 bg-zinc-100 dark:bg-muted/50 rounded-2xl border border-border gap-1 w-full sm:w-auto">
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
                                      "flex items-center max-sm:flex-col gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all min-w-[90px] max-sm:min-w-0 sm:min-w-0 justify-center sm:justify-start",
                                      item.layout === opt.id 
                                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                                        : "text-muted-foreground/65 hover:text-foreground hover:bg-background/40"
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
                                    onMouseDown={handleCopy}
                                    className={cn(
                                      "flex-1 min-w-0 h-10 max-sm:h-11 px-4 rounded-xl flex items-center transition-all active:scale-[0.98] border cursor-pointer select-none animate-in fade-in duration-300",
                                      isCopied 
                                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" 
                                        : "bg-primary/[0.03] dark:bg-primary/[0.06] border-primary/20 text-foreground/80 hover:bg-primary/10 hover:border-primary/40"
                                    )}
                                  >
                                    <div className="flex w-full items-center justify-between min-w-0">
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <ImageIcon 
                                          className={cn(
                                            "size-3.5 transition-colors",
                                            isCopied ? "text-emerald-600 dark:text-emerald-400" : "text-primary/60"
                                          )} 
                                          strokeWidth={2.25} 
                                        />
                                        <span className="text-[10px] sm:text-[11px] font-bold truncate tracking-tight">
                                          {isCopied ? "Link Copied!" : item.backgroundImageURL}
                                        </span>
                                      </div>
                                      {isCopied ? <Check className="size-3.5 shrink-0" /> : <Copy className="size-3.5 shrink-0 opacity-40" />}
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-center size-10 max-sm:size-11 shrink-0 rounded-xl bg-zinc-100/40 dark:bg-zinc-950/20 border border-zinc-200 dark:border-white/5">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-8 max-sm:size-9 rounded-xl text-destructive/55 transition-all hover:bg-destructive/8 hover:text-destructive hover:border-destructive/20 dark:text-destructive/75 dark:hover:bg-destructive/12"
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
                                  {/* Integrated Single-Box Input */}
                                  <div className="flex-1 min-w-0 flex items-center gap-3 px-3.5 h-10 max-sm:h-11 bg-zinc-100/40 dark:bg-zinc-950/20 border border-zinc-200 dark:border-white/5 rounded-xl transition-all focus-within:border-primary/50 group/url-input backdrop-blur-sm">
                                    <ImageIcon className="size-4 shrink-0 text-muted-foreground/50 group-focus-within/url-input:text-foreground/70 transition-colors" strokeWidth={2.25} />
                                    <input 
                                      autoFocus
                                      ref={backgroundImageUrlInputRef as any}
                                      placeholder="Paste Image URL (https://...)" 
                                      className="flex-1 min-w-0 h-full bg-transparent border-none focus:outline-none focus:ring-0 text-xs sm:text-[11px] font-bold text-foreground/80 placeholder:text-muted-foreground/35"
                                      value={item.backgroundImageURL || ''}
                                      onChange={(e) => onUpdate({ backgroundImageURL: e.target.value })}
                                    />
                                  </div>

                                  {/* Unified Trash Box (Matching Data Source Rows) */}
                                  <div className="flex items-center justify-center size-10 max-sm:size-11 shrink-0 rounded-xl bg-zinc-100/40 dark:bg-zinc-950/20 border border-zinc-200 dark:border-white/5">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-8 max-sm:size-9 rounded-xl text-destructive/55 transition-all hover:bg-destructive/8 hover:text-destructive hover:border-destructive/20 dark:text-destructive/75 dark:hover:bg-destructive/12"
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
                              className="h-9 px-2.5 text-[10px] gap-1 font-bold border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 dark:bg-zinc-900/40 dark:text-muted-foreground/60 dark:hover:text-primary dark:hover:bg-primary/5 dark:hover:border-primary/20 transition-all rounded-xl uppercase tracking-wider backdrop-blur-sm" 
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
                          <div className="flex items-center justify-center py-8 border border-dashed border-border/20 rounded-xl bg-muted/5">
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
