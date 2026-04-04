"use client";

import { useState, useCallback, memo } from 'react';
import { useConfig } from '@/context/ConfigContext';
import { CollectionRowWidget, CollectionItem } from '@/lib/types/widget';
import { Button } from '@/components/ui/button';
import { Plus, ListTree, Layers, SortAsc, SortDesc, Pencil, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { CollectionItemEditor } from './CollectionItemEditor';
import { AddItemDialog } from './AddItemDialog';
import { editorPanelClass } from './editorSurfaceStyles';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

export const CollectionRowEditor = memo(function CollectionRowEditor({ 
  widget, 
  searchQuery = "", 
  onRename, 
  onDelete 
}: { 
  widget: CollectionRowWidget, 
  searchQuery?: string, 
  onRename?: () => void,
  onDelete?: (e: React.MouseEvent) => void 
}) {
  const {
    addCollectionItem,
    reorderCollectionItems,
    removeCollectionItem,
    updateCollectionItem,
    updateWidgetMeta,
  } = useConfig();
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'none' | 'asc' | 'desc'>('none');
  const [manualOrder, setManualOrder] = useState<CollectionItem[] | null>(null);

  const filteredItems = widget.dataSource.payload.items.filter(item => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (item.name || "").toLowerCase().includes(q) || item.id.toLowerCase().includes(q);
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAddItem = useCallback((newItem: CollectionItem) => {
    addCollectionItem(widget.id, newItem);
  }, [addCollectionItem, widget.id]);

  const handleDeleteItem = useCallback((itemId: string) => {
    removeCollectionItem(widget.id, itemId);
  }, [removeCollectionItem, widget.id]);

  const handleUpdateItem = useCallback((itemId: string, updates: Partial<CollectionItem>) => {
    updateCollectionItem(widget.id, itemId, updates);
  }, [updateCollectionItem, widget.id]);
  
  const handleSortCycle = () => {
    let nextMode: 'none' | 'asc' | 'desc';
    let newItems: CollectionItem[];

    if (sortMode === 'none') {
      // none -> asc
      nextMode = 'asc';
      // Store current order as manual fallback
      setManualOrder([...widget.dataSource.payload.items]);
      newItems = [...widget.dataSource.payload.items].sort((a, b) => {
        const nameA = (a.name || "").trim().toLowerCase();
        const nameB = (b.name || "").trim().toLowerCase();
        return nameA.localeCompare(nameB);
      });
    } else if (sortMode === 'asc') {
      // asc -> desc
      nextMode = 'desc';
      newItems = [...widget.dataSource.payload.items].sort((a, b) => {
        const nameA = (a.name || "").trim().toLowerCase();
        const nameB = (b.name || "").trim().toLowerCase();
        return nameB.localeCompare(nameA);
      });
    } else {
      nextMode = 'none';
      newItems = manualOrder || [...widget.dataSource.payload.items];
      setManualOrder(null);
    }
    
    updateWidgetMeta(widget.id, { dataSource: { ...widget.dataSource, payload: { ...widget.dataSource.payload, items: newItems } } });
    setSortMode(nextMode);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const items = widget.dataSource.payload.items;
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderCollectionItems(widget.id, oldIndex, newIndex);
      }
    }
  };

  return (
    <div className={cn(editorPanelClass, "flex flex-col gap-6 max-sm:gap-4 p-5 max-sm:p-3.5 bg-white dark:bg-black/10 max-sm:rounded-[1.15rem] dark:border-white/5")}>
      <div className="space-y-5 max-sm:space-y-4">
        <div className="mb-2 border-b border-border/40 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-3 sm:justify-start">
              <div className="hidden min-w-0 items-center gap-2 rounded-xl border border-zinc-200/70 bg-zinc-50/80 px-3 py-2 dark:border-white/8 dark:bg-white/[0.04] sm:inline-flex">
                <ListTree className="size-3.5 text-muted-foreground/50" />
                <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/58">Items</span>
              </div>

              {searchQuery && (
                <span className="hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 sm:inline">
                  Reorder disabled
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 sm:justify-end">
              <AddItemDialog 
                onAdd={handleAddItem} 
                trigger={
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="group h-10 flex-1 rounded-full border border-primary/20 bg-primary/10 px-4 text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-all duration-300 hover:bg-primary/[0.18] hover:text-primary hover:scale-[1.02] active:scale-[0.98] dark:border-primary/25 dark:bg-primary/12 dark:hover:bg-primary/[0.18] sm:h-9 sm:flex-none"
                  >
                    <Plus className="size-3.5 mr-2 transition-colors group-hover:text-primary" /> 
                    Add Item
                  </Button>
                }
              />

              <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200/70 bg-zinc-50/80 p-1.5 dark:border-white/8 dark:bg-white/[0.04]">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={cn(
                    "h-9 w-9 rounded-full border p-0 transition-all shrink-0 hover:scale-110 active:scale-90",
                    sortMode !== 'none' 
                      ? "border-primary/20 bg-primary/[0.08] text-primary hover:bg-primary/12 hover:border-primary/30" 
                      : "border-transparent text-muted-foreground/62 hover:border-primary/10 hover:bg-primary/5 hover:text-primary"
                  )}
                  onClick={handleSortCycle}
                  title={sortMode === 'none' ? "Sort A-Z" : sortMode === 'asc' ? "Sort Z-A" : "Reset Sort"}
                >
                  {sortMode === 'none' ? <SortAsc className="size-3.5" /> : sortMode === 'asc' ? <SortAsc className="size-3.5" /> : <SortDesc className="size-3.5" />}
                </Button>

                {onRename && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-9 w-9 rounded-full border border-transparent p-0 text-muted-foreground/62 transition-all shrink-0 hover:scale-110 active:scale-90 hover:border-primary/10 hover:bg-primary/5 hover:text-primary"
                    onClick={onRename}
                    title="Rename Widget"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}

                {onDelete && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-9 w-9 rounded-full border border-transparent p-0 text-red-500/60 transition-all shrink-0 hover:scale-110 active:scale-90 hover:border-red-500/20 hover:bg-red-500/5 hover:text-red-500 sm:hidden"
                    onClick={onDelete}
                    title="Delete Widget"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 gap-2 max-sm:gap-2">
            <SortableContext 
              items={filteredItems.map(item => item.id)}
              strategy={verticalListSortingStrategy}
            >
              {filteredItems.map((item, index) => (
                <CollectionItemEditor 
                  key={item.id}
                  item={item}
                  index={index}
                  isExpanded={expandedItemId === item.id}
                  onToggleExpand={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}
                  onUpdate={(updates) => handleUpdateItem(item.id, updates)}
                  onDelete={() => handleDeleteItem(item.id)}
                />
              ))}
            </SortableContext>
            
            {widget.dataSource.payload.items.length === 0 && (
              <div className="py-12 max-sm:py-10 border-2 border-dashed rounded-2xl max-sm:rounded-[1.15rem] flex flex-col items-center justify-center text-muted-foreground/30 bg-muted/10 border-border">
                <Layers className="size-10 mb-4 opacity-20" />
                <p className="text-sm font-medium opacity-60 mb-6">This collection has no items yet</p>
                <AddItemDialog 
                  onAdd={handleAddItem} 
                  trigger={
                    <Button variant="outline" size="sm" className="h-9 rounded-[1rem] font-bold px-6 text-[10px] uppercase tracking-wider border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 transition-all dark:border-primary/25 dark:bg-primary/12 dark:hover:bg-primary/18">
                      <Plus className="size-3.5 mr-2" /> Add first item
                    </Button>
                  }
                />
              </div>
            )}
          </div>
        </DndContext>
      </div>
    </div>
  );
});
