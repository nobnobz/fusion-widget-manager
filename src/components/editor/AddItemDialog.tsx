"use client";

import { useRef, useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, RectangleHorizontal, RectangleVertical, Square, Layers, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CollectionItem, AIOMetadataDataSource } from '@/lib/types/widget';
import { DataSourceEditor } from './DataSourceEditor';
import { MANIFEST_PLACEHOLDER } from '@/lib/config-utils';

interface AddItemDialogProps {
  onAdd: (item: CollectionItem) => void;
  trigger?: React.ReactNode;
}

export function AddItemDialog({ onAdd, trigger }: AddItemDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [backgroundImageURL, setBackgroundImageURL] = useState('');
  const backgroundImageUrlInputRef = useRef<HTMLInputElement | null>(null);
  const [layout, setLayout] = useState<'Wide' | 'Poster' | 'Square'>('Wide');
  const [dataSources, setDataSources] = useState<AIOMetadataDataSource[]>([
    {
      sourceType: 'aiometadata',
      kind: 'addonCatalog',
      payload: { addonId: MANIFEST_PLACEHOLDER, catalogId: '', catalogType: 'movie' }
    }
  ]);

  const handleAdd = () => {
    if (!name.trim()) return;
    
    const newItem: CollectionItem = {
      id: crypto.randomUUID(),
      name: name.trim(),
      hideTitle: false,
      layout: layout,
      backgroundImageURL: backgroundImageURL.trim(),
      dataSources: dataSources
    };
    
    onAdd(newItem);
    setOpen(false);
    setName('');
    setBackgroundImageURL('');
    setLayout('Wide');
    setDataSources([
      {
        sourceType: 'aiometadata',
        kind: 'addonCatalog',
        payload: { addonId: MANIFEST_PLACEHOLDER, catalogId: '', catalogType: 'movie' }
      }
    ]);
  };

  const handleClearBackgroundImageUrl = () => {
    setBackgroundImageURL('');

    requestAnimationFrame(() => {
      backgroundImageUrlInputRef.current?.focus();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="h-9 w-full sm:w-auto px-4 rounded-xl font-bold uppercase tracking-wider text-[10px] sm:text-xs border border-primary/20 bg-primary/10 text-primary transition-all hover:bg-primary/20 dark:border-primary/25 dark:bg-primary/12 dark:hover:bg-primary/18">
            <Plus className="size-3.5 mr-2" /> Add Item
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px] rounded-3xl border border-zinc-200 dark:border-border/40 bg-white dark:bg-background/95 p-0 overflow-hidden  backdrop-blur-2xl">
        <DialogTitle className="sr-only">Add New Item</DialogTitle>
        <div className="p-8 pt-10 max-sm:p-5 max-sm:pt-6">
          <DialogHeader className="space-y-6 items-start text-left">
            <div className="size-14 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary  max-sm:size-12">
              <Plus className="size-7 max-sm:size-6" />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-black tracking-tight max-sm:text-xl">Add New Item</DialogTitle>
              <DialogDescription className="text-muted-foreground/60 text-xs font-medium leading-relaxed max-w-[360px] max-sm:text-[11px] max-sm:max-w-none">
                Configure a new entry for your collection.
              </DialogDescription>
            </div>
        </DialogHeader>
        
        <div className="space-y-5 py-8 max-sm:space-y-4 max-sm:py-6">
          <div className="space-y-2.5">
            <Label htmlFor="item-title" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/50 ml-1">Item Title</Label>
            <div className="relative group rounded-xl border border-zinc-200 dark:border-border/10 bg-zinc-100 dark:bg-zinc-900/30 p-1 transition-all focus-within:border-primary/30">
              <Input
                id="item-title"
                placeholder="e.g. Inception"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 max-sm:h-11 bg-transparent border-none focus-visible:ring-0 rounded-xl font-semibold px-4 text-base sm:text-sm text-foreground/85"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="item-url" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/50 ml-1">Image URL</Label>
            <div className="relative group rounded-xl border border-border/10 bg-zinc-900/30 p-1 transition-all focus-within:border-primary/30">
              <Input
                id="item-url"
                ref={backgroundImageUrlInputRef}
                placeholder="https://..."
                value={backgroundImageURL}
                onChange={(e) => setBackgroundImageURL(e.target.value)}
                className="h-11 max-sm:h-11 bg-transparent border-none focus-visible:ring-0 rounded-xl px-4 pr-12 text-sm sm:text-[11px] font-semibold text-foreground/60 focus:text-foreground/90 transition-colors flex-1 min-w-0"
              />
              {backgroundImageURL && (
                <button
                  type="button"
                  onClick={handleClearBackgroundImageUrl}
                  className="absolute right-3 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground/45 transition-colors hover:bg-destructive/10 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive/20"
                  aria-label="Clear image URL"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </div>
          
          <div className="space-y-3">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/50 ml-1">Aspect Ratio</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'Wide', label: 'Wide', icon: RectangleHorizontal },
                { id: 'Poster', label: 'Poster', icon: RectangleVertical },
                { id: 'Square', label: 'Square', icon: Square },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setLayout(opt.id as 'Wide' | 'Poster' | 'Square')}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-3 max-sm:min-h-[88px] rounded-xl border transition-all",
                    layout === opt.id 
                      ? "bg-primary/5 border-primary text-primary " 
                      : "bg-zinc-100 dark:bg-muted/30 border-transparent text-muted-foreground/60 hover:bg-zinc-200/60 dark:hover:bg-muted/50"
                  )}
                >
                  <opt.icon className="size-4" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/50 ml-1 flex items-center gap-1.5">
                <Layers className="size-3" /> Data Source
              </Label>
            </div>
            <DataSourceEditor 
              dataSource={dataSources[0]}
              onUpdate={(updates) => setDataSources([ { ...dataSources[0], payload: { ...dataSources[0].payload, ...updates } } ])}
              onDelete={() => {}} 
            />
          </div>
        </div>
        
        <DialogFooter className="flex-col sm:flex-row gap-3 sm:gap-4 mt-4">
          <Button 
            variant="ghost" 
            onClick={() => setOpen(false)}
            className="w-full sm:flex-1 h-11 sm:h-12 rounded-xl font-bold uppercase tracking-wider text-xs text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30 transition-all"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleAdd}
            disabled={!name.trim()}
            className="w-full sm:flex-1 h-11 sm:h-12 rounded-xl font-bold uppercase tracking-wider text-xs   bg-primary hover:bg-primary/90 text-primary-foreground transition-all active:scale-95"
          >
            Create Item
          </Button>
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
