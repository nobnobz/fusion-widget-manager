"use client";

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GripVertical, Copy, Trash2, ChevronRight, Check, Pencil, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AddonCatalogDataSource, Widget } from '@/lib/types/widget';
import { useConfig } from '@/context/ConfigContext';
import { 
  processWidgetWithManifest, 
  convertEditorWidgetToFusionWidget,
} from '@/lib/config-utils';
import { useState }
 from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

  const hasInvalidCatalog = (() => {
    const checkDS = (ds: AddonCatalogDataSource) => {
      if (!ds.payload?.addonId?.toUpperCase().includes('AIOMETADATA')) return false;
      // If catalogId is missing or empty, it's invalid
      if (!ds.payload?.catalogId || ds.payload.catalogId === '') return true;
      return !manifestCatalogs.some(c => `${c.type}::${c.id}` === ds.payload.catalogId);
    };

    if (widget.type === 'collection.row') {
      return widget.dataSource.payload.items.some(item => 
        item.dataSources.some(checkDS)
      );
    }
    if (widget.type === 'row.classic') {
      return checkDS(widget.dataSource);
    }
    return false;
  })();

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
    if (fusionWidget.type === 'row.classic' && fusionWidget.dataSource?.payload?.addonId?.startsWith('http')) {
      addonsSet.add(fusionWidget.dataSource.payload.addonId);
    } else if (fusionWidget.type === 'collection.row' && Array.isArray(fusionWidget.dataSource?.payload?.items)) {
        fusionWidget.dataSource.payload.items.forEach((item: { dataSources: Array<{ payload: { addonId: string } }> }) => {
          item.dataSources.forEach((dataSource) => {
            if (dataSource.payload.addonId.startsWith('http')) {
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
      className={cn(
        "group relative bg-background/40 dark:bg-zinc-900/20 border border-zinc-200/50 dark:border-border/10 rounded-2xl max-sm:rounded-[1.2rem] transition-all duration-500 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.03)] max-sm:shadow-[0_1px_4px_rgba(0,0,0,0.04)] backdrop-blur-md",
        isSelected ? "ring-2 ring-primary/20 shadow-2xl border-primary/40 z-20 bg-background/80 max-sm:ring-1 max-sm:shadow-xl" : "hover:border-primary/20 hover:shadow-lg hover:bg-background/60",
        isDragging && "opacity-50 scale-[0.98] z-50",
        isOverlay && "z-[100] scale-[1.02] shadow-2xl border-primary/40 pointer-events-none opacity-100 bg-background/90",
        (isDragging || isOverlay) && "!transition-none"
      )}
    >
      <div 
        onClick={handleSelect}
        className={cn(
          "p-4 flex items-center justify-between cursor-pointer rounded-2xl transition-all duration-300 focus:outline-none",
          isSelected ? "bg-primary/[0.03]" : "hover:bg-primary/[0.01]"
        )}
      >
        <div className="hidden sm:flex items-center gap-5 flex-1 min-w-0">
          {/* Symmetrical Left Handle: Grip */}
          <div 
            {...attributes} 
            {...listeners}
            className="size-10 flex items-center justify-center rounded-xl text-muted-foreground/20 hover:text-primary hover:bg-primary/10 transition-all cursor-grab active:cursor-grabbing border border-transparent hover:border-primary/10 shrink-0 shadow-sm touch-none select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="size-4" />
          </div>

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
                  className="h-9 py-0 px-3 text-sm font-bold tracking-tight bg-background/50 border-primary/20 focus:border-primary/40 focus-visible:ring-0 rounded-xl w-full max-w-[320px] backdrop-blur-sm shadow-inner"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div 
                  className="flex items-center gap-3 group/text overflow-hidden cursor-pointer"
                  onClick={startEditing}
                >
                  <h3 className="text-[17px] font-black tracking-tight text-foreground truncate drop-shadow-sm">
                    {hasInvalidCatalog && (
                      <AlertTriangle className="size-4 text-amber-500 animate-pulse shrink-0 inline mr-2" />
                    )}
                    {widget.title}
                  </h3>
                  <div className="size-6 rounded-lg bg-primary/10 flex items-center justify-center opacity-0 group-hover/text:opacity-100 transition-all duration-300 shrink-0 scale-75 group-hover:scale-100">
                    <Pencil className="size-3 text-primary" />
                  </div>
                </div>
              )}
            </div>

            {/* Metadata Group (Below title) */}
            <div className="flex items-center gap-3 mt-1.5">
              <div className={cn(
                "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-[0.15em] shadow-sm",
                widget.type.startsWith('collection') 
                  ? "bg-primary/10 text-primary border border-primary/20" 
                  : "bg-indigo-500/10 text-indigo-500 border border-indigo-500/20"
              )}>
                {widget.type.split('.')[0] === 'collection' ? 'Collection' : 'Classic'}
              </div>
              {widget.dataSource.kind === 'collection' && widget.dataSource.payload?.items && (
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground/40 uppercase tracking-[0.1em]">
                  <div className="size-1 rounded-full bg-muted-foreground/20" />
                  <span>{widget.dataSource.payload.items.length} items</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions & Expand - Desktop Only */}
        <div className="hidden sm:flex items-center gap-4 shrink-0">
          <div className={cn(
            "flex items-center gap-1.5 transition-all duration-500 mr-2",
            isSelected ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 pointer-events-none group-hover:pointer-events-auto"
          )}>
            <Button 
              variant="ghost" 
              size="icon" 
              className="size-10 rounded-2xl hover:bg-primary/10 hover:text-primary transition-all opacity-40 hover:opacity-100 border border-transparent hover:border-primary/10 shadow-sm"
              onClick={handleCopy}
              title="Copy widget JSON"
            >
              {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="size-10 rounded-2xl hover:bg-destructive/10 hover:text-destructive transition-all opacity-40 hover:opacity-100 border border-transparent hover:border-destructive/10 shadow-sm"
              onClick={handleDelete}
              title="Move widget to trash"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          <div className={cn(
            "size-10 flex items-center justify-center rounded-xl bg-muted/5 text-muted-foreground/20 transition-all duration-500 shadow-sm border border-transparent",
            isSelected ? "rotate-90 bg-primary/10 text-primary opacity-100 border-primary/10" : "group-hover:text-primary/40 group-hover:bg-primary/5"
          )}>
            <ChevronRight className="size-4" />
          </div>
        </div>

        <div className="sm:hidden flex w-full flex-col gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div 
              {...attributes} 
              {...listeners}
              className="mt-0.5 size-9 flex items-center justify-center rounded-xl text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-all cursor-grab active:cursor-grabbing border border-transparent hover:border-primary/10 shrink-0 touch-none select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="size-4" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                {hasInvalidCatalog && (
                  <AlertTriangle className="mt-0.5 size-4 text-amber-500 animate-pulse shrink-0" />
                )}

                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <Input 
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={handleTitleSubmit}
                      onKeyDown={handleTitleKeyDown}
                      className="h-9 py-0 px-3 text-[13px] font-bold tracking-tight bg-background/60 border-primary/20 focus:border-primary/40 focus-visible:ring-0 rounded-xl w-full backdrop-blur-sm shadow-inner"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 overflow-hidden text-left"
                      onClick={startEditing}
                    >
                      <h3 className="truncate text-[15px] font-black tracking-tight text-foreground leading-tight">
                        {widget.title}
                      </h3>
                      <div className="mt-0.5 rounded-lg bg-primary/10 p-1 text-primary/80 shrink-0">
                        <Pencil className="size-3" />
                      </div>
                    </button>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className={cn(
                      "px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.15em]",
                      widget.type.startsWith('collection') 
                        ? "bg-primary/10 text-primary border border-primary/20" 
                        : "bg-indigo-500/10 text-indigo-500 border border-indigo-500/20"
                    )}>
                      {widget.type.split('.')[0] === 'collection' ? 'Collection' : 'Classic'}
                    </div>
                    {widget.dataSource.kind === 'collection' && widget.dataSource.payload?.items && (
                      <div className="flex items-center gap-1.5 rounded-full bg-muted/40 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                        <div className="size-1 rounded-full bg-muted-foreground/30" />
                        <span>{widget.dataSource.payload.items.length} items</span>
                      </div>
                    )}
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "size-9 rounded-xl border border-border/50 bg-background/60 transition-all shadow-sm shrink-0",
                    isSelected ? "rotate-90 bg-primary/10 text-primary border-primary/20" : "text-muted-foreground/60"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(widget.id);
                  }}
                  title={isSelected ? "Collapse widget" : "Expand widget"}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border/50 pt-2.5">
            <Button 
              variant="ghost" 
              size="icon" 
              className="size-9 rounded-xl border border-border/50 bg-background/50 hover:bg-primary/10 hover:text-primary transition-all shadow-sm"
              onClick={handleCopy}
              title="Copy widget JSON"
            >
              {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="size-9 rounded-xl border border-border/50 bg-background/50 hover:bg-destructive/10 hover:text-destructive transition-all shadow-sm"
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
            <div className="px-6 max-sm:px-3.5 pb-6 max-sm:pb-4 pt-2 max-sm:pt-1.5 border-t border-border bg-muted/10 max-sm:bg-muted/5">
               {widget.type === 'collection.row' ? (
                 <CollectionRowEditor widget={widget} searchQuery={searchQuery} />
               ) : (
                 <RowClassicEditor widget={widget} />
               )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
