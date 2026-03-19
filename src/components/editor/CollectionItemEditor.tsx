"use client";

import { CollectionItem, AddonCatalogDataSource } from '@/lib/types/widget';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { useConfig } from '@/context/ConfigContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { findCatalog } from '@/lib/config-utils';
import { 
  Trash2, 
  Copy, 
  GripVertical, 
  Plus, 
  Eye, 
  EyeOff, 
  Image as ImageIcon, 
  Layers, 
  RectangleHorizontal,
  RectangleVertical,
  Square,
  AlertTriangle,
  ChevronRight,
  Pencil
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DataSourceEditor } from './DataSourceEditor';
import { MANIFEST_PLACEHOLDER } from '@/lib/config-utils';

export function CollectionItemEditor({ 
  item, 
  onUpdate, 
  onDelete, 
  onDuplicate,
  isExpanded,
  onToggleExpand
}: { 
  item: CollectionItem, 
  index: number,
  onUpdate: (updates: Partial<CollectionItem>) => void,
  onDelete: () => void,
  onDuplicate: () => void,
  isExpanded: boolean,
  onToggleExpand: () => void
}) {
  const { manifestCatalogs } = useConfig();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  
  const hasInvalidCatalog = useMemo(() => {
    return item.dataSources.some(ds => {
      const { addonId, catalogId } = ds.payload || {};
      if (!addonId?.toUpperCase().includes('AIOMETADATA')) return false;
      if (!catalogId) return false;
      
      return !findCatalog(manifestCatalogs, catalogId);
    });
  }, [item.dataSources, manifestCatalogs]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleAddDataSource = () => {
    const newDS: AddonCatalogDataSource = {
      kind: 'addonCatalog',
      payload: {
        addonId: MANIFEST_PLACEHOLDER,
        catalogId: '',
        catalogType: 'movie'
      }
    };
    onUpdate({ 
      dataSources: [...item.dataSources, newDS],
    });
  };

  const handleDeleteDataSource = (dsIndex: number) => {
    onUpdate({ dataSources: item.dataSources.filter((_, i) => i !== dsIndex) });
  };

  const handleUpdateDataSource = (dsIndex: number, updates: Partial<AddonCatalogDataSource['payload']>) => {
    onUpdate({
      dataSources: item.dataSources.map((ds, i) => 
        i === dsIndex ? { ...ds, payload: { ...ds.payload, ...updates } } : ds
      )
    });
  };

  const handleTitleSubmit = () => {
    if (editName.trim() && editName !== item.name) {
      onUpdate({ name: editName.trim() });
    }
    setIsEditing(false);
  };

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(item.name);
    setIsEditing(true);
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "z-50")}>
      <Card className="group bg-card border border-zinc-200/80 dark:border-border shadow-[0_1px_4px_rgba(0,0,0,0.02)] dark:shadow-none rounded-xl overflow-hidden transition-all duration-300 hover:border-primary/30 hover:shadow-sm">
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div 
            className="flex items-center justify-between p-3 border-b border-border/40 bg-primary/[0.02] cursor-pointer"
            onClick={onToggleExpand}
          >
            <div className="flex-1 flex items-center gap-3 min-w-0">
            <div 
                {...attributes} 
                {...listeners}
                className="text-muted-foreground/30 hover:text-primary hover:bg-primary/5 transition-all cursor-grab active:cursor-grabbing p-1.5 rounded-lg shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="size-3.5" />
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                {hasInvalidCatalog && (
                  <AlertTriangle className="size-3.5 text-amber-500 animate-pulse shrink-0" />
                )}
                
                <div 
                  className="min-w-0 group/title flex-1 flex items-center gap-2"
                >
                  {isEditing ? (
                    <Input 
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={handleTitleSubmit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleTitleSubmit();
                        if (e.key === 'Escape') {
                          setEditName(item.name);
                          setIsEditing(false);
                        }
                      }}
                      className="h-6 py-0 px-2 text-xs font-bold tracking-tight bg-background border-primary/30 focus:border-primary/50 focus-visible:ring-0 rounded-md w-full max-w-[200px]"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div 
                      className="flex items-center gap-2 group/text overflow-hidden cursor-pointer"
                      onClick={startEditing}
                    >
                      <span className="text-sm font-bold tracking-tight text-foreground/90 truncate">
                        {item.name || "Untitled Item"}
                      </span>
                      <Pencil className="size-3 text-primary opacity-0 group-hover/text:opacity-40 transition-opacity shrink-0" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 ml-3 shrink-0">
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn(
                  "size-8 rounded-lg transition-all",
                  isExpanded ? "bg-primary/10 text-primary rotate-90" : "text-muted-foreground/40 hover:bg-primary/5 hover:text-primary"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand();
                }}
                title={isExpanded ? "Collapse Item" : "Expand Item"}
              >
                <ChevronRight className="size-3.5" />
              </Button>
              <div className="w-px h-4 bg-border mx-1" />
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn(
                  "size-8 rounded-lg transition-all",
                  item.hideTitle ? "text-muted-foreground/40" : "text-primary bg-primary/5"
                )}
                onClick={(e) => {
                   e.stopPropagation();
                   onUpdate({ hideTitle: !item.hideTitle });
                }}
                title={item.hideTitle ? "Show Title" : "Hide Title"}
              >
                  {item.hideTitle ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="size-8 rounded-lg hover:bg-primary/5" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} title="Duplicate Item">
                <Copy className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="size-8 rounded-lg text-destructive/40 hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete Item">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                layout
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="p-5 flex flex-col gap-6 bg-muted/20 border-t border-border">
                  {/* Configuration Area */}
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/50 ml-1">Configuration & Preview</Label>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-6 p-5 bg-muted/20 dark:bg-muted/10 rounded-2xl border border-zinc-200 dark:border-border/40 shadow-sm backdrop-blur-sm">
                          {/* Adaptive Thumbnail */}
                          <div className={cn(
                            "rounded-xl bg-zinc-950 border border-border/40 flex items-center justify-center relative shadow-inner overflow-hidden shrink-0 transition-all duration-500 mx-auto sm:mx-0",
                            item.layout === 'Poster' ? "aspect-[2/3] w-28 sm:w-24" : 
                            item.layout === 'Wide' ? "aspect-video w-48 sm:w-40" : 
                            "aspect-square w-32 sm:w-28"
                          )}>
                            {item.backgroundImageURL ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img 
                                src={item.backgroundImageURL} 
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="size-6 text-muted-foreground/10" />
                            )}
                          </div>

                          <div className="flex-1 flex flex-col gap-4 sm:gap-3 w-full min-w-0">
                            <div className="flex items-center justify-center sm:justify-start">
                              {/* Premium Segmented Control */}
                              <div className="flex flex-wrap items-center justify-center sm:justify-start p-1 bg-muted/50 rounded-lg border border-border gap-1">
                                {[
                                  { id: 'Wide', label: 'Wide', icon: RectangleHorizontal },
                                  { id: 'Poster', label: 'Poster', icon: RectangleVertical },
                                  { id: 'Square', label: 'Square', icon: Square }
                                ].map((opt) => (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => onUpdate({ layout: opt.id as CollectionItem['layout'] })}
                                    className={cn(
                                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all min-w-[80px] sm:min-w-0 justify-center sm:justify-start",
                                      item.layout === opt.id 
                                        ? "bg-primary text-primary-foreground shadow-sm" 
                                        : "text-muted-foreground/50 hover:text-foreground hover:bg-background"
                                    )}
                                  >
                                    <opt.icon className="size-3" />
                                    <span className="leading-none">{opt.label}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
 
                            <div className="relative group/url w-full">
                              <ImageIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/30 group-focus-within/url:text-primary transition-colors" />
                              <Input 
                                placeholder="Image URL (https://...)" 
                                className="h-10 pl-10 text-xs bg-background/50 border-zinc-200 dark:border-border/40 focus:border-primary/50 focus-visible:ring-0 rounded-xl shadow-sm dark:shadow-none backdrop-blur-sm transition-all"
                                value={item.backgroundImageURL}
                                onChange={(e) => onUpdate({ backgroundImageURL: e.target.value })}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
 
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/50 flex items-center gap-1.5">
                          <Layers className="size-3" /> Data Sources
                        </h4>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-6 px-2 text-[10px] gap-1 font-bold border-border/40 bg-muted/10 hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-all rounded-lg uppercase tracking-wider backdrop-blur-sm" 
                          onClick={(e) => { e.stopPropagation(); handleAddDataSource(); }}
                        >
                          <Plus className="size-2.5" /> New
                        </Button>
                      </div>
                      <div className="space-y-2 pr-1">
                        {item.dataSources.map((ds, dsIndex) => (
                          <DataSourceEditor 
                            key={dsIndex}
                            dataSource={ds}
                            onUpdate={(updates) => handleUpdateDataSource(dsIndex, updates)}
                            onDelete={() => handleDeleteDataSource(dsIndex)}
                          />
                        ))}
                        {item.dataSources.length === 0 && (
                          <div className="flex items-center justify-center py-4 border border-dashed border-border/20 rounded-xl bg-muted/5">
                            <p className="text-[10px] text-muted-foreground/30 font-bold uppercase tracking-widest">No catalogs</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
 
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </div>
  );
}
