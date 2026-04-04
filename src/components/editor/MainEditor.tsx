"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useConfig } from '@/context/ConfigContext';
import { WidgetSelectionGrid } from './WidgetSelectionGrid';
import { ManifestModal } from './ManifestModal';
import { Button } from '@/components/ui/button';
import {
  FileJson2,
  Plus,
  RotateCcw,
  Download,
  Check,
  Copy,
  Github,
  Heart,
  ChevronDown,
  Book,
  ClipboardPaste,
  UploadCloud,
} from 'lucide-react';
import Image from 'next/image';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useTheme } from 'next-themes';
import { ManagerSwitcher } from '@/components/ui/ManagerSwitcher';
import { EditorMobileHeader } from './EditorMobileHeader';
import {
  editorActionButtonClass,
  editorFooterPrimaryButtonClass,
  editorFooterSecondaryButtonClass,
} from './editorSurfaceStyles';
import LogoImage from '@/../public/branding/clown_logo.png';
import { convertAiometadataImportToFusion, isAiometadataImportPayload } from '@/lib/aiometadata-import';
import { convertOmniToFusion } from '@/lib/omni-converter';
import { shouldPromptForAiometadataManifestSetup } from '@/lib/aiometadata-manifest-detection';

import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { NewWidgetDialog } from './NewWidgetDialog';
import { ImportMergeDialog } from './ImportMergeDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FusionSetupGuide } from './FusionSetupGuide';
import {
  fetchTemplateRepository,
  formatTemplateLabel,
  type RepositoryTemplate,
} from '@/lib/template-repository';
import { normalizeFusionConfigDetailed } from '@/lib/widget-domain';
import { copyTextToClipboard, downloadTextFile } from '@/lib/browser-transfer';
import { getErrorMessage } from '@/lib/error-utils';

type JsonRecord = Record<string, unknown>;

function isHttpUrlInput(value: string): boolean {
  if (!value || /\s/.test(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOmniSnapshotPayload(value: unknown): value is JsonRecord {
  return isJsonRecord(value) && 'includedKeys' in value && 'values' in value;
}

function isFusionWidgetsPayload(value: unknown): value is JsonRecord & { widgets: unknown[] } {
  return isJsonRecord(value) && value.exportType === 'fusionWidgets' && Array.isArray(value.widgets);
}

function parseJsonText(input: string): unknown {
  return JSON.parse(input) as unknown;
}

export function MainEditor() {
  const [showManifestModal, setShowManifestModal] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [expandedWidgetId, setExpandedWidgetId] = useState<string | null>(null);
  const [pastedJson, setPastedJson] = useState('');
  const [showNewWidgetDialog, setShowNewWidgetDialog] = useState(false);
  const [showHowToUse, setShowHowToUse] = useState(false);
  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    details?: ReactNode;
    variant: 'info' | 'danger';
    confirmText?: string;
    contentClassName?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    details: undefined,
    variant: 'info',
    confirmText: 'CONTINUE',
    contentClassName: undefined,
  });

  const [githubTemplates, setGithubTemplates] = useState<RepositoryTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [selectedTemplateUrl, setSelectedTemplateUrl] = useState<string>('');
  const [aiometadataTemplate, setAiometadataTemplate] = useState<RepositoryTemplate | null>(null);
  const [aiometadataCatalogsOnlyTemplate, setAiometadataCatalogsOnlyTemplate] = useState<RepositoryTemplate | null>(null);
  const [aiostreamsTemplate, setAiostreamsTemplate] = useState<RepositoryTemplate | null>(null);
  const [isTemplatePopoverOpen, setIsTemplatePopoverOpen] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [showAiometadataActions, setShowAiometadataActions] = useState(false);
  const [showAiostreamsActions, setShowAiostreamsActions] = useState(false);
  const [showImportMergeDialog, setShowImportMergeDialog] = useState(false);
  const [initialImportJson, setInitialImportJson] = useState<string | undefined>(undefined);
  const [initialImportFileName, setInitialImportFileName] = useState<string | undefined>(undefined);
  const [isImportFocused, setIsImportFocused] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const omniFileInputRef = useRef<HTMLInputElement>(null);

  const {
    importConfig,
    widgets,
    view,
    setView,
    clearConfig,
    manifestUrl
  } = useConfig();

  const buildImportIssueDetails = useCallback(
    (
      issues: Array<{ label: string; parentLabel?: string; message: string }>,
      importedWidgets: number
    ) => {
      const grouped = new Map<string, { label: string; parentLabel?: string; message: string }>();

      issues.forEach((issue) => {
        const key = `${issue.parentLabel || ''}::${issue.label}`;
        if (!grouped.has(key)) {
          grouped.set(key, issue);
        }
      });

      const entries = Array.from(grouped.values());

      return {
        message: `Imported ${importedWidgets} widget${importedWidgets === 1 ? '' : 's'}, but some entries could not be imported.`,
        details: (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                  Skipped Entries
                </p>
                <div className="rounded-full border border-amber-500/20 bg-background/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                  {entries.length}
                </div>
              </div>
              <div className="mt-3 max-h-[min(42vh,20rem)] space-y-2 overflow-y-auto pr-1">
                {entries.map((entry) => (
                  <div
                    key={`${entry.parentLabel || ''}-${entry.label}-${entry.message}`}
                    className="rounded-xl border border-border/50 bg-background/80 px-3 py-2.5 text-left "
                  >
                    <p className="text-sm font-bold tracking-tight text-foreground">
                      {entry.label}
                    </p>
                    {entry.parentLabel ? (
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/65">
                        In {entry.parentLabel}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
                      {entry.message}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ),
      };
    },
    []
  );

  const applyImportConfig = useCallback(
    (config: unknown) => {
      const result = importConfig(config);
      if (result.importIssues.length > 0) {
        const issueContent = buildImportIssueDetails(result.importIssues, result.importedWidgets);
        setAlertDialog({
          isOpen: true,
          title: 'Imported With Skips',
          message: issueContent.message,
          details: issueContent.details,
          variant: 'info',
          confirmText: 'CONTINUE',
          contentClassName: 'sm:max-w-[44rem]',
        });
      }
      return result;
    },
    [buildImportIssueDetails, importConfig]
  );

  const shouldOpenManifestModalForImportedConfig = useCallback((config: unknown) => {
    if (manifestUrl) return false;
    try {
      const normalizedInput = isAiometadataImportPayload(config)
        ? convertAiometadataImportToFusion(config)
        : config;
      const normalized = normalizeFusionConfigDetailed(normalizedInput, {
        sanitize: true,
        allowPartialImport: true,
      });
      return shouldPromptForAiometadataManifestSetup(normalized.config.widgets);
    } catch {
      return true;
    }
  }, [manifestUrl]);

  const importParsedPayload = useCallback(
    (payload: unknown, options?: { allowTextareaFallback?: boolean }) => {
      if (isOmniSnapshotPayload(payload)) {
        const fusionConfig = convertOmniToFusion(payload);
        applyImportConfig(fusionConfig);
        if (shouldOpenManifestModalForImportedConfig(fusionConfig)) {
          setShowManifestModal(true);
        }
        setAlertDialog({
          isOpen: true,
          title: 'Omni JSON detected',
          message: 'The Omni snapshot has been automatically converted and imported.',
          variant: 'info',
          confirmText: 'CONTINUE',
        });
        return true;
      }

      if (isFusionWidgetsPayload(payload)) {
        applyImportConfig(payload);
        if (shouldOpenManifestModalForImportedConfig(payload)) {
          setShowManifestModal(true);
        }
        return true;
      }

      if (isAiometadataImportPayload(payload)) {
        applyImportConfig(payload);
        if (shouldOpenManifestModalForImportedConfig(payload)) {
          setShowManifestModal(true);
        }
        setAlertDialog({
          isOpen: true,
          title: 'AIOMetadata JSON detected',
          message: 'The AIOMetadata payload has been automatically converted and imported.',
          variant: 'info',
          confirmText: 'CONTINUE',
        });
        return true;
      }

      if (options?.allowTextareaFallback) {
        return false;
      }

      applyImportConfig(payload);
      if (shouldOpenManifestModalForImportedConfig(payload)) {
        setShowManifestModal(true);
      }
      return true;
    },
    [applyImportConfig, shouldOpenManifestModalForImportedConfig]
  );

  // Fetch UME templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoadingTemplates(true);
      try {
        const repository = await fetchTemplateRepository();
        setGithubTemplates(repository.fusionTemplates);
        setAiometadataTemplate(repository.aiometadataTemplate ?? null);
        setAiometadataCatalogsOnlyTemplate(repository.aiometadataCatalogsOnlyTemplate ?? null);
        setAiostreamsTemplate(repository.aiostreamsTemplate ?? null);
        setSelectedTemplateUrl(repository.defaultFusionTemplate?.rawUrl ?? '');
      } catch (error) {
        console.error('Error fetching UME templates:', error);
      } finally {
        setIsLoadingTemplates(false);
      }
    };

    fetchTemplates();
  }, []);

  const handleLoadTemplate = async () => {
    if (!selectedTemplateUrl) return;

    setIsLoadingTemplates(true);
    try {
      const response = await fetch(selectedTemplateUrl);
      if (!response.ok) throw new Error('Failed to load template');
      const json = await response.json() as unknown;

      if (isFusionWidgetsPayload(json)) {
        if (widgets.length === 0) {
          applyImportConfig(json);
          if (shouldOpenManifestModalForImportedConfig(json)) {
            setShowManifestModal(true);
          }
        } else {
          setInitialImportJson(JSON.stringify(json, null, 2));
          setInitialImportFileName(selectedTemplate?.filename || 'UME Template');
          setShowImportMergeDialog(true);
        }
      } else {
        const fusionConfig = convertOmniToFusion(json);
        if (widgets.length === 0) {
          applyImportConfig(fusionConfig);
          if (shouldOpenManifestModalForImportedConfig(fusionConfig)) {
            setShowManifestModal(true);
          }
        } else {
          setInitialImportJson(JSON.stringify(fusionConfig, null, 2));
          setInitialImportFileName(selectedTemplate?.filename || 'UME Template');
          setShowImportMergeDialog(true);
        }
      }
    } catch (error) {
        setAlertDialog({
          isOpen: true,
          title: 'Loading Failed',
          message: getErrorMessage(error, 'Could not load the selected UME template.'),
          variant: 'danger'
        });
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setInitialImportJson(event.target?.result as string);
      setInitialImportFileName(file.name);
      setShowImportMergeDialog(true);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOmniImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = parseJsonText(event.target?.result as string);
        const fusionConfig = convertOmniToFusion(json);
        setInitialImportJson(JSON.stringify(fusionConfig, null, 2));
        setInitialImportFileName(`Converted: ${file.name}`);
        setShowImportMergeDialog(true);
      } catch (error) {
        setAlertDialog({
          isOpen: true,
          title: 'Conversion Failed',
          message: getErrorMessage(error, 'The Omni JSON could not be converted.'),
          variant: 'danger'
        });
      }
    };
    reader.readAsText(file);
    if (omniFileInputRef.current) omniFileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);

    const file = e.dataTransfer.files?.[0];
    if (file && (file.type === 'application/json' || file.name.endsWith('.json'))) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const imported = importParsedPayload(parseJsonText(content), { allowTextareaFallback: true });

          if (!imported) {
            setPastedJson(content);
          }
        } catch (error) {
          setAlertDialog({
            isOpen: true,
            title: 'Invalid File',
            message: getErrorMessage(error, 'The file does not contain valid JSON.'),
            variant: 'danger'
          });
        }
      };
      reader.readAsText(file);
    }
  };

  const handlePasteImport = async () => {
    const trimmedInput = pastedJson.trim();
    if (!trimmedInput) return;

    if (isHttpUrlInput(trimmedInput)) {
      try {
        const response = await fetch(trimmedInput);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json() as unknown;
        setInitialImportJson(JSON.stringify(json, null, 2));
        setInitialImportFileName('Imported from URL');
        setShowImportMergeDialog(true);
        setPastedJson('');
      } catch (error) {
        setAlertDialog({
          isOpen: true,
          title: 'URL Load Failed',
          message: getErrorMessage(error, 'Could not fetch JSON from the provided URL.'),
          variant: 'danger'
        });
      }
      return;
    }

    if (widgets.length === 0) {
      try {
        const parsed = parseJsonText(trimmedInput);
        applyImportConfig(parsed);
        setPastedJson('');
      } catch (error) {
        setAlertDialog({
          isOpen: true,
          title: 'Invalid JSON',
          message: getErrorMessage(error, 'The pasted content is not a valid JSON structure.'),
          variant: 'danger'
        });
      }
      return;
    }

    setInitialImportJson(trimmedInput);
    setInitialImportFileName('Pasted JSON Payload');
    setShowImportMergeDialog(true);
    setPastedJson('');
  };

  const downloadTemplateFile = async (template: RepositoryTemplate | null) => {
    if (!template?.rawUrl) return;

    try {
      const response = await fetch(template.rawUrl);
      if (!response.ok) throw new Error('Download failed');
      const json = await response.json() as unknown;

      downloadTextFile(
        JSON.stringify(json, null, 2),
        template.filename.endsWith('.json') ? template.filename : `${template.filename}.json`
      );
    } catch (error) {
      setAlertDialog({
        isOpen: true,
        title: 'Download Failed',
        message: getErrorMessage(error, 'The selected template could not be downloaded.'),
        variant: 'danger',
      });
    }
  };

  const handleDownloadMetadata = async () => {
    if (!aiometadataTemplate && !aiometadataCatalogsOnlyTemplate) return;
    setShowAiometadataActions(true);
  };

  const handleDownloadAiostreams = () => {
    if (!aiostreamsTemplate) return;
    setShowAiostreamsActions(true);
  };

  const handleCopyAiostreamsUrl = async () => {
    if (!aiostreamsTemplate?.rawUrl) return;

    try {
      await copyTextToClipboard(aiostreamsTemplate.rawUrl);
      setAlertDialog({
        isOpen: true,
        title: 'URL Copied',
        message: 'The template URL for the UME AIOStreams template has been copied to your clipboard.',
        variant: 'info',
        confirmText: 'CONTINUE'
      });
      setShowAiostreamsActions(false);
    } catch {
      setAlertDialog({
        isOpen: true,
        title: 'Clipboard Failed',
        message: 'The template URL could not be copied to your clipboard.',
        variant: 'danger',
        confirmText: 'CONTINUE'
      });
    }
  };

  const openSupportLink = () => {
    window.open('https://ko-fi.com/botbidraiser', '_blank', 'noopener,noreferrer');
  };

  const selectedTemplate = githubTemplates.find((template) => template.rawUrl === selectedTemplateUrl);

  const openManifestModal = useCallback(() => {
    setShowManifestModal(true);
  }, []);

  const openNewWidgetDialog = useCallback(() => {
    setShowNewWidgetDialog(true);
  }, []);

  const handleAddFirstWidget = () => {
    clearConfig();
    setShowNewWidgetDialog(true);
  };

  const onWidgetCreated = useCallback((id: string) => {
    setExpandedWidgetId(id);
    setShowManifestModal(true);
  }, []);

  // Render logic
  const renderContent = () => {
    if (view === 'welcome') {
      return (
        <div className="flex-1 flex flex-col items-center justify-center max-sm:justify-start px-4 py-6 sm:px-8 sm:py-8 md:px-12 md:py-10 max-sm:pb-[calc(env(safe-area-inset-bottom)+2rem)] animate-in fade-in duration-700 max-w-2xl md:max-w-[46rem] lg:max-w-[49rem] mx-auto w-full relative">
          <div className="absolute top-5 right-5 hidden sm:flex items-center gap-1 animate-in fade-in slide-in-from-right-4 duration-700 delay-300">
            <ManagerSwitcher currentManager="fusion" className="h-9 px-3 text-[13px]" />
            <div className="w-px h-4 bg-border/45 mx-0.5" />
            <Button
              data-testid="open-setup-guide"
              variant="ghost"
              size="icon"
              className="size-9 rounded-xl hover:bg-primary/10 hover:text-primary transition-all overflow-hidden"
              onClick={() => setShowHowToUse(true)}
              title="How To Use"
            >
              <Book className="size-4.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-xl hover:bg-red-500/10 hover:text-red-500 transition-all overflow-hidden"
              onClick={openSupportLink}
              title="Support Me"
            >
              <Heart className="size-4.5" />
            </Button>
            <div className="w-px h-4 bg-border/45 mx-0.5" />
            <ThemeToggle className="size-9 rounded-xl" />
            <Button variant="ghost" size="icon" className="size-9 rounded-xl hover:bg-zinc-500/10 hover:text-zinc-600 transition-all overflow-hidden dark:hover:text-zinc-300" onClick={() => setShowRestartConfirm(true)} title="Back to Start">
              <RotateCcw className="size-4" />
            </Button>
          </div>

          {/* Branding Section */}
          <div className="relative group mb-0 sm:-mb-4 max-sm:mt-4 text-center flex flex-col items-center">
            <div className="relative size-38 sm:size-52 flex items-center justify-center rounded-full overflow-hidden select-none">
              <Image
                src={LogoImage}
                alt="Clown Logo"
                width={208}
                height={208}
                className="w-full h-full object-contain"
                priority
              />
            </div>

            <h2 className="text-3xl sm:text-6xl font-black tracking-tighter mb-2 sm:mb-4 text-center max-sm:max-w-[12ch] leading-[0.95]">
              Fusion Widget <span className="text-primary">Manager</span>
            </h2>

            <p className="text-[12px] sm:text-sm max-w-sm text-center mb-6 sm:mb-10 text-muted-foreground/80 font-medium tracking-tight leading-relaxed">
              Manage your Fusion widgets through a powerful web interface.
            </p>
          </div>

          <div className="w-full space-y-4 sm:space-y-4 mb-6 sm:mb-10">
            <div className="flex flex-col items-start gap-1 w-full sm:w-auto sm:ml-auto">
              <div className="px-1 sm:px-0 text-[10px] sm:text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/58">
                Additional Resources
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:items-center sm:gap-1.5 w-full">
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(editorActionButtonClass, "col-span-1 h-10 sm:h-[2.2rem] border border-border/65 bg-background/65 hover:border-primary/35 hover:bg-primary/[0.04] text-[9px] px-2 sm:px-3 text-muted-foreground/68 hover:text-primary whitespace-nowrap shrink-0 justify-center")}
                  onClick={handleDownloadMetadata}
                  disabled={isLoadingTemplates || (!aiometadataTemplate && !aiometadataCatalogsOnlyTemplate)}
                >
                  {isLoadingTemplates ? <RotateCcw className="size-3 mr-1.5 animate-spin" /> : <Download className="size-3 mr-1.5" />}
                  {formatTemplateLabel('AIOMeta', aiometadataTemplate ?? undefined)}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(editorActionButtonClass, "col-span-1 h-10 sm:h-[2.2rem] border border-border/65 bg-background/65 hover:border-primary/35 hover:bg-primary/[0.04] text-[9px] px-2 sm:px-3 text-muted-foreground/68 hover:text-primary whitespace-nowrap shrink-0 justify-center")}
                  onClick={handleDownloadAiostreams}
                  disabled={isLoadingTemplates || !aiostreamsTemplate}
                >
                  {isLoadingTemplates ? <RotateCcw className="size-3 mr-1.5 animate-spin" /> : <Download className="size-3 mr-1.5" />}
                  {formatTemplateLabel('AIOStreams', aiostreamsTemplate ?? undefined)}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(editorActionButtonClass, "col-span-2 sm:col-span-1 h-10 sm:h-[2.2rem] border border-primary/20 bg-primary/5 hover:border-primary/40 hover:bg-primary/10 text-[10px] sm:text-[9px] px-3.5 sm:px-3 text-primary whitespace-nowrap shrink-0 justify-center")}
                  onClick={() => omniFileInputRef.current?.click()}
                >
                  <FileJson2 className="size-3.5 mr-2" />
                  Convert Omni Snapshot
                </Button>
              </div>
            </div>

            <div
              className={cn(
                "relative group transition-all duration-300 w-full",
                isDraggingFile && "scale-[1.02]"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Textarea
                data-testid="welcome-import-textarea"
                value={pastedJson}
                onChange={(e) => setPastedJson(e.target.value)}
                onFocus={() => setIsImportFocused(true)}
                onBlur={() => setIsImportFocused(false)}
                placeholder={isImportFocused ? "Paste JSON payload here..." : (isDraggingFile ? "Drop your JSON file here!" : "Paste your Fusion widget export, a JSON URL, or drag & drop a file here...")}
                className={cn(
                  "min-h-[200px] max-sm:min-h-[100px] pt-32 max-sm:pt-28 pb-10 max-sm:pb-5 font-mono text-base sm:text-xs",
                  "bg-white/40 dark:bg-white/[0.03] border-2 border-dashed border-zinc-200/80 dark:border-white/10 rounded-3xl max-sm:rounded-2xl px-10 max-sm:px-5 text-center focus:text-left focus-visible:ring-primary/20 transition-all leading-relaxed placeholder:text-center focus:placeholder:text-left placeholder:text-muted-foreground/60 placeholder:font-sans resize-none overflow-hidden backdrop-blur-sm",
                  "hover:bg-white/60 dark:hover:bg-white/[0.05] hover:border-primary/40",
                  isDraggingFile && "border-primary bg-primary/5 ring-8 ring-primary/5 scale-[1.01]"
                )}
              />
              <div className={cn(
                "absolute top-8 max-sm:top-5 left-1/2 -translate-x-1/2 flex flex-col items-center transition-all duration-700 delay-75",
                pastedJson.trim() ? "opacity-0 scale-75 -translate-y-4" : "opacity-100 scale-100"
              )}>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="size-14 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 flex items-center justify-center text-muted-foreground shadow-sm hover:scale-110 hover:text-primary hover:border-primary/40 transition-all duration-500 ease-out relative group/icon"
                >
                  <UploadCloud className="size-6 relative z-10" />
                  <div className="absolute inset-0 rounded-full bg-primary/5 scale-0 group-hover/icon:scale-125 transition-transform duration-500" />
                </button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
              <input type="file" ref={omniFileInputRef} onChange={handleOmniImport} className="hidden" accept=".json" />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:max-w-2xl sm:mx-auto items-stretch sm:items-center justify-center">
              {pastedJson.trim() ? (
                <Button
                  data-testid="welcome-load-configuration"
                  onClick={handlePasteImport}
                  size="lg"
                  className={cn(editorActionButtonClass, "h-11 sm:h-[3.05rem] w-full sm:min-w-[224px] text-[11px] sm:text-[10px] bg-primary/10 text-primary border border-primary/20 hover:bg-primary/18 hover:scale-[1.01] overflow-hidden group/load shadow-sm shadow-primary/5")}
                >
                  <ClipboardPaste className="size-4 sm:size-5 mr-3 shrink-0" />
                  Load Configuration
                </Button>
              ) : (
                <Button
                  data-testid="welcome-create-widget-button"
                  className={cn(editorActionButtonClass, "h-11 sm:h-[3.05rem] w-full sm:min-w-[224px] text-[11px] sm:text-[10px] bg-primary/10 text-primary border border-primary/20 hover:bg-primary/18 hover:scale-[1.01] shadow-sm shadow-primary/5 group/create overflow-hidden")}
                  onClick={handleAddFirstWidget}
                >
                  <Plus className="size-4 sm:size-5 mr-3 shrink-0" />
                  Create New
                </Button>
              )}
            </div>

            <div className="flex justify-center pt-2 w-full">
              {githubTemplates.length > 0 ? (
                <div className="w-full max-w-[38.5rem] rounded-3xl border border-zinc-200/80 dark:border-white/10 bg-white/40 dark:bg-zinc-950/20 px-3 py-3 sm:px-4 sm:py-4 backdrop-blur-sm space-y-2 sm:space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <a 
                      href="https://github.com/nobnobz/Omni-Template-Bot-Bid-Raiser" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex items-center gap-2 opacity-70 hover:opacity-100 hover:text-primary transition-all group/tpl"
                    >
                      <Github className="size-3.5 text-primary group-hover/tpl:scale-110 transition-transform" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground group-hover/tpl:text-primary">UME Templates</span>
                    </a>
                  </div>
                  <div className="flex gap-1.5 sm:gap-2 p-1.5 rounded-2xl sm:rounded-3xl border border-zinc-200/60 dark:border-white/5 bg-white/60 dark:bg-card/55 backdrop-blur-sm transition-all focus-within:border-primary/30 h-11 sm:h-[3.25rem] items-center">
                    <Popover open={isTemplatePopoverOpen} onOpenChange={setIsTemplatePopoverOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex-1 h-full min-w-0 bg-transparent border-none focus:outline-none text-[11px] sm:text-[12px] font-bold pl-3 pr-4 appearance-none cursor-pointer hover:bg-muted/10 rounded-2xl transition-all text-left flex items-center justify-between group/select">
                          <span className="truncate">
                            {selectedTemplate ? formatTemplateLabel('UME Fusion Template', selectedTemplate) : 'Select Template...'}
                          </span>
                          <ChevronDown className={cn("size-3.5 text-muted-foreground/50 group-hover/select:text-primary transition-all shrink-0", isTemplatePopoverOpen && "rotate-180")} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1 rounded-2xl border-border/40 bg-card/95 backdrop-blur-xl " align="start">
                        <div className="flex flex-col gap-0.5 max-h-[160px] overflow-y-auto pr-1">
                          {githubTemplates.map((template) => (
                            <button
                              key={template.rawUrl}
                              onClick={() => {
                                setSelectedTemplateUrl(template.rawUrl);
                                setIsTemplatePopoverOpen(false);
                              }}
                              className={cn(
                                "w-full px-4 py-3 rounded-2xl text-[12px] font-bold text-left transition-all flex items-center justify-between group active:scale-[0.98]",
                                selectedTemplateUrl === template.rawUrl 
                                  ? "bg-primary/10 text-primary" 
                                  : "hover:bg-muted text-foreground/80 hover:text-foreground"
                              )}
                            >
                              <span className="truncate">{formatTemplateLabel('UME Fusion Template', template)}</span>
                              {selectedTemplateUrl === template.rawUrl && <Check className="size-3.5 shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button
                      onClick={handleLoadTemplate}
                      disabled={isLoadingTemplates || !selectedTemplateUrl}
                      size="sm"
                      data-testid="welcome-load-template"
                      className={cn(editorActionButtonClass, "h-11 sm:h-full min-w-[90px] sm:min-w-[120px] px-4 sm:px-6 text-[11px] sm:text-[10px] bg-primary hover:bg-primary/90 shadow-md shadow-primary/10")}
                    >
                      {isLoadingTemplates ? <RotateCcw className="size-4 animate-spin" /> : <><Download className="size-4 mr-2" />Load</>}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" className="h-12 w-full max-w-sm rounded-2xl border border-dashed border-border/60 bg-muted/10" disabled={isLoadingTemplates}>
                  <Github className={cn("size-4 text-primary/80", isLoadingTemplates && "animate-pulse")} />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80 ml-2">
                    {isLoadingTemplates ? 'Fetching Templates...' : 'UME Templates - No templates available'}
                  </span>
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (view === 'selection' || view === 'editor') {
      return (
        <WidgetSelectionGrid
          expandedWidgetId={expandedWidgetId}
          onExpandedWidgetChange={setExpandedWidgetId}
          onNewWidget={openNewWidgetDialog}
          onSyncManifest={openManifestModal}
        />
      );
    }
    return null;
  };

  return (
    <div className="flex min-h-app-screen w-full bg-background overflow-x-hidden selection:bg-primary/20">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
      </div>

      <main className="flex-1 flex flex-col min-w-0 relative z-10">
        <EditorMobileHeader
          view={view}
          onShowHowToUse={() => setShowHowToUse(true)}
          onShowRestartConfirm={() => setShowRestartConfirm(true)}
          onOpenSupport={openSupportLink}
        />

        {view !== 'welcome' && (
          <header className="sticky top-0 z-50 hidden sm:block w-full px-4 sm:px-6 py-4">
            <div className="max-w-[1400px] mx-auto">
              <div className="flex items-center justify-between gap-4 h-20 px-4 lg:px-8 rounded-3xl bg-background/60 backdrop-blur-xl border border-border">
                <div className="flex min-w-0 items-center gap-3 lg:gap-6 group/logo">
                  <div className="size-14 lg:size-20 relative flex shrink-0 items-center justify-center overflow-hidden transition-all duration-500 group-hover/logo:scale-110 group-hover/logo:rotate-3">
                    <Image src={LogoImage} alt="Logo" fill className="object-contain" priority />
                  </div>
                  <div className="flex min-w-[9.5rem] shrink-0 flex-col -space-y-1">
                    <h1 className="whitespace-nowrap text-sm lg:text-base font-black tracking-tight leading-none">Fusion Widget</h1>
                    <span className="whitespace-nowrap text-[11px] lg:text-[12px] font-black tracking-[0.16em] lg:tracking-[0.2em] text-primary uppercase opacity-90">Manager</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 lg:gap-2">
                  <Button 
                    data-testid="open-setup-guide" 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                      editorActionButtonClass, 
                      "group h-10 px-4 rounded-full border border-primary/10 bg-primary/[0.04] text-[10px] text-primary/80 transition-all duration-300 hover:bg-primary/10 hover:border-primary/20 hover:text-primary hover:scale-[1.02] active:scale-[0.98] overflow-hidden"
                    )} 
                    onClick={() => setShowHowToUse(true)}
                  >
                    <Book className="size-3.5 mr-2 transition-colors group-hover:text-primary" />
                    How To Use
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                      editorActionButtonClass, 
                      "group h-10 px-4 rounded-full border border-red-500/10 bg-red-500/[0.04] text-[10px] text-red-500/80 transition-all duration-300 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-500 hover:scale-[1.02] active:scale-[0.98] overflow-hidden"
                    )} 
                    onClick={openSupportLink}
                  >
                    <Heart className="size-3.5 mr-2 fill-current transition-colors group-hover:text-red-500" />
                    Support Me
                  </Button>
                  <div className="w-[1px] h-4 bg-border mx-2" />
                  <ThemeToggle className="size-10 rounded-full" />
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="size-10 rounded-full border border-zinc-500/10 bg-zinc-500/[0.04] text-zinc-500/70 transition-all duration-300 hover:scale-110 active:scale-95 hover:bg-zinc-500/10 hover:border-zinc-500/20 hover:text-zinc-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300/80 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100" 
                    onClick={() => setShowRestartConfirm(true)}
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </header>
        )}

        <div className="flex-1">{renderContent()}</div>

        <footer className="w-full py-8 sm:py-12 pb-[calc(env(safe-area-inset-bottom)+2rem)] flex flex-col items-center gap-4 mt-auto">
          <a href="https://github.com/nobnobz/fusion-widget-manager" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50 hover:text-primary transition-all">
            <Github className="size-3.5 opacity-60 hover:opacity-100" />Project Repository
          </a>
          <div className="flex flex-col items-center gap-1 opacity-45">
            <div className="flex items-center gap-2 text-[9.5px] font-mono tracking-[0.2em] font-medium uppercase text-muted-foreground/80">
              <span>V0.5.2</span><span className="size-1 rounded-full bg-foreground/20" /><span>BY BOT-BID-RAISER</span>
            </div>
            <div className="text-[8.5px] font-mono tracking-[0.3em] uppercase opacity-75 text-foreground/80">BUILT WITH ANTIGRAVITY</div>
          </div>
        </footer>
      </main>

      {showManifestModal && (
        <ManifestModal isOpen={showManifestModal} onOpenChange={setShowManifestModal} />
      )}
      {showImportMergeDialog && (
        <ImportMergeDialog
          open={showImportMergeDialog}
          onOpenChange={(open) => { 
            setShowImportMergeDialog(open); 
            if (!open) { 
              setInitialImportJson(undefined); 
              setInitialImportFileName(undefined); 
            } 
          }}
          initialJson={initialImportJson}
          initialFileName={initialImportFileName}
        />
      )}
      {showNewWidgetDialog && (
        <NewWidgetDialog isOpen={showNewWidgetDialog} onOpenChange={setShowNewWidgetDialog} onCreated={(id) => onWidgetCreated(id)} />
      )}
      {showRestartConfirm && (
        <ConfirmationDialog
          isOpen={showRestartConfirm} onOpenChange={setShowRestartConfirm} title="Clear & Restart?" variant="danger" description="Are you sure you want to start over? All current widgets will be permanently cleared from temporary storage." confirmText="START OVER"
          onConfirm={() => { clearConfig(); setView('welcome'); }}
        />
      )}
      {alertDialog.isOpen && (
        <ConfirmationDialog
          isOpen={alertDialog.isOpen} onOpenChange={(open) => setAlertDialog(prev => ({ ...prev, isOpen: open }))} title={alertDialog.title} description={alertDialog.message} details={alertDialog.details} variant={alertDialog.variant} confirmText={alertDialog.confirmText || "CONTINUE"} contentClassName={alertDialog.contentClassName} onConfirm={() => { }}
        />
      )}

      {showAiometadataActions && (
        <Dialog open={showAiometadataActions} onOpenChange={setShowAiometadataActions}>
          <DialogContent className="sm:max-w-[460px] rounded-3xl border border-border/40 bg-card/95 p-0 backdrop-blur-2xl overflow-hidden max-sm:w-[calc(100vw-1.25rem)] max-sm:rounded-[2rem]">
            <DialogTitle className="sr-only">AIOMetadata Download</DialogTitle>
            <div className="p-8 pt-10 max-sm:px-5 max-sm:pt-6 text-left">
              <DialogHeader className="space-y-6 items-start">
                <div className="size-14 rounded-xl border border-primary/10 bg-primary/5 text-primary flex items-center justify-center max-sm:size-12">
                  <Download className="size-7 max-sm:size-6" />
                </div>
                <div className="space-y-1">
                  <DialogTitle className="text-2xl font-bold tracking-tight">AIOMetadata Download</DialogTitle>
                  <DialogDescription className="max-w-[34ch] text-xs font-medium leading-relaxed text-muted-foreground/60 max-sm:max-w-none">
                    Use Full Template for first setup, or Catalogs Only for updates.
                  </DialogDescription>
                </div>
              </DialogHeader>
              <div className="mt-8 grid gap-3 max-sm:mt-6">
                {[aiometadataTemplate, aiometadataCatalogsOnlyTemplate].map((t, i) => (
                  <Button
                    key={i} variant="outline" className="h-auto min-h-[5.25rem] w-full rounded-2xl border-border/50 bg-background/55 px-4 py-3 text-left transition-all hover:bg-primary/[0.04]"
                    onClick={async () => { await downloadTemplateFile(t); setShowAiometadataActions(false); }} disabled={!t}
                  >
                    <div className="flex w-full items-center gap-3">
                      <div className="flex min-w-0 flex-1 flex-col items-start font-bold uppercase tracking-[0.16em] text-[11px]">{i === 0 ? 'Full Template' : 'Catalogs Only'}<span className="pt-1 text-[10px] font-medium normal-case text-muted-foreground/58">{t?.filename ?? 'Not available'}</span></div>
                      <div className="size-11 shrink-0 items-center justify-center rounded-xl border border-primary/12 bg-primary/6 text-primary flex"><Download className="size-4.5" /></div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showAiostreamsActions && (
        <Dialog open={showAiostreamsActions} onOpenChange={setShowAiostreamsActions}>
          <DialogContent className="sm:max-w-[420px] rounded-3xl border border-border/40 bg-card/95 p-0 backdrop-blur-2xl overflow-hidden max-sm:w-[calc(100vw-1rem)]">
            <DialogTitle className="sr-only">AIOStreams Templates</DialogTitle>
            <div className="p-8 pt-10 max-sm:px-5 max-sm:pt-6 text-left">
              <DialogHeader className="space-y-6 items-start text-left">
                <div className="size-14 rounded-xl border border-primary/10 bg-primary/5 text-primary flex items-center justify-center max-sm:size-12"><Download className="size-7 max-sm:size-6" /></div>
                <div className="space-y-1">
                  <DialogTitle className="text-2xl font-bold tracking-tight">{formatTemplateLabel('AIOStreams Template', aiostreamsTemplate ?? undefined)}</DialogTitle>
                  <DialogDescription className="text-muted-foreground/60 text-xs font-medium">Choose to copy the URL or download the file directly.</DialogDescription>
                </div>
              </DialogHeader>
              <DialogFooter className="mt-6 flex-col gap-2.5">
                <Button variant="outline" className={cn(editorActionButtonClass, editorFooterSecondaryButtonClass)} onClick={handleCopyAiostreamsUrl} disabled={!aiostreamsTemplate?.rawUrl}><Copy className="size-4 mr-2" />Copy URL</Button>
                <Button className={cn(editorActionButtonClass, editorFooterPrimaryButtonClass)} onClick={async () => { await downloadTemplateFile(aiostreamsTemplate); setShowAiostreamsActions(false); }} disabled={!aiostreamsTemplate}><Download className="size-4 mr-2" />Download</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showHowToUse && (
        <FusionSetupGuide
          open={showHowToUse}
          onOpenChange={setShowHowToUse}
          aiometadataTemplate={aiometadataTemplate}
          isTemplateLoading={isLoadingTemplates}
          onDownloadAiometadataTemplate={() => downloadTemplateFile(aiometadataTemplate)}
        />
      )}
    </div>
  );
}
