"use client";

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'info';
}

export function ConfirmationDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = 'info'
}: ConfirmationDialogProps) {
  const isDanger = variant === 'danger';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] rounded-[2.5rem] border border-border/40 bg-card/95 backdrop-blur-2xl shadow-2xl p-0 overflow-hidden max-sm:w-[calc(100vw-1rem)] max-sm:max-w-[calc(100vw-1rem)] max-sm:rounded-[1.9rem] [&>button:last-child]:hidden">
        <div className="p-8 pt-10 max-sm:p-5 max-sm:pt-6">
          <DialogHeader className="space-y-4 items-start text-left">
            <div className={cn(
              "size-14 rounded-2xl flex items-center justify-center border shadow-sm transition-all animate-in zoom-in-75 duration-300 max-sm:size-12 max-sm:rounded-[1rem]",
              isDanger 
                ? "bg-destructive/5 text-destructive border-destructive/10" 
                : "bg-primary/5 text-primary border-primary/10"
            )}>
              {isDanger ? <AlertTriangle className="size-7 max-sm:size-6" /> : <Info className="size-7 max-sm:size-6" />}
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-bold tracking-tight max-sm:text-xl">{title}</DialogTitle>
              <DialogDescription className="text-muted-foreground/60 text-xs font-medium leading-relaxed max-sm:text-[11px]">
                {description}
              </DialogDescription>
            </div>
          </DialogHeader>

          <DialogFooter className="flex-col sm:flex-row gap-3 sm:gap-4 mt-8 sm:mt-10">
            {cancelText && (
              <Button
                variant="ghost"
                className="w-full sm:flex-1 h-11 sm:h-12 rounded-xl max-sm:rounded-[1rem] font-bold uppercase tracking-wider text-xs text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30 transition-all"
                onClick={() => onOpenChange(false)}
              >
                {cancelText}
              </Button>
            )}
            <Button
              className={cn(
                "w-full sm:flex-1 h-11 sm:h-12 rounded-xl max-sm:rounded-[1rem] font-bold uppercase tracking-wider text-xs shadow-lg transition-all active:scale-95",
                isDanger 
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-destructive/20" 
                  : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20",
                !cancelText && "w-full"
              )}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmText}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
