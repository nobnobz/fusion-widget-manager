"use client";

import { useState, useEffect, useRef } from 'react';
import { useConfig } from '@/context/ConfigContext';
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
import { Input } from '@/components/ui/input';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { Loader2, Globe, Sparkles, Trash2, Copy, Check } from 'lucide-react';
import { AIOMetadataCatalog } from '@/lib/types/widget';
import { copyTextToClipboard } from '@/lib/browser-transfer';
import { cn } from '@/lib/utils';
import {
  editorActionButtonClass,
  editorFooterPrimaryButtonClass,
  editorFooterSecondaryButtonClass,
  editorDisconnectIconButtonClass,
  editorFormSurfaceClass,
  editorPanelClass,
} from './editorSurfaceStyles';
import { useMobile } from '@/hooks/use-mobile';


interface ManifestModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManifestModal({ isOpen, onOpenChange }: ManifestModalProps) {
  const isMobile = useMobile();
  const { manifestUrl, setManifestUrl, fetchManifest, syncManifest, setView, importManifest, disconnectManifest } = useConfig();
  const [url, setUrl] = useState(manifestUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [isManual, setIsManual] = useState(false);
  const [manualJson, setManualJson] = useState('');
  const [error, setError] = useState<{ title: string; message: string; isCors?: boolean } | null>(null);
  const [copiedManifestUrl, setCopiedManifestUrl] = useState(false);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const isSyncedUrlLocked = Boolean(manifestUrl && !manifestUrl.startsWith('manual://'));

  // Update local URL state when context changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setUrl(manifestUrl);
      setIsManual(false);
      setManualJson('');
      setError(null);
      setCopiedManifestUrl(false);
    }
  }, [isOpen, manifestUrl]);


  const handleLoad = async () => {
    if (!url) return;
    setIsLoading(true);
    setError(null);
    try {
      const catalogs = await fetchManifest(url);
      handleSyncSuccess(catalogs, url);
    } catch (err: unknown) {
      console.error(err);
      setError({
        title: 'Connection Error',
        message: 'Could not fetch the manifest. This is often caused by CORS restrictions on the manifest server.',
        isCors: true
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSync = () => {
    if (!manualJson) return;
    try {
      const catalogs = importManifest(manualJson);
      handleSyncSuccess(catalogs, url || 'manual://pasted-content');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'The content you pasted is not a valid AIOMetadata manifest.';
      setError({
        title: 'Invalid JSON',
        message: message
      });
    }
  };

  const handleSyncSuccess = (catalogs: AIOMetadataCatalog[], syncUrl: string) => {
    setManifestUrl(syncUrl);
    // Auto-update placeholders after fetching
    try {
      syncManifest(catalogs, syncUrl, true);
      setView('selection');
      onOpenChange(false);
    } catch (bulkErr: unknown) {
      const message = bulkErr instanceof Error ? bulkErr.message : 'Could not automatically sync catalogs with your widgets.';
      setError({
        title: 'Sync Failed',
        message: message
      });
    }
  };

  const handleClearSyncedUrl = () => {
    disconnectManifest();
    setUrl('');
    setError(null);
    setCopiedManifestUrl(false);

    requestAnimationFrame(() => {
      urlInputRef.current?.focus();
    });
  };

  const handleCopyManifestUrl = async () => {
    if (!url) return;

    try {
      await copyTextToClipboard(url);
      setCopiedManifestUrl(true);
      window.setTimeout(() => {
        setCopiedManifestUrl(false);
      }, 2000);
    } catch {
      setError({
        title: 'Copy Failed',
        message: 'The manifest URL could not be copied to your clipboard.'
      });
    }
  };

  const handleManifestUrlKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    void handleCopyManifestUrl();
  };

  const Content = (
    <div className="min-w-0 p-8 pt-10 max-sm:p-5 max-sm:pt-6">
      <div className="space-y-6 items-start text-left flex flex-col">
        <div className="size-14 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary  max-sm:size-12">
          <Sparkles className="size-7 max-sm:size-6" />
        </div>
        <div className="min-w-0 space-y-1">
          <h2 className="text-2xl font-black tracking-tight max-sm:text-xl">
            {isManual ? 'Manual Manifest Sync' : 'AIOMetadata Setup'}
          </h2>
          <p className="text-muted-foreground/60 text-xs font-medium leading-relaxed max-sm:text-[11px]">
            {isManual 
              ? 'Paste your AIOMetadata manifest JSON below to sync catalogs. This bypasses CORS and connection issues.'
              : 'Enter your AIOMetadata manifest URL below to automatically sync your catalogs and update placeholders.'}
          </p>
        </div>
      </div>

      <div className="py-6 max-sm:py-5">
        {!isManual ? (
          <div className="space-y-4">
            {manifestUrl && (
            <div className={cn(editorPanelClass, "flex items-center justify-between gap-3 border-primary/10 bg-primary/5 px-4 py-2.5")}>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-primary/80">
                  <span className="size-1.5 rounded-full bg-green-500/90 " />
                  Synced
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(editorActionButtonClass, editorDisconnectIconButtonClass)}
                onClick={handleClearSyncedUrl}
                aria-label="Disconnect AIOMetadata manifest"
                title="Disconnect AIOMetadata manifest"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )}

          <div className="space-y-2.5">
            <p className="px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/55">
              Manifest URL
            </p>
            <div className={cn(editorFormSurfaceClass, "relative group border-zinc-200/90 bg-white/92 p-1.5 transition-all hover:border-zinc-300/90 focus-within:border-primary/35 focus-within:bg-white dark:border-border/40 dark:bg-background/74 dark:hover:border-border/55 dark:focus-within:bg-background")}>
              {isSyncedUrlLocked ? (
                <div className="flex min-w-0 items-center gap-1.5 overflow-hidden rounded-lg bg-zinc-50/85 pr-1.5 dark:bg-muted/[0.16]">
                  <div
                    role="button"
                    tabIndex={0}
                    data-testid="manifest-url-input"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      void handleCopyManifestUrl();
                    }}
                    onKeyDown={handleManifestUrlKeyDown}
                    className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-lg px-3 py-3 text-left transition-colors hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 active:scale-[0.98] cursor-pointer select-none"
                    aria-label="Copy synced AIOMetadata manifest URL"
                  >
                    <Globe className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary/80 dark:text-muted-foreground/28" />
                    <span className="block min-w-0 flex-1 truncate font-medium text-base text-foreground/88 sm:text-sm dark:text-foreground/84">
                      {url}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyManifestUrl}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground/55 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                    aria-label="Copy synced AIOMetadata URL"
                  >
                    {copiedManifestUrl ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSyncedUrl}
                    className={cn(editorDisconnectIconButtonClass, "inline-flex items-center justify-center")}
                    aria-label="Disconnect synced AIOMetadata URL"
                    title="Disconnect AIOMetadata manifest"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ) : (
                <div className="relative flex items-center rounded-lg bg-zinc-50/85 dark:bg-muted/[0.16]">
                  <Globe className="pointer-events-none absolute left-3.5 size-4 text-muted-foreground/40 group-focus-within:text-primary/80 dark:text-muted-foreground/28 transition-colors" />
                  <Input
                    data-testid="manifest-url-input"
                    ref={urlInputRef}
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="https://aiometadata.fortheweak.cloud/manifest.json"
                    className="pl-11 pr-4 h-12 max-sm:h-11 bg-transparent border-none text-foreground/88 placeholder:text-muted-foreground/40 focus-visible:ring-0 transition-all font-medium text-base sm:text-sm dark:text-foreground/84 dark:placeholder:text-muted-foreground/34"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
                  />
                </div>
              )}
            </div>
          </div>
          
          {error?.isCors && (
            <div className={cn(editorPanelClass, "p-4 bg-destructive/5 border-destructive/10 space-y-2")}>
              <p className="text-xs text-destructive/80 leading-relaxed font-medium">
                Fetching failed. This is likely a CORS alert. Would you like to try 
                <button 
                  onClick={() => setIsManual(true)}
                  className="mx-1 text-primary hover:underline font-bold"
                >
                  Manual Sync
                </button> 
                instead?
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className={cn(editorPanelClass, "relative group bg-muted/20 border-border/10 focus-within:border-primary/30 transition-all p-2")}>
            <textarea
              data-testid="manifest-manual-textarea"
              placeholder='{ "catalogs": [...] }'
              className="w-full min-h-[150px] max-sm:min-h-[180px] bg-transparent border-none focus:outline-none transition-all font-mono text-base sm:text-[10px] leading-tight resize-y overflow-y-auto p-2"
              value={manualJson}
              onChange={(e) => setManualJson(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setIsManual(false)}
            className="text-[10px] text-muted-foreground/60 hover:text-primary transition-all font-bold uppercase tracking-widest"
          >
            ← Back to URL Sync
          </button>
        </div>
      )}
    </div>

    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pb-4 max-sm:pb-[env(safe-area-inset-bottom,1.5rem)]">
      <Button
        type="button"
        variant="ghost"
        className={cn(editorActionButtonClass, editorFooterSecondaryButtonClass, "w-full sm:flex-1")}
        onClick={() => {
          setView('selection');
          onOpenChange(false);
        }}
      >
        Skip for now
      </Button>
      <Button
        type="button"
        data-testid="manifest-sync-submit"
        className={cn(editorActionButtonClass, editorFooterPrimaryButtonClass, "w-full sm:flex-1")}
        onClick={isManual ? handleManualSync : handleLoad}
        disabled={isLoading || (isManual ? !manualJson : !url)}
      >
        {isLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          isManual ? "Import JSON" : manifestUrl ? "Update Sync" : "Connect & Sync"
        )}
      </Button>
    </div>
  </div>
  );

  if (isMobile) {
    return (
      <Drawer
        open={isOpen}
        onOpenChange={onOpenChange}
        fixed
        handleOnly
      >
        <DrawerContent className="max-h-[94dvh] overflow-hidden rounded-t-[2.5rem] bg-background border-border/40">
          <DrawerHeader className="sr-only">
            <DrawerTitle>{isManual ? 'Manual Manifest Sync' : 'AIOMetadata Setup'}</DrawerTitle>
            <DrawerDescription>AIOMetadata setup and sync configuration.</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            {Content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(500px,calc(100vw-2rem))] max-w-[min(500px,calc(100vw-2rem))] rounded-3xl border border-border/40 bg-card/95 p-0 backdrop-blur-2xl overflow-x-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>{isManual ? 'Manual Manifest Sync' : 'AIOMetadata Setup'}</DialogTitle>
          <DialogDescription>AIOMetadata setup and sync configuration.</DialogDescription>
        </DialogHeader>
        {Content}
      </DialogContent>

      <ConfirmationDialog 
        isOpen={!!error && !error.isCors}
        onOpenChange={(open) => !open && setError(null)}
        title={error?.title || 'Error'}
        description={error?.message || ''}
        variant="danger"
        confirmText="Retry"
        onConfirm={() => setError(null)}
      />
    </Dialog>
  );
}
