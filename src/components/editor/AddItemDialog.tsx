"use client";

import { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
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
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-xl font-bold tracking-tight">Add New Item</DialogTitle>
          <p className="text-xs text-muted-foreground/60 font-medium">Configure a new entry for your collection.</p>
        </DialogHeader>
        
        <div className="p-6 space-y-5">
          <div className="space-y-2.5">
            <Label htmlFor="item-title" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/50 ml-1">Item Title</Label>
            <Input
              id="item-title"
              placeholder="e.g. Inception"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 bg-background border-border focus:border-primary/50 rounded-xl font-semibold"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="item-url" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/50 ml-1">Image URL</Label>
            <Input
              id="item-url"
              placeholder="https://..."
              value={backgroundImageURL}
              onChange={(e) => setBackgroundImageURL(e.target.value)}
              className="h-10 bg-background border-border focus:border-primary/50 rounded-xl px-4 font-mono text-xs"
            />
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
                    "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all",
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
        
        <DialogFooter className="px-6 py-4 bg-muted/30 border-t border-border flex items-center justify-end gap-3">
          <Button 
            variant="ghost" 
            onClick={() => setOpen(false)}
            size="sm"
            className="h-9 px-6 rounded-lg text-xs font-bold uppercase tracking-wider"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleAdd}
            disabled={!name.trim()}
            size="sm"
            className="h-9 px-6 rounded-xl font-bold uppercase tracking-wider text-xs shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground transition-all active:scale-95"
          >
            Create Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
