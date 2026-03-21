"use client";

import { useState } from 'react';
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
import { Plus, RectangleHorizontal, RectangleVertical, Square, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CollectionItem, AddonCatalogDataSource } from '@/lib/types/widget';
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
  const [layout, setLayout] = useState<'Wide' | 'Poster' | 'Square'>('Wide');
  const [dataSources, setDataSources] = useState<AddonCatalogDataSource[]>([
    {
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
        kind: 'addonCatalog',
        payload: { addonId: MANIFEST_PLACEHOLDER, catalogId: '', catalogType: 'movie' }
      }
    ]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="h-9 max-sm:h-10 w-full sm:w-auto px-4 rounded-xl max-sm:rounded-[1rem] font-bold uppercase tracking-wider text-xs max-sm:text-[10px] border-border/40 bg-muted/10 hover:bg-muted/20 transition-all text-foreground/80">
            <Plus className="size-3.5 mr-2" /> Add Item
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px] rounded-[2.5rem] border border-border/40 bg-background/95 p-0 overflow-hidden shadow-2xl backdrop-blur-2xl max-sm:w-[calc(100vw-1rem)] max-sm:max-w-[calc(100vw-1rem)] max-sm:rounded-[1.9rem] [&>button:last-child]:top-8 [&>button:last-child]:right-8 [&>button:last-child]:size-9 [&>button:last-child]:rounded-full [&>button:last-child]:bg-muted/30 [&>button:last-child]:hover:bg-muted/50 [&>button:last-child]:transition-all [&>button:last-child]:border-none [&>button:last-child]:flex [&>button:last-child]:items-center [&>button:last-child]:justify-center max-sm:[&>button:last-child]:top-4 max-sm:[&>button:last-child]:right-4">
        <div className="p-8 pt-10 max-sm:p-5 max-sm:pt-6">
          <DialogHeader className="space-y-4 items-start text-left">
            <div className="size-14 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary shadow-sm max-sm:size-12 max-sm:rounded-[1rem]">
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
            <div className="relative group rounded-2xl border border-border/10 bg-muted/20 p-1 transition-all focus-within:border-primary/30">
              <Input
                id="item-title"
                placeholder="e.g. Inception"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 max-sm:h-11 bg-transparent border-none focus-visible:ring-0 rounded-xl max-sm:rounded-[1rem] font-semibold px-4"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="item-url" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/50 ml-1">Image URL</Label>
            <div className="relative group rounded-2xl border border-border/10 bg-muted/20 p-1 transition-all focus-within:border-primary/30">
              <Input
                id="item-url"
                placeholder="https://..."
                value={backgroundImageURL}
                onChange={(e) => setBackgroundImageURL(e.target.value)}
                className="h-11 max-sm:h-11 bg-transparent border-none focus-visible:ring-0 rounded-xl max-sm:rounded-[1rem] px-4 font-mono text-xs"
              />
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
                    "flex flex-col items-center justify-center gap-2 p-3 max-sm:min-h-[88px] rounded-xl max-sm:rounded-[1rem] border transition-all",
                    layout === opt.id 
                      ? "bg-primary/5 border-primary text-primary shadow-sm" 
                      : "bg-muted/30 border-transparent text-muted-foreground/60 hover:bg-muted/50"
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
            className="w-full sm:flex-1 h-11 sm:h-12 rounded-xl max-sm:rounded-[1rem] font-bold uppercase tracking-wider text-xs text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30 transition-all"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleAdd}
            disabled={!name.trim()}
            className="w-full sm:flex-1 h-11 sm:h-12 rounded-xl max-sm:rounded-[1rem] font-bold uppercase tracking-wider text-xs shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground transition-all active:scale-95"
          >
            Create Item
          </Button>
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
