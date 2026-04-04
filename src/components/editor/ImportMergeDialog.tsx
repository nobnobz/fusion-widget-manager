"use client";

import { useState, useRef, DragEvent, ChangeEvent, useMemo, useEffect, useCallback } from 'react';
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
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer"
import { 
  AlertCircle, CheckCircle2, ChevronDown, ChevronRight, 
  CloudUpload, FileJson, FileUp, Image as ImageIcon, RefreshCw, Check, Tag, Trash2, UploadCloud, ArrowRight, Sparkles, ListTree
} from 'lucide-react';
import { convertOmniToFusion } from '@/lib/omni-converter';
import { 
  normalizeFusionConfigDetailed, 
  findCatalog 
} from '@/lib/widget-domain';
import { convertAiometadataImportToFusion, isAiometadataImportPayload } from '@/lib/aiometadata-import';
import { fetchTemplateRepository } from '@/lib/template-repository';
import type { Widget } from '@/lib/types/widget';
import {
  applyImportReview,
  buildImportReviewState,
  getImportItemSelectionKey,
  type WidgetDiff,
} from '@/lib/import-merge';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/lib/error-utils';
import {
  editorActionButtonClass,
  editorFooterPrimaryButtonClass,
  editorFooterSecondaryButtonClass,
  editorPanelClass,
} from './editorSurfaceStyles';
import { useMobile } from '@/hooks/use-mobile';

interface ImportMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialJson?: string;
  initialFileName?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ImportMergeDialog({ open, onOpenChange, initialJson, initialFileName }: ImportMergeDialogProps) {
  const isMobile = useMobile();
  const { widgets, replaceConfig, manifestUrl, replacePlaceholder, manifestCatalogs } = useConfig();
  
  const [step, setStep] = useState<'input' | 'review' | 'success'>('input');
  
  // ... rest of state stays the same ...
  const [jsonInput, setJsonInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [success, setSuccess] = useState<{
    widgetsAdded: number;
    widgetsUpdated: number;
    itemsAdded: number;
    itemsUpdated: number;
    repairedCount: number;
    importIssues: { path: string; label: string; parentLabel?: string; message: string }[];
  } | null>(null);
  const [parsedImportIssues, setParsedImportIssues] = useState<
    Array<{ path: string; label: string; parentLabel?: string; message: string }>
  >([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Review state
  const [parsedWidgets, setParsedWidgets] = useState<Widget[]>([]);
  const [widgetDiffs, setWidgetDiffs] = useState<Record<string, WidgetDiff>>({});
  const [widgetSelected, setWidgetSelected] = useState<Record<string, boolean>>({});
  const [itemSelected, setItemSelected] = useState<Record<string, boolean>>({});
  const [expandedWidgets, setExpandedWidgets] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<string | null>(null);
  
  // Field-level update selection
  const [widgetFieldUpdates, setWidgetFieldUpdates] = useState<Record<string, { name: boolean; catalogs: boolean; image: boolean }>>({});
  const [itemFieldUpdates, setItemFieldUpdates] = useState<Record<string, { name: boolean; catalogs: boolean; image: boolean }>>({});
  
  const [keepExistingCatalogs, setKeepExistingCatalogs] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'new' | 'updates'>('all');
  const [lastImportedJson, setLastImportedJson] = useState<string | null>(null);
  const [lastImportedName, setLastImportedName] = useState<string | null>(null);
  
  const [defaultTemplateUrl, setDefaultTemplateUrl] = useState<string | null>(null);
  const [defaultTemplateVersion, setDefaultTemplateVersion] = useState<string | null>(null);
  const [isFetchingTemplate, setIsFetchingTemplate] = useState(false);

  useEffect(() => {
    if (open) {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('fusion-manager-last-import') : null;
      if (stored) setLastImportedJson(stored);
      const storedName = typeof window !== 'undefined' ? localStorage.getItem('fusion-manager-last-import-name') : null;
      if (storedName) setLastImportedName(storedName);
      
      fetchTemplateRepository().then(repo => {
        setDefaultTemplateUrl(repo.defaultFusionTemplate?.rawUrl || null);
        setDefaultTemplateVersion(repo.defaultFusionTemplate?.version || null);
      }).catch(console.error);
    }
  }, [open]);

  // Updates Dropdown Menu State
  const [updatesDropdownOpen, setUpdatesDropdownOpen] = useState(false);
  const updatesDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!updatesDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (updatesDropdownRef.current && !updatesDropdownRef.current.contains(e.target as Node)) {
        setUpdatesDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [updatesDropdownOpen]);

  // Handle initial payload if provided
  useEffect(() => {
    if (open && initialJson) {
      setJsonInput(initialJson);
      setFileName(initialFileName || 'Import Payload');
      parseAndReview(initialJson, initialFileName || 'Import Payload');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialJson, initialFileName]);

  const resetState = () => {
    setError(null);
    setSuccess(null);
    setJsonInput('');
    setFileName(null);
    setIsDragging(false);
    setStep('input');
    setParsedWidgets([]);
    setWidgetDiffs({});
    setWidgetSelected({});
    setItemSelected({});
    setExpandedWidgets(null);
    setExpandedItems(null);
    setWidgetFieldUpdates({});
    setItemFieldUpdates({});
    setKeepExistingCatalogs(false);
    setParsedImportIssues([]);
  };

  const processFile = (file: File) => {
    if (!file.name.endsWith('.json')) {
      setError('Please provide a valid .json file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setJsonInput(text);
      setFileName(file.name);
      setError(null);
      parseAndReview(text, file.name);
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsText(file);
  };

  const handleDragOver = (e: DragEvent<HTMLElement>) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: DragEvent<HTMLElement>) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
  };
  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) processFile(e.target.files[0]);
  };
  const handleTextareaChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setJsonInput(text);
    setFileName('Pasted JSON');
    if (error) setError(null);

    // Auto-Review if it looks like a valid Fusion JSON
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        const isOmni = parsed?.includedKeys && Array.isArray(parsed?.values);
        const isFusion = parsed?.exportType === 'fusionWidgets' && Array.isArray(parsed?.widgets);
        const isAiometadata = isAiometadataImportPayload(parsed);
        
        if (isOmni || isFusion || isAiometadata) {
          parseAndReview(text, 'Auto-detected Payload');
        }
      } catch {
        // Not a complete JSON yet, ignore
      }
    }
  };

  const parseAndReview = (input: string, sourceName?: string) => {
    try {
      let config = JSON.parse(input);
      if (config?.includedKeys && config?.values) config = convertOmniToFusion(config);
      if (isAiometadataImportPayload(config)) config = convertAiometadataImportToFusion(config);
      if (config.exportType !== 'fusionWidgets' || !Array.isArray(config.widgets)) {
        throw new Error('Invalid Fusion JSON format. Missing "exportType": "fusionWidgets" or "widgets" array.');
      }

      const normalized = normalizeFusionConfigDetailed(config, {
        manifestUrl,
        replacePlaceholder,
        catalogs: manifestCatalogs,
        sanitize: true,
        allowPartialImport: true,
      });
      if (normalized.config.widgets.length === 0 && normalized.importIssues.length > 0) {
        throw new Error(
          `No supported widgets could be imported. First issue: ${normalized.importIssues[0]?.path} - ${normalized.importIssues[0]?.message}`
        );
      }
      const incomingWidgets: Widget[] = normalized.config.widgets;
      const reviewState = buildImportReviewState(widgets, incomingWidgets);

      setParsedWidgets(incomingWidgets);
      setParsedImportIssues(normalized.importIssues);
      setWidgetDiffs(reviewState.widgetDiffs);
      setWidgetSelected(reviewState.widgetSelected);
      setItemSelected(reviewState.itemSelected);
      setWidgetFieldUpdates(reviewState.widgetFieldUpdates);
      setItemFieldUpdates(reviewState.itemFieldUpdates);
      setExpandedWidgets(null);
      setExpandedItems(null);
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('fusion-manager-last-import', input);
        if (sourceName) localStorage.setItem('fusion-manager-last-import-name', sourceName);
      }
      setLastImportedJson(input);
      if (sourceName) setLastImportedName(sourceName);

      setStep('review');
      setError(null);
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to parse JSON'));
      setSuccess(null);
      setStep('input');
    }
  };

  const toggleWidgetSelection = (widgetId: string, checked: boolean) => {
    setWidgetSelected(prev => ({ ...prev, [widgetId]: checked }));
    
    const w = parsedWidgets.find(pw => pw.id === widgetId);
    if (!w) return;

    if (w.type === 'collection.row') {
      const diff = widgetDiffs[widgetId];
      setItemSelected(prev => {
        const next = { ...prev };
        w.dataSource.payload.items.forEach(item => {
          const itemKey = getImportItemSelectionKey(w.id, item.id);
          if (diff?.itemDiffs[item.id]?.status !== 'unchanged') {
            next[itemKey] = checked;
          }
        });
        return next;
      });
      // Force reset field updates on check
      if (checked) {
        setItemFieldUpdates(prev => {
          const next = { ...prev };
          w.dataSource.payload.items.forEach(item => {
            const itemDiff = diff?.itemDiffs[item.id];
            const itemKey = getImportItemSelectionKey(w.id, item.id);
            if (itemDiff && itemDiff.status !== 'unchanged') {
              next[itemKey] = {
                name: itemDiff.changes.has('name'),
                catalogs: itemDiff.changes.has('catalogs'),
                image: itemDiff.changes.has('image')
              };
            }
          });
          return next;
        });
      }
    } else if (w.type === 'row.classic' && checked) {
      const diff = widgetDiffs[widgetId];
      if (diff?.status === 'existing') {
        setWidgetFieldUpdates(prev => ({
          ...prev,
          [widgetId]: {
            name: diff?.changes.has('name') ?? false,
            catalogs: diff?.changes.has('catalogs') ?? false,
            image: diff?.changes.has('image') ?? false
          }
        }));
      }
    }
  };

  const toggleExpand = (id: string) =>
    setExpandedWidgets(prev => prev === id ? null : id);

  const setAllSelections = (mode: 'all' | 'none' | 'new' | 'updates-all' | 'updates-catalogs' | 'updates-names' | 'updates-images' | 'updates-clear' | 'updates-catalogs-on' | 'updates-catalogs-off' | 'updates-names-on' | 'updates-names-off' | 'updates-images-on' | 'updates-images-off', exclusive = false) => {
    const newWidgetSelected: Record<string, boolean> = exclusive ? {} : { ...widgetSelected };
    const newItemSelected: Record<string, boolean> = exclusive ? {} : { ...itemSelected };
    const newWidgetFieldUpdates: Record<string, { name: boolean; catalogs: boolean; image: boolean }> = exclusive ? {} : { ...widgetFieldUpdates };
    const newItemFieldUpdates: Record<string, { name: boolean; catalogs: boolean; image: boolean }> = exclusive ? {} : { ...itemFieldUpdates };

    parsedWidgets.forEach(w => {
      const diff = widgetDiffs[w.id];
      if (!diff) return;

      if (mode === 'none') {
        newWidgetSelected[w.id] = false;
        if (w.type === 'collection.row') {
          w.dataSource.payload.items.forEach(item => {
            newItemSelected[getImportItemSelectionKey(w.id, item.id)] = false;
          });
        }
      } else if (mode === 'all') {
        let anyActionableItem = false;
        if (w.type === 'collection.row') {
          w.dataSource.payload.items.forEach(item => {
            const itemDiff = diff.itemDiffs[item.id];
            const itemKey = getImportItemSelectionKey(w.id, item.id);
            const isActionable = (itemDiff?.status ?? 'unchanged') !== 'unchanged';
            newItemSelected[itemKey] = isActionable;
            if (isActionable) {
              anyActionableItem = true;
              newItemFieldUpdates[itemKey] = {
                name: itemDiff?.changes.has('name') ?? false,
                catalogs: itemDiff?.changes.has('catalogs') ?? false,
                image: itemDiff?.changes.has('image') ?? false
              };
            }
          });
        }
        newWidgetSelected[w.id] = diff.status !== 'unchanged' || anyActionableItem;
      } else if (mode === 'new') {
        let hasNewItems = false;
        if (w.type === 'collection.row') {
          w.dataSource.payload.items.forEach(item => {
            const itemKey = getImportItemSelectionKey(w.id, item.id);
            const itemStatus = diff.itemDiffs[item.id]?.status;
            const isItemNew = itemStatus === 'new' || itemStatus === 'ambiguous';
            newItemSelected[itemKey] = isItemNew;
            if (isItemNew) {
              hasNewItems = true;
            }
          });
        }
        newWidgetSelected[w.id] = diff.status === 'new' || hasNewItems;
      } else if (mode.startsWith('updates-')) {
        if (diff.status !== 'existing') {
          if (exclusive) newWidgetSelected[w.id] = false;
          return;
        }

        if (mode === 'updates-clear') {
          newWidgetSelected[w.id] = false;
          if (w.type === 'collection.row') {
            w.dataSource.payload.items.forEach(item => {
              newItemSelected[getImportItemSelectionKey(w.id, item.id)] = false;
            });
          }
        } else if (mode === 'updates-all') {
          let hasUpdatedItems = false;
          if (w.type === 'collection.row') {
            w.dataSource.payload.items.forEach(item => {
              const itemDiff = diff.itemDiffs[item.id];
              const itemKey = getImportItemSelectionKey(w.id, item.id);
              const isUpdate = itemDiff?.status === 'updated' || itemDiff?.status === 'moved';
              newItemSelected[itemKey] = isUpdate;
              if (isUpdate) {
                hasUpdatedItems = true;
                newItemFieldUpdates[itemKey] = {
                  name: itemDiff?.changes.has('name') ?? false,
                  catalogs: itemDiff?.changes.has('catalogs') ?? false,
                  image: itemDiff?.changes.has('image') ?? false
                };
              }
            });
          }
          if (w.type === 'row.classic') {
            newWidgetFieldUpdates[w.id] = {
              name: diff.changes.has('name'),
              catalogs: diff.changes.has('catalogs'),
              image: diff.changes.has('image')
            };
          }
          newWidgetSelected[w.id] = w.type === 'row.classic' ? diff.changes.size > 0 : hasUpdatedItems;
        } else {
          // Filter by specific change type
          const isCatalogMode = mode.includes('catalogs');
          const isNameMode    = mode.includes('names');
          
          const changeKey: 'catalogs' | 'name' | 'image' =
            isCatalogMode ? 'catalogs' :
            isNameMode ? 'name' : 'image';

          // Explicit force on/off or toggle (default to on)
          const forceOff = mode.endsWith('-off');
          const forceOn  = mode.endsWith('-on') || !forceOff;

          if (w.type === 'row.classic') {
            const matches = diff.changes.has(changeKey);
            if (forceOff) {
              newWidgetFieldUpdates[w.id] = { ...newWidgetFieldUpdates[w.id], [changeKey]: false };
              // De-select widget if NO fields are now updated
              const anyFieldLeft = Object.values(newWidgetFieldUpdates[w.id]).some(v => v);
              if (!anyFieldLeft) newWidgetSelected[w.id] = false;
            } else if (forceOn && matches) {
              newWidgetSelected[w.id] = true;
              newWidgetFieldUpdates[w.id] = { ...newWidgetFieldUpdates[w.id], [changeKey]: true };
            }
          } else if (w.type === 'collection.row') {
            let anyItemSelected = false;
            w.dataSource.payload.items.forEach(item => {
              const itemDiff = diff.itemDiffs[item.id];
              const itemKey = getImportItemSelectionKey(w.id, item.id);
              const matches = itemDiff?.changes.has(changeKey) ?? false;
              
              if (forceOff) {
                const current = newItemFieldUpdates[itemKey] || { name: false, catalogs: false, image: false };
                newItemFieldUpdates[itemKey] = { ...current, [changeKey]: false };
                const anyItemFieldLeft = Object.values(newItemFieldUpdates[itemKey]).some(v => v);
                if (!anyItemFieldLeft) newItemSelected[itemKey] = false;
              } else if (forceOn && matches) {
                newItemSelected[itemKey] = true;
                const current = newItemFieldUpdates[itemKey] || { name: false, catalogs: false, image: false };
                newItemFieldUpdates[itemKey] = { ...current, [changeKey]: true };
              }
              
              if (newItemSelected[itemKey]) anyItemSelected = true;
            });
            newWidgetSelected[w.id] = anyItemSelected || (newWidgetSelected[w.id] ?? false);
          }
        }
      }
    });

    setWidgetSelected(newWidgetSelected);
    setItemSelected(newItemSelected);
    setWidgetFieldUpdates(newWidgetFieldUpdates);
    setItemFieldUpdates(newItemFieldUpdates);
  };

  // ─── Execute ────────────────────────────────────────────────────────────────

  const executeImport = () => {
    try {
      const applied = applyImportReview(widgets, parsedWidgets, widgetDiffs, {
        widgetSelected,
        itemSelected,
        widgetFieldUpdates,
        itemFieldUpdates,
        keepExistingCatalogs,
        applyMode: 'merge',
      });

      const finalConfigResult = normalizeFusionConfigDetailed(
        { exportType: 'fusionWidgets', exportVersion: 1, widgets: applied.widgets },
        { manifestUrl, catalogs: manifestCatalogs, replacePlaceholder }
      );

      replaceConfig(finalConfigResult.config);
      const combinedImportIssues = [...parsedImportIssues, ...finalConfigResult.importIssues];
      const deduplicatedImportIssues = combinedImportIssues.filter((issue, index, entries) => {
        const key = `${issue.path}::${issue.label}::${issue.parentLabel || ''}::${issue.message}`;
        return entries.findIndex((entry) =>
          `${entry.path}::${entry.label}::${entry.parentLabel || ''}::${entry.message}` === key
        ) === index;
      });
      setSuccess({
        widgetsAdded: applied.widgetsAdded,
        widgetsUpdated: applied.widgetsUpdated,
        itemsAdded: applied.itemsAdded,
        itemsUpdated: applied.itemsUpdated,
        repairedCount: finalConfigResult.repairedIds.widgetIds.length + finalConfigResult.repairedIds.itemIds.length,
        importIssues: deduplicatedImportIssues,
      });
      setStep('success');
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to execute import. Please try again.'));
    }
  };

  // ─── Derived state ───────────────────────────────────────────────────────────

  const { newWidgets, existingWidgets } = useMemo(() => {
    const nw: Widget[] = [], ew: Widget[] = [];
    parsedWidgets.forEach(w => {
      const d = widgetDiffs[w.id];
      if (!d) return;
      
      const hasNewItems = w.type === 'collection.row'
        && Object.values(d.itemDiffs).some(id => id.status === 'new' || id.status === 'ambiguous');
      const hasUpdates = d.status === 'existing'
        && (d.changes.size > 0
          || Object.values(d.itemDiffs).some(id => id.status === 'updated' || id.status === 'moved'));

      if (d.status === 'new' || hasNewItems) nw.push(w);
      if (hasUpdates) ew.push(w);
    });
    return { newWidgets: nw, existingWidgets: ew };
  }, [parsedWidgets, widgetDiffs]);

  const selectedCount = useMemo(() => {
    return parsedWidgets.filter(w => widgetSelected[w.id] && widgetDiffs[w.id]?.status !== 'unchanged').length;
  }, [parsedWidgets, widgetSelected, widgetDiffs]);

  // ─── Sub-components ──────────────────────────────────────────────────────────

  const CustomCheckbox = ({ checked, onChange, indeterminate, className }: {
    checked: boolean; onChange: (val: boolean) => void; indeterminate?: boolean; className?: string
  }) => (
    <div
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={cn(
        "size-[1.15rem] rounded-[0.4rem] border-2 transition-all cursor-pointer flex items-center justify-center shrink-0",
        checked || indeterminate
          ? "bg-primary border-primary "
          : "bg-white dark:bg-zinc-950/40 border-zinc-300 dark:border-white/10 hover:border-zinc-400 dark:hover:border-primary/40",
        className
      )}
    >
      {indeterminate
        ? <div className="w-2.5 h-0.5 bg-primary-foreground rounded-full" />
        : checked && <Check className="size-3.5 text-primary-foreground stroke-[3.5px]" />
      }
    </div>
  );

  const ChangeBadge = ({ type, active, onClick, disabled, className, children, hideIcon, label }: { 
    type: 'name' | 'catalogs' | 'image' | 'new' | 'updates' | 'moved' | 'ambiguous';
    active?: boolean;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    children?: React.ReactNode;
    hideIcon?: boolean;
    label?: string;
  }) => {
    const configs = {
      new: { label: 'New', icon: null, cls: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/30' },
      updates: { label: 'Updates', icon: null, cls: 'bg-indigo-500/15 text-indigo-700 dark:bg-indigo-500/25 dark:text-indigo-400 border-indigo-500/20 dark:border-indigo-500/30' },
      moved: { label: 'Moved', icon: null, cls: 'bg-violet-500/15 text-violet-700 dark:bg-violet-500/25 dark:text-violet-400 border-violet-500/20 dark:border-violet-500/30' },
      ambiguous: { label: 'Ambiguous', icon: null, cls: 'bg-amber-500/15 text-amber-800 dark:bg-amber-500/25 dark:text-amber-300 border-amber-500/20 dark:border-amber-500/30' },
      name: { label: 'Title', icon: <Tag className="size-2.5 max-sm:size-2" />, cls: 'bg-cyan-500/15 text-cyan-700 dark:bg-cyan-500/25 dark:text-cyan-400 border-cyan-500/20 dark:border-cyan-500/30' },
      catalogs: { label: 'Catalogs', icon: <RefreshCw className="size-2.5 max-sm:size-2" />, cls: 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/25 dark:text-amber-400 border-amber-500/20 dark:border-amber-500/30' },
      image: { label: 'Image', icon: <ImageIcon className="size-2.5 max-sm:size-2" />, cls: 'bg-rose-500/15 text-rose-700 dark:bg-rose-500/25 dark:text-rose-400 border-rose-500/20 dark:border-rose-500/30' },
    };
    const config = configs[type];
    const isSelected = active !== false;

    return (
      <div 
        onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
        className={cn(
          "h-5 max-sm:h-4.5 px-1.5 max-sm:px-1 flex items-center justify-center gap-1 max-sm:gap-0.5 text-[9px] max-sm:text-[8px] font-black uppercase tracking-[0.14em] transition-all rounded-md border",
          onClick && !disabled && "cursor-pointer hover:scale-105 active:scale-95",
          disabled && "opacity-50 cursor-default",
          isSelected ? config.cls : "bg-muted/10 text-muted-foreground/70 border-muted-foreground/20 dark:bg-white/5",
          className
        )}
      >
        {!hideIcon && config.icon}
        {children || label || config.label}
      </div>
    );
  };

  // ─── ImageThumb ───────────────────────────────────────────────────────────────

  const ImageThumb = ({ src, alt, layout, className }: { src: string; alt: string; layout?: 'Wide' | 'Poster' | 'Square' | 'wide' | 'poster' | 'square', className?: string }) => {
    const [ratio, setRatio] = useState<number | null>(null);
    
    // Prioritize explicit layout prop if provided, otherwise auto-detect
    const normalizedLayout = layout?.toLowerCase() as 'wide' | 'poster' | 'square' | undefined;
    
    // portrait < 0.75, square 0.75–1.4, landscape > 1.4
    const isPoster = normalizedLayout ? normalizedLayout === 'poster' : ratio !== null && ratio < 0.75;
    const isWide   = normalizedLayout ? normalizedLayout === 'wide' : ratio !== null && ratio > 1.4;
    
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={cn(
          "rounded-xl object-cover border border-border/40  bg-zinc-50 transition-all dark:bg-muted/10 dark:border-border/20",
          isPoster ? "h-28 w-20 max-sm:h-36 max-sm:w-24"   // portrait
          : isWide  ? "h-16 w-32 max-sm:h-20 max-sm:w-40"  // landscape
          :            "size-20 max-sm:size-24",   // square
          className
        )}
        onLoad={(e) => {
          const img = e.target as HTMLImageElement;
          setRatio(img.naturalWidth / img.naturalHeight);
        }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  };

  // ─── Updates Dropdown Computations ──────────────────────────────────────────

  const computeActiveState = useCallback((field: 'catalogs' | 'name' | 'image'): 'all' | 'some' | 'none' => {
    let eligible = 0;
    let active = 0;
    
    parsedWidgets.forEach(w => {
      if (activeTab === 'new' && widgetDiffs[w.id]?.status !== 'new') return;
      if (activeTab === 'updates' && widgetDiffs[w.id]?.status === 'new') return;
      
      const diff = widgetDiffs[w.id];
      if (!diff) return;

      if (w.type === 'row.classic' && diff.status === 'existing' && diff.changes.has(field)) {
        eligible++;
        if (widgetSelected[w.id] && widgetFieldUpdates[w.id]?.[field]) active++;
      } else if (w.type === 'collection.row') {
        w.dataSource.payload.items.forEach(item => {
          const itemKey = getImportItemSelectionKey(w.id, item.id);
          if (diff.itemDiffs[item.id]?.changes.has(field)) {
            eligible++;
            if (itemSelected[itemKey] && itemFieldUpdates[itemKey]?.[field]) active++;
          }
        });
      }
    });

    if (eligible === 0) return 'none';
    if (active === 0) return 'none';
    if (active === eligible) return 'all';
    return 'some';
  }, [parsedWidgets, widgetDiffs, widgetSelected, widgetFieldUpdates, itemSelected, itemFieldUpdates, activeTab]);

  const catalogState = computeActiveState('catalogs');
  const nameState = computeActiveState('name');
  const imageState = computeActiveState('image');

  const dropdownItems: Array<{ 
    label: string; 
    mode: 'updates-all' | 'updates-catalogs-on' | 'updates-catalogs-off' | 'updates-names-on' | 'updates-names-off' | 'updates-images-on' | 'updates-images-off' | 'updates-clear';
    isActive?: 'all' | 'some' | 'none';
    isToggle?: boolean;
  } | null> = useMemo(() => [
    { label: 'All Updates',      mode: 'updates-all' },
    null,
    ...(activeTab !== 'new' ? [{ label: 'Catalog Updates',  mode: catalogState === 'all' ? 'updates-catalogs-off' as const : 'updates-catalogs-on' as const, isActive: catalogState, isToggle: true }] : []),
    { label: 'Name Updates',     mode: nameState === 'all' ? 'updates-names-off' as const : 'updates-names-on' as const, isActive: nameState, isToggle: true },
    { label: 'Image Updates',    mode: imageState === 'all' ? 'updates-images-off' as const : 'updates-images-on' as const, isActive: imageState, isToggle: true },
    null, 
    { label: 'Clear Selection',  mode: 'updates-clear' },
  ], [activeTab, catalogState, nameState, imageState]);

  const WidgetRow = ({ w }: { w: Widget }) => {
    const diff = widgetDiffs[w.id];
    if (!diff) return null;
    const isExpanded = expandedWidgets === w.id;
    const isSelected = widgetSelected[w.id];
    const isCollection = w.type === 'collection.row';
    const isUnchanged = diff.status === 'unchanged';
    const visibleCollectionItems = isCollection
      ? w.dataSource.payload.items.filter((item) => {
          const status = diff.itemDiffs[item.id]?.status;
          if (!status || status === 'unchanged') return false;
          if (activeTab === 'new' && status !== 'new' && status !== 'ambiguous') return false;
          if (activeTab === 'updates' && (status === 'new' || status === 'ambiguous')) return false;
          return true;
        })
      : [];

    // Check if widget-level checkbox should be indeterminate
    let isIndeterminate = false;
    if (isCollection && isSelected) {
      const selectedItems = visibleCollectionItems.filter(i => itemSelected[getImportItemSelectionKey(w.id, i.id)]);
      isIndeterminate = selectedItems.length > 0 && selectedItems.length < visibleCollectionItems.length;
    } else if (!isCollection && isSelected && diff?.status === 'existing') {
      const active = widgetFieldUpdates[w.id] || {};
      const activeCount = [
        diff.changes.has('name') && active.name,
        diff.changes.has('catalogs') && active.catalogs,
        diff.changes.has('image') && active.image
      ].filter(Boolean).length;
      if (activeCount > 0 && activeCount < diff.changes.size) {
        isIndeterminate = true;
      }
    }

    // Summary counts for collection (Tab-aware)
    let hasNewItems = false;
    let hasActualUpdates = false;
    let hasMovedItems = false;
    let hasAmbiguousItems = false;

    if (isCollection && diff.status !== 'unchanged') {
      const diffs = Object.values(diff.itemDiffs);
      
      const nNew = diffs.filter(d => d.status === 'new' || d.status === 'ambiguous').length;
      
      hasNewItems = nNew > 0;
      hasMovedItems = diffs.some(id => id.status === 'moved');
      hasAmbiguousItems = diffs.some(id => id.status === 'ambiguous');
      hasActualUpdates = diff.status === 'existing' && (
        diff.changes.size > 0 || 
        diffs.some(id => id.status === 'updated' || id.status === 'moved')
      );

      // Only show relevant summary parts for the current tab

    } else if (diff.status === 'existing') {
      // For classic rows (not collections)
      hasActualUpdates = diff.changes.size > 0;
    }

    return (
      <div
        className={cn(
          "rounded-3xl border transition-all duration-500 relative overflow-hidden",
          !isExpanded && "group",
          isUnchanged 
            ? "border-transparent bg-transparent opacity-20 grayscale scale-[0.98]" 
            : isSelected 
              ? "border-primary/30 bg-white dark:bg-white/[0.05] ring-1 ring-primary/10 shadow-md shadow-primary/5 z-20" 
              : cn(
                  "border-border/10 bg-white/95 backdrop-blur-sm dark:bg-white/[0.02] transition-all shadow-sm",
                  !isExpanded && "hover:bg-white dark:hover:bg-white/[0.05] hover:border-border/40 hover:shadow-md transition-shadow"
                )
        )}
      >
        {/* Header Row */}
        <div className="p-3.5 max-sm:p-2.5 flex items-center gap-3 max-sm:gap-2">
          {isUnchanged ? (
            <div className="size-[1.15rem] rounded-[0.4rem] border border-border/30 bg-transparent shrink-0" />
          ) : (
            <CustomCheckbox
              checked={isSelected}
              indeterminate={isIndeterminate}
              onChange={(val) => toggleWidgetSelection(w.id, val)}
            />
          )}

          <div
            className={cn("flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer", !isCollection && "!cursor-default")}
            onClick={() => isCollection && !isUnchanged && toggleExpand(w.id)}
          >
            {/* Senior Design: Minimalist Expander Icon */}
            <div className={cn(
              "size-9 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0 border",
              isCollection 
                ? isSelected 
                  ? "bg-primary/10 border-primary/20 text-primary shadow-sm shadow-primary/5" 
                  : "bg-background/60 dark:bg-zinc-950/40 border-border/40 dark:border-white/5 text-muted-foreground/60 group-hover:border-primary/20 group-hover:bg-primary/5 group-hover:text-primary"
                : "bg-background/40 border-border/20 text-muted-foreground/30 dark:bg-white/5",
              isUnchanged && "opacity-20"
            )}>
              {isCollection ? (
                <div className={cn("transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1)", isExpanded && "rotate-90")}>
                  <ChevronRight className="size-4" />
                </div>
              ) : (
                <FileJson className="size-4" />
              )}
            </div>

            {/* Title & Badges */}
            <div className={cn("min-w-0 flex-1 transition-opacity", !isSelected && !isUnchanged && "opacity-75")}>
              <div className="flex items-center gap-1.5">
                <h3 className="text-[16px] font-black tracking-tight text-foreground truncate leading-tight">
                  {w.title}
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {/* Type indicator */}
                <div className={cn(
                  "h-5 px-1.5 rounded-md text-[9px] font-black uppercase tracking-[0.14em] flex items-center justify-center border transition-opacity leading-none",
                  isCollection 
                    ? "bg-sky-500/15 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400 border-sky-500/20 dark:border-sky-500/30" 
                    : "bg-teal-500/15 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400 border-teal-500/20 dark:border-teal-500/30",
                  !isSelected && !isUnchanged && "opacity-60"
                )}>
                  {isCollection ? 'Collection' : 'Classic Row'}
                </div>
                {!isUnchanged && <span className="text-muted-foreground/20 text-[10px] font-bold">·</span>}
                {isUnchanged ? (
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground/35">No changes</span>
                ) : (
                  <div className="flex items-center gap-1">
                    {(diff.status === 'new' || (hasNewItems && activeTab !== 'updates')) && (
                      <ChangeBadge type="new" disabled={!isSelected} />
                    )}
                    {hasMovedItems && activeTab !== 'new' && (
                      <ChangeBadge type="moved" disabled={!isSelected} />
                    )}
                    {hasActualUpdates && activeTab !== 'new' && (
                      <ChangeBadge type="updates" label="Updates" disabled={!isSelected} />
                    )}
                    {hasAmbiguousItems && activeTab !== 'updates' && (
                      <ChangeBadge type="ambiguous" disabled={!isSelected} />
                    )}
                  </div>
                )}
                
                {/* Field-level indicators (optional when collapsed) - Only show in All/Updates tabs */}
                {diff.status === 'existing' && activeTab !== 'new' && (
                  <div className="flex flex-wrap items-center gap-1 ml-1">
                    {diff.changes.has('name') && (
                      <ChangeBadge 
                        type="name" 
                        active={widgetFieldUpdates[w.id]?.name}
                        onClick={diff.changes.size > 1 ? () => {
                          setWidgetFieldUpdates(p => {
                            const current = p[w.id] || { name: false, catalogs: false, image: false };
                            const nextVal = !current.name;
                            const next = { ...p, [w.id]: { ...current, name: nextVal } };
                            if (nextVal) setWidgetSelected(s => ({ ...s, [w.id]: true }));
                            else if (!next[w.id].name && !next[w.id].catalogs && !next[w.id].image) setWidgetSelected(s => ({ ...s, [w.id]: false }));
                            return next;
                          });
                        } : undefined} 
                        disabled={!isSelected}
                      />
                    )}
                    {diff.changes.has('catalogs') && (
                      <ChangeBadge 
                        type="catalogs" 
                        active={widgetFieldUpdates[w.id]?.catalogs} 
                        onClick={diff.changes.size > 1 ? () => {
                          setWidgetFieldUpdates(p => {
                            const current = p[w.id] || { name: false, catalogs: false, image: false };
                            const nextVal = !current.catalogs;
                            const next = { ...p, [w.id]: { ...current, catalogs: nextVal } };
                            if (nextVal) setWidgetSelected(s => ({ ...s, [w.id]: true }));
                            else if (!next[w.id].name && !next[w.id].catalogs && !next[w.id].image) setWidgetSelected(s => ({ ...s, [w.id]: false }));
                            return next;
                          });
                        } : undefined} 
                        disabled={!isSelected}
                      />
                    )}
                    {diff.changes.has('image') && (
                      <ChangeBadge 
                        type="image" 
                        active={widgetFieldUpdates[w.id]?.image} 
                        onClick={diff.changes.size > 1 ? () => {
                          setWidgetFieldUpdates(p => {
                            const current = p[w.id] || { name: false, catalogs: false, image: false };
                            const nextVal = !current.image;
                            const next = { ...p, [w.id]: { ...current, image: nextVal } };
                            if (nextVal) setWidgetSelected(s => ({ ...s, [w.id]: true }));
                            else if (!next[w.id].name && !next[w.id].catalogs && !next[w.id].image) setWidgetSelected(s => ({ ...s, [w.id]: false }));
                            return next;
                          });
                        } : undefined} 
                        disabled={!isSelected}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Expanded Items (Collection only) */}
        {isExpanded && isCollection && w.type === 'collection.row' && !isUnchanged && (
          <div className="border-t border-zinc-200/60 dark:border-white/5 bg-zinc-100/30 dark:bg-zinc-900/30 flex max-sm:flex-col">
            <div className="w-8 shrink-0 flex justify-center border-r border-border/5 bg-transparent max-sm:hidden">
              <div className="w-px h-full bg-gradient-to-b from-transparent via-border/40 to-transparent" />
            </div>
            <div className="flex-1 px-4 max-sm:px-2 pb-4 pt-1 max-sm:pt-2 space-y-2 overflow-hidden">
              <div className="pt-2 pb-2 flex items-center gap-2.5 px-1">
                <ListTree className="size-3.5 text-muted-foreground/50 shrink-0" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/65">Items ({visibleCollectionItems.length})</h3>
              </div>
              <div className="space-y-2">
              {visibleCollectionItems.map((item) => {
                const itemDiff = diff.itemDiffs[item.id];
                if (!itemDiff || itemDiff.status === 'unchanged') return null;
                const itemKey = getImportItemSelectionKey(w.id, item.id);

                const isItemExpanded = expandedItems === item.id;
                const isItemSelected = itemSelected[itemKey];
                const hasImage = !!item.backgroundImageURL;
                // Indeterminate: item selected but not ALL available change fields are active
                const itemFieldCount = [itemDiff.changes.has('name'), itemDiff.changes.has('catalogs'), itemDiff.changes.has('image')].filter(Boolean).length;
                const activeFieldCount = itemFieldUpdates[itemKey] ? [
                  itemDiff.changes.has('name') && itemFieldUpdates[itemKey].name,
                  itemDiff.changes.has('catalogs') && itemFieldUpdates[itemKey].catalogs,
                  itemDiff.changes.has('image') && itemFieldUpdates[itemKey].image,
                ].filter(Boolean).length : 0;
                const isItemIndeterminate = isItemSelected && itemFieldCount > 1 && activeFieldCount > 0 && activeFieldCount < itemFieldCount;

                return (
                  <div 
                    key={item.id} 
                    className={cn(
                      "rounded-xl border transition-all duration-300 shadow-[0_1px_2px_rgba(0,0,0,0.02)]",
                      isItemSelected 
                        ? "bg-white dark:bg-white/[0.04] border-primary/20 shadow-md shadow-primary/5" 
                        : "bg-white/90 dark:bg-black/20 border-zinc-200/60 dark:border-white/5 hover:border-zinc-300/80 hover:shadow-sm hover:bg-white"
                    )}
                  >
                    {/* Item Header Row */}
                    <div 
                      onClick={() => setExpandedItems(prev => prev === item.id ? null : item.id)}
                      className="flex items-center gap-2.5 max-sm:gap-1.5 px-3 max-sm:px-2 py-3 max-sm:py-2.5 cursor-pointer group/row"
                    >
                      <CustomCheckbox
                        checked={isItemSelected}
                        indeterminate={isItemIndeterminate}
                        onChange={(val) => {
                          setItemSelected(prev => ({ ...prev, [itemKey]: val }));
                          if (val) {
                            setWidgetSelected(prev => ({ ...prev, [w.id]: true }));
                            // Auto-select ALL available change fields when item is checked
                            setItemFieldUpdates(prev => ({
                              ...prev,
                              [itemKey]: {
                                name: itemDiff?.changes.has('name') ?? false,
                                catalogs: itemDiff?.changes.has('catalogs') ?? false,
                                image: itemDiff?.changes.has('image') ?? false,
                              }
                            }));
                          } else {
                            // Bottom-up sync: check if any other items in this widget are still selected
                            setWidgetSelected(prev => {
                              const anyOtherItemsSelected = w.dataSource.payload.items.some(
                                i => i.id !== item.id && itemSelected[getImportItemSelectionKey(w.id, i.id)]
                              );
                              return { ...prev, [w.id]: anyOtherItemsSelected };
                            });
                          }
                        }}
                      />

                      {/* Item expand toggle */}
                      <div
                        className={cn(
                          "size-8 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 border",
                          isItemSelected
                            ? "bg-primary/10 border-primary/20 text-primary shadow-sm shadow-primary/5"
                            : "bg-background/60 dark:bg-zinc-950/40 border-border/40 dark:border-white/5 text-muted-foreground/60 group-hover/row:border-primary/20 group-hover/row:bg-primary/5 group-hover/row:text-primary"
                        )}
                      >
                        <ChevronRight className={cn("size-3.5 transition-transform duration-300", isItemExpanded && "rotate-90")} />
                      </div>

                      <p className={cn(
                        "text-[16px] font-bold truncate flex-1 leading-tight tracking-tight duration-200 transition-colors",
                        isItemSelected ? "text-foreground" : "text-foreground/75 group-hover/row:text-foreground"
                      )}>
                        {item.name}
                      </p>

                      <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                        {itemDiff.status === 'new' && (
                          <ChangeBadge type="new" disabled={!isItemSelected} />
                        )}
                        {itemDiff.status === 'ambiguous' && (
                          <ChangeBadge type="ambiguous" disabled={!isItemSelected} />
                        )}
                        {itemDiff.status === 'moved' && (
                          <ChangeBadge type="moved" disabled={!isItemSelected} />
                        )}
                        {itemDiff.status !== 'new' && itemDiff.status !== 'ambiguous' && (
                          <>
                            {itemDiff.changes.has('name') && (
                              <ChangeBadge 
                                type="name" 
                                active={isItemSelected && itemFieldUpdates[itemKey]?.name} 
                                onClick={() => {
                                  setItemFieldUpdates(p => {
                                    const current = p[itemKey] || { name: false, catalogs: false, image: false };
                                    const nextVal = !isItemSelected ? true : !current.name;
                                    // If activating on unselected item: reset all other fields so only this one is ON
                                    const nextFields = !isItemSelected
                                      ? { name: true, catalogs: false, image: false }
                                      : { ...current, name: nextVal };
                                    const next = { ...p, [itemKey]: nextFields };
                                    if (nextVal) {
                                      setItemSelected(s => ({ ...s, [itemKey]: true }));
                                      setWidgetSelected(s => ({ ...s, [w.id]: true }));
                                    } else if (!nextFields.name && !nextFields.catalogs && !nextFields.image) {
                                      setItemSelected(s => ({ ...s, [itemKey]: false }));
                                    }
                                    return next;
                                  });
                                }}
                              />
                            )}
                            {itemDiff.changes.has('catalogs') && (
                              <ChangeBadge 
                                type="catalogs" 
                                active={isItemSelected && itemFieldUpdates[itemKey]?.catalogs} 
                                onClick={() => {
                                  setItemFieldUpdates(p => {
                                    const current = p[itemKey] || { name: false, catalogs: false, image: false };
                                    const nextVal = !isItemSelected ? true : !current.catalogs;
                                    // If activating on unselected item: reset all other fields so only this one is ON
                                    const nextFields = !isItemSelected
                                      ? { name: false, catalogs: true, image: false }
                                      : { ...current, catalogs: nextVal };
                                    const next = { ...p, [itemKey]: nextFields };
                                    if (nextVal) {
                                      setItemSelected(s => ({ ...s, [itemKey]: true }));
                                      setWidgetSelected(s => ({ ...s, [w.id]: true }));
                                    } else if (!nextFields.name && !nextFields.catalogs && !nextFields.image) {
                                      setItemSelected(s => ({ ...s, [itemKey]: false }));
                                    }
                                    return next;
                                  });
                                }}
                              />
                            )}
                            {itemDiff.changes.has('image') && (
                              <ChangeBadge 
                                type="image" 
                                active={isItemSelected && itemFieldUpdates[itemKey]?.image} 
                                onClick={() => {
                                  setItemFieldUpdates(p => {
                                    const current = p[itemKey] || { name: false, catalogs: false, image: false };
                                    const nextVal = !isItemSelected ? true : !current.image;
                                    // If activating on unselected item: reset all other fields so only this one is ON
                                    const nextFields = !isItemSelected
                                      ? { name: false, catalogs: false, image: true }
                                      : { ...current, image: nextVal };
                                    const next = { ...p, [itemKey]: nextFields };
                                    if (nextVal) {
                                      setItemSelected(s => ({ ...s, [itemKey]: true }));
                                      setWidgetSelected(s => ({ ...s, [w.id]: true }));
                                    } else if (!nextFields.name && !nextFields.catalogs && !nextFields.image) {
                                      setItemSelected(s => ({ ...s, [itemKey]: false }));
                                    }
                                    return next;
                                  });
                                }}
                              />
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Item Expanded Details */}
                    {isItemExpanded && (
                      <div className="px-3 max-sm:px-2.5 pb-3 pt-1 border-t border-border/10 bg-muted/20">
                        <div className="flex gap-2.5 max-sm:flex-col">
                          {/* Catalogs */}
                          <div className="flex-1 min-w-0 space-y-1">
                            {item.dataSources.map((ds, i) => {
                              const catalogMatch = ds.sourceType === 'aiometadata'
                                ? findCatalog(manifestCatalogs, ds.payload.catalogId)
                                : null;
                              const catalogName = catalogMatch?.name ?? null;

                              return (
                                <div key={i} className="flex items-start gap-3 rounded-2xl bg-background/80 border border-border/40 px-3.5 py-3 [0_4px_12px_-4px_rgba(0,0,0,0.02)] group/catalog transition-all dark:bg-background/40 dark:border-border/10">
                                  <div className="size-6 rounded-lg bg-primary/5 flex items-center justify-center shrink-0 mt-0.5 border border-primary/10">
                                    <RefreshCw className="size-3 text-primary/60" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    {ds.sourceType === 'aiometadata' ? (
                                      <>
                                        <p className="text-[12px] font-bold text-foreground truncate leading-tight">
                                          {catalogName ?? ds.payload.catalogId}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-1.5 ">
                                          <span className="px-1.5 py-0.5 rounded-md bg-primary/[0.07] text-[9px] font-black tracking-widest uppercase text-primary/60 border border-primary/[0.08] dark:bg-primary/10 dark:text-primary/80 dark:border-primary/20 transition-colors">
                                            {ds.payload.catalogType}
                                          </span>
                                          {catalogName && (
                                            <span className="text-[10px] text-muted-foreground/50 truncate max-w-[140px] font-medium">
                                              {ds.payload.catalogId}
                                            </span>
                                          )}
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <p className="text-[12px] font-bold text-foreground truncate leading-tight">
                                          {ds.payload.listName || ds.payload.listSlug}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-1.5">
                                          <span className="px-1.5 py-0.5 rounded-md bg-amber-500/[0.07] text-[9px] font-black tracking-widest uppercase text-amber-600/70 border border-amber-500/[0.08] dark:bg-amber-500/10 dark:text-amber-600/80 dark:border-amber-500/10 transition-colors">
                                            trakt
                                          </span>
                                          <span className="text-[10px] text-muted-foreground/50 truncate max-w-[140px] font-medium">
                                            {ds.payload.listSlug}
                                          </span>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Image Thumbnail */}
                          {hasImage ? (
                            <div className="shrink-0 max-sm:mx-auto mt-2 max-sm:mt-4">
                              <ImageThumb src={item.backgroundImageURL} alt={item.name} layout={item.layout} className="rounded-xl" />
                            </div>
                          ) : (
                            <div className="shrink-0 size-20 max-sm:size-24 max-sm:mx-auto mt-2 max-sm:mt-4 rounded-xl border border-border/40 bg-zinc-50 flex items-center justify-center dark:bg-muted/20 dark:border-border/20 transition-colors">
                              <ImageIcon className="size-5 max-sm:size-6 text-muted-foreground/30" />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Section Header ──────────────────────────────────────────────────────────



  // ─── Render ──────────────────────────────────────────────────────────────────

  const Content = (
    <div className="overflow-y-auto w-full p-8 pt-10 max-sm:p-4 max-sm:pt-6">

          <DialogHeader className="space-y-6 items-start text-left shrink-0">
            <div className="size-14 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary  max-sm:size-12">
              <CloudUpload className="size-7 max-sm:size-6" />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-black tracking-tight max-sm:text-xl text-foreground">
                {step === 'review' ? 'Review Import' : 'Import from Template'}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground/60 text-[13px] font-medium leading-relaxed max-w-none">
                {step === 'review'
                  ? 'Changes detected in the import file are shown below. Select what you want to apply.'
                  : 'Bring widgets from different Fusion or Omni setups into your current configuration.'}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-6 max-sm:py-5 w-full min-w-0">

            {/* ── Input Step ── */}
            {step === 'input' && (
              <div className="flex flex-col gap-4 w-full">
                {/* Quick Load Buttons Container */}
                <div className={cn(
                  "flex justify-center gap-3 w-full mx-auto transition-all duration-500",
                  jsonInput.trim() ? "opacity-0 -mt-8 h-0 overflow-hidden pointer-events-none" : "opacity-100 mt-0 h-auto"
                )}>
                  {defaultTemplateUrl && (
                    <button
                      onClick={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        setIsFetchingTemplate(true);
                        fetch(defaultTemplateUrl)
                          .then(res => res.text())
                          .then(text => {
                             const fetchedName = `UME Template ${defaultTemplateVersion || ''}`.trim();
                             setJsonInput(text);
                             setFileName(fetchedName);
                             setError(null);
                             parseAndReview(text, fetchedName);
                          })
                          .catch(err => { console.error('Failed to load template:', err); setError('Failed to load UME template.'); })
                          .finally(() => setIsFetchingTemplate(false));
                      }}
                      disabled={isFetchingTemplate}
                      className={cn(editorActionButtonClass, "w-full px-4 py-2 flex-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 text-[10px] tracking-[0.15em] hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-500/20 flex items-center justify-center text-center")}
                    >
                      {isFetchingTemplate ? 'Loading...' : `LOAD UME TEMPLATE ${defaultTemplateVersion || ''}`.trim()}
                    </button>
                  )}
                  {lastImportedJson && (
                    <button
                      onClick={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        const loadName = lastImportedName || 'Previous Template';
                        setJsonInput(lastImportedJson);
                        setFileName(loadName);
                        setError(null);
                        parseAndReview(lastImportedJson, loadName);
                      }}
                      className={cn(editorActionButtonClass, "w-full px-4 py-2 flex-1 bg-primary/10 hover:bg-primary/20 text-primary text-[10px] tracking-[0.15em] hover:scale-[1.02] border border-primary/20 flex items-center justify-center text-center")}
                    >
                      LOAD PREVIOUS TEMPLATE
                    </button>
                  )}
                </div>

                <div
                  className={cn("relative group transition-all duration-300 w-full", isDragging && "scale-[1.01]")}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <Textarea
                    data-testid="merge-import-textarea"
                    value={jsonInput}
                    onChange={handleTextareaChange}
                    placeholder={isDragging ? "Drop your JSON file here!" : "Paste your Fusion widget export, a JSON URL, or drag & drop a file here..."}
                    className={cn(
                      "min-h-[240px] max-sm:min-h-[140px] pb-10 max-sm:pb-6 transition-all leading-relaxed placeholder:text-muted-foreground/40 placeholder:font-bold placeholder:font-sans resize-none overflow-hidden",
                      "font-mono text-base sm:text-sm bg-zinc-50/50 dark:bg-muted/10 border-2 border-dashed border-zinc-200 dark:border-border/60 rounded-3xl max-sm:rounded-2xl px-10 max-sm:px-6",
                    "hover:bg-zinc-50/50 dark:hover:bg-muted/15 hover:border-primary/30",
                    "focus:border-primary/40 focus:bg-white dark:focus:bg-muted/20 focus-visible:ring-primary/10 focus-visible:ring-offset-0 text-left",
                    !jsonInput.trim() ? "pt-40 max-sm:pt-24" : "pt-10 max-sm:pt-6",
                    isDragging && "border-primary bg-primary/5 ring-8 ring-primary/5  scale-[1.01]"
                  )}
                />
                
                {/* Initial Instruction Layer (Icon) */}
                <div className={cn(
                  "absolute top-12 max-sm:top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2.5 transition-all duration-500 pointer-events-none w-full",
                  jsonInput.trim() || isDragging ? "opacity-0 scale-90 -translate-y-4" : "opacity-100 scale-100"
                )}>

                  {/* Main Upload Icon */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="size-14 rounded-full bg-background border border-border/40  flex items-center justify-center text-muted-foreground hover:scale-110 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all duration-300 pointer-events-auto group/icon"
                  >
                    <UploadCloud className="size-5.5 relative z-10" />
                    <div className="absolute inset-0 rounded-full bg-primary/5 scale-0 group-hover/icon:scale-125 transition-transform duration-300" />
                  </button>
                </div>

                <div className="absolute bottom-6 right-6 pointer-events-none">
                  <div className="pointer-events-auto">
                    {jsonInput.trim() && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-10 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all border border-border/20 bg-background/50 backdrop-blur-md"
                        onClick={() => { setJsonInput(''); setError(null); }}
                      >
                        <Trash2 className="size-4.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileInput} />
              </div>
            </div>
          )}

          {/* ── Review Step ── */}
          {step === 'review' && (
            <div className="space-y-3 w-full min-w-0">

              {/* Selected File Header (Streamlined) */}
              <div className={cn(editorPanelClass, "px-5 py-3.5 bg-zinc-50/50 dark:bg-zinc-900/40 border-border/10 flex items-center justify-between group")}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm shadow-primary/5">
                    <FileUp className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-0.5">Selection Station</p>
                    <h2 className="text-[15px] font-bold text-foreground truncate tracking-tight">{fileName}</h2>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => { setStep('input'); }}
                  className="size-9 rounded-xl hover:bg-destructive/10 hover:text-destructive text-muted-foreground/30 transition-all"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              {/* Senior Design: Selection Station Frame */}
              <div className="flex flex-col min-w-0 bg-white/70 dark:bg-zinc-950/25 border border-zinc-200 dark:border-white/5 rounded-3xl backdrop-blur-xl shadow-sm relative">
                
                {/* Glass Header Stack: Tabs + Action Dock */}
                <div className="shrink-0 border-b border-zinc-200/60 dark:border-border/5 relative z-50 rounded-t-3xl">
                  
                  {/* High-Fidelity Segmented Control */}
                  <div className="p-2.5 border-b border-zinc-200/60 dark:border-border/5 bg-zinc-50/10 dark:bg-white/[0.02]">
                    <div className="flex bg-zinc-100/50 dark:bg-zinc-950/40 p-1 rounded-2xl relative border border-zinc-200/60 dark:border-white/5 shadow-inner shadow-black/[0.02]">
                      {[
                        { id: 'all', label: 'All', count: newWidgets.length + existingWidgets.length },
                        { id: 'new', label: 'New', count: newWidgets.length },
                        { id: 'updates', label: 'Updates', count: existingWidgets.length }
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id as 'all' | 'new' | 'updates')}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-2.5 h-9 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 relative",
                            activeTab === tab.id
                              ? "bg-white dark:bg-white/[0.1] shadow-md shadow-primary/5 text-primary border border-zinc-200/60 dark:border-white/10 z-10 scale-[1.02]"
                              : "text-foreground/50 hover:text-foreground hover:bg-white/40 dark:hover:bg-white/[0.06]"
                          )}
                        >
                          <span>{tab.label}</span>
                          <span className={cn(
                            "px-2 py-0.5 rounded-md text-[9px] font-black tracking-tight transition-all",
                            activeTab === tab.id ? "bg-primary/10 text-primary" : "bg-muted-foreground/10 text-muted-foreground/50"
                          )}>
                            {tab.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Integrated Action Dock */}
                  <div className="flex items-center justify-between px-5 max-sm:px-3 h-12 bg-white/30 dark:bg-black/10">
                    
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setAllSelections(activeTab === 'new' ? 'new' : activeTab === 'updates' ? 'updates-all' : 'all', activeTab !== 'all')}
                        data-testid="import-select-all"
                        className="h-7.5 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest text-foreground/65 border border-border/10 bg-white/95 dark:bg-white/[0.06] hover:bg-white dark:hover:bg-white/[0.12] hover:border-primary/20 hover:text-primary transition-all active:scale-95 shadow-sm dark:shadow-none"
                      >
                        All
                      </button>
                      
                      <button 
                        onClick={() => setAllSelections('none')}
                        className="h-7.5 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest text-foreground/65 border border-border/10 bg-white/95 dark:bg-white/[0.06] hover:bg-white dark:hover:bg-white/[0.12] hover:border-primary/20 hover:text-primary transition-all active:scale-95 shadow-sm dark:shadow-none"
                      >
                        None
                      </button>
                      
                      {activeTab === 'all' && (
                        <button 
                          onClick={() => setAllSelections('new')}
                          className="h-7.5 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest text-foreground/65 border border-border/10 bg-white/95 dark:bg-white/[0.06] hover:bg-white dark:hover:bg-white/[0.12] hover:border-primary/20 hover:text-primary transition-all active:scale-95 shadow-sm dark:shadow-none"
                        >
                          New
                        </button>
                      )}

                      {activeTab !== 'new' && (
                        <div className="relative" ref={updatesDropdownRef}>
                          <button 
                            disabled={existingWidgets.length === 0}
                            onClick={() => setUpdatesDropdownOpen(v => !v)}
                            className={cn(
                              "h-7.5 px-3 rounded-xl flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest border border-border/10 transition-all active:scale-95 shadow-sm dark:shadow-none",
                              updatesDropdownOpen 
                                ? "text-primary bg-white dark:bg-white/[0.1] border-primary/30" 
                                : "text-foreground/65 bg-white/95 dark:bg-white/[0.06] hover:bg-white dark:hover:bg-white/[0.12] hover:border-primary/20 hover:text-primary",
                              existingWidgets.length === 0 && "opacity-30 cursor-not-allowed"
                            )}
                          >
                            <span className="pointer-events-none">Updates</span>
                            <ChevronDown className={cn("size-2.5 transition-transform duration-200 pointer-events-none", updatesDropdownOpen && "rotate-180")} />
                          </button>
                          
                          {updatesDropdownOpen && (
                            <div className="absolute top-full left-0 mt-2 z-[100] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl shadow-2xl shadow-primary/10 overflow-hidden min-w-[240px] py-1.5 animate-in fade-in zoom-in-95 duration-200 backdrop-blur-xl">
                              {dropdownItems.map((item, i) =>
                                item === null ? (
                                  <div key={i} className="h-px bg-zinc-200/60 dark:bg-border/5 my-1.5 mx-2" />
                                ) : (
                                  <button
                                    key={item.mode}
                                    onClick={(e) => { 
                                      setAllSelections(item.mode); 
                                      if (item.mode.includes('all') || item.mode.includes('clear')) {
                                        setUpdatesDropdownOpen(false);
                                      } else {
                                        e.stopPropagation();
                                      }
                                    }}
                                    className={cn(
                                      "w-full px-4 py-2.5 text-[11px] font-bold tracking-wide transition-colors flex items-center group/item",
                                      item.mode === 'updates-all' 
                                        ? "text-primary/90 justify-center hover:bg-primary/5 hover:text-primary" 
                                        : item.mode === 'updates-clear'
                                          ? "text-muted-foreground/70 justify-center hover:bg-destructive/5 hover:text-destructive"
                                          : "text-foreground/80 justify-between hover:bg-zinc-50/40 dark:hover:bg-muted/60 hover:text-foreground"
                                    )}
                                  >
                                    {item.label}
                                    {!(item.mode === 'updates-all' || item.mode === 'updates-clear') && (
                                      <div className={cn(
                                        "size-[1.125rem] rounded-[5px] border flex items-center justify-center shrink-0 transition-all",
                                        item.isActive === 'all' || item.isActive === 'some' 
                                          ? "bg-primary border-primary text-primary-foreground scale-105" 
                                          : "bg-white dark:bg-transparent border-zinc-300 dark:border-border/40 group-hover/item:border-zinc-400 dark:group-hover/item:border-border/60"
                                      )}>
                                        {item.isActive === 'some' ? (
                                          <div className="w-2.5 h-[2px] rounded-full bg-current" />
                                        ) : item.isActive === 'all' ? (
                                          <Check className="size-3 stroke-[3.5px]" />
                                        ) : null}
                                      </div>
                                    )}
                                  </button>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Info Cluster */}
                    <div className="flex items-center">
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground h-5 flex items-center select-none">
                        <span className="text-primary">{selectedCount}</span>
                        <span className="text-[9.5px] font-black ml-2 mt-0.5 text-foreground/60 max-sm:hidden">SELECTED</span>
                      </div>
                    </div>
                  </div>
                </div>

                  {/* Frame Content: Widget Lists */}
                  <div className="p-4 w-full min-w-0 space-y-4 overflow-y-auto max-h-[430px] custom-scrollbar bg-zinc-50/20 dark:bg-zinc-950/10 rounded-b-3xl">
                  {(activeTab === 'all' || activeTab === 'new') && newWidgets.length > 0 && 
                    newWidgets.map(w => <WidgetRow key={w.id} w={w} />)}
                  {(activeTab === 'all' || activeTab === 'updates') && existingWidgets.length > 0 && 
                    existingWidgets.map(w => <WidgetRow key={w.id} w={w} />)}
                  
                  {/* Empty states - Refined typography */}
                  {activeTab === 'new' && newWidgets.length === 0 && (
                    <div className="py-20 flex flex-col items-center gap-4 bg-muted/5 rounded-xl border border-border/10">
                      <div className="size-16 rounded-full bg-muted/10 flex items-center justify-center text-muted-foreground/20">
                        <Sparkles className="size-8" />
                      </div>
                      <p className="text-[12px] font-black uppercase tracking-[0.2em] text-muted-foreground/25">No New Entries</p>
                    </div>
                  )}
                  {activeTab === 'updates' && existingWidgets.length === 0 && (
                    <div className="py-20 flex flex-col items-center gap-4 bg-muted/5 rounded-xl border border-border/10">
                      <div className="size-16 rounded-full bg-muted/10 flex items-center justify-center text-muted-foreground/20">
                        <RefreshCw className="size-8" />
                      </div>
                      <p className="text-[12px] font-black uppercase tracking-[0.2em] text-muted-foreground/25">No Updates Pending</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

            {/* ── Error ── */}
            {error && (
              <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/10 flex items-center gap-3 text-destructive animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="size-4 shrink-0" />
                <p className="text-xs font-bold">{error}</p>
              </div>
            )}

            {/* ── Success ── */}
            {step === 'success' && success && (
              <div className="p-6 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-border/10 flex flex-col gap-6 animate-in zoom-in-95 duration-300 w-full mb-2">
                <div className="flex items-center gap-4">
                  <div className="size-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-8" />
                  </div>
                  <div>
                    <h2 data-testid="success-import-message" className="text-xl font-black tracking-tight text-foreground">Import successful!</h2>
                    <p className="text-[13.5px] font-medium text-muted-foreground/70">Your configuration has been updated.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Widgets Card */}
                  <div className="bg-background/80 backdrop-blur-sm rounded-2xl p-5 border border-border/40  ring-1 ring-black/5 flex flex-col items-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 mb-5 border-b border-border/20 pb-2 w-full text-center">Widgets</p>
                    <div className="flex items-center justify-around w-full">
                      <div className="flex flex-col items-center gap-1.5">
                        <span data-testid="success-widgets-added" className="text-3xl text-foreground font-black tracking-tighter leading-none">{success.widgetsAdded}</span>
                        <div className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[8px] font-black uppercase tracking-wider">
                          New
                        </div>
                      </div>
                      <div className="w-px bg-border/20 h-8" />
                      <div className="flex flex-col items-center gap-1.5">
                        <span data-testid="success-widgets-updated" className="text-3xl text-foreground font-black tracking-tighter leading-none">{success.widgetsUpdated}</span>
                        <div className="px-1.5 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[8px] font-black uppercase tracking-wider">
                          Updated
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Items Card */}
                  <div className="bg-background/80 backdrop-blur-sm rounded-2xl p-5 border border-border/40  ring-1 ring-black/5 flex flex-col items-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 mb-5 border-b border-border/20 pb-2 w-full text-center">Items</p>
                    <div className="flex items-center justify-around w-full">
                      <div className="flex flex-col items-center gap-1.5">
                        <span data-testid="success-items-added" className="text-3xl text-foreground font-black tracking-tighter leading-none">{success.itemsAdded}</span>
                        <div className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[8px] font-black uppercase tracking-wider">
                          New
                        </div>
                      </div>
                      <div className="w-px bg-border/20 h-8" />
                      <div className="flex flex-col items-center gap-1.5">
                        <span data-testid="success-items-updated" className="text-3xl text-foreground font-black tracking-tighter leading-none">{success.itemsUpdated}</span>
                        <div className="px-1.5 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[8px] font-black uppercase tracking-wider">
                          Updated
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {success.importIssues.length > 0 && (
                  <div className="mt-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-left text-xs text-amber-700 dark:text-amber-300">
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <p className="font-black tracking-tight flex items-center gap-2 text-sm uppercase">
                        <AlertCircle className="size-4" />
                        Skipped Entries
                      </p>
                      <div className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-black">
                        {success.importIssues.length}
                      </div>
                    </div>
                    <div className="max-h-48 space-y-2 overflow-y-auto pr-2 custom-scrollbar text-[12.5px] leading-relaxed">
                      {success.importIssues.map((issue) => (
                        <div key={`${issue.label}-${issue.message}`} className="p-3.5 rounded-xl bg-background/50 border border-amber-500/10">
                          <p className="font-bold text-foreground inline-block mr-1">{issue.label}</p>
                          {issue.parentLabel && <span className="text-muted-foreground/60 text-[11px] font-bold uppercase tracking-wider">in {issue.parentLabel}</span>}
                          <p className="mt-1.5 text-muted-foreground/75 leading-relaxed">{issue.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-auto pt-4 shrink-0 transition-all border-t border-border/20 w-full flex flex-col gap-4">
            
            {/* Contextual Footer Settings */}
            {step === 'review' && selectedCount > 0 && (
              <div className="mb-4 max-sm:mb-2 w-full px-1 fade-in">
                <div className="grid gap-3">
                  <button 
                    onClick={() => setKeepExistingCatalogs(v => !v)}
                    data-testid="import-keep-catalogs-toggle"
                    className={cn(
                      "w-full flex items-center justify-between p-4 max-sm:p-2.5 rounded-3xl border transition-all duration-300 text-left cursor-pointer group",
                      (keepExistingCatalogs && catalogState !== 'none')
                        ? "border-primary/30 bg-white dark:bg-white/[0.05] ring-1 ring-primary/10 shadow-sm shadow-primary/5"
                        : "bg-white/95 backdrop-blur-sm dark:bg-white/[0.02] border-border/10 hover:bg-white dark:hover:bg-white/[0.05] hover:border-border/40 hover:shadow-md"
                    )}
                  >
                    <div className="flex flex-col gap-1 pr-6 max-sm:pr-2">
                      <span className="text-[17px] max-sm:text-[15px] font-black tracking-tight text-foreground transition-colors">
                        Do not overwrite existing catalogs
                      </span>
                      {!isMobile && (
                        <span className="text-[13.5px] max-sm:text-[12px] font-medium text-muted-foreground/70 leading-relaxed">
                          Prevent imported widgets from overwriting your configured catalogs.
                        </span>
                      )}
                    </div>
                    
                    <div className={cn(
                      "w-11 h-6 rounded-full relative transition-colors duration-400 shrink-0 ",
                      (keepExistingCatalogs && catalogState !== 'none') 
                        ? "bg-primary" 
                        : "bg-accent-foreground/15 group-hover:bg-accent-foreground/20"
                    )}>
                      <div className={cn(
                        "absolute top-[2px] left-[2px] size-5 bg-background rounded-full  transition-transform duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                        (keepExistingCatalogs && catalogState !== 'none') ? "translate-x-5" : "translate-x-0"
                      )} />
                    </div>
                  </button>
                </div>
              </div>
            )}

            <DialogFooter className="flex-col sm:flex-row gap-3 sm:gap-4 w-full">
              <DialogClose asChild>
                <Button 
                  variant="ghost" 
                  data-testid="import-dialog-close"
                  className={cn(editorActionButtonClass, editorFooterSecondaryButtonClass, "w-full sm:flex-1 tracking-[0.12em] text-[12px]")}
                >
                  {step === 'success' ? 'Close' : 'Cancel'}
                </Button>
              </DialogClose>
              
              {step === 'input' && jsonInput.trim() && (
                <Button
                  onClick={() => parseAndReview(jsonInput, fileName || 'Import Payload')}
                  className={cn(editorActionButtonClass, editorFooterPrimaryButtonClass, "w-full sm:flex-1 tracking-[0.12em] text-[12px] px-8")}
                >
                  <span className="flex items-center justify-center gap-2">
                    Review Configuration
                    <ArrowRight className="size-3.5" />
                  </span>
                </Button>
              )}

              {step === 'review' && (
                <Button
                  onClick={executeImport}
                  disabled={selectedCount === 0}
                  data-testid="merge-widgets-submit"
                  className={cn(editorActionButtonClass, editorFooterPrimaryButtonClass, "w-full sm:flex-1 tracking-[0.12em] text-[12px] px-8 disabled:opacity-50 disabled:cursor-not-allowed")}
                >
                  <span className="flex items-center justify-center gap-2">
                    Import
                    {selectedCount > 0 && (
                      <span className="bg-background/25 rounded-md px-1.5 py-0.5 text-[10px] font-black">
                        {selectedCount}
                      </span>
                    )}
                  </span>
                </Button>
              )}
            </DialogFooter>
          </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(val) => {
        onOpenChange(val);
        if (!val) resetState();
      }}>
        <DrawerContent className="bg-background border-border/40">
          <DrawerTitle className="sr-only">{step === 'review' ? 'Review Import' : 'Import from Template'}</DrawerTitle>
          {Content}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val);
      if (!val) {
        resetState();
      }
    }}>
      <DialogContent className={cn(
        "rounded-3xl border border-border/40 bg-background !shadow-none p-0 flex flex-col max-h-[90vh] transition-all",
        step === 'review' ? "sm:max-w-[660px] w-full" : "sm:max-w-[550px]"
      )}>
        <DialogTitle className="sr-only">{step === 'review' ? 'Review Import' : 'Import from Template'}</DialogTitle>
        {Content}
      </DialogContent>
    </Dialog>
  );
}
