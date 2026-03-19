"use client";

import { useMemo, useState } from 'react';
import { useConfig } from '@/context/ConfigContext';
import { SortableWidget } from './SortableWidget';
import { Button } from '@/components/ui/button';
import { Plus, Download, Check, Copy, Search, FileJson2 } from 'lucide-react';
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
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
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
}

export function WidgetSelectionGrid({ onNewWidget, onDownload }: WidgetSelectionGridProps) {
  const { widgets, exportConfig, exportOmniConfig, reorderWidgets } = useConfig();
  const [exportMode, setExportMode] = useState<'fusion' | 'omni'>('fusion');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showNewWidgetDialog, setShowNewWidgetDialog] = useState(false);
  const [showImportMergeDialog, setShowImportMergeDialog] = useState(false);
  const [copied, setCopied] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
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

  const previewContent = useMemo(() => {
    if (!showPreview) return '';
    try {
      const config = exportMode === 'fusion' ? exportConfig() : exportOmniConfig();
      return JSON.stringify(config, null, 2);
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : 'Export failed.'}`;
    }
  }, [exportConfig, exportMode, exportOmniConfig, showPreview]);

  const handleCreateWidget = () => {
    if (onNewWidget) {
      onNewWidget();
      return;
    }
    setShowNewWidgetDialog(true);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(previewContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([previewContent], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = exportMode === 'fusion' ? 'fusion-widgets.json' : 'omni-snapshot.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (searchQuery) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = widgets.findIndex((widget) => widget.id === active.id);
    const newIndex = widgets.findIndex((widget) => widget.id === over.id);
    reorderWidgets(oldIndex, newIndex);
  };

  return (
    <div className="flex-1 flex flex-col bg-transparent">
      <main className="max-w-5xl mx-auto w-full px-6 py-12">
        <div className="flex flex-col gap-2 mb-12 text-center sm:text-left">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Widget Manager</h1>
          <p className="text-base text-muted-foreground font-medium max-w-2xl leading-relaxed">
            Organize and manage your library of Fusion widgets. Drag to reorder, click to edit.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-10 p-2 rounded-2xl bg-muted/20 dark:bg-muted/10 border border-zinc-200 dark:border-border/40 shadow-sm backdrop-blur-md">
          <div className="relative w-full sm:max-w-md group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Search for widgets or types..."
              className="pl-11 h-10 border-none bg-transparent shadow-none focus-visible:ring-0 text-sm font-medium"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleCreateWidget}
              size="sm"
              className="h-9 px-4 rounded-xl font-bold uppercase tracking-wider text-[10px] shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground transition-all active:scale-95"
            >
              <Plus className="size-3.5 mr-2" />
              New
            </Button>

            <Button
              onClick={() => setShowImportMergeDialog(true)}
              variant="outline"
              size="sm"
              className="h-9 px-4 rounded-xl font-bold uppercase tracking-wider text-[10px] border-border/60 bg-muted/5 hover:bg-muted/20 hover:border-primary/30 hover:text-primary transition-all backdrop-blur-sm shadow-sm"
            >
              <FileJson2 className="size-3.5 mr-2" />
              Import
            </Button>

            <Button
              onClick={() => {
                setShowPreview(true);
                onDownload?.();
              }}
              variant="outline"
              size="sm"
              className="h-9 px-4 rounded-xl font-bold uppercase tracking-wider text-[10px] border-border/60 bg-muted/5 hover:bg-muted/20 hover:border-primary/30 hover:text-primary transition-all backdrop-blur-sm shadow-sm"
            >
              <Download className="size-3.5 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {searchQuery && (
          <p className="mb-4 text-xs font-medium text-muted-foreground/70">
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
            <div className="flex flex-col gap-3">
              {filteredWidgets.map((widget) => (
                <SortableWidget
                  key={widget.id}
                  widget={widget}
                  isSelected={expandedId === widget.id}
                  onSelect={(id) => setExpandedId(expandedId === id ? null : id)}
                  searchQuery={searchQuery}
                />
              ))}

              <button
                onClick={handleCreateWidget}
                className="w-full h-16 border-2 border-dashed border-border/40 rounded-2xl flex items-center justify-center gap-3 text-muted-foreground/40 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all group mt-2 bg-muted/5"
              >
                <Plus className="size-4 group-hover:scale-110 transition-transform opacity-50 group-hover:opacity-100" />
                <span className="text-xs font-bold uppercase tracking-widest">Add another widget</span>
              </button>
            </div>
          </SortableContext>
        </DndContext>

        {filteredWidgets.length === 0 && searchQuery && (
          <div className="py-20 text-center">
            <p className="text-muted-foreground font-medium">No widgets match your search.</p>
          </div>
        )}
      </main>

      <NewWidgetDialog
        isOpen={showNewWidgetDialog}
        onOpenChange={setShowNewWidgetDialog}
        onCreated={(id) => setExpandedId(id)}
      />

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight">Export JSON</DialogTitle>
                <DialogDescription className="text-xs font-medium opacity-50">
                  {exportMode === 'fusion' ? 'Fusion Widgets Format' : 'Omni Snapshot Format'}
                </DialogDescription>
              </div>
              <div className="flex bg-muted/20 p-1 rounded-xl mr-12">
                <button
                  onClick={() => setExportMode('fusion')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                    exportMode === 'fusion' ? 'bg-primary text-primary-foreground shadow-sm' : 'opacity-40 hover:opacity-70'
                  )}
                >
                  Fusion
                </button>
                <button
                  onClick={() => setExportMode('omni')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                    exportMode === 'omni' ? 'bg-primary text-primary-foreground shadow-sm' : 'opacity-40 hover:opacity-70'
                  )}
                >
                  Omni
                </button>
              </div>
            </div>
          </DialogHeader>
          <div className="p-6 pt-4">
            <div className="relative group bg-muted/30 rounded-xl border border-border overflow-hidden">
              <Textarea
                readOnly
                value={previewContent}
                className="w-full h-[320px] font-mono text-xs bg-transparent border-none p-5 focus-visible:ring-0 resize-none custom-scrollbar leading-relaxed"
              />
            </div>
          </div>

          <div className="px-6 py-4 bg-muted/5 border-t border-border/40 flex items-center justify-end gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="h-9 w-40 px-0 rounded-xl bg-muted/40 hover:bg-muted/60 text-muted-foreground text-[11px] font-bold uppercase tracking-wider transition-all border-none shrink-0"
              onClick={handleDownload}
            >
              <Download className="size-3.5 mr-1.5" />
              Download JSON
            </Button>
            <Button
              size="sm"
              className="h-9 w-40 px-0 rounded-xl shadow-lg shadow-primary/20 text-[11px] font-bold uppercase tracking-wider transition-all shrink-0"
              onClick={handleCopy}
              disabled={previewContent.startsWith('Error:')}
            >
              {copied ? <Check className="size-3.5 mr-1.5" /> : <Copy className="size-3.5 mr-1.5" />}
              {copied ? 'Copied' : 'Copy JSON'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ImportMergeDialog
        open={showImportMergeDialog}
        onOpenChange={setShowImportMergeDialog}
      />
    </div>
  );
}
