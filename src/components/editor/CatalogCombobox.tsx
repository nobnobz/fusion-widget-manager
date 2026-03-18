"use client";

import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, Hash, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';
import { AIOMetadataCatalog } from '@/lib/types/widget';
import { findCatalog } from '@/lib/config-utils';

interface CatalogComboboxProps {
  options: AIOMetadataCatalog[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function CatalogCombobox({
  options,
  value,
  onChange,
  placeholder = "Select catalog...",
  className
}: CatalogComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

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

  // Reset search when opening
  useEffect(() => {
    if (isOpen) setSearch('');
  }, [isOpen]);

  const isInvalid = !selectedOption && value !== '';

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center justify-between w-full h-8 px-3 rounded-lg bg-muted/50 text-[11px] font-semibold text-left transition-all outline-none border border-transparent",
            isOpen ? "ring-1 ring-primary/30 bg-background border-primary/20" : "hover:bg-muted hover:border-border",
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
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content 
          sideOffset={8} 
          align="start"
          className="z-[99999] w-[var(--radix-popover-trigger-width)] min-w-[320px]"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.1, ease: "easeOut" }}
            className="bg-popover border border-border rounded-xl shadow-xl overflow-hidden flex flex-col h-full max-h-[inherit]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-border flex items-center gap-2 bg-muted/30">
              <Search className="size-3.5 text-muted-foreground/50" />
              <input
                autoFocus
                type="text"
                placeholder="Search catalogs..."
                className="flex-1 bg-transparent border-none outline-none text-xs h-7 placeholder:text-muted-foreground/40 focus:ring-0"
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
                  className="p-1 hover:bg-muted rounded-md transition-colors"
                >
                  <X className="size-3 text-muted-foreground/40" />
                </button>
              )}
            </div>

            <div 
              className="flex-1 min-h-0 max-h-[400px] overflow-y-auto p-1.5 custom-scrollbar scrollbar-thin"
              onWheel={(e) => e.stopPropagation()}
            >
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => {
                  const combinedId = `${option.type}::${option.id}`;
                  const isSelected = combinedId === value;
                  
                  return (
                    <button
                      key={combinedId}
                      type="button"
                      onClick={() => {
                        onChange(combinedId);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-all mb-0.5 last:mb-0",
                        isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
                      )}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold">{option.name}</span>
                        <span className={cn(
                          "text-[9px] uppercase tracking-wider opacity-60 font-medium",
                          isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                        )}>
                          {option.type} • {option.id}
                        </span>
                      </div>
                      {isSelected && <Check className="size-3.5 shrink-0" />}
                    </button>
                  );
                })
              ) : (
                <div className="p-8 text-center flex flex-col items-center justify-center gap-2 opacity-30">
                  <Search className="size-8 stroke-1" />
                  <p className="text-[10px] font-bold uppercase tracking-widest">No catalogs found</p>
                </div>
              )}

            </div>
          </motion.div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
