"use client";

import { useState } from 'react';
import { useConfig } from '@/context/ConfigContext';
import { CollectionRowWidget, CollectionItem } from '@/lib/types/widget';
import { Button } from '@/components/ui/button';
import { Plus, ListTree, Layers, SortAsc, SortDesc } from 'lucide-react';

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

export function CollectionRowEditor({ widget, searchQuery = "" }: { widget: CollectionRowWidget, searchQuery?: string }) {
  const {
    addCollectionItem,
    reorderCollectionItems,
    removeCollectionItem,
    updateCollectionItem,
    updateWidgetMeta,
  } = useConfig();
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

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
  
  const handleSort = (direction: 'asc' | 'desc') => {
    const sortedItems = [...widget.dataSource.payload.items].sort((a, b) => {
      const nameA = (a.name || "").trim().toLowerCase();
      const nameB = (b.name || "").trim().toLowerCase();
      return direction === 'asc' 
        ? nameA.localeCompare(nameB) 
        : nameB.localeCompare(nameA);
    });

    updateWidgetMeta(widget.id, {
      dataSource: {
        ...widget.dataSource,
        payload: {
          ...widget.dataSource.payload,
          items: sortedItems
        }
      }
    });
  };


  function handleDragEnd(event: DragEndEvent) {
    if (searchQuery) return;

    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = widget.dataSource.payload.items.findIndex((item) => item.id === active.id);
      const newIndex = widget.dataSource.payload.items.findIndex((item) => item.id === over.id);
      
      reorderCollectionItems(widget.id, oldIndex, newIndex);
    }
  }

  return (
    <div className="space-y-6 max-sm:space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="space-y-4 max-sm:space-y-3">
        <div className="flex items-center justify-between px-1 max-sm:flex-col max-sm:items-stretch max-sm:gap-2.5 max-sm:px-0">
          <h3 className="text-xs max-sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground/75 flex items-center gap-2.5 ml-0.5">
            <ListTree className="size-3.5 opacity-50" />
            Items ({filteredItems.length})
          </h3>

          <div className="flex items-center gap-2 max-sm:flex-wrap max-sm:justify-between">
            {searchQuery && (
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mr-2 max-sm:order-3 max-sm:mr-0 max-sm:w-full">
                Reorder disabled while searching
              </span>
            )}
            <div className="flex items-center gap-1 flex-1">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-9 max-sm:flex-1 px-3 text-xs max-sm:text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 hover:text-primary hover:bg-primary/5 transition-all rounded-lg max-sm:rounded-xl border border-transparent hover:border-primary/10"
                onClick={() => handleSort('asc')}
                title="Sort A-Z"
              >
                <SortAsc className="size-3.5 mr-1.5" />
                A-Z
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-9 max-sm:flex-1 px-3 text-xs max-sm:text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 hover:text-primary hover:bg-primary/5 transition-all rounded-lg max-sm:rounded-xl border border-transparent hover:border-primary/10"
                onClick={() => handleSort('desc')}
                title="Sort Z-A"
              >
                <SortDesc className="size-3.5 mr-1.5" />
                Z-A
              </Button>
            </div>

            <div className="h-5 w-px bg-border/40 mx-2 max-sm:hidden" />

            <div className="max-sm:w-full">
              <AddItemDialog onAdd={handleAddItem} />
            </div>
          </div>
        </div>

        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 gap-4 max-sm:gap-3">
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
              <div className="py-12 max-sm:py-10 border-2 border-dashed rounded-2xl max-sm:rounded-[1.2rem] flex flex-col items-center justify-center text-muted-foreground/30 bg-muted/10 border-border">
                <Layers className="size-10 mb-4 opacity-20" />
                <p className="text-sm font-medium opacity-60 mb-6">This collection has no items yet</p>
                <AddItemDialog 
                  onAdd={handleAddItem} 
                  trigger={
                    <Button variant="outline" size="sm" className="h-9 rounded-xl font-bold px-6 text-[10px] uppercase tracking-wider max-sm:h-10 max-sm:rounded-[1rem]">
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
