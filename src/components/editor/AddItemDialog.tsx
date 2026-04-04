"use client";

import { useRef, useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogTitle, 
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, RectangleHorizontal, RectangleVertical, Square, Layers, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CollectionItem, AIOMetadataDataSource } from '@/lib/types/widget';
import { DataSourceEditor } from './DataSourceEditor';
import { MANIFEST_PLACEHOLDER } from '@/lib/config-utils';
import {
  editorActionButtonClass,
  editorFooterPrimaryButtonClass,
  editorFooterSecondaryButtonClass,
  editorFormSurfaceClass,
} from './editorSurfaceStyles';
import { useMobile } from '@/hooks/use-mobile';

interface AddItemDialogProps {
  onAdd: (item: CollectionItem) => void;
  trigger?: React.ReactNode;
}

export function AddItemDialog({ onAdd, trigger }: AddItemDialogProps) {
  const isMobile = useMobile();
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

  const Content = (
    <div className="flex flex-col min-h-0 max-h-[min(100dvh-2rem,48rem)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-6 pt-10 max-sm:px-5 max-sm:pb-5 max-sm:pt-6">
        <header className="relative space-y-5 items-start text-left">
          <div className="size-14 rounded-xl border border-primary/12 bg-primary/[0.06] flex items-center justify-center text-primary max-sm:size-11">
            <Plus className="size-7 max-sm:size-5" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-2xl font-black tracking-tight max-sm:text-[1.35rem]">Add New Item</h2>
            <p className="max-w-[360px] text-xs font-medium leading-relaxed text-muted-foreground/64 max-sm:max-w-none max-sm:text-[11px]">
              Configure a new entry for your collection.
            </p>
          </div>
        </header>
        
        <div className="space-y-5 py-7 max-sm:space-y-4 max-sm:py-5">
          <div className="space-y-2.5">
            <Label htmlFor="item-title" className="ml-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/48">Item Title</Label>
            <div className={cn(editorFormSurfaceClass, "relative group p-1 transition-all focus-within:border-primary/30")}>
              <Input
                id="item-title"
                placeholder="e.g. Inception"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 bg-transparent border-none rounded-xl px-4 text-base font-semibold text-foreground/85 focus-visible:ring-0 sm:text-sm"
                autoFocus={!isMobile}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="item-url" className="ml-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/48">Image URL</Label>
            <div className={cn(editorFormSurfaceClass, "relative group p-1 transition-all focus-within:border-primary/30")}>
              <Input
                id="item-url"
                ref={backgroundImageUrlInputRef}
                placeholder="https://..."
                value={backgroundImageURL}
                onChange={(e) => setBackgroundImageURL(e.target.value)}
                className="h-11 bg-transparent border-none rounded-xl px-4 pr-12 text-base font-semibold text-foreground/85 transition-colors focus:text-foreground focus-visible:ring-0 sm:text-sm"
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
            <Label className="ml-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/48">Aspect Ratio</Label>
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
                    "flex min-h-[82px] flex-col items-center justify-center gap-2 rounded-2xl border p-3 transition-all",
                    layout === opt.id
                      ? "border-primary bg-primary/[0.06] text-primary"
                      : "border-zinc-200/65 bg-zinc-50/60 text-muted-foreground/60 hover:border-zinc-300/75 hover:bg-zinc-50/80 dark:border-white/8 dark:bg-white/[0.03] dark:hover:border-white/12 dark:hover:bg-white/[0.05]"
                  )}
                >
                  <opt.icon className="size-4" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em]">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-border/70 dark:border-white/8">
            <div className="mb-1 flex items-center justify-between">
              <Label className="ml-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/48">
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
      </div>
      
      <div className="px-8 pb-8 pt-1 max-sm:px-5 max-sm:pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] max-sm:pt-0">
        <footer className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <Button 
            variant="ghost" 
            onClick={() => setOpen(false)}
            className={cn(editorActionButtonClass, editorFooterSecondaryButtonClass, "w-full sm:flex-1")}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleAdd}
            disabled={!name.trim()}
            className={cn(editorActionButtonClass, editorFooterPrimaryButtonClass, "w-full sm:flex-1")}
          >
            Create Item
          </Button>
        </footer>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          {trigger || (
            <Button variant="ghost" size="sm" className={cn(editorActionButtonClass, "h-9 w-full sm:w-auto px-4 text-[10px] sm:text-xs border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 dark:border-primary/25 dark:bg-primary/12 dark:hover:bg-primary/18")}>
              <Plus className="size-3.5 mr-2" /> Add Item
            </Button>
          )}
        </DrawerTrigger>
        <DrawerContent className="border-zinc-200/80 bg-zinc-50/96 dark:border-white/12 dark:bg-zinc-950/93">
          <DrawerTitle className="sr-only">Add New Item</DrawerTitle>
          {Content}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className={cn(editorActionButtonClass, "h-9 w-full sm:w-auto px-4 text-[10px] sm:text-xs border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 dark:border-primary/25 dark:bg-primary/12 dark:hover:bg-primary/18")}>
            <Plus className="size-3.5 mr-2" /> Add Item
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px] rounded-3xl border border-zinc-200/80 bg-zinc-50/96 p-0 overflow-hidden backdrop-blur-2xl dark:border-white/12 dark:bg-zinc-950/93">
        <DialogTitle className="sr-only">Add New Item</DialogTitle>
        {Content}
      </DialogContent>
    </Dialog>
  );
}

