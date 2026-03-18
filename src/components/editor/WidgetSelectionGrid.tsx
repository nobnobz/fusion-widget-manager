"use client";

import { useConfig } from '@/context/ConfigContext';
import { SortableWidget } from './SortableWidget';
import { Button } from '@/components/ui/button';
import { Plus, Download, Check, Copy, RotateCcw, Search, Globe, LayoutGrid, List, FileJson2 } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { cn } from '@/lib/utils';
import { CollectionItemEditor } from './CollectionItemEditor';
import { AddItemDialog } from './AddItemDialog';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';

import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { NewWidgetDialog } from './NewWidgetDialog';
import { ImportMergeDialog } from './ImportMergeDialog';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

interface WidgetSelectionGridProps {
  onSelectWidget: (id: string) => void;
  onOpenManifest?: () => void;
  onNewWidget?: () => void;
  onDownload?: () => void;
}


export function WidgetSelectionGrid({ onSelectWidget, onOpenManifest, onNewWidget, onDownload }: WidgetSelectionGridProps) {

  const { widgets, setView, addWidget, exportConfig, exportOmniConfig, manifestUrl, clearConfig, reorderWidgets } = useConfig();
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [exportMode, setExportMode] = useState<'fusion' | 'omni'>('fusion');


  const sensors = useSensors(

    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showNewWidgetDialog, setShowNewWidgetDialog] = useState(false);
  const [showImportMergeDialog, setShowImportMergeDialog] = useState(false);

  const filteredWidgets = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return widgets.filter(w => {
      // Search in widget title and type
      const matchWidget = w.title.toLowerCase().includes(q) || w.type.toLowerCase().includes(q);
      if (matchWidget) return true;

      // Search in collection items if it's a collection row
      if (w.type === 'collection.row' && w.dataSource.kind === 'collection') {
        const items = w.dataSource.payload.items || [];
        return items.some(item =>
          (item.name || "").toLowerCase().includes(q) ||
          item.id?.toLowerCase().includes(q)
        );
      }
      return false;
    });
  }, [widgets, searchQuery]);

  const handleExport = () => {
    setShowPreview(true);
  };

  const handleCreateWidget = () => {
    setShowNewWidgetDialog(true);
  };

  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    try {
      const config = exportMode === 'fusion' ? exportConfig() : exportOmniConfig();
      navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    }
  };


  const handleDownload = () => {
    try {
      const config = exportMode === 'fusion' ? exportConfig() : exportOmniConfig();
      // Use application/octet-stream for iOS to prevent .txt extension being added
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportMode === 'fusion' ? 'fusion-widgets.json' : 'omni-snapshot.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {

    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = widgets.findIndex((w) => w.id === active.id);
      const newIndex = widgets.findIndex((w) => w.id === over.id);
      reorderWidgets(oldIndex, newIndex);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-transparent">
      {/* Selection Content Container */}
      <main className="max-w-5xl mx-auto w-full px-6 py-12">
        <div className="flex flex-col gap-2 mb-12 text-center sm:text-left">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Widget Manager</h1>
          <p className="text-base text-muted-foreground font-medium max-w-2xl leading-relaxed">
            Organize and manage your library of Fusion widgets. Drag to reorder, click to edit.
          </p>
        </div>

        {/* Action Bar - Modern Search & Filter */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-10 p-2 rounded-2xl bg-muted/20 dark:bg-muted/10 border border-zinc-200 dark:border-border/40 shadow-sm backdrop-blur-md">
          <div className="relative w-full sm:max-w-md group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Search for widgets or types..."
              className="pl-11 h-10 border-none bg-transparent shadow-none focus-visible:ring-0 text-sm font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={onNewWidget}
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
              onClick={onDownload}
              variant="outline"
              size="sm"
              className="h-9 px-4 rounded-xl font-bold uppercase tracking-wider text-[10px] border-border/60 bg-muted/5 hover:bg-muted/20 hover:border-primary/30 hover:text-primary transition-all backdrop-blur-sm shadow-sm"
            >
              <Download className="size-3.5 mr-2" />
              Export
            </Button>
          </div>
        </div>




        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={widgets.map(w => w.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {filteredWidgets.map((widget) => (
                <SortableWidget
                  key={widget.id}
                  widget={widget}
                  isSelected={expandedId === widget.id}
                  onSelect={(id) => setExpandedId(expandedId === id ? null : id)}
                  onDelete={() => { }} // context handles it
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
        onCreated={(id) => {
          setExpandedId(id);
        }}
      />
      {/* Compact Export Dialog */}
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
                    "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    exportMode === 'fusion' ? "bg-primary text-primary-foreground shadow-sm" : "opacity-40 hover:opacity-70"
                  )}
                >
                  Fusion
                </button>
                <button
                  onClick={() => setExportMode('omni')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    exportMode === 'omni' ? "bg-primary text-primary-foreground shadow-sm" : "opacity-40 hover:opacity-70"
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
                value={(() => {
                  try {
                    return JSON.stringify(exportMode === 'fusion' ? exportConfig() : exportOmniConfig(), null, 2);
                  } catch (err: any) {
                    return `Error: ${err.message}`;
                  }
                })()}
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
            >
              {copied ? <Check className="size-3.5 mr-1.5" /> : <Copy className="size-3.5 mr-1.5" />}
              {copied ? 'Copied' : 'Copy JSON'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        isOpen={showRestartConfirm}
        onOpenChange={setShowRestartConfirm}
        title="Go to Start Page?"
        description="Are you sure you want to go back to the welcome screen? All your current widgets will remain safely stored."
        confirmText="Go back"
        onConfirm={() => setView('welcome')}
      />

      <ImportMergeDialog
        open={showImportMergeDialog}
        onOpenChange={setShowImportMergeDialog}
      />
    </div>
  );
}
