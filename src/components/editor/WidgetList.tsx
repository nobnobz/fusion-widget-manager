"use client";

import { useState, useMemo } from 'react';
import { useConfig } from '@/context/ConfigContext';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import { 
  restrictToVerticalAxis 
} from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableWidget } from './SortableWidget';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WidgetListProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function WidgetList({ selectedId, onSelect }: WidgetListProps) {
  const { 
    widgets, 
    deleteWidget, 
    duplicateWidget, 
    reorderWidgets,
    setIsDragging 
  } = useConfig();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeWidget = useMemo(() => 
    widgets.find(w => w.id === activeId)
  , [widgets, activeId]);

  const filteredWidgets = useMemo(() => {
    return widgets.filter(w => 
      w.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [widgets, searchQuery]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
    setIsDragging(true);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setIsDragging(false);

    if (over && active.id !== over.id) {
      const oldIndex = widgets.findIndex((w) => w.id === active.id);
      const newIndex = widgets.findIndex((w) => w.id === over.id);
      reorderWidgets(oldIndex, newIndex);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b bg-muted/20">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40 transition-colors group-focus-within:text-primary" />
          <Input 
            placeholder="Search widgets..." 
            className="pl-10 h-10 text-xs bg-white/50 dark:bg-black/20 border-border/40 rounded-xl focus-visible:ring-primary/20 transition-all font-medium"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute right-0.5 top-1/2 -translate-y-1/2 size-7 hover:bg-transparent"
              onClick={() => setSearchQuery('')}
            >
              <X className="size-3 text-muted-foreground hover:text-foreground" />
            </Button>
          )}
        </div>
      </div>
      
      <DndContext 
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
          <SortableContext 
            items={filteredWidgets.map(w => w.id)}
            strategy={verticalListSortingStrategy}
          >
            {filteredWidgets.map((widget) => (
              <SortableWidget 
                key={widget.id}
                widget={widget}
                isSelected={selectedId === widget.id}
                onSelect={onSelect}
                onDelete={deleteWidget}
              />
            ))}
          </SortableContext>
          
          {filteredWidgets.length === 0 && (
            <div className="py-20 text-center border-2 border-dashed rounded-3xl border-muted/30 bg-muted/5">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/40">
                {searchQuery ? 'No matches' : 'No widgets'}
              </p>
            </div>
          )}
        </div>

        <DragOverlay adjustScale={false} modifiers={[restrictToVerticalAxis]}>
          {activeId && activeWidget ? (
            <SortableWidget 
              widget={activeWidget}
              isSelected={selectedId === activeId}
              onSelect={() => {}}
              onDelete={() => {}}
              isOverlay={true}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
