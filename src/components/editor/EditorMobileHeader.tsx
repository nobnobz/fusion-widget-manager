"use client";

import { useState, memo } from 'react';
import Image from 'next/image';
import { 
  Ellipsis, 
  Book, 
  RotateCcw, 
  Heart, 
  Moon, 
  Sun
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Drawer, 
  DrawerContent, 
  DrawerHeader, 
  DrawerTitle, 
  DrawerTrigger 
} from '@/components/ui/drawer';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ManagerSwitcher } from '@/components/ui/ManagerSwitcher';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import LogoImage from '@/../public/branding/clown_logo.png';

interface EditorMobileHeaderProps {
  view: 'welcome' | 'selection' | 'editor';
  onShowHowToUse: () => void;
  onShowRestartConfirm: () => void;
  onOpenSupport: () => void;
}

const mobileHeaderShellClass = "rounded-[1.45rem] border border-zinc-200/80 bg-white/82 px-3.5 py-2.5 shadow-[0_16px_42px_-28px_rgba(15,23,42,0.38)] backdrop-blur-xl dark:border-white/12 dark:bg-zinc-950/84 dark:shadow-[0_20px_46px_-34px_rgba(0,0,0,0.9)]";
const mobileHeaderActionClass = "size-9 rounded-[1rem] border border-zinc-200/80 bg-white/76 text-muted-foreground/72 shadow-sm transition-all hover:border-primary/20 hover:bg-white hover:text-foreground dark:border-white/10 dark:bg-white/[0.045] dark:text-zinc-300/80 dark:shadow-none dark:hover:border-white/14 dark:hover:bg-white/[0.075]";
const mobileHeaderMenuButtonClass = "flex w-full items-center gap-4 rounded-2xl border border-transparent px-4 py-4 text-left text-[14px] font-bold tracking-tight text-foreground/80 transition-all active:scale-[0.98] hover:bg-primary/[0.06] hover:text-primary dark:text-zinc-200/84 dark:hover:bg-white/[0.055]";
const mobileHeaderMenuIconClass = "flex size-11 shrink-0 items-center justify-center rounded-[1.125rem] border border-zinc-200/70 bg-white/80 text-muted-foreground/72 shadow-sm dark:border-white/10 dark:bg-white/[0.045] dark:text-zinc-300/80 dark:shadow-none";
const mobileHeaderMenuTitleClass = "text-[14px] font-bold tracking-tight text-foreground/80 dark:text-zinc-200/84";

export const EditorMobileHeader = memo(function EditorMobileHeader({
  view,
  onShowHowToUse,
  onShowRestartConfirm,
  onOpenSupport
}: EditorMobileHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { resolvedTheme } = useTheme();
  const MobileThemeIcon = resolvedTheme === 'dark' ? Moon : Sun;

  const handleMenuAction = (action: () => void) => {
    setIsOpen(false);
    // Use a small delay to ensure the drawer closes smoothly before triggering heavy actions
    setTimeout(action, 200);
  };

  return (
    <header className="sticky top-0 z-50 w-full px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-2 sm:hidden">
      <div className={mobileHeaderShellClass}>
        {view === 'welcome' ? (
          <div className="flex items-center justify-between gap-2.5">
            <ManagerSwitcher currentManager="fusion" className="h-[2.125rem] min-w-0 px-2.5 text-[11px] shadow-none" />
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                data-testid="open-setup-guide-mobile"
                variant="ghost" size="icon"
                className={cn(mobileHeaderActionClass, "text-primary/80 hover:text-primary")}
                onClick={onShowHowToUse}
              >
                <Book className="size-4" />
              </Button>
              
              <Drawer open={isOpen} onOpenChange={setIsOpen}>
                <DrawerTrigger asChild>
                  <Button variant="ghost" size="icon" className={mobileHeaderActionClass}>
                    <Ellipsis className="size-4" />
                  </Button>
                </DrawerTrigger>
                <DrawerContent className="rounded-t-[2.5rem] bg-white dark:bg-zinc-950 border-zinc-200/80 dark:border-white/10 px-4 pb-12">
                  <DrawerHeader className="relative border-b border-border/5 pb-6 pt-2">
                    <DrawerTitle className="text-[17px] font-black tracking-tight text-center text-foreground/90">Options</DrawerTitle>
                  </DrawerHeader>
                  <div className="mt-6 space-y-2">
                    <ThemeToggle
                      trigger={
                        <button type="button" className={mobileHeaderMenuButtonClass}>
                          <span className={mobileHeaderMenuIconClass}>
                            <MobileThemeIcon className={cn("size-5", resolvedTheme === 'dark' ? "text-primary" : "text-amber-500")} />
                          </span>
                          <div className="flex flex-col">
                            <span className={mobileHeaderMenuTitleClass}>Theme</span>
                            <span className="text-[11px] font-medium text-muted-foreground/60">Switch colors</span>
                          </div>
                        </button>
                      }
                    />
                    <button
                      type="button"
                      className={mobileHeaderMenuButtonClass}
                      onClick={() => handleMenuAction(onOpenSupport)}
                    >
                      <span className={mobileHeaderMenuIconClass}>
                        <Heart className="size-5 shrink-0 text-red-500" />
                      </span>
                      <div className="flex flex-col">
                        <span className={mobileHeaderMenuTitleClass}>Support My Work</span>
                        <span className="text-[11px] font-medium text-muted-foreground/60">Help me improve Fusion Widget Manager</span>
                      </div>
                    </button>
                  </div>
                </DrawerContent>
              </Drawer>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="relative size-12 shrink-0 overflow-hidden">
                <Image src={LogoImage} alt="Logo" fill className="object-contain" priority />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <h1 className="truncate text-[13px] font-black leading-none tracking-[-0.03em]">Fusion Widget</h1>
                <span className="truncate pt-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-primary/90 leading-none">Manager</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button 
                data-testid="open-setup-guide-mobile" 
                variant="ghost" 
                size="icon" 
                className={cn(mobileHeaderActionClass, "text-primary/80 hover:text-primary")} 
                onClick={onShowHowToUse}
              >
                <Book className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={mobileHeaderActionClass}
                onClick={onShowRestartConfirm}
              >
                <RotateCcw className="size-4" />
              </Button>
              <Drawer open={isOpen} onOpenChange={setIsOpen}>
                <DrawerTrigger asChild>
                  <Button variant="ghost" size="icon" className={mobileHeaderActionClass}>
                    <Ellipsis className="size-4" />
                  </Button>
                </DrawerTrigger>
                <DrawerContent className="rounded-t-[2.5rem] bg-white dark:bg-zinc-950 border-zinc-200/80 dark:border-white/10 px-4 pb-12">
                  <DrawerHeader className="relative border-b border-border/5 pb-5 pt-2">
                    <DrawerTitle className="text-[17px] font-black tracking-tight text-center text-foreground/90">Options</DrawerTitle>
                  </DrawerHeader>
                  <div className="mt-6 space-y-2">
                    <ThemeToggle
                      trigger={
                        <button type="button" className={mobileHeaderMenuButtonClass}>
                          <span className={mobileHeaderMenuIconClass}>
                            <MobileThemeIcon className={cn("size-5", resolvedTheme === 'dark' ? "text-primary" : "text-amber-500")} />
                          </span>
                          <div className="flex flex-col">
                            <span className={mobileHeaderMenuTitleClass}>Theme</span>
                            <span className="text-[11px] font-medium text-muted-foreground/60">Switch appearance</span>
                          </div>
                        </button>
                      }
                    />
                    <button
                      type="button"
                      className={mobileHeaderMenuButtonClass}
                      onClick={() => handleMenuAction(onOpenSupport)}
                    >
                      <span className={mobileHeaderMenuIconClass}>
                        <Heart className="size-5 shrink-0 text-red-500" />
                      </span>
                      <div className="flex flex-col">
                        <span className={mobileHeaderMenuTitleClass}>Support My Work</span>
                        <span className="text-[11px] font-medium text-muted-foreground/60">Help me improve Fusion Widget Manager</span>
                      </div>
                    </button>
                  </div>
                </DrawerContent>
              </Drawer>
            </div>
          </div>
        )}
      </div>
    </header>
  );
});
