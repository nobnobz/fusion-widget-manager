"use client";

import { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
  DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Box, Layers, Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConfig } from '@/context/ConfigContext';
import { MANIFEST_PLACEHOLDER } from '@/lib/config-utils';
import { Widget } from '@/lib/types/widget';

interface NewWidgetDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}

export function NewWidgetDialog({ isOpen, onOpenChange, onCreated }: NewWidgetDialogProps) {
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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] rounded-[3rem] border border-border/40 bg-background/95 backdrop-blur-2xl shadow-2xl p-0 overflow-hidden max-sm:w-[calc(100vw-1rem)] max-sm:max-w-[calc(100vw-1rem)] max-sm:rounded-[1.9rem] [&>button:last-child]:top-8 [&>button:last-child]:right-8 [&>button:last-child]:size-10 [&>button:last-child]:rounded-2xl [&>button:last-child]:bg-muted/10 [&>button:last-child]:hover:bg-muted/20 [&>button:last-child]:transition-all [&>button:last-child]:border-none [&>button:last-child]:flex [&>button:last-child]:items-center [&>button:last-child]:justify-center max-sm:[&>button:last-child]:top-4 max-sm:[&>button:last-child]:right-4 max-sm:[&>button:last-child]:size-9 max-sm:[&>button:last-child]:rounded-xl">
        <div className="p-10 pt-12 max-sm:p-5 max-sm:pt-6">
          <DialogHeader className="space-y-6 items-start text-left">
            <div className="size-16 rounded-[1.5rem] bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-2 shadow-inner max-sm:size-12 max-sm:rounded-[1rem]">
               <Sparkles className="size-8 max-sm:size-6" />
            </div>
            <div className="space-y-2">
              <DialogTitle className="text-3xl font-black tracking-tighter max-sm:text-2xl">Add New Widget</DialogTitle>
              <DialogDescription className="text-muted-foreground/80 text-[13px] font-medium leading-relaxed max-w-[360px] max-sm:text-xs max-sm:max-w-none">
                Create a new widget to organize your Fusion content.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="space-y-8 py-8 max-sm:space-y-6 max-sm:py-6">
            <div className="space-y-2.5">
              <Label htmlFor="widget-title" className="text-xs font-bold uppercase tracking-widest text-muted-foreground/40 ml-1">Widget Title</Label>
              <div className="relative group bg-muted/20 rounded-2xl border border-border/10 focus-within:border-primary/30 transition-all p-1">
                <Input
                  id="widget-title"
                  placeholder="e.g. Recommended for You"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-12 max-sm:h-11 bg-transparent border-none focus-visible:ring-0 px-4 font-bold text-lg max-sm:text-base transition-all"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/40 ml-1">Widget Type</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={() => setType('collection.row')}
                  className={cn(
                    "flex flex-col items-start gap-4 p-5 max-sm:p-4 rounded-2xl max-sm:rounded-[1.15rem] border transition-all relative overflow-hidden group/btn min-h-[156px] max-sm:min-h-[132px]",
                    type === 'collection.row' 
                      ? "bg-primary/5 border-primary shadow-sm" 
                      : "bg-muted/10 border-transparent hover:bg-muted/20 hover:border-border/30"
                  )}
                >
                  <div className={cn(
                    "size-10 rounded-xl flex items-center justify-center transition-colors shadow-sm",
                    type === 'collection.row' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover/btn:bg-muted/80"
                  )}>
                    <Box className="size-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">Collection</p>
                    <p className="text-xs text-muted-foreground/60 font-medium leading-tight mt-1">Manual items with custom metadata</p>
                  </div>
                  {type === 'collection.row' && (
                    <div className="absolute top-4 right-4 animate-in fade-in zoom-in">
                      <Check className="size-4 text-primary" />
                    </div>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setType('row.classic')}
                  className={cn(
                    "flex flex-col items-start gap-4 p-5 max-sm:p-4 rounded-2xl max-sm:rounded-[1.15rem] border transition-all relative overflow-hidden group/btn min-h-[156px] max-sm:min-h-[132px]",
                    type === 'row.classic' 
                      ? "bg-indigo-500/5 border-indigo-500 shadow-sm" 
                      : "bg-muted/10 border-transparent hover:bg-muted/20 hover:border-border/30"
                  )}
                >
                  <div className={cn(
                    "size-10 rounded-xl flex items-center justify-center transition-colors shadow-sm",
                    type === 'row.classic' ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground group-hover/btn:bg-muted/80"
                  )}>
                    <Layers className="size-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">Row</p>
                    <p className="text-xs text-muted-foreground/60 font-medium leading-tight mt-1">Dynamic stream from single catalog</p>
                  </div>
                  {type === 'row.classic' && (
                    <div className="absolute top-4 right-4 animate-in fade-in zoom-in">
                      <Check className="size-4 text-indigo-500" />
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-3 sm:gap-4 mt-4">
            <DialogClose asChild>
              <Button variant="ghost" className="w-full sm:flex-1 h-11 sm:h-12 rounded-xl max-sm:rounded-[1rem] font-bold uppercase tracking-wider text-xs text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30 transition-all">
                Cancel
              </Button>
            </DialogClose>
            <Button 
              onClick={handleCreate}
              disabled={!title.trim()}
              className="w-full sm:flex-1 h-11 sm:h-12 rounded-xl max-sm:rounded-[1rem] font-bold uppercase tracking-wider text-xs shadow-lg shadow-primary/20 transition-all active:scale-95"
            >
              Create
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
