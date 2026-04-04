"use client";

import { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogTitle, 
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Box, Layers, Check, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConfig } from '@/context/ConfigContext';
import { MANIFEST_PLACEHOLDER } from '@/lib/config-utils';
import { Widget } from '@/lib/types/widget';
import { editorActionButtonClass, editorFormSurfaceClass } from './editorSurfaceStyles';
import { useMobile } from '@/hooks/use-mobile';

interface NewWidgetDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}

export function NewWidgetDialog({ isOpen, onOpenChange, onCreated }: NewWidgetDialogProps) {
  const isMobile = useMobile();
  const { addWidget } = useConfig();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'collection.row' | 'row.classic'>('collection.row');

  const handleCreate = () => {
    if (!title.trim()) return;

    const id = crypto.randomUUID();
    const newWidget: Widget = type === 'collection.row'
      ? {
          id,
          title: title.trim(),
          type,
          dataSource: { kind: 'collection', payload: { items: [] } },
        }
      : {
          id,
          title: title.trim(),
          type,
          dataSource: {
            sourceType: 'aiometadata',
            kind: 'addonCatalog',
            payload: { addonId: MANIFEST_PLACEHOLDER, catalogId: '', catalogType: 'movie' },
          },
        cacheTTL: 1800,
        limit: 20,
        presentation: {
          aspectRatio: 'poster' as const,
          cardStyle: 'medium' as const,
          badges: { providers: false, ratings: true }
        }
      };

    addWidget(newWidget);
    onCreated(id);
    onOpenChange(false);
    setTitle('');
    setType('collection.row');
  };

  const Content = (
    <div className="flex flex-col min-h-0 max-h-[min(100dvh-2rem,46rem)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-6 pt-10 max-sm:px-5 max-sm:pb-5 max-sm:pt-6">
        <header className="relative space-y-5 items-start text-left">
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-0 top-0.5 p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 text-muted-foreground/60 hover:text-foreground active:scale-95 transition-all"
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </button>
          <div className="size-14 rounded-xl border border-primary/12 bg-primary/[0.06] flex items-center justify-center text-primary max-sm:size-11">
            <Sparkles className="size-7 max-sm:size-[1.375rem]" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-2xl font-black tracking-tight max-sm:text-[1.35rem]">Add New Widget</h2>
            <p className="max-w-[360px] text-xs font-medium leading-relaxed text-muted-foreground/64 max-sm:max-w-none max-sm:text-[11px]">
              Add a new widget to organize your Fusion content.
            </p>
          </div>
        </header>

        <div className="space-y-7 py-7 max-sm:space-y-5 max-sm:py-5">
          <div className="space-y-2.5">
            <Label htmlFor="widget-title" className="ml-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/48">Widget Title</Label>
            <div className={cn(editorFormSurfaceClass, "relative group p-1 transition-all focus-within:border-primary/30 dark:focus-within:border-primary/28")}>
              <Input
                data-testid="new-widget-title-input"
                id="widget-title"
                placeholder="e.g. Recommended for You"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-11 bg-transparent border-none px-4 text-base font-semibold text-foreground/85 transition-all focus-visible:ring-0 sm:text-sm"
                autoFocus={!isMobile}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <Label className="ml-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/48">Widget Type</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => setType('collection.row')}
                className={cn(
                  "group/btn relative flex min-h-[132px] flex-col items-start gap-3 overflow-hidden rounded-2xl border p-4 transition-all sm:min-h-[156px] sm:p-5",
                  type === 'collection.row'
                    ? "border-primary bg-primary/[0.06]"
                    : "border-zinc-200/65 bg-zinc-50/58 hover:border-zinc-300/75 hover:bg-zinc-50/82 dark:border-white/8 dark:bg-white/[0.03] dark:hover:border-white/12 dark:hover:bg-white/[0.05]"
                )}
              >
                <div className={cn(
                  "flex size-10 items-center justify-center rounded-xl transition-colors",
                  type === 'collection.row' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover/btn:bg-muted/80"
                )}>
                  <Box className="size-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold">Collection</p>
                  <p className="mt-1 text-[11px] font-medium leading-tight text-muted-foreground/62">Add a collection with different catalogs and custom images.</p>
                </div>
                {type === 'collection.row' && (
                  <div className="absolute right-4 top-4 animate-in fade-in zoom-in">
                    <Check className="size-4 text-primary" />
                  </div>
                )}
              </button>

              <button
                type="button"
                onClick={() => setType('row.classic')}
                className={cn(
                  "group/btn relative flex min-h-[132px] flex-col items-start gap-3 overflow-hidden rounded-2xl border p-4 transition-all sm:min-h-[156px] sm:p-5",
                  type === 'row.classic'
                    ? "border-indigo-500 bg-indigo-500/6"
                    : "border-zinc-200/65 bg-zinc-50/58 hover:border-zinc-300/75 hover:bg-zinc-50/82 dark:border-white/8 dark:bg-white/[0.03] dark:hover:border-white/12 dark:hover:bg-white/[0.05]"
                )}
              >
                <div className={cn(
                  "flex size-10 items-center justify-center rounded-xl transition-colors",
                  type === 'row.classic' ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground group-hover/btn:bg-muted/80"
                )}>
                  <Layers className="size-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold">Classic Row</p>
                  <p className="mt-1 text-[11px] font-medium leading-tight text-muted-foreground/62">Show a single catalog on your homescreen.</p>
                </div>
                {type === 'row.classic' && (
                  <div className="absolute right-4 top-4 animate-in fade-in zoom-in">
                    <Check className="size-4 text-indigo-500" />
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 pb-8 pt-1 max-sm:px-5 max-sm:pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] max-sm:pt-0">
        <footer className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            className={cn(editorActionButtonClass, "h-11 w-full text-xs text-muted-foreground/52 hover:bg-white/72 hover:text-muted-foreground sm:h-12 sm:flex-1 dark:hover:bg-white/[0.06]")}>
            Cancel
          </Button>
          <Button 
            data-testid="new-widget-submit"
            onClick={handleCreate}
            disabled={!title.trim()}
            className={cn(editorActionButtonClass, "h-11 w-full text-xs sm:h-12 sm:flex-1")}
          >
            Add Widget
          </Button>
        </footer>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[94dvh] border-border/40 bg-background rounded-t-[2.5rem]">
          <DrawerTitle className="sr-only">Add New Widget</DrawerTitle>
          {Content}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] rounded-3xl border border-zinc-200/80 bg-zinc-50/96 p-0 overflow-hidden backdrop-blur-2xl dark:border-white/12 dark:bg-zinc-950/93">
        <DialogTitle className="sr-only">Add New Widget</DialogTitle>
        {Content}
      </DialogContent>
    </Dialog>
  );
}

