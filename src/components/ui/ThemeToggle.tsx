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

export function ThemeToggle({ className }: { className?: string }) {
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
    return (
      <Button 
        variant="ghost" 
        size="icon" 
        className={cn(
          "size-10 rounded-2xl bg-white/5 dark:bg-black/20 border border-border/40 opacity-50",
          className
        )}
      >
        <div className="size-5" />
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className={cn(
            "size-10 rounded-xl border transition-all group relative overflow-hidden",
            isDark 
              ? "bg-indigo-500/[0.08] border-indigo-500/25 hover:bg-indigo-500/15 hover:border-indigo-500/35 text-indigo-400" 
              : "bg-amber-500/[0.04] border-amber-500/20 hover:bg-amber-500/10 hover:border-amber-500/30 text-amber-500",
            className
          )}
        >
          <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
          <div className="relative size-5 flex items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              {isDark ? (
                <motion.div
                  key="moon"
                  initial={{ y: 20, rotate: 90, opacity: 0 }}
                  animate={{ y: 0, rotate: 0, opacity: 1 }}
                  exit={{ y: -20, rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "backOut" }}
                  className="text-indigo-400"
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
                  className="text-amber-500"
                >
                  <Sun className="size-5" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <span className="sr-only">Toggle theme</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-36 p-1 bg-white/90 dark:bg-black/90 backdrop-blur-xl border-border/40 rounded-2xl ">
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
