"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Button } from '@/components/ui/button';
import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMobile } from '@/hooks/use-mobile';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  details?: React.ReactNode;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'info' | 'warning';
  contentClassName?: string;
}

export function ConfirmationDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  details,
  onConfirm,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = 'info',
  contentClassName,
}: ConfirmationDialogProps) {
  const isMobile = useMobile();
  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';

  const Content = (
    <div className="p-8 pt-10 max-sm:p-5 max-sm:pt-6">
      <div className="space-y-6 items-start text-left flex flex-col">
        <div className={cn(
          "size-14 rounded-2xl flex items-center justify-center border  transition-all animate-in zoom-in-75 duration-300 max-sm:size-12 max-sm:rounded-[1rem]",
          isDanger 
            ? "bg-destructive/5 text-destructive border-destructive/10"
            : isWarning
              ? "bg-amber-500/8 text-amber-600 border-amber-500/15 dark:text-amber-300 dark:border-amber-500/20"
              : "bg-primary/5 text-primary border-primary/10"
        )}>
          {isDanger || isWarning ? <AlertTriangle className="size-7 max-sm:size-6" /> : <Info className="size-7 max-sm:size-6" />}
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight max-sm:text-xl">{title}</h2>
          <div className="text-muted-foreground/60 text-xs font-medium leading-relaxed max-sm:text-[11px]">
            {description}
          </div>
        </div>
      </div>

      {details ? <div className="mt-5">{details}</div> : null}

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-8 sm:mt-10 pb-[env(safe-area-inset-bottom,0px)]">
        {cancelText && (
          <Button
            variant="ghost"
            className="w-full sm:flex-1 h-10 rounded-2xl max-sm:rounded-[1rem] border border-zinc-200/70 bg-white/72 font-bold uppercase tracking-wider text-[11px] text-foreground/80 transition-all hover:bg-white/88 hover:border-zinc-300/75 dark:border-white/10 dark:bg-white/[0.045] dark:text-foreground/88 dark:hover:bg-white/[0.07]"
            onClick={() => onOpenChange(false)}
          >
            {cancelText}
          </Button>
        )}
        <Button
          className={cn(
            "w-full sm:flex-1 h-11 rounded-2xl max-sm:rounded-[1rem] font-bold uppercase tracking-wider text-[11px] transition-all active:scale-95 shadow-[0_12px_28px_-18px_rgba(37,99,235,0.58)] hover:shadow-[0_14px_30px_-18px_rgba(37,99,235,0.62)]",
            isDanger 
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_12px_28px_-18px_rgba(220,38,38,0.45)] hover:shadow-[0_14px_30px_-18px_rgba(220,38,38,0.5)]" 
              : "bg-primary/[0.96] text-primary-foreground hover:bg-primary/90 ",
            !cancelText && "w-full"
          )}
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          {confirmText}
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={onOpenChange}>
        <DrawerContent className="bg-background border-border/40">
          <DrawerHeader className="sr-only">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          {Content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "sm:max-w-[500px] rounded-3xl border border-border/40 bg-card/95 backdrop-blur-2xl  p-0 overflow-hidden [&>button:last-child]:hidden",
        contentClassName
      )}>
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {Content}
      </DialogContent>
    </Dialog>
  );
}
