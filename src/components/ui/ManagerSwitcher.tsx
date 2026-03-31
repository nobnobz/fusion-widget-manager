"use client";

import * as React from "react";
import { ArrowUpRight, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type ManagerId = "fusion" | "omni";

interface ManagerSwitcherProps {
  currentManager: ManagerId;
  className?: string;
}

const managers: Record<
  ManagerId,
  {
    id: ManagerId;
    name: string;
    shortName: string;
    description: string;
    href: string;
  }
> = {
  fusion: {
    id: "fusion",
    name: "Fusion Widget Manager",
    shortName: "Fusion",
    description: "Create and edit Fusion widget exports.",
    href: "https://nobnobz.github.io/fusion-widget-manager/",
  },
  omni: {
    id: "omni",
    name: "Omni Snapshot Manager",
    shortName: "Omni",
    description: "Import, build, and export Omni snapshots.",
    href: "https://nobnobz.github.io/omni-snapshot-editor/",
  },
};

export function ManagerSwitcher({
  currentManager,
  className,
}: ManagerSwitcherProps) {
  const [open, setOpen] = React.useState(false);
  const current = managers[currentManager];
  const options = Object.values(managers);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-[1.25rem] border border-border/40 bg-white/5 px-3.5 text-left text-[14px] font-medium text-foreground/72  backdrop-blur-sm transition-all hover:bg-primary/5 hover:text-primary dark:bg-black/20",
            className
          )}
          aria-label="Switch manager"
        >
          <span className="truncate leading-none">{current.shortName}</span>
          <ChevronDown
            className={cn(
              "size-3 shrink-0 text-muted-foreground/55 transition-transform",
              open && "rotate-180 text-primary"
            )}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-[290px] rounded-3xl border border-border/50 bg-background/92 p-2  backdrop-blur-2xl shadow-xl shadow-black/10"
      >
        <div className="px-2 pb-2 pt-1">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/55">
            Switch Manager
          </p>
        </div>

        <div className="space-y-1">
          {options.map((manager) => {
            const isCurrent = manager.id === currentManager;

            if (isCurrent) {
              return (
                <div
                  key={manager.id}
                  className="flex items-start gap-3 rounded-2xl border border-primary/10 bg-primary/6 px-3.5 py-3"
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-background/80 text-primary">
                    <Check className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-[13px] font-bold tracking-tight text-foreground">
                        {manager.name}
                      </span>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-primary">
                        Current
                      </span>
                    </div>
                    <p className="pt-1 text-[11px] leading-5 text-muted-foreground/70">
                      {manager.description}
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <a
                key={manager.id}
                href={manager.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 rounded-2xl px-3.5 py-3 transition-all hover:bg-muted/40 hover:text-foreground"
              >
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/80 text-muted-foreground/70">
                  <ArrowUpRight className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold tracking-tight text-foreground">
                    {manager.name}
                  </div>
                  <p className="pt-1 text-[11px] leading-5 text-muted-foreground/70">
                    {manager.description}
                  </p>
                </div>
              </a>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
