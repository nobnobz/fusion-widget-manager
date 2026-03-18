"use client";

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { GripVertical, Copy, Trash2, Box, Layers, ChevronRight, Check, Pencil, AlertTriangle, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Widget } from '@/lib/types/widget';
import { useConfig } from '@/context/ConfigContext';
import { 
  processWidgetWithManifest, 
  convertEditorWidgetToFusionWidget,
  MANIFEST_PLACEHOLDER 
} from '@/lib/config-utils';
import { useState }
 from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';

import { CollectionRowEditor } from './CollectionRowEditor';
import { RowClassicEditor } from './RowClassicEditor';

interface SortableWidgetProps {
  widget: Widget;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  isOverlay?: boolean;
  searchQuery?: string;
}

export function SortableWidget({ 
  widget, 
  isSelected, 
  onSelect, 
  onDelete,
  isOverlay = false,
  searchQuery = ""
}: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });

  const { deleteWidget, updateWidget, manifestUrl, replacePlaceholder, manifestCatalogs } = useConfig();
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(widget.title);

  const hasInvalidCatalog = (() => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const checkDS = (ds: any) => {
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
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        fusionWidget.dataSource.payload.items.forEach((item: any) => {
          if (item.dataSource?.payload?.addonId?.startsWith('http')) {
            addonsSet.add(item.dataSource.payload.addonId);
          }
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
    } catch (err: any) {
      alert(err.message || "Failed to copy widget. Please ensure a catalog is selected.");
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    deleteWidget(widget.id);
    setShowDeleteConfirm(false);
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
      updateWidget(widget.id, { title: editTitle.trim() });
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

  const getWidgetIcon = () => {
    if (widget.type === 'collection.row') return <Box className="size-4" />;
    return <Layers className="size-4" />;
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative bg-card border border-zinc-200/80 dark:border-border rounded-xl transition-all duration-300 shadow-[0_1px_4px_rgba(0,0,0,0.02)] dark:shadow-none",
        isSelected ? "ring-2 ring-primary/20 shadow-lg border-primary/30 z-20" : "hover:border-primary/30 hover:shadow-sm",
        isDragging && "opacity-50 scale-95 z-50",
        isOverlay && "z-[100] scale-[1.02] shadow-xl border-primary/30 pointer-events-none opacity-100",
        (isDragging || isOverlay) && "!transition-none"
      )}
    >
      <div 
        onClick={handleSelect}
        className={cn(
          "p-3 flex items-center justify-between cursor-pointer rounded-xl transition-all focus:outline-none",
          isSelected ? "bg-primary/5" : "hover:bg-muted/50"
        )}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {/* Symmetrical Left Handle: Grip */}
          <div 
            {...attributes} 
            {...listeners}
            className="size-9 flex items-center justify-center rounded-lg text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-all cursor-grab active:cursor-grabbing border border-transparent hover:border-primary/20 shrink-0"
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
                  className="h-8 py-0 px-2 text-sm font-bold tracking-tight bg-muted/10 border-primary/30 focus:border-primary/50 focus-visible:ring-0 rounded-lg w-full max-w-[280px] backdrop-blur-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div 
                  className="flex items-center gap-2 group/text overflow-hidden cursor-pointer"
                  onClick={startEditing}
                >
                  <h3 className="text-base font-bold tracking-tight text-foreground truncate">
                    {hasInvalidCatalog && (
                      <AlertTriangle className="size-3.5 text-amber-500 animate-pulse shrink-0 inline mr-1.5" />
                    )}
                    {widget.title}
                  </h3>
                  <Pencil className="size-3 text-primary opacity-0 group-hover/text:opacity-40 transition-opacity shrink-0" />
                </div>
              )}
            </div>

            {/* Metadata Group (Below title) */}
            <div className="flex items-center gap-2 mt-1">
              <span className={cn(
                "text-[10px] font-black uppercase tracking-[0.1em]",
                widget.type.startsWith('collection') ? "text-primary/60" : "text-indigo-500/60"
              )}>
                {widget.type.split('.')[0] === 'collection' ? 'Collection' : 'Classic'}
              </span>
              {widget.dataSource.kind === 'collection' && widget.dataSource.payload?.items && (
                <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground/30 uppercase tracking-[0.1em]">
                  <span>•</span>
                  <span>{widget.dataSource.payload.items.length} items</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions & Expand */}
        <div className="flex items-center gap-3 shrink-0">
          <div className={cn(
            "flex items-center gap-1 transition-all duration-300 mr-1",
            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
          )}>
            <Button 
              variant="ghost" 
              size="icon" 
              className="size-9 rounded-xl hover:bg-primary/10 hover:text-primary transition-all opacity-60 hover:opacity-100 border border-transparent hover:border-primary/20"
              onClick={handleCopy}
              title="Copy widget JSON"
            >
              {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="size-9 rounded-xl hover:bg-destructive/10 hover:text-destructive transition-all opacity-60 hover:opacity-100 border border-transparent hover:border-destructive/20"
              onClick={handleDelete}
              title="Delete widget"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          <div className={cn(
            "size-8 flex items-center justify-center rounded-lg text-muted-foreground/20 transition-all duration-300",
            isSelected ? "rotate-90 text-primary opacity-100" : "group-hover:text-primary/40"
          )}>
            <ChevronRight className="size-4" />
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
            <div className="px-6 pb-6 pt-2 border-t border-border bg-muted/10">
               {widget.type === 'collection.row' ? (
                 <CollectionRowEditor widget={widget} searchQuery={searchQuery} />
               ) : (
                 <RowClassicEditor widget={widget} />
               )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmationDialog 
        isOpen={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete widget?"
        description={`Are you sure you want to permanently delete "${widget.title}"?`}
        variant="danger"
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
      />
    </motion.div>
  );
}
