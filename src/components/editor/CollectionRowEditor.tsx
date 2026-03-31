"use client";

import { useState } from 'react';
import { useConfig } from '@/context/ConfigContext';
import { CollectionRowWidget, CollectionItem } from '@/lib/types/widget';
import { Button } from '@/components/ui/button';
import { Plus, ListTree, Layers, SortAsc, SortDesc, Pencil } from 'lucide-react';

import { cn } from '@/lib/utils';
import { CollectionItemEditor } from './CollectionItemEditor';
import { AddItemDialog } from './AddItemDialog';
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

export function CollectionRowEditor({ widget, searchQuery = "", onRename }: { widget: CollectionRowWidget, searchQuery?: string, onRename?: () => void }) {
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

  const handleAddItem = (newItem: CollectionItem) => {
    addCollectionItem(widget.id, newItem);
  };

  const handleDeleteItem = (itemId: string) => {
    removeCollectionItem(widget.id, itemId);
  };

  const handleUpdateItem = (itemId: string, updates: Partial<CollectionItem>) => {
    updateCollectionItem(widget.id, itemId, updates);
  };
  
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
    <div className="flex flex-col gap-6 max-sm:gap-4 p-5 max-sm:p-3.5 bg-white dark:bg-black/10 rounded-xl border border-zinc-200/80 dark:border-white/5  backdrop-blur-sm">
      <div className="space-y-5 max-sm:space-y-4">
        <div className="flex items-center justify-between border-b border-border/40 pb-4 mb-2">
          <div className="flex items-center gap-4 flex-1">
            <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 flex items-center gap-2">
              <ListTree className="size-3.5" /> Items ({widget.dataSource.payload.items.length})
            </h4>
            <div className="h-4 w-px bg-border/40" />
            <AddItemDialog 
              onAdd={handleAddItem} 
              trigger={
                <Button variant="ghost" size="sm" className="h-9 rounded-xl font-bold px-4 text-[10px] uppercase tracking-wider border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 transition-all dark:border-primary/25 dark:bg-primary/12 dark:hover:bg-primary/18">
                  <Plus className="size-3.5 mr-2" /> Add Item
                </Button>
              }
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-background/50 dark:bg-black/20 p-1 rounded-xl border border-border/40 shrink-0">

              <Button 
                variant="ghost" 
                size="sm" 
                className={cn(
                  "h-9 w-9 p-0 transition-all rounded-xl border shrink-0",
                  sortMode !== 'none' 
                    ? "text-primary bg-primary/5 border-primary/20 hover:bg-primary/10 hover:border-primary/30" 
                    : "text-muted-foreground/60 border-transparent hover:text-primary hover:bg-primary/5 hover:border-primary/10"
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
                  className="h-9 w-9 p-0 text-muted-foreground/60 hover:text-primary hover:bg-primary/5 transition-all rounded-xl border border-transparent hover:border-primary/10 shrink-0"
                  onClick={onRename}
                  title="Rename Widget"
                >
                  <Pencil className="size-3.5" />
                </Button>
              )}
            </div>

            {searchQuery && (
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mr-2 max-sm:hidden">
                Reorder disabled
              </span>
            )}
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
              <div className="py-12 max-sm:py-10 border-2 border-dashed rounded-3xl max-sm:rounded-[1.5rem] flex flex-col items-center justify-center text-muted-foreground/30 bg-muted/10 border-border">
                <Layers className="size-10 mb-4 opacity-20" />
                <p className="text-sm font-medium opacity-60 mb-6">This collection has no items yet</p>
                <AddItemDialog 
                  onAdd={handleAddItem} 
                  trigger={
                    <Button variant="outline" size="sm" className="h-9 rounded-xl font-bold px-6 text-[10px] uppercase tracking-wider border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 transition-all dark:border-primary/25 dark:bg-primary/12 dark:hover:bg-primary/18">
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
}
