"use client";

import { useState } from 'react';
import { useConfig } from '@/context/ConfigContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2, CloudUpload } from 'lucide-react';

interface ImportMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportMergeDialog({ open, onOpenChange }: ImportMergeDialogProps) {
  const { mergeConfig } = useConfig();
  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    added: number;
    skippedExisting: number;
    skippedInPayload: number;
    repairedIds: { widgetIds: string[]; itemIds: string[] };
    importIssues: { path: string; label: string; parentLabel?: string; message: string }[];
  } | null>(null);

  const handleImport = () => {
    try {
      const config = JSON.parse(jsonInput);
      
      // Basic validation
      if (config.exportType !== 'fusionWidgets' || !Array.isArray(config.widgets)) {
        throw new Error('Invalid Fusion JSON format. Missing "exportType": "fusionWidgets" or "widgets" array.');
      }

      const result = mergeConfig(config);
      setSuccess(result);
      setError(null);
      setJsonInput('');

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to parse JSON');
      setSuccess(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val);
      if (!val) {
        setError(null);
        setSuccess(null);
        setJsonInput('');
      }
    }}>
      <DialogContent className="sm:max-w-[550px] rounded-[2.5rem] border border-border/40 bg-background/95 backdrop-blur-2xl shadow-2xl p-0 overflow-hidden max-sm:w-[calc(100vw-1rem)] max-sm:max-w-[calc(100vw-1rem)] max-sm:rounded-[1.9rem]">
        <div className="p-8 pt-10 max-sm:p-5 max-sm:pt-6">
          <DialogHeader className="space-y-4 items-start text-left">
            <div className="size-14 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary mb-2 shadow-sm max-sm:size-12 max-sm:rounded-[1rem]">
               <CloudUpload className="size-7 max-sm:size-6" />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-black tracking-tight max-sm:text-xl">Merge &amp; Update Widgets</DialogTitle>
              <DialogDescription className="text-muted-foreground/60 text-xs font-medium leading-relaxed max-w-[360px] max-sm:text-[11px] max-sm:max-w-none">
                Paste your Fusion JSON here. Existing widgets with the same title and type will be skipped automatically. Use this to merge widgets from different setups or bring missing widgets into your current setup.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="space-y-6 py-6 max-sm:space-y-5 max-sm:py-5">
            <div className="relative group bg-muted/20 rounded-2xl border border-border/10 focus-within:border-primary/30 transition-all p-1">
              <Textarea
                data-testid="merge-import-textarea"
                placeholder='{ "exportType": "fusionWidgets", ... }'
                className="min-h-[250px] max-sm:min-h-[220px] font-mono text-[11px] bg-transparent border-none focus-visible:ring-0 p-4 max-sm:p-3 resize-none transition-all leading-relaxed"
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
              />
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/10 flex items-center gap-3 text-destructive animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="size-4 shrink-0" />
                <p className="text-xs font-bold">{error}</p>
              </div>
            )}

            {success && (
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-center gap-3 text-primary animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 className="size-4 shrink-0" />
                <div className="flex flex-col">
                  <p className="text-xs font-bold">Import successful!</p>
                  <p className="text-[10px] font-medium opacity-60">
                    Added: {success.added} | Existing: {success.skippedExisting} | Payload: {success.skippedInPayload}
                  </p>
                  <p className="text-[10px] font-medium opacity-60">
                    Repaired IDs: {success.repairedIds.widgetIds.length + success.repairedIds.itemIds.length}
                  </p>
                  {success.importIssues.length > 0 && (
                    <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-left text-[10px] text-amber-700 dark:text-amber-300">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold">Skipped unsupported entries</p>
                        <div className="rounded-full border border-amber-500/20 bg-background/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]">
                          {success.importIssues.length}
                        </div>
                      </div>
                      <div className="mt-2 max-h-36 space-y-1 overflow-y-auto pr-1">
                        {success.importIssues.map((issue) => (
                          <p key={`${issue.label}-${issue.message}`}>
                            <span className="font-bold text-foreground/85">{issue.label}</span>
                            {issue.parentLabel ? <span> in {issue.parentLabel}</span> : null}
                            <span>: {issue.message}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-3 sm:gap-4">
            <DialogClose asChild>
              <Button variant="ghost" className="w-full sm:flex-1 h-11 sm:h-12 rounded-xl max-sm:rounded-[1rem] font-bold uppercase tracking-wider text-xs text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30 transition-all">
                Cancel
              </Button>
            </DialogClose>
            <Button 
              data-testid="merge-widgets-submit"
              onClick={handleImport}
              disabled={!jsonInput.trim() || !!success}
              className="w-full sm:flex-1 h-11 sm:h-12 rounded-xl max-sm:rounded-[1rem] font-bold uppercase tracking-wider text-xs shadow-lg shadow-primary/20 transition-all active:scale-95 px-8"
            >
              Merge Widgets
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
