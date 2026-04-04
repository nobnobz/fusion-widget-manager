import { useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { ExportableCatalogInventory } from '@/lib/aiometadata-export-inventory';
import type {
  AIOMetadataCacheTtlPreset,
  AIOMetadataExportOverrideState,
  AIOMetadataLetterboxdExportOverride,
  AIOMetadataMDBListExportOverride,
  AIOMetadataSourceScopedOverrideMap,
  AIOMetadataStreamingExportOverride,
  AIOMetadataTraktExportOverride,
} from '@/lib/aiometadata-export-settings';
import {
  CACHE_TTL_PRESET_OPTIONS,
  MDBLIST_SORT_OPTIONS,
  STREAMING_SORT_OPTIONS,
  TRAKT_SORT_OPTIONS,
  cacheTtlSecondsFromPreset,
  detectCacheTtlPreset,
  formatCacheTtlLabel,
} from '@/lib/aiometadata-export-settings';
import {
  editorActionButtonClass,
  editorFooterPrimaryButtonClass,
  editorFooterSecondaryButtonClass,
} from './editorSurfaceStyles';
import { useMobile } from '@/hooks/use-mobile';

export type AIOMetadataSettingsDialogTarget =
  | { kind: 'widget'; widgetId: string }
  | { kind: 'item'; itemKey: string }
  | { kind: 'catalog'; catalogKey: string };

type EditableAiometadataSource = 'mdblist' | 'trakt' | 'streaming' | 'letterboxd';

function cloneOverrides(overrides: AIOMetadataExportOverrideState): AIOMetadataExportOverrideState {
  return {
    widgets: Object.fromEntries(Object.entries(overrides.widgets).map(([key, value]) => [key, { ...value }])),
    items: Object.fromEntries(Object.entries(overrides.items).map(([key, value]) => [key, { ...value }])),
    catalogs: Object.fromEntries(Object.entries(overrides.catalogs).map(([key, value]) => [key, { ...value }])),
  };
}

function cleanupScopedValue<T extends Record<string, unknown>>(value: T | undefined): T | undefined {
  if (!value) return undefined;
  const next = Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)) as T;
  return Object.keys(next).length > 0 ? next : undefined;
}

function getTargetMeta(target: AIOMetadataSettingsDialogTarget | null, inventory: ExportableCatalogInventory) {
  if (!target) {
    return null;
  }

  if (target.kind === 'widget') {
    const widget = inventory.widgets.find((candidate) => candidate.id === target.widgetId);
    if (!widget) return null;
    return {
      title: widget.widgetTitle || `Widget ${widget.widgetIndex + 1}`,
      description: 'AIOMetadata settings',
      sources: Array.from(new Set(
        widget.catalogKeys
          .map((catalogKey) => inventory.catalogs.find((catalog) => catalog.key === catalogKey)?.source)
          .filter((source): source is EditableAiometadataSource =>
            source === 'mdblist' || source === 'trakt' || source === 'streaming' || source === 'letterboxd'
          )
      )),
    };
  }

  if (target.kind === 'item') {
    const item = inventory.widgets.flatMap((widget) => widget.items).find((candidate) => candidate.id === target.itemKey);
    if (!item) return null;
    return {
      title: item.itemName,
      description: 'AIOMetadata settings',
      sources: Array.from(new Set(
        item.catalogKeys
          .map((catalogKey) => inventory.catalogs.find((catalog) => catalog.key === catalogKey)?.source)
          .filter((source): source is EditableAiometadataSource =>
            source === 'mdblist' || source === 'trakt' || source === 'streaming' || source === 'letterboxd'
          )
      )),
    };
  }

  const catalog = inventory.catalogs.find((candidate) => candidate.key === target.catalogKey);
  if (!catalog) return null;
  return {
    title: catalog.entry.name,
    description: 'AIOMetadata settings',
    sources: catalog.source === 'mdblist' || catalog.source === 'trakt' || catalog.source === 'streaming' || catalog.source === 'letterboxd'
      ? [catalog.source]
      : [],
  };
}

function SourceSection({ title, onReset, children }: { title: string; onReset: () => void; children: ReactNode }) {
  return (
    <div className="space-y-4 rounded-3xl border border-zinc-200/60 bg-zinc-50/50 p-6 max-sm:p-5 dark:border-white/5 dark:bg-white/[0.02] backdrop-blur-sm shadow-sm relative group/section">
      <div className="flex items-center justify-between border-b border-border/10 pb-2.5 mb-4.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/45">
          {title}
        </p>
        {onReset && (
          <button
            onClick={onReset}
            className="text-[9px] font-bold uppercase tracking-widest text-foreground/40 hover:text-red-500/80 transition-all bg-zinc-200/50 dark:bg-white/5 hover:bg-zinc-300 dark:hover:bg-white/10 px-2 py-1 rounded-lg border border-zinc-300/30 dark:border-white/5 active:scale-95"
          >
            Reset
          </button>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40">{children}</p>;
}

function PickerField({
  value,
  onChange,
  options,
}: {
  value: string | undefined;
  onChange: (nextValue: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value) || options[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-xl border border-zinc-200/80 bg-white/70 px-4 text-[14.5px] sm:text-[14px] font-semibold text-left outline-none transition-all hover:border-primary/40 hover:bg-white dark:border-white/10 dark:bg-zinc-950/40 dark:hover:border-primary/40 dark:hover:bg-zinc-950/60 shadow-sm"
        >
          <span>{selectedOption?.label}</span>
          <ChevronDown className={cn("size-4 text-muted-foreground/50 transition-transform", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent 
        align="start" 
        className="w-[var(--radix-popover-trigger-width)] max-h-[350px] overflow-y-auto custom-scrollbar rounded-2xl border border-zinc-200/80 bg-white/95 p-1.5 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/95 shadow-xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="space-y-1 p-1.5 max-h-[340px] overflow-y-auto custom-scrollbar">
          {options.map((option) => {
            const selected = option.value === selectedOption?.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-base sm:text-[13px] font-bold transition-all active:scale-[0.98]",
                  selected 
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/10" 
                    : "text-foreground/75 hover:bg-muted"
                )}
              >
                <span>{option.label}</span>
                {selected ? <Check className="size-4 stroke-[3px]" /> : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CacheTtlField({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (nextValue: number | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const detectedPreset = detectCacheTtlPreset(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-xl border border-zinc-200/80 bg-white/70 px-4 text-left outline-none transition-all hover:border-primary/40 hover:bg-white dark:border-white/10 dark:bg-zinc-950/40 dark:hover:border-primary/40 dark:hover:bg-zinc-950/60 shadow-sm"
          >
            <div className="min-w-0">
              <p className="truncate text-[14.5px] sm:text-[14px] font-semibold">{formatCacheTtlLabel(value)}</p>
            </div>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground/50 transition-transform", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent 
        align="start" 
        className="w-[var(--radix-popover-trigger-width)] max-h-[350px] overflow-y-auto custom-scrollbar rounded-2xl border border-zinc-200/80 bg-white/95 p-1.5 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/95 shadow-xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="space-y-1 p-1.5 max-h-[340px] overflow-y-auto custom-scrollbar">
          {CACHE_TTL_PRESET_OPTIONS.map((option) => {
            const selected = detectedPreset === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(cacheTtlSecondsFromPreset(option.value as Exclude<AIOMetadataCacheTtlPreset, 'custom'>));
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-left text-base sm:text-[13px] font-bold transition-all active:scale-[0.98]",
                  selected 
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/10" 
                    : "text-foreground/75 hover:bg-muted"
                )}
              >
                <span>{option.label}</span>
                {selected ? <Check className="size-4 stroke-[3px]" /> : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AIOMetadataExportSettingsDialog({
  open,
  onOpenChange,
  target,
  inventory,
  overrides,
  resolvedValues,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: AIOMetadataSettingsDialogTarget | null;
  inventory: ExportableCatalogInventory;
  overrides: AIOMetadataExportOverrideState;
  resolvedValues: AIOMetadataSourceScopedOverrideMap;
  onSave: (nextValue: AIOMetadataExportOverrideState) => void;
}) {
  const isMobile = useMobile();
  const [draftOverrides, setDraftOverrides] = useState<AIOMetadataExportOverrideState>(cloneOverrides(overrides));

  const targetMeta = useMemo(() => getTargetMeta(target, inventory), [inventory, target]);

  const updateSourceOverride = (
    source: EditableAiometadataSource,
    nextSourceValue:
      | AIOMetadataMDBListExportOverride
      | AIOMetadataTraktExportOverride
      | AIOMetadataStreamingExportOverride
      | AIOMetadataLetterboxdExportOverride
      | undefined
  ) => {
    if (!target) return;

    setDraftOverrides((current) => {
      const next = cloneOverrides(current);
      const scopeName = target.kind === 'widget' ? 'widgets' : target.kind === 'item' ? 'items' : 'catalogs';
      const scopeKey = target.kind === 'widget' ? target.widgetId : target.kind === 'item' ? target.itemKey : target.catalogKey;

      if (scopeName === 'catalogs') {
        next.catalogs[scopeKey] = cleanupScopedValue(nextSourceValue as Record<string, unknown>) as typeof next.catalogs[string];
        if (!next.catalogs[scopeKey]) {
          delete next.catalogs[scopeKey];
        }
        return next;
      }

      const currentScopeValue: AIOMetadataSourceScopedOverrideMap = { ...(next[scopeName][scopeKey] || {}) };
      if (nextSourceValue) {
        if (source === 'mdblist') {
          currentScopeValue.mdblist = cleanupScopedValue(nextSourceValue as Record<string, unknown>) as AIOMetadataMDBListExportOverride;
        } else if (source === 'trakt') {
          currentScopeValue.trakt = cleanupScopedValue(nextSourceValue as Record<string, unknown>) as AIOMetadataTraktExportOverride;
        } else if (source === 'letterboxd') {
          currentScopeValue.letterboxd = cleanupScopedValue(nextSourceValue as Record<string, unknown>) as AIOMetadataLetterboxdExportOverride;
        } else {
          currentScopeValue.streaming = cleanupScopedValue(nextSourceValue as Record<string, unknown>) as AIOMetadataStreamingExportOverride;
        }
      } else {
        delete currentScopeValue[source];
      }

      if (Object.keys(currentScopeValue).length === 0) {
        delete next[scopeName][scopeKey];
      } else {
        next[scopeName][scopeKey] = currentScopeValue;
      }
      return next;
    });
  };

  const getSourceOverride = (source: EditableAiometadataSource) => {
    if (!target) return undefined;
    const scopeName = target.kind === 'widget' ? 'widgets' : target.kind === 'item' ? 'items' : 'catalogs';
    const scopeKey = target.kind === 'widget' ? target.widgetId : target.kind === 'item' ? target.itemKey : target.catalogKey;
    if (scopeName === 'catalogs') {
      return draftOverrides.catalogs[scopeKey] || resolvedValues[source];
    }
    return draftOverrides[scopeName][scopeKey]?.[source] || resolvedValues[source];
  };

  const handleSave = () => {
    onSave(draftOverrides);
    onOpenChange(false);
  };

  const Content = (
    <>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-10 max-sm:px-5 max-sm:pt-6">
        <DialogHeader className="space-y-6 max-sm:space-y-4 items-start text-left shrink-0">
          <div className="size-14 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary max-sm:size-12">
            <SlidersHorizontal className="size-7 max-sm:size-6" />
          </div>
          <div className="space-y-1">
            <DialogTitle className="text-2xl font-black tracking-tight max-sm:text-[1.25rem] truncate w-full">
              {targetMeta?.title || 'AIOMetadata Export Settings'}
            </DialogTitle>
            <DialogDescription className="text-xs font-medium leading-relaxed text-muted-foreground/64 max-sm:text-[11px]">
              {targetMeta?.description || 'Adjust source-specific AIOMetadata export settings.'}
            </DialogDescription>
          </div>
        </DialogHeader>
        
        <div className="px-8 py-6 max-sm:px-0 space-y-6">
          {targetMeta?.sources.includes('mdblist') && (
            <SourceSection title="MDBList" onReset={() => updateSourceOverride('mdblist', undefined)}>
              <div>
                <FieldLabel>Sort</FieldLabel>
                <PickerField
                  value={(getSourceOverride('mdblist') as AIOMetadataMDBListExportOverride | undefined)?.sort}
                  onChange={(value) => updateSourceOverride('mdblist', {
                    ...(getSourceOverride('mdblist') as AIOMetadataMDBListExportOverride | undefined),
                    sort: value as AIOMetadataMDBListExportOverride['sort'],
                  })}
                  options={MDBLIST_SORT_OPTIONS}
                />
              </div>
              <div>
                <FieldLabel>Order</FieldLabel>
                <PickerField
                  value={(getSourceOverride('mdblist') as AIOMetadataMDBListExportOverride | undefined)?.order}
                  onChange={(value) => updateSourceOverride('mdblist', {
                    ...(getSourceOverride('mdblist') as AIOMetadataMDBListExportOverride | undefined),
                    order: value as AIOMetadataMDBListExportOverride['order'],
                  })}
                  options={[
                    { value: 'asc', label: 'Ascending' },
                    { value: 'desc', label: 'Descending' },
                  ]}
                />
              </div>
              <div>
                <FieldLabel>Refresh every</FieldLabel>
                <CacheTtlField
                  value={(getSourceOverride('mdblist') as AIOMetadataMDBListExportOverride | undefined)?.cacheTTL}
                  onChange={(value) => updateSourceOverride('mdblist', {
                    ...(getSourceOverride('mdblist') as AIOMetadataMDBListExportOverride | undefined),
                    cacheTTL: value,
                  })}
                />
              </div>
            </SourceSection>
          )}

          {targetMeta?.sources.includes('trakt') && (
            <SourceSection title="Trakt" onReset={() => updateSourceOverride('trakt', undefined)}>
              <div>
                <FieldLabel>Sort</FieldLabel>
                <PickerField
                  value={(getSourceOverride('trakt') as AIOMetadataTraktExportOverride | undefined)?.sort}
                  onChange={(value) => updateSourceOverride('trakt', {
                    ...(getSourceOverride('trakt') as AIOMetadataTraktExportOverride | undefined),
                    sort: value as AIOMetadataTraktExportOverride['sort'],
                  })}
                  options={TRAKT_SORT_OPTIONS}
                />
              </div>
              <div>
                <FieldLabel>Direction</FieldLabel>
                <PickerField
                  value={(getSourceOverride('trakt') as AIOMetadataTraktExportOverride | undefined)?.sortDirection}
                  onChange={(value) => updateSourceOverride('trakt', {
                    ...(getSourceOverride('trakt') as AIOMetadataTraktExportOverride | undefined),
                    sortDirection: value as AIOMetadataTraktExportOverride['sortDirection'],
                  })}
                  options={[
                    { value: 'asc', label: 'Ascending' },
                    { value: 'desc', label: 'Descending' },
                  ]}
                />
              </div>
              <div>
                <FieldLabel>Refresh every</FieldLabel>
                <CacheTtlField
                  value={(getSourceOverride('trakt') as AIOMetadataTraktExportOverride | undefined)?.cacheTTL}
                  onChange={(value) => updateSourceOverride('trakt', {
                    ...(getSourceOverride('trakt') as AIOMetadataTraktExportOverride | undefined),
                    cacheTTL: value,
                  })}
                />
              </div>
            </SourceSection>
          )}

          {targetMeta?.sources.includes('streaming') && (
            <SourceSection title="Streaming" onReset={() => updateSourceOverride('streaming', undefined)}>
              <div>
                <FieldLabel>Sort</FieldLabel>
                <PickerField
                  value={(getSourceOverride('streaming') as AIOMetadataStreamingExportOverride | undefined)?.sort}
                  onChange={(value) => updateSourceOverride('streaming', {
                    ...(getSourceOverride('streaming') as AIOMetadataStreamingExportOverride | undefined),
                    sort: value as AIOMetadataStreamingExportOverride['sort'],
                  })}
                  options={STREAMING_SORT_OPTIONS}
                />
              </div>
              <div>
                <FieldLabel>Direction</FieldLabel>
                <PickerField
                  value={(getSourceOverride('streaming') as AIOMetadataStreamingExportOverride | undefined)?.sortDirection}
                  onChange={(value) => updateSourceOverride('streaming', {
                    ...(getSourceOverride('streaming') as AIOMetadataStreamingExportOverride | undefined),
                    sortDirection: value as AIOMetadataStreamingExportOverride['sortDirection'],
                  })}
                  options={[
                    { value: 'asc', label: 'Ascending' },
                    { value: 'desc', label: 'Descending' },
                  ]}
                />
              </div>
            </SourceSection>
          )}

          {targetMeta?.sources.includes('letterboxd') && (
            <SourceSection title="Letterboxd" onReset={() => updateSourceOverride('letterboxd', undefined)}>
              <div>
                <FieldLabel>Refresh every</FieldLabel>
                <CacheTtlField
                  value={(getSourceOverride('letterboxd') as AIOMetadataLetterboxdExportOverride | undefined)?.cacheTTL}
                  onChange={(value) => updateSourceOverride('letterboxd', {
                    ...(getSourceOverride('letterboxd') as AIOMetadataLetterboxdExportOverride | undefined),
                    cacheTTL: value,
                  })}
                />
              </div>
            </SourceSection>
          )}
        </div>
      </div>

      <div className="p-8 pt-4 pb-8 max-sm:px-6 max-sm:pb-8 shrink-0 transition-all border-t border-zinc-200/40 dark:border-white/5 w-full bg-zinc-50/30 dark:bg-zinc-950/10">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 shrink-0">
          <Button
            variant="secondary"
            className={cn(editorActionButtonClass, editorFooterSecondaryButtonClass, "w-full sm:flex-1 h-11 text-[13px] font-bold uppercase tracking-wider")}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button 
             className={cn(editorActionButtonClass, editorFooterPrimaryButtonClass, "w-full sm:flex-1 h-11 text-[13px] font-bold uppercase tracking-wider")} 
             onClick={handleSave}
          >
            Save Changes
          </Button>
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[94dvh] border-zinc-200/80 bg-white dark:border-white/10 dark:bg-zinc-950 rounded-t-[2.5rem]">
          <DrawerHeader className="sr-only">
            <DrawerTitle>{targetMeta?.title || 'AIOMetadata Export Settings'}</DrawerTitle>
            <DrawerDescription>{targetMeta?.description || 'Adjust source-specific AIOMetadata export settings.'}</DrawerDescription>
          </DrawerHeader>
          {Content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] flex flex-col p-0 border-zinc-200/80 bg-white/84 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/84 sm:max-w-[34rem] rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        <DialogHeader className="sr-only">
          <DialogTitle>{targetMeta?.title || 'AIOMetadata Export Settings'}</DialogTitle>
          <DialogDescription>{targetMeta?.description || 'Adjust source-specific AIOMetadata export settings.'}</DialogDescription>
        </DialogHeader>
        {Content}
      </DialogContent>
    </Dialog>
  );
}
