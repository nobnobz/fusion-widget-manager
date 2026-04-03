"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { motion, AnimatePresence } from "framer-motion";

export function ThemeToggle({
  className,
  trigger,
}: {
  className?: string;
  trigger?: React.ReactNode;
}) {
  const { setTheme, theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const themes = [
    { id: "light", icon: Sun, label: "Light" },
    { id: "dark", icon: Moon, label: "Dark" },
    { id: "system", icon: Monitor, label: "System" },
  ];

  if (!mounted) {
    if (trigger) {
      return <>{trigger}</>;
    }

    return (
      <Button 
        variant="ghost" 
        size="icon" 
        className={cn(
          "size-10 rounded-xl border border-zinc-200/75 bg-white/72 text-muted-foreground/60 opacity-60 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300/75 dark:shadow-none",
          className
        )}
      >
        <div className="size-5" />
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";
  const toggleButtonClass = isDark
    ? "hover:border-primary/20"
    : "hover:border-zinc-300/85";
  const activeIconClass = isDark ? "text-primary" : "text-amber-500";

  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger ? (
          trigger
        ) : (
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn(
              "size-10 rounded-xl border border-zinc-200/75 bg-white/72 text-muted-foreground/72 shadow-sm transition-all group relative overflow-hidden hover:bg-white hover:text-foreground dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300/80 dark:shadow-none dark:hover:border-white/14 dark:hover:bg-white/[0.07]",
              toggleButtonClass,
              className
            )}
          >
            <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 bg-gradient-to-r from-transparent via-primary/12 to-transparent pointer-events-none" />
            <div className="relative size-5 flex items-center justify-center overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                {isDark ? (
                  <motion.div
                    key="moon"
                    initial={{ y: 20, rotate: 90, opacity: 0 }}
                    animate={{ y: 0, rotate: 0, opacity: 1 }}
                    exit={{ y: -20, rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "backOut" }}
                    className={activeIconClass}
                  >
                    <Moon className="size-5" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="sun"
                    initial={{ y: 20, rotate: 90, opacity: 0 }}
                    animate={{ y: 0, rotate: 0, opacity: 1 }}
                    exit={{ y: -20, rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "backOut" }}
                    className={activeIconClass}
                  >
                    <Sun className="size-5" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <span className="sr-only">Toggle theme</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-36 rounded-2xl border border-zinc-200/75 bg-white/96 p-1 shadow-xl shadow-black/10 backdrop-blur-xl dark:border-white/12 dark:bg-zinc-950/94 dark:shadow-black/40">
        <div className="flex flex-col gap-1">
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all",
                theme === t.id 
                  ? "bg-primary text-primary-foreground  " 
                  : "hover:bg-primary/5 hover:text-primary opacity-60 hover:opacity-100"
              )}
            >
              <t.icon className="size-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
