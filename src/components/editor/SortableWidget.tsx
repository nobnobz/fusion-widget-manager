"use client";

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GripVertical, Copy, Trash2, ChevronRight, ChevronUp, Check, Pencil, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Widget } from '@/lib/types/widget';
import { useConfig } from '@/context/ConfigContext';
import { 
  processWidgetWithManifest, 
  convertEditorWidgetToFusionWidget,
} from '@/lib/config-utils';
import { countInvalidCatalogsInWidget, countTraktWarningsInWidget } from '@/lib/catalog-validation';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { isNativeTraktDataSource } from '@/lib/widget-domain';

import { CollectionRowEditor } from './CollectionRowEditor';
import { RowClassicEditor } from './RowClassicEditor';

interface SortableWidgetProps {
  widget: Widget;
  isSelected: boolean;
  onSelect: (id: string) => void;
  isOverlay?: boolean;
  searchQuery?: string;
}

export function SortableWidget({ 
  widget, 
  isSelected, 
  onSelect, 
  isOverlay = false,
  searchQuery = ""
}: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });

  const { deleteWidget, updateWidgetMeta, manifestUrl, replacePlaceholder, manifestCatalogs } = useConfig();
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(widget.title);

  const invalidCatalogCount = countInvalidCatalogsInWidget(widget, manifestCatalogs);
  const hasInvalidCatalog = invalidCatalogCount > 0;
  const traktWarningCount = countTraktWarningsInWidget(widget);
  const hasNativeTrakt = widget.type === 'row.classic' && isNativeTraktDataSource(widget.dataSource);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: (isDragging || isOverlay) ? 100 : undefined,
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      // 1. Initial normalization/sync
      const normalized = processWidgetWithManifest(
        widget,
        manifestUrl,
        replacePlaceholder,
        manifestCatalogs,
        true // Sanitize on export
      );

      // 2. Strict Fusion transformation
      const fusionWidget = convertEditorWidgetToFusionWidget(normalized, manifestUrl);

      // 3. Collect required addons for this single widget
    const addonsSet = new Set<string>();
    if (
      fusionWidget.type === 'row.classic' &&
      fusionWidget.dataSource.kind === 'addonCatalog' &&
      fusionWidget.dataSource.payload.addonId.startsWith('http')
    ) {
      addonsSet.add(fusionWidget.dataSource.payload.addonId);
    } else if (fusionWidget.type === 'collection.row' && Array.isArray(fusionWidget.dataSource?.payload?.items)) {
        fusionWidget.dataSource.payload.items.forEach((item) => {
          item.dataSources.forEach((dataSource) => {
            if (dataSource.kind === 'addonCatalog' && dataSource.payload.addonId.startsWith('http')) {
              addonsSet.add(dataSource.payload.addonId);
            }
          });
        });
      }

      // Wrap the single widget in the format expected by the ImportMergeDialog
      const exportData = {
        exportType: "fusionWidgets",
        exportVersion: 1,
        requiredAddons: Array.from(addonsSet),
        widgets: [fusionWidget]
      };
      const widgetJson = JSON.stringify(exportData, null, 2);
      navigator.clipboard.writeText(widgetJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to copy widget. Please ensure a catalog is selected.");
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteWidget(widget.id);
  };

  const handleSelect = (e: React.MouseEvent) => {
    // If we click an action button or the edit input, don't toggle
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    onSelect(widget.id);
  };

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTitle(widget.title);
    setIsEditing(true);
  };

  const handleTitleSubmit = () => {
    if (editTitle.trim() && editTitle !== widget.title) {
      updateWidgetMeta(widget.id, { title: editTitle.trim() });
    }
    setIsEditing(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleTitleSubmit();
    if (e.key === 'Escape') {
      setEditTitle(widget.title);
      setIsEditing(false);
    }
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      data-testid={`widget-card-${widget.id}`}
      className={cn(
        "group relative bg-white/40 dark:bg-white/[0.03] border border-zinc-200/80 dark:border-white/10 rounded-3xl max-sm:rounded-[1.5rem] transition-[border,box-shadow,transform,opacity] duration-500 backdrop-blur-md overflow-hidden",
        isSelected ? "ring-1 ring-primary/40 z-20 bg-white/80 dark:bg-zinc-900/80" : "hover:border-primary/20 hover:bg-white/60 dark:hover:bg-zinc-900/60",
        isDragging && "opacity-50 scale-[0.98] z-50",
        isOverlay && "z-[100] scale-[1.02] border-primary/40 pointer-events-none opacity-100 bg-white/90 dark:bg-zinc-900/95",
        (isDragging || isOverlay) && "!transition-none"
      )}
    >
      <div 
        onClick={handleSelect}
        className={cn(
          "p-4 flex items-center justify-between cursor-pointer rounded-3xl transition-all duration-300 focus:outline-none",
          isSelected ? "bg-primary/[0.03]" : "hover:bg-primary/[0.01]"
        )}
      >
        <div className="hidden sm:flex items-center gap-5 flex-1 min-w-0">
          {/* Symmetrical Left Handle: Grip */}
          <div 
            {...attributes} 
            {...listeners}
            data-testid={`widget-handle-${widget.id}`}
            className="size-10 flex items-center justify-center rounded-xl text-muted-foreground/20 hover:text-primary hover:bg-primary/10 transition-all cursor-grab active:cursor-grabbing border border-transparent hover:border-primary/10 shrink-0  touch-none select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="size-4" />
          </div>

          <div className="h-8 w-px bg-border/40 shrink-0" />

          {/* Title & Metadata */}
          <div className="flex flex-col min-w-0 flex-1 py-1">
            <div className="min-w-0 group/title flex items-center gap-2">
              {isEditing ? (
                <Input 
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={handleTitleSubmit}
                  onKeyDown={handleTitleKeyDown}
                  className="h-9 py-0 px-3 text-base sm:text-sm font-bold tracking-tight bg-background/50 border-primary/20 focus:border-primary/40 focus-visible:ring-0 rounded-xl w-full max-w-[320px] backdrop-blur-sm "
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                  <h3 className="text-[17px] font-black tracking-tight text-foreground truncate drop-">
                    {hasInvalidCatalog && (
                      <AlertTriangle className="size-4 text-amber-500 animate-pulse shrink-0 inline mr-2" />
                    )}
                    {widget.title}
                  </h3>
              )}
            </div>

            {/* Metadata Group (Below title) */}
            <div className="flex items-center gap-3 mt-1.5">
              <div className={cn(
                "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-[0.15em] ",
                widget.type.startsWith('collection') 
                  ? "bg-primary/10 text-primary border border-primary/20" 
                  : "bg-indigo-500/10 text-indigo-500 border border-indigo-500/20"
              )}>
                {widget.type.split('.')[0] === 'collection' ? 'Collection' : 'Classic Row'}
              </div>
              {hasNativeTrakt && (
                <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-300">
                  Native Trakt
                </Badge>
              )}
              {widget.dataSource.kind === 'collection' && widget.dataSource.payload?.items && (
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground/40 uppercase tracking-[0.1em]">
                  <div className="size-1 rounded-full bg-muted-foreground/20" />
                  <span>{widget.dataSource.payload.items.length} items</span>
                </div>
              )}
              {hasInvalidCatalog && (
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-amber-500 uppercase tracking-[0.1em]">
                  <div className="size-1 rounded-full bg-amber-500/60" />
                  <span>{invalidCatalogCount} alert{invalidCatalogCount === 1 ? '' : 's'}</span>
                </div>
              )}
              {traktWarningCount > 0 && (
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-700 uppercase tracking-[0.1em] dark:text-emerald-300">
                  <div className="size-1 rounded-full bg-emerald-500/70" />
                  <span>{traktWarningCount} Trakt warn</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "size-10 rounded-xl border border-border/40 bg-background/60 transition-all transition-all duration-300 shrink-0 hover:border-primary/20 hover:bg-primary/5 hover:text-primary dark:border-white/5 dark:bg-zinc-950/40",
              isSelected ? "rotate-90 bg-primary/10 text-primary border-primary/20 dark:bg-primary/15 dark:border-primary/25" : "text-muted-foreground/60"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(widget.id);
            }}
            title={isSelected ? "Collapse widget" : "Expand widget"}
          >
            <ChevronRight className="size-4" />
          </Button>

          <div className="w-px h-4 bg-border/40 mx-1.5 shrink-0" />

          <div className="flex items-center gap-1.5">
            <Button 
              variant="ghost" 
              size="icon" 
              className="size-10 rounded-xl border border-border/40 bg-background/60 text-muted-foreground/60  transition-all hover:border-primary/20 hover:bg-primary/5 hover:text-primary dark:border-white/5 dark:bg-zinc-950/40"
              onClick={handleCopy}
              title="Copy widget JSON"
            >
              {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="size-10 rounded-xl border border-border/40 bg-background/60 text-destructive/55  transition-all hover:border-destructive/20 hover:bg-destructive/8 hover:text-destructive dark:border-white/5 dark:bg-zinc-950/40 dark:text-destructive/75 dark:hover:bg-destructive/12"
              onClick={handleDelete}
              title="Move widget to trash"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        <div className="sm:hidden flex items-center gap-2 w-full">
          {/* Drag Handle */}
            <div 
              {...attributes} 
              {...listeners}
              data-testid={`widget-handle-${widget.id}`}
              className="size-9 flex items-center justify-center rounded-xl text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-all cursor-grab active:cursor-grabbing border border-transparent hover:border-primary/10 shrink-0 touch-none select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="size-4" />
            </div>

          <div className="h-8 w-px bg-border/40 shrink-0" />

          {/* Title + Badges */}
          <div className="flex flex-col min-w-0 flex-1 py-1">
            <div className="flex items-center gap-1.5 min-w-0">
              {hasInvalidCatalog && (
                <AlertTriangle className="size-3.5 text-amber-500 animate-pulse shrink-0" />
              )}
              {isEditing ? (
                <Input 
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={handleTitleSubmit}
                  onKeyDown={handleTitleKeyDown}
                  className="h-8 py-0 px-2.5 text-sm font-bold tracking-tight bg-background/60 border-primary/20 focus:border-primary/40 focus-visible:ring-0 rounded-xl w-full backdrop-blur-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <h3 className="truncate text-[15px] font-black tracking-tight text-foreground leading-snug">
                  {widget.title}
                </h3>
              )}
            </div>
            {/* Metadata badges – same style as desktop */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <div className={cn(
                "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-[0.15em]",
                widget.type.startsWith('collection')
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-indigo-500/10 text-indigo-500 border border-indigo-500/20"
              )}>
                {widget.type.split('.')[0] === 'collection' ? 'Collection' : 'Classic Row'}
              </div>
              {hasNativeTrakt && (
                <div className="flex items-center gap-1">
                  <div className="size-1 rounded-full bg-emerald-500/70" />
                  <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-700 dark:text-emerald-300">Trakt</span>
                </div>
              )}
              {widget.dataSource.kind === 'collection' && widget.dataSource.payload?.items && (
                <div className="flex items-center gap-1">
                  <div className="size-1 rounded-full bg-muted-foreground/25" />
                  <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground/50">{widget.dataSource.payload.items.length} items</span>
                </div>
              )}
              {hasInvalidCatalog && (
                <div className="flex items-center gap-1">
                  <div className="size-1 rounded-full bg-amber-500/60" />
                  <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-amber-500">{invalidCatalogCount} alert{invalidCatalogCount === 1 ? '' : 's'}</span>
                </div>
              )}
              {traktWarningCount > 0 && (
                <div className="flex items-center gap-1">
                  <div className="size-1 rounded-full bg-emerald-500/60" />
                  <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-700 dark:text-emerald-300">{traktWarningCount} Trakt warn</span>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons – right-aligned, always visible */}
          <div className="flex items-center gap-1 shrink-0">
            <Button 
              variant="ghost" 
              size="icon"
              className={cn(
                "size-9 rounded-xl border border-border/40 bg-background/60 transition-all duration-300 shrink-0 hover:border-primary/20 hover:bg-primary/5 hover:text-primary dark:border-white/5 dark:bg-zinc-950/40",
                isSelected ? "rotate-90 bg-primary/10 text-primary border-primary/20 dark:bg-primary/15 dark:border-primary/25" : "text-muted-foreground/60"
              )}
              onClick={(e) => { e.stopPropagation(); onSelect(widget.id); }}
              title={isSelected ? "Collapse widget" : "Expand widget"}
            >
              <ChevronRight className="size-4" />
            </Button>
            <div className="w-px h-4 bg-border/40 mx-0.5 shrink-0" />
            <Button 
              variant="ghost" 
              size="icon"
              className="size-9 rounded-xl border border-border/40 bg-background/60 text-muted-foreground/60 transition-all hover:border-primary/20 hover:bg-primary/5 hover:text-primary dark:border-white/5 dark:bg-zinc-950/40"
              onClick={handleCopy}
              title="Copy widget JSON"
            >
              {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              className="size-9 rounded-xl border border-border/40 bg-background/60 text-destructive/55 transition-all hover:border-destructive/20 hover:bg-destructive/8 hover:text-destructive dark:border-white/5 dark:bg-zinc-950/40 dark:text-destructive/75 dark:hover:bg-destructive/12"
              onClick={handleDelete}
              title="Move widget to trash"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Expanded Content: Inline Editor */}
      <AnimatePresence initial={false}>
        {isSelected && (
          <motion.div
            layout
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="p-4 max-sm:p-3 border-t border-border bg-white dark:bg-black/20">
               {widget.type === 'row.classic' && (
                 <div className="flex items-center justify-end mb-4 pb-3 border-b border-border/40">
                   <Button 
                     variant="ghost" 
                     size="sm" 
                     className="h-8 rounded-xl border border-border/40 bg-zinc-500/[0.03] text-muted-foreground/70 hover:text-primary hover:bg-primary/5 hover:border-primary/20 transition-all font-bold text-[10px] uppercase tracking-widest"
                     onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                   >
                     <Pencil className="size-3 mr-2" />
                     Rename Widget
                   </Button>
                 </div>
               )}
               {widget.type === 'collection.row' ? (
                 <CollectionRowEditor widget={widget} searchQuery={searchQuery} onRename={() => setIsEditing(true)} />
               ) : (
                 <RowClassicEditor widget={widget} />
               )}
                <div className="mt-4 pt-4 border-t border-border/40 flex justify-center">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-10 px-8 rounded-xl border border-border/40 bg-zinc-500/[0.03] text-muted-foreground/80 hover:bg-primary/5 hover:text-primary hover:border-primary/20 transition-all font-bold text-[10px] uppercase tracking-widest sm:w-auto w-full"
                    onClick={(e) => { e.stopPropagation(); onSelect(widget.id); }}
                  >
                    <ChevronUp className="size-3.5 mr-2" />
                    Close Widget
                  </Button>
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
