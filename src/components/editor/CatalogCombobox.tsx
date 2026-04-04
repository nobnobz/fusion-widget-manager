"use client";

import { useEffect, useMemo, useState } from 'react';
import { Search, ChevronDown, Check, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { AIOMetadataCatalog } from '@/lib/types/widget';
import { findCatalog } from '@/lib/config-utils';
import { VisuallyHidden } from '@/components/ui/visually-hidden';

interface CatalogComboboxProps {
  options: AIOMetadataCatalog[];
  value: string;
  onChange: (value: string) => void;
  disabledValues?: string[];
  placeholder?: string;
  className?: string;
  trigger?: React.ReactNode;
}

export function CatalogCombobox({
  options,
  value,
  onChange,
  disabledValues = [],
  placeholder = "Select catalog...",
  className,
  trigger
}: CatalogComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  
  const disabledValueSet = useMemo(() => new Set(disabledValues), [disabledValues]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const selectedOption = useMemo(() => {
    return findCatalog(options, value);
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    const lowerSearch = search.toLowerCase();
    return options.filter(o => 
      o.name.toLowerCase().includes(lowerSearch) || 
      o.id.toLowerCase().includes(lowerSearch) ||
      o.type.toLowerCase().includes(lowerSearch)
    );
  }, [options, search]);

  const isInvalid = !selectedOption && value !== '';

  const renderTrigger = () => {
    if (trigger) return trigger;
    
    return (
      <button
        type="button"
        className={cn(
          "flex items-center justify-between w-full h-10 max-sm:h-9 px-4 max-sm:px-3.5 rounded-xl bg-zinc-100/40 dark:bg-zinc-950/20 text-base sm:text-[11px] max-sm:text-sm font-bold text-left transition-all outline-none border group/combobox",
          isOpen 
            ? "ring-1 ring-primary/30 bg-background border-primary/20 dark:bg-zinc-900" 
            : "border-zinc-200 dark:border-white/5 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60 hover:border-primary/20",
          selectedOption ? "text-primary" : (isInvalid ? "text-amber-500 italic border-amber-500/20" : "text-muted-foreground/60"),
          className
        )}
      >
        <div className="flex items-center gap-2 truncate pr-2 flex-1">
          {isInvalid && <AlertTriangle className="size-3 text-amber-500 shrink-0 animate-pulse" />}
          <span className="truncate">
            {selectedOption ? selectedOption.name : (value ? value : placeholder)}
          </span>
        </div>
        <ChevronDown className={cn("size-3 shrink-0 transition-transform duration-300 opacity-40 group-hover/combobox:opacity-100", isOpen && "rotate-180")} />
      </button>
    );
  };

  const renderContent = () => (
    <motion.div
      initial={isMobile ? { opacity: 0, scale: 0.95 } : { opacity: 0, scale: 0.98, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={isMobile ? { opacity: 0, scale: 0.95 } : { opacity: 0, scale: 0.98, y: -4 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={cn(
        "bg-popover border border-border  flex flex-col h-full overflow-hidden",
        isMobile ? "rounded-[2.25rem] w-full max-h-[85vh]" : "rounded-3xl w-full sm:max-h-[380px]"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-3 border-b border-border flex items-center gap-2.5 bg-muted/30">
        <Search className="size-4 text-muted-foreground/40" />
        <input
          autoFocus={!isMobile}
          type="text"
          placeholder="Search catalogs..."
          className="flex-1 bg-transparent border-none outline-none text-base sm:text-xs h-8 placeholder:text-muted-foreground/30 focus:ring-0"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsOpen(false);
            e.stopPropagation();
          }}
        />
        {search && (
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSearch('');
            }} 
            className="p-1.5 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="size-4 text-muted-foreground/40" />
          </button>
        )}
      </div>

      <div 
        className={cn(
          "flex-1 min-h-0 overflow-y-auto p-2 custom-scrollbar scrollbar-thin",
          isMobile ? "max-h-none pb-8" : "max-h-[min(400px,calc(100vh-200px))]"
        )}
        onWheel={(e) => e.stopPropagation()}
      >
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => {
            const combinedId = `${option.type}::${option.id}`;
            const isSelected = combinedId === value;
            const isDisabled = !isSelected && disabledValueSet.has(combinedId);
            
            return (
              <button
                key={combinedId}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) return;
                  onChange(combinedId);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-left text-base sm:text-xs transition-all mb-1.5 last:mb-0",
                  isSelected
                    ? "bg-primary text-primary-foreground  "
                    : isDisabled
                      ? "text-muted-foreground/25 cursor-not-allowed opacity-40"
                      : "hover:bg-muted text-foreground/80 hover:text-foreground active:scale-[0.98]"
                )}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold tracking-tight">{option.name}</span>
                  <span className={cn(
                    "text-[10px] sm:text-[9px] uppercase tracking-widest opacity-60 font-black",
                    isSelected ? "text-primary-foreground/70" : "text-muted-foreground/60"
                  )}>
                    {option.type} • {option.id}
                  </span>
                </div>
                {isSelected && <Check className="size-4 shrink-0" />}
              </button>
            );
          })
        ) : (
          <div className="p-12 text-center flex flex-col items-center justify-center gap-3 opacity-30">
            <Search className="size-10 stroke-1" />
            <p className="text-[11px] font-black uppercase tracking-widest">No catalogs found</p>
          </div>
        )}
      </div>
    </motion.div>
  );

  if (isMobile) {
    return (
      <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
        <Dialog.Trigger asChild>
          {renderTrigger()}
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[10000] bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-300" />
          <Dialog.Content 
            className="fixed left-1/2 top-1/2 z-[10001] w-[90vw] max-w-[400px] -translate-x-1/2 -translate-y-1/2 outline-none"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Dialog.Title asChild>
              <VisuallyHidden>Select Catalog</VisuallyHidden>
            </Dialog.Title>
            <AnimatePresence>
              {isOpen && renderContent()}
            </AnimatePresence>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <Popover.Root
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) setSearch('');
      }}
    >
      <Popover.Trigger asChild>
        {renderTrigger()}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content 
          sideOffset={8} 
          align="start"
          collisionPadding={20}
          className="z-[99999] w-[var(--radix-popover-trigger-width)] min-w-[340px] outline-none"
        >
          <AnimatePresence>
            {isOpen && renderContent()}
          </AnimatePresence>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
