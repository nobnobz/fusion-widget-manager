"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type FusionGuideDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
};

export function FusionGuideDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: FusionGuideDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="fusion-setup-guide"
        className={cn(
          "flex max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[calc(100vw-1.25rem)] max-w-[58rem] flex-col overflow-hidden rounded-3xl border border-border/45 bg-white/94 p-0 shadow-[0_32px_110px_-44px_rgba(15,23,42,0.48)] backdrop-blur-2xl dark:bg-zinc-950/94 dark:shadow-[0_38px_120px_-48px_rgba(0,0,0,0.95)] sm:w-[calc(100vw-2rem)]",
          className,
        )}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-6 sm:px-7 sm:pb-7 sm:pt-7">
          <DialogHeader className="border-b border-border/55 pb-4 pr-10 text-left sm:pb-5 sm:pr-12">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/18 bg-primary/8 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
              Setup Guide
            </div>
            <div className="space-y-2 pt-2">
              <DialogTitle className="text-[1.9rem] font-black tracking-tight text-foreground sm:text-[2.25rem]">
                {title}
              </DialogTitle>
              {description ? (
                <DialogDescription className="max-w-3xl text-sm font-medium leading-6 text-muted-foreground/78 sm:text-[15px]">
                  {description}
                </DialogDescription>
              ) : null}
            </div>
          </DialogHeader>
          <div className="space-y-4 pt-4 sm:space-y-5 sm:pt-5">{children}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const GUIDE_SECTION_RADIUS = "rounded-3xl";
const GUIDE_SURFACE_RADIUS = "rounded-2xl";

type FusionGuideFlowItem = {
  title: string;
  detail?: string;
  icon: LucideIcon;
};

type FusionGuideFlowProps = {
  title: string;
  items: FusionGuideFlowItem[];
};

export function FusionGuideFlow({ title, items }: FusionGuideFlowProps) {
  return (
    <section className={cn("mx-2 border border-primary/14 bg-[linear-gradient(180deg,rgba(239,246,255,0.96),rgba(248,250,252,0.92))] p-3.5 shadow-[0_12px_32px_-22px_rgba(59,130,246,0.24)] dark:border-primary/18 dark:bg-[linear-gradient(180deg,rgba(8,23,38,0.9),rgba(9,15,24,0.84))] sm:mx-0 sm:p-4", GUIDE_SECTION_RADIUS)}>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary/88">{title}</p>
      <ol className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item, index) => {
          return (
            <li
              key={item.title}
              className={cn("border border-primary/12 bg-background/72 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] dark:border-white/8 dark:bg-white/[0.03] dark:shadow-none sm:px-4 sm:py-3.5", GUIDE_SURFACE_RADIUS)}
            >
              <div className="flex min-h-[3rem] items-center gap-3">
                <div className="inline-flex size-7.5 shrink-0 items-center justify-center rounded-full border border-primary/16 bg-primary/10 text-[11px] font-black text-primary">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <h3 className="text-left text-[14px] font-bold tracking-tight text-foreground">{item.title}</h3>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

type FusionGuideSectionProps = {
  step: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
};

export function FusionGuideSection({
  step,
  title,
  description,
  children,
  className,
}: FusionGuideSectionProps) {
  return (
    <section
      className={cn(
        "border border-border/55 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.84))] p-4 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.34)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(14,17,24,0.96),rgba(9,12,18,0.92))] sm:p-5",
        GUIDE_SECTION_RADIUS,
        className,
      )}
    >
      <div className="flex items-center gap-4 sm:gap-5">
        <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/16 bg-primary/10 text-[12px] font-black uppercase tracking-[0.08em] text-primary">
          {step}
        </div>
        <div className="min-w-0">
          <h2 className="text-[1.15rem] font-black tracking-tight text-foreground sm:text-[1.25rem]">{title}</h2>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground/76">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-5 sm:mt-6">{children}</div>
    </section>
  );
}

type FusionGuidePanelProps = {
  title?: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
};

export function FusionGuidePanel({ title, children, className }: FusionGuidePanelProps) {
  return (
    <article
      className={cn(
        "border border-border/50 bg-background/72 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] dark:border-white/8 dark:bg-white/[0.03] dark:shadow-none",
        GUIDE_SURFACE_RADIUS,
        className,
      )}
    >
      {title ? (
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-bold tracking-tight text-foreground/82 sm:text-base">{title}</h3>
        </div>
      ) : null}
      <div className={cn(title ? "mt-3" : undefined)}>{children}</div>
    </article>
  );
}

type FusionGuideStepListProps = {
  items: string[];
  ordered?: boolean;
  className?: string;
};

export function FusionGuideStepList({ items, ordered = true, className }: FusionGuideStepListProps) {
  return (
    <ol className={cn("space-y-3", className)}>
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="flex items-start gap-3">
          <span
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-full border border-primary/14 bg-primary/10 font-black text-primary",
              ordered ? "mt-0.5 size-6 text-[11px]" : "mt-[7px] size-2.5 border-0 bg-primary/78 text-transparent",
            )}
          >
            {ordered ? index + 1 : "."}
          </span>
          <span className="text-[14px] leading-6 text-foreground/78">{item}</span>
        </li>
      ))}
    </ol>
  );
}
