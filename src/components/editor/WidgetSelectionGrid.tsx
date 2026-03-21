"use client";

import { useMemo, useState } from 'react';
import { useConfig } from '@/context/ConfigContext';
import { SortableWidget } from './SortableWidget';
import { Button } from '@/components/ui/button';
import { Plus, Download, Check, Copy, Search, FileJson2, Trash2, RotateCcw, Globe, AlertTriangle } from 'lucide-react';
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
}

export function WidgetSelectionGrid({ onNewWidget, onDownload, onSyncManifest }: WidgetSelectionGridProps) {
  const {
    widgets,
    trash,
    itemTrash,
    manifestUrl,
    exportConfig,
    exportOmniConfig,
    reorderWidgets,
    restoreWidget,
    restoreCollectionItem,
    emptyTrash,
  } = useConfig();
  const [exportMode, setExportMode] = useState<'fusion' | 'omni'>('fusion');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showNewWidgetDialog, setShowNewWidgetDialog] = useState(false);
  const [showImportMergeDialog, setShowImportMergeDialog] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [copied, setCopied] = useState(false);
  const trashCount = trash.length + itemTrash.length;
  const hasTrash = trashCount > 0;

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

  const previewContent = useMemo(() => {
    if (!showPreview) return '';
    try {
      const config = exportMode === 'fusion' ? exportConfig() : exportOmniConfig();
      return JSON.stringify(config, null, 2);
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : 'Export failed.'}`;
    }
  }, [exportConfig, exportMode, exportOmniConfig, showPreview]);

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
      <main className="max-w-5xl mx-auto w-full px-6 max-sm:px-4 py-12 max-sm:py-6 max-sm:pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <div className="flex flex-col gap-3 mb-10 max-sm:mb-6 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start max-sm:justify-start">
            <h1 className="text-4xl max-sm:text-[1.9rem] font-black tracking-tight text-foreground leading-none">Widget Manager</h1>
          </div>
          <p className="text-[15px] max-sm:text-[13px] text-muted-foreground/80 font-medium max-w-2xl leading-relaxed max-sm:text-left">
            Organize and manage your library of Fusion widgets. Drag to reorder, click to edit.
          </p>
        </div>

        <div className="mb-12 max-sm:mb-7">
          {!manifestUrl && (
            <div className="mb-4 rounded-[1.75rem] border border-border/40 bg-muted/10 px-5 py-4 shadow-sm max-sm:mb-3 max-sm:rounded-[1.3rem] max-sm:px-4 dark:border-amber-500/15 dark:bg-amber-500/[0.06]">
              <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-stretch">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-amber-500/10 p-2 text-amber-600 dark:bg-amber-500/12 dark:text-amber-500">
                    <AlertTriangle className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-700/85 dark:text-amber-500/90">
                      AIOMetadata not synced
                    </p>
                    <p className="mt-1 text-sm font-medium leading-relaxed text-foreground/72 max-sm:text-[13px] dark:text-zinc-300/78">
                      Sync a manifest URL to validate catalogs and replace AIOMetadata placeholders before export.
                    </p>
                  </div>
                </div>

                <Button
                  onClick={onSyncManifest}
                  variant="secondary"
                  className="h-10 shrink-0 rounded-2xl border border-amber-500/20 bg-background/70 px-4 text-[10px] font-black uppercase tracking-wider text-amber-700 shadow-sm transition-all hover:bg-amber-500/10 hover:border-amber-500/35 max-sm:w-full dark:bg-zinc-950/60 dark:text-amber-500 dark:hover:bg-amber-500/12 dark:hover:border-amber-500/30"
                >
                  <Globe className="size-4 mr-2" />
                  Sync Manifest
                </Button>
              </div>
            </div>
          )}

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
                <Search className="absolute left-5 max-sm:left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
                <Input
                  placeholder="Search for widgets..."
                  className="w-full h-12 max-sm:h-11 pl-12 max-sm:pl-10 pr-10 rounded-[2rem] max-sm:rounded-[1.25rem] border-none bg-transparent shadow-none focus-visible:ring-0 text-sm max-sm:text-[14px] font-semibold tracking-tight"
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
              <div className="flex flex-wrap items-center gap-2 p-1 md:p-0 max-sm:grid max-sm:grid-cols-2 max-sm:w-full max-sm:gap-2 max-sm:p-0">
                <Button
                  onClick={handleCreateWidget}
                  className="h-11 max-sm:h-12 px-6 max-sm:px-4 rounded-2xl max-sm:rounded-xl font-black uppercase tracking-wider text-[10px] shadow-xl shadow-primary/20 bg-primary hover:bg-primary/95 text-primary-foreground transition-all active:scale-95 flex-1 md:flex-none order-1"
                >
                  <Plus className="size-4 mr-2" />
                  New Widget
                </Button>

                <Button
                  onClick={onSyncManifest}
                  variant="secondary"
                  className={cn(
                    "h-11 max-sm:h-12 px-6 max-sm:px-4 rounded-2xl max-sm:rounded-xl font-black uppercase tracking-wider text-[10px] transition-all shadow-sm order-2 flex-1 md:flex-none relative",
                    manifestUrl
                      ? "border border-primary/20 bg-primary/10 text-primary hover:bg-primary/15 dark:border-primary/25 dark:bg-primary/12 dark:hover:bg-primary/16"
                      : "border border-border/40 bg-muted/20 text-muted-foreground hover:bg-muted/30 dark:border-white/10 dark:bg-zinc-950/65 dark:text-zinc-300/80 dark:hover:bg-zinc-900/85"
                  )}
                  title={manifestUrl ? "Manifest synced" : "Sync manifest"}
                >
                  <div className="relative mr-2">
                    <Globe className="size-4" />
                    {manifestUrl && (
                      <div className="absolute -right-0.5 -top-0.5 size-2 rounded-full border border-background bg-green-500" />
                    )}
                  </div>
                  {manifestUrl ? 'Synced' : 'Sync Manifest'}
                </Button>

                <Button
                  onClick={() => setShowImportMergeDialog(true)}
                  variant="secondary"
                  className="h-11 max-sm:h-12 px-6 max-sm:px-4 rounded-2xl max-sm:rounded-xl font-black uppercase tracking-wider text-[10px] border border-border/40 bg-muted/20 text-muted-foreground hover:bg-muted/30 transition-all shadow-sm order-3 flex-1 md:flex-none dark:border-white/10 dark:bg-zinc-950/65 dark:text-zinc-300/80 dark:hover:bg-zinc-900/85"
                  title="Import JSON"
                >
                  <FileJson2 className="size-4 mr-2 opacity-60" />
                  Import
                </Button>

                <Button
                  onClick={() => {
                    setShowPreview(true);
                    onDownload?.();
                  }}
                  variant="secondary"
                  className="h-11 max-sm:h-12 px-6 max-sm:px-4 rounded-2xl max-sm:rounded-xl font-black uppercase tracking-wider text-[10px] border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 transition-all shadow-sm order-4 flex-1 md:flex-none dark:border-primary/25 dark:bg-primary/12 dark:hover:bg-primary/18"
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
                  isSelected={expandedId === widget.id}
                  onSelect={(id) => setExpandedId(expandedId === id ? null : id)}
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
        onCreated={(id) => setExpandedId(id)}
      />

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl rounded-[2.5rem] border border-border/40 bg-background/95 p-0 overflow-hidden shadow-2xl backdrop-blur-2xl max-sm:w-[calc(100vw-1rem)] max-sm:max-w-[calc(100vw-1rem)] max-sm:rounded-[1.9rem] [&>button:last-child]:top-8 [&>button:last-child]:right-8 [&>button:last-child]:size-9 [&>button:last-child]:rounded-full [&>button:last-child]:bg-muted/30 [&>button:last-child]:hover:bg-muted/50 [&>button:last-child]:transition-all [&>button:last-child]:border-none [&>button:last-child]:flex [&>button:last-child]:items-center [&>button:last-child]:justify-center max-sm:[&>button:last-child]:top-4 max-sm:[&>button:last-child]:right-4">
          <div className="p-8 pt-10 max-sm:p-5 max-sm:pt-6">
            <DialogHeader className="space-y-4 items-start text-left">
              <div className="size-14 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary shadow-sm max-sm:size-12 max-sm:rounded-[1rem]">
                <FileJson2 className="size-7 max-sm:size-6" />
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-2xl font-black tracking-tight max-sm:text-xl">Export JSON</DialogTitle>
                <DialogDescription className="text-muted-foreground/60 text-xs font-medium leading-relaxed max-w-[360px] max-sm:text-[11px] max-sm:max-w-none">
                  {exportMode === 'fusion' ? 'Preview your Fusion widget export before copying or downloading it.' : 'Preview your Omni snapshot export before copying or downloading it.'}
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="mt-6 flex justify-end max-sm:mt-5 max-sm:justify-start">
              <div className="flex rounded-2xl border border-border/10 bg-muted/20 p-1">
                <button
                  onClick={() => setExportMode('fusion')}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                    exportMode === 'fusion' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground/45 hover:text-muted-foreground/80'
                  )}
                >
                  Fusion
                </button>
                <button
                  onClick={() => setExportMode('omni')}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                    exportMode === 'omni' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground/45 hover:text-muted-foreground/80'
                  )}
                >
                  Omni
                </button>
              </div>
            </div>

            <div className="mt-5">
              <div className="relative group rounded-2xl border border-border/10 bg-muted/20 p-1 overflow-hidden">
              <Textarea
                readOnly
                value={previewContent}
                className="h-[320px] w-full resize-none border-none bg-transparent p-5 font-mono text-xs leading-relaxed focus-visible:ring-0 custom-scrollbar"
              />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
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
                {copied ? <Check className="size-3.5 mr-1.5" /> : <Copy className="size-3.5 mr-1.5" />}
                {copied ? 'Copied' : 'Copy JSON'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ImportMergeDialog
        open={showImportMergeDialog}
        onOpenChange={setShowImportMergeDialog}
      />

      <Dialog open={showTrash} onOpenChange={setShowTrash}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden border-border/40 shadow-2xl backdrop-blur-xl bg-background/95 dark:border-white/10 dark:bg-zinc-950/95 max-sm:w-[calc(100vw-1rem)] max-sm:max-w-[calc(100vw-1rem)] max-sm:rounded-[1.9rem] [&>button:last-child]:top-8 [&>button:last-child]:right-8 [&>button:last-child]:size-9 [&>button:last-child]:rounded-full [&>button:last-child]:bg-muted/30 [&>button:last-child]:hover:bg-muted/50 [&>button:last-child]:transition-all [&>button:last-child]:border-none [&>button:last-child]:flex [&>button:last-child]:items-center [&>button:last-child]:justify-center max-sm:[&>button:last-child]:top-4 max-sm:[&>button:last-child]:right-4">
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
    </div>
  );
}
