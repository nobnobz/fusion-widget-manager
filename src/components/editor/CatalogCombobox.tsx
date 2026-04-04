import { useEffect, useMemo, useState } from 'react';
import { Search, ChevronDown, Check, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Popover from '@radix-ui/react-popover';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose,
} from "@/components/ui/drawer";
import { cn } from '@/lib/utils';
import { AIOMetadataCatalog } from '@/lib/types/widget';
import { findCatalog } from '@/lib/config-utils';

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

  const renderContentItems = () => (
    <div className="flex flex-col h-full overflow-hidden">
      <div className={cn(
        "px-6 py-4 border-b border-border/5 flex items-center gap-3 bg-zinc-50/50 dark:bg-white/[0.02]",
        isMobile ? "pt-2 pb-6" : "bg-muted/30"
      )}>
        <div className="flex-1 flex items-center gap-2.5 px-3.5 h-10 rounded-2xl bg-zinc-100/50 dark:bg-white/5 border border-zinc-200/50 dark:border-white/5 focus-within:border-primary/30 transition-all">
          <Search className="size-4 text-muted-foreground/35" />
          <input
            autoFocus={!isMobile}
            type="text"
            placeholder="Search catalogs..."
            className="flex-1 bg-transparent border-none outline-none text-base sm:text-[11px] h-full placeholder:text-muted-foreground/30 focus:ring-0 font-bold"
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
              className="p-1 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-md transition-colors shrink-0"
            >
              <X className="size-3 text-muted-foreground/40" />
            </button>
          )}
        </div>
      </div>

      <div 
        className={cn(
          "flex-1 min-h-0 overflow-y-auto custom-scrollbar scrollbar-thin",
          isMobile ? "px-4 pt-2 pb-14 max-h-[60dvh]" : "p-2 max-h-[min(400px,calc(100vh-200px))]"
        )}
        onWheel={(e) => e.stopPropagation()}
      >
        {filteredOptions.length > 0 ? (
          <div className={cn("grid grid-cols-1", isMobile ? "gap-2" : "gap-1")}>
            {filteredOptions.map((option) => {
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
                    "w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-left transition-all relative group/item",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/15"
                      : isDisabled
                        ? "text-muted-foreground/25 cursor-not-allowed opacity-40 grayscale"
                        : "hover:bg-primary/[0.04] dark:hover:bg-white/[0.04] text-foreground/80 hover:text-primary active:scale-[0.985]"
                  )}
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className={cn(
                      "font-bold tracking-tight text-base sm:text-sm truncate",
                      isSelected ? "text-primary-foreground" : "text-foreground group-hover/item:text-primary"
                    )}>
                      {option.name}
                    </span>
                    <span className={cn(
                      "text-[11px] sm:text-[10px] uppercase tracking-[0.16em] font-bold opacity-55",
                      isSelected ? "text-primary-foreground/80" : "text-muted-foreground/60"
                    )}>
                      {option.type} <span className="mx-1 opacity-25">•</span> {option.id}
                    </span>
                  </div>
                  {isSelected && <Check className="size-4 shrink-0 stroke-[3px]" />}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-16 text-center flex flex-col items-center justify-center gap-4 opacity-30 grayscale invert dark:invert-0">
            <Search className="size-12 stroke-[1.5px]" />
            <p className="text-[11px] font-black uppercase tracking-[0.2em] max-w-[20ch]">No matching catalogs found</p>
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerTrigger asChild>
          {renderTrigger()}
        </DrawerTrigger>
        <DrawerContent className="max-h-[94dvh] bg-white dark:bg-zinc-950 border-zinc-200/80 dark:border-white/10 rounded-t-[2.5rem]">
          <DrawerHeader className="relative border-b border-border/5 pb-5 pt-2">
            <DrawerTitle className="text-[17px] font-black tracking-tight text-center text-foreground/90">Select Catalog</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-hidden">
            {renderContentItems()}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  const renderContent = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: -4 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border border-zinc-200/80 dark:border-white/10 flex flex-col h-full overflow-hidden rounded-3xl w-full sm:max-h-[380px] shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {renderContentItems()}
    </motion.div>
  );

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
