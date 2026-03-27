"use client";

import { useState, useEffect, useRef } from 'react';
import { useConfig } from '@/context/ConfigContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { Loader2, Globe, Sparkles, Trash2 } from 'lucide-react';
import { AIOMetadataCatalog } from '@/lib/types/widget';


interface ManifestModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManifestModal({ isOpen, onOpenChange }: ManifestModalProps) {
  const { manifestUrl, setManifestUrl, fetchManifest, syncManifest, setView, importManifest, disconnectManifest } = useConfig();
  const [url, setUrl] = useState(manifestUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [isManual, setIsManual] = useState(false);
  const [manualJson, setManualJson] = useState('');
  const [error, setError] = useState<{ title: string; message: string; isCors?: boolean } | null>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  // Update local URL state when context changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setUrl(manifestUrl);
      setIsManual(false);
      setManualJson('');
      setError(null);
      setShowDisconnectConfirm(false);
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
    setShowDisconnectConfirm(false);

    requestAnimationFrame(() => {
      urlInputRef.current?.focus();
    });
  };


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-[2.5rem] border border-border/40 bg-card/95 backdrop-blur-2xl shadow-2xl max-sm:w-[calc(100vw-1rem)] max-sm:max-w-[calc(100vw-1rem)] max-sm:rounded-[1.9rem]">
        <DialogHeader className="space-y-4 pt-4 max-sm:pt-2">
          <div className="size-14 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary mb-2 shadow-sm max-sm:size-12 max-sm:rounded-[1rem]">
            <Sparkles className="size-7 max-sm:size-6" />
          </div>
          <div className="space-y-1">
            <DialogTitle className="text-2xl font-black tracking-tight max-sm:text-xl">
              {isManual ? 'Manual Manifest Sync' : 'AIOMetadata Setup'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground/60 text-xs font-medium leading-relaxed max-sm:text-[11px]">
              {isManual 
                ? 'Paste your AIOMetadata manifest JSON below to sync catalogs. This bypasses CORS and connection issues.'
                : 'Enter your AIOMetadata manifest URL below to automatically sync your catalogs and update placeholders.'}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="py-6 max-sm:py-5">
          {!isManual ? (
            <div className="space-y-4">
              {manifestUrl && (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 max-sm:flex-col max-sm:items-stretch">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-primary/80">
                      <span className="size-1.5 rounded-full bg-green-500/90 shadow-[0_0_6px_rgba(34,197,94,0.28)]" />
                      Currently synced
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 shrink-0 rounded-xl px-3 text-[10px] font-bold uppercase tracking-widest text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setShowDisconnectConfirm(true)}
                  >
                    Disconnect
                  </Button>
                </div>
              )}

              <div className="space-y-2.5">
                <p className="px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/55">
                  Manifest URL
                </p>
                <div className="relative group rounded-[1.6rem] border border-zinc-200/90 bg-white/92 p-1.5 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.18)] transition-all hover:border-zinc-300/90 focus-within:border-primary/35 focus-within:bg-white dark:border-border/40 dark:bg-background/74 dark:hover:border-border/55 dark:focus-within:bg-background">
                  <div className="relative flex items-center rounded-[1.2rem] bg-zinc-50/85 dark:bg-muted/[0.16]">
                    <Globe className="pointer-events-none absolute left-3.5 size-4 text-muted-foreground/40 group-focus-within:text-primary/80 dark:text-muted-foreground/28 transition-colors" />
                    <Input
                      data-testid="manifest-url-input"
                      ref={urlInputRef}
                      placeholder="https://aiometadata.fortheweak.cloud/manifest.json"
                      className="pl-11 pr-14 h-12 max-sm:h-11 bg-transparent border-none text-foreground/88 placeholder:text-muted-foreground/40 focus-visible:ring-0 transition-all font-medium text-sm max-sm:text-[13px] dark:text-foreground/84 dark:placeholder:text-muted-foreground/34"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
                    />
                    {manifestUrl && (
                      <button
                        type="button"
                        onClick={handleClearSyncedUrl}
                        className="absolute right-2.5 inline-flex size-8 items-center justify-center rounded-xl text-muted-foreground/45 transition-colors hover:bg-destructive/10 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive/20"
                        aria-label="Clear synced AIOMetadata URL"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              
              {error?.isCors && (
                <div className="p-4 rounded-2xl bg-destructive/5 border border-destructive/10 space-y-2">
                  <p className="text-xs text-destructive/80 leading-relaxed font-medium">
                    Fetching failed. This is likely a CORS issue. Would you like to try 
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
              <div className="relative group bg-muted/20 rounded-2xl border border-border/10 focus-within:border-primary/30 transition-all p-2">
                <textarea
                  data-testid="manifest-manual-textarea"
                  placeholder='{ "catalogs": [...] }'
                  className="w-full min-h-[150px] max-sm:min-h-[180px] bg-transparent border-none focus:outline-none transition-all font-mono text-[10px] leading-tight resize-none p-2"
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

        <DialogFooter className="flex-col sm:flex-row gap-3 sm:gap-4 pb-4">
          <Button
            variant="ghost"
            className="w-full sm:flex-1 h-11 rounded-xl max-sm:rounded-[1rem] font-bold uppercase tracking-wider text-xs text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30 transition-all"
            onClick={() => {
              setView('selection');
              onOpenChange(false);
            }}
          >
            Skip for now
          </Button>
          <Button
            data-testid="manifest-sync-submit"
            className="w-full sm:flex-1 h-11 rounded-xl max-sm:rounded-[1rem] font-bold uppercase tracking-wider text-xs shadow-lg shadow-primary/20 transition-all"
            onClick={isManual ? handleManualSync : handleLoad}
            disabled={isLoading || (isManual ? !manualJson : !url)}
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              isManual ? "Import JSON" : manifestUrl ? "Update Sync" : "Connect & Sync"
            )}
          </Button>
        </DialogFooter>
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

      <ConfirmationDialog
        isOpen={showDisconnectConfirm}
        onOpenChange={setShowDisconnectConfirm}
        title="Disconnect Sync?"
        description="The synced AIOMetadata URL will be removed. Existing widgets stay as they are, but catalog validation and placeholder replacement will stop until you sync again."
        variant="danger"
        confirmText="Disconnect"
        onConfirm={() => {
          disconnectManifest();
          setUrl('');
          setIsManual(false);
          setManualJson('');
        }}
      />
    </Dialog>
  );
}
