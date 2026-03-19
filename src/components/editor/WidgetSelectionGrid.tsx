"use client";

import { useMemo, useState } from 'react';
import { useConfig } from '@/context/ConfigContext';
import { SortableWidget } from './SortableWidget';
import { Button } from '@/components/ui/button';
import { Plus, Download, Check, Copy, Search, FileJson2, Trash2, RotateCcw } from 'lucide-react';
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
  const { widgets, trash, exportConfig, exportOmniConfig, reorderWidgets, restoreWidget, emptyTrash } = useConfig();
  const [exportMode, setExportMode] = useState<'fusion' | 'omni'>('fusion');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showNewWidgetDialog, setShowNewWidgetDialog] = useState(false);
  const [showImportMergeDialog, setShowImportMergeDialog] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
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
        <div className="flex flex-col gap-3 mb-10 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-3">
             <div className="size-10 rounded-2xl bg-primary/10 flex items-center justify-center shadow-inner">
                <FileJson2 className="size-5 text-primary" />
             </div>
             <h1 className="text-4xl font-black tracking-tight text-foreground">Widget Manager</h1>
          </div>
          <p className="text-[15px] text-muted-foreground/80 font-medium max-w-2xl leading-relaxed">
            Organize and manage your library of Fusion widgets. Drag to reorder, click to edit.
          </p>
        </div>

        <div className="mb-12">
          <div className="p-2 rounded-[2.5rem] bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-border/10 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.05)] backdrop-blur-2xl">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
              {/* Left Group: Search */}
              <div className="relative flex-1 group min-w-0">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
                <Input
                  placeholder="Search for widgets..."
                  className="w-full h-12 pl-12 pr-10 border-none bg-transparent shadow-none focus-visible:ring-0 text-sm font-semibold tracking-tight"
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
              <div className="flex flex-wrap items-center gap-2 p-1 md:p-0">
                <Button
                  onClick={handleCreateWidget}
                  className="h-11 px-6 rounded-2xl font-black uppercase tracking-wider text-[10px] shadow-xl shadow-primary/20 bg-primary hover:bg-primary/95 text-primary-foreground transition-all active:scale-95 flex-1 md:flex-none order-1"
                >
                  <Plus className="size-4 mr-2" />
                  New Widget
                </Button>

                <Button
                  onClick={() => {
                    setShowPreview(true);
                    onDownload?.();
                  }}
                  variant="secondary"
                  className="h-11 px-6 rounded-2xl font-black uppercase tracking-wider text-[10px] border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 transition-all shadow-sm order-2 flex-1 md:flex-none"
                  title="Export JSON"
                >
                  <Download className="size-4 mr-2" />
                  Export
                </Button>

                <div className="flex items-center bg-background/50 dark:bg-zinc-800/40 rounded-2xl border border-border/20 p-1 shadow-sm order-3">
                  <Button
                    onClick={() => setShowImportMergeDialog(true)}
                    variant="ghost"
                    size="icon"
                    className="size-10 rounded-xl hover:bg-muted/50 transition-all"
                    title="Import JSON"
                  >
                    <FileJson2 className="size-4 opacity-60" />
                  </Button>

                  <div className="w-[1px] h-4 bg-border/40 mx-1" />

                  <Button
                    onClick={() => setShowTrash(true)}
                    variant="ghost"
                    size="icon"
                    className="size-10 rounded-xl hover:bg-destructive/10 hover:text-destructive transition-all relative"
                    title="Trash"
                  >
                    <Trash2 className="size-4 opacity-60" />
                    {trash.length > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[8px] font-black text-white ring-2 ring-background animate-in zoom-in-50">
                        {trash.length}
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </div>
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

              {widgets.length > 0 && (
                <button
                  onClick={handleCreateWidget}
                  className="w-full h-16 border-2 border-dashed border-border/40 rounded-2xl flex items-center justify-center gap-3 text-muted-foreground/40 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all group mt-2 bg-muted/5"
                >
                  <Plus className="size-4 group-hover:scale-110 transition-transform opacity-50 group-hover:opacity-100" />
                  <span className="text-xs font-bold uppercase tracking-widest">Add another widget</span>
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>

        {widgets.length === 0 && !searchQuery && (
          <div className="py-20 text-center space-y-4">
            <p className="text-muted-foreground font-medium">
              No active widgets. Create a new one or restore one from trash.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={handleCreateWidget} className="rounded-xl">
                <Plus className="size-4 mr-2" />
                New widget
              </Button>
              <Button onClick={() => setShowTrash(true)} variant="outline" className="rounded-xl">
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

      <Dialog open={showTrash} onOpenChange={setShowTrash}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden border-border/40 shadow-2xl backdrop-blur-xl bg-background/95">
          <DialogHeader className="p-8 pb-4">
            <div className="flex flex-col gap-1">
              <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-3">
                <div className="rounded-xl bg-destructive/10 p-2.5">
                  <Trash2 className="size-5 text-destructive" />
                </div>
                Trash
              </DialogTitle>
              <DialogDescription className="text-[13px] font-medium leading-relaxed max-w-md mt-1">
                Deleted widgets stay here in local storage until you restore them or empty the trash.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="px-8 pb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
                Deleted ({trash.length})
              </h3>
              {trash.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest text-destructive hover:bg-destructive/10 hover:text-destructive transition-all active:scale-95"
                  onClick={emptyTrash}
                >
                  <Trash2 className="size-3 mr-1.5 opacity-70" />
                  Empty trash
                </Button>
              )}
            </div>

            {trash.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border/40 bg-muted/5 py-16 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="rounded-2xl bg-muted/10 p-4">
                    <Trash2 className="size-8 text-muted-foreground/20" />
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground/40 uppercase tracking-widest">
                    Trash is empty
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex max-h-[440px] flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar">
                {trash.map((entry) => (
                  <div
                    key={`${entry.widget.id}-${entry.deletedAt}`}
                    className="group flex items-center justify-between gap-4 rounded-3xl border border-border/40 bg-muted/5 px-6 py-5 hover:bg-muted/10 hover:border-border/60 transition-all duration-300 backdrop-blur-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-primary opacity-60">
                          {entry.widget.type.split('.').pop()}
                        </span>
                        <div className="size-1 rounded-full bg-border" />
                        <span className="text-[9px] font-bold text-muted-foreground/50">
                          {new Date(entry.deletedAt).toLocaleDateString()} at {new Date(entry.deletedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="truncate text-base font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">
                        {entry.widget.title}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-2xl shrink-0 h-9 px-5 border-border/60 bg-background/50 text-[11px] font-black uppercase tracking-widest hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all active:scale-95 shadow-sm"
                      onClick={() => restoreWidget(entry.widget.id)}
                    >
                      <RotateCcw className="size-3.5 mr-2" />
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
