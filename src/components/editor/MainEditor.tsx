/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useConfig } from '@/context/ConfigContext';
import { WidgetSelectionGrid } from './WidgetSelectionGrid';
import { ManifestModal } from './ManifestModal';
import { Button } from '@/components/ui/button';
import {
  FileJson2,
  Upload,
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
  Globe,
} from 'lucide-react';
import Image from 'next/image';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ManagerSwitcher } from '@/components/ui/ManagerSwitcher';
import LogoImage from '@/../public/branding/clown_logo.png';
import { convertOmniToFusion } from '@/lib/omni-converter';
import { shouldPromptForAiometadataManifestSetup } from '@/lib/aiometadata-manifest-detection';

import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import {

  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { NewWidgetDialog } from './NewWidgetDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  fetchTemplateRepository,
  formatTemplateLabel,
  type RepositoryTemplate,
} from '@/lib/template-repository';
import { normalizeFusionConfigDetailed } from '@/lib/widget-domain';

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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const omniFileInputRef = useRef<HTMLInputElement>(null);


  const {
    importConfig,
    view,
    setView,
    clearConfig
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
            <div className="rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4">
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
                    className="rounded-xl border border-border/50 bg-background/80 px-3 py-2.5 text-left shadow-[0_8px_18px_-16px_rgba(15,23,42,0.3)]"
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
    try {
      const normalized = normalizeFusionConfigDetailed(config, {
        sanitize: true,
        allowPartialImport: true,
      });
      return shouldPromptForAiometadataManifestSetup(normalized.config.widgets);
    } catch {
      return true;
    }
  }, []);

  const importParsedPayload = useCallback(
    (payload: any, options?: { allowTextareaFallback?: boolean }) => {
      if (payload?.includedKeys && payload?.values) {
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

      if (payload?.exportType === 'fusionWidgets' || Array.isArray(payload?.widgets)) {
        applyImportConfig(payload);
        if (shouldOpenManifestModalForImportedConfig(payload)) {
          setShowManifestModal(true);
        }
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
      const json = await response.json();

      if (json.exportType === 'fusionWidgets' || Array.isArray(json.widgets)) {
        applyImportConfig(json);
        if (shouldOpenManifestModalForImportedConfig(json)) {
          setShowManifestModal(true);
        }
      } else {
        // Fallback or handle Omni
        const fusionConfig = convertOmniToFusion(json);
        applyImportConfig(fusionConfig);
        if (shouldOpenManifestModalForImportedConfig(fusionConfig)) {
          setShowManifestModal(true);
        }
      }
    } catch {
        setAlertDialog({
          isOpen: true,
          title: 'Loading Failed',
        message: 'Could not load the selected UME template.',
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
      try {
        importParsedPayload(JSON.parse(event.target?.result as string));
      } catch (err: any) {
        setAlertDialog({
          isOpen: true,
          title: 'Import Failed',
          message: err.message || 'The JSON file is invalid or corrupted.',
          variant: 'danger'
        });
      }
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
        const json = JSON.parse(event.target?.result as string);
        const fusionConfig = convertOmniToFusion(json);
        importParsedPayload(fusionConfig);
      } catch {
        setAlertDialog({
          isOpen: true,
          title: 'Conversion Failed',
          message: 'The Omni JSON could not be converted.',
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
          const imported = importParsedPayload(JSON.parse(content), { allowTextareaFallback: true });

          if (!imported) {
            setPastedJson(content);
          }
        } catch {
          setAlertDialog({
            isOpen: true,
            title: 'Invalid File',
            message: 'The file does not contain valid JSON.',
            variant: 'danger'
          });
        }
      };
      reader.readAsText(file);
    }
  };


  const handlePasteImport = async () => {
    try {
      const trimmedInput = pastedJson.trim();
      if (!trimmedInput) return;

      if (isHttpUrlInput(trimmedInput)) {
        const response = await fetch(trimmedInput);
        if (!response.ok) {
          throw new Error(`The JSON URL returned HTTP ${response.status}.`);
        }
        importParsedPayload(await response.json());
        setPastedJson('');
        return;
      }

      importParsedPayload(JSON.parse(trimmedInput));
      setPastedJson('');
    } catch (err: any) {
      setAlertDialog({
        isOpen: true,
        title: 'Import Failed',
        message:
          err.message || 'The content is not valid JSON, the URL could not be loaded, or the file is missing required fields.',
        variant: 'danger'
      });
    }
  };


  const downloadTemplateFile = async (template: RepositoryTemplate | null) => {
    if (!template?.rawUrl) return;

    try {
      const response = await fetch(template.rawUrl);
      if (!response.ok) throw new Error('Download failed');
      const json = await response.json();
      
      // Force JSON download for iOS compatibility
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      link.download = template.filename.endsWith('.json') ? template.filename : `${template.filename}.json`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading template:', error);
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
      await navigator.clipboard.writeText(aiostreamsTemplate.rawUrl);
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

  const onWidgetCreated = useCallback(() => {
    setShowManifestModal(true);
  }, []);

  // Render logic
  const renderContent = () => {
    if (view === 'welcome') {
      return (
        <div className="flex-1 flex flex-col items-center justify-center max-sm:justify-start px-4 py-6 sm:px-8 sm:py-8 md:px-12 md:py-10 max-sm:pb-[calc(env(safe-area-inset-bottom)+2rem)] animate-in fade-in duration-700 max-w-2xl md:max-w-[46rem] lg:max-w-[49rem] mx-auto w-full relative">
          <div className="absolute top-5 right-5 hidden sm:flex items-center gap-1 animate-in fade-in slide-in-from-right-4 duration-700 delay-300">
            <ManagerSwitcher currentManager="fusion" className="h-9 rounded-[1.15rem] px-3 text-[13px] shadow-xs" />
            <div className="w-px h-4 bg-border/45 mx-0.5" />
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-[1.15rem] hover:bg-primary/10 hover:text-primary transition-all shadow-sm"
              onClick={() => setShowHowToUse(true)}
              title="How To Use"
            >
              <Book className="size-4.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-[1.15rem] hover:bg-red-500/10 hover:text-red-500 transition-all shadow-sm"
              onClick={() => window.open('https://ko-fi.com/botbidraiser', '_blank')}
              title="Support My Work"
            >
              <Heart className="size-4.5" />
            </Button>
            <div className="w-px h-4 bg-border/45 mx-0.5" />
            <ThemeToggle className="size-9 rounded-[1.15rem]" />
          </div>

          <div className="relative group mb-0 sm:-mb-4 max-sm:mt-2">
            <div className="absolute -inset-20 bg-primary/25 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none transform-gpu" />
            <div className="relative size-28 sm:size-52 flex items-center justify-center rounded-full overflow-hidden select-none">
              <Image
                src={LogoImage}
                alt="Clown Logo"
                width={208}
                height={208}
                className="w-full h-full object-contain animate-in zoom-in-110 duration-1000"
                priority
              />
            </div>
          </div>

          <h2 className="text-3xl sm:text-6xl font-black tracking-tighter mb-3 sm:mb-4 text-center max-sm:max-w-[12ch] leading-[0.95]">
            Fusion Widget <span className="text-primary">Manager</span>
          </h2>

          <p className="text-[13px] sm:text-sm max-w-sm text-center mb-6 sm:mb-10 text-muted-foreground font-medium tracking-tight leading-relaxed">
            Manage your Fusion widgets through a powerful web interface.
          </p>

          <div className="w-full space-y-4 sm:space-y-4 mb-6 sm:mb-10">
            <div className="flex justify-start sm:justify-end px-0 sm:px-2 mb-1 sm:mb-2">
              <div className="flex flex-col items-start gap-1 w-full sm:w-auto">
                <div className="px-1 sm:px-0 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/58">
                  Additional Resources
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-1.5 w-full sm:w-auto overflow-x-auto no-scrollbar scroll-smooth justify-start sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 sm:h-[2.2rem] rounded-[1rem] border border-border/65 bg-background/65 hover:border-primary/35 hover:bg-primary/[0.04] transition-all font-bold uppercase tracking-[0.14em] text-[9px] px-3.5 sm:px-3 text-muted-foreground/68 hover:text-primary whitespace-nowrap shrink-0 justify-center shadow-[0_10px_24px_-22px_rgba(15,23,42,0.28)]"
                  onClick={handleDownloadMetadata}
                  disabled={isLoadingTemplates || (!aiometadataTemplate && !aiometadataCatalogsOnlyTemplate)}
                >
                  {isLoadingTemplates ? (
                    <RotateCcw className="size-3 mr-2 animate-spin" />
                  ) : (
                    <Download className="size-3 mr-2" />
                  )}
                  {formatTemplateLabel('AIOMetadata', aiometadataTemplate ?? undefined)}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 sm:h-[2.2rem] rounded-[1rem] border border-border/65 bg-background/65 hover:border-primary/35 hover:bg-primary/[0.04] transition-all font-bold uppercase tracking-[0.14em] text-[9px] px-3.5 sm:px-3 text-muted-foreground/68 hover:text-primary whitespace-nowrap shrink-0 justify-center shadow-[0_10px_24px_-22px_rgba(15,23,42,0.28)]"
                  onClick={handleDownloadAiostreams}
                  disabled={isLoadingTemplates || !aiostreamsTemplate}
                >
                  {isLoadingTemplates ? (
                    <RotateCcw className="size-3 mr-2 animate-spin" />
                  ) : (
                    <Download className="size-3 mr-2" />
                  )}
                  {formatTemplateLabel('AIOSTREAMS', aiostreamsTemplate ?? undefined)}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 sm:h-[2.2rem] rounded-[1rem] border border-border/65 bg-background/65 hover:border-blue-500/35 hover:bg-blue-500/[0.04] transition-all font-bold uppercase tracking-[0.14em] text-[9px] px-3.5 sm:px-3 text-muted-foreground/68 hover:text-blue-500/80 whitespace-nowrap shrink-0 justify-center shadow-[0_10px_24px_-22px_rgba(15,23,42,0.28)]"
                  onClick={() => omniFileInputRef.current?.click()}
                >
                  <FileJson2 className="size-3 mr-2" />
                  Convert Omni Snapshot
                </Button>
                </div>
              </div>
            </div>

            <div
              className={cn(
                "relative group transition-all duration-300",
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
                placeholder={isDraggingFile ? "Drop your JSON file here!" : "Paste your Fusion widget export, a JSON URL, or drag & drop a file here..."}
                className={cn(
                  "min-h-[148px] max-sm:min-h-[136px] font-mono text-xs bg-muted/40 border-border/80 rounded-[2rem] max-sm:rounded-[1.5rem] p-5 max-sm:p-4 focus-visible:ring-primary/20 transition-all leading-relaxed shadow-inner",
                  isDraggingFile && "border-primary/50 bg-primary/5 ring-4 ring-primary/10 shadow-lg shadow-primary/5"
                )}
              />
              {isDraggingFile && (
                <div className="absolute inset-x-0 bottom-6 flex justify-center pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="bg-primary/95 text-primary-foreground px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-xl flex items-center gap-2">
                    <Download className="size-3" />
                    Drop to load
                  </div>
                </div>
              )}
            </div>

            {/* Primary Actions Below */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-3 w-full sm:max-w-[38rem] sm:mx-auto items-stretch sm:items-center justify-center">
              {pastedJson.trim() ? (
                <Button
                  data-testid="welcome-load-configuration"
                  onClick={handlePasteImport}
                  size="lg"
                  className="h-12 sm:h-[3.05rem] w-full sm:min-w-[224px] rounded-[1.25rem] sm:rounded-[1.3rem] shadow-lg shadow-primary/12 animate-in zoom-in-95 duration-300 font-bold uppercase tracking-[0.14em] text-[11px] sm:text-[10px] bg-primary hover:bg-primary/90 hover:scale-[1.01] active:scale-[0.98] transition-all relative overflow-hidden group/load"
                >
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
                  <ClipboardPaste className="size-5 mr-3 shrink-0" />
                  Load Configuration
                </Button>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full">
                    <Button
                      data-testid="welcome-import-file-button"
                      variant="outline"
                      className="flex-1 h-[3.2rem] sm:h-[3.05rem] rounded-[1.15rem] sm:rounded-[1.2rem] border-border/75 bg-background/62 backdrop-blur-sm hover:bg-muted/70 transition-all font-bold uppercase tracking-[0.14em] text-[10px] sm:text-[10px] px-5 sm:px-5.5 group/btn hover:scale-[1.01] active:scale-[0.98] shadow-[0_12px_26px_-24px_rgba(15,23,42,0.26)]"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="size-4 mr-3 text-muted-foreground/72 group-hover/btn:text-primary transition-colors shrink-0" />
                      Import Fusion JSON
                    </Button>
                    <Button
                      data-testid="welcome-create-widget-button"
                      className="flex-1 h-[3.2rem] sm:h-[3.05rem] rounded-[1.15rem] sm:rounded-[1.2rem] font-bold uppercase tracking-[0.14em] text-[10px] sm:text-[10px] px-5 sm:px-5.5 shadow-lg shadow-primary/12 group/create relative overflow-hidden bg-primary hover:bg-primary/90 hover:scale-[1.01] active:scale-[0.98] transition-all"
                      onClick={handleAddFirstWidget}
                    >
                      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
                      <div className="relative flex items-center">
                        <Plus className="size-4 mr-3 shrink-0" />
                        Create New
                      </div>
                    </Button>
                </div>
              )}
            </div>

            {/* Template Selection */}
            <div className="flex justify-center pt-0.5 sm:pt-1">
              {githubTemplates.length > 0 ? (
                <div className="w-full max-w-md sm:max-w-[38rem] rounded-[1.5rem] border border-border/45 bg-background/35 px-3 py-3 sm:px-3.5 sm:py-3.5 shadow-[0_16px_40px_-34px_rgba(15,23,42,0.24)] backdrop-blur-sm space-y-2 sm:space-y-2.5 animate-in fade-in slide-in-from-bottom-2 duration-500">
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
                  <div className="flex gap-1.5 sm:gap-2 p-1 rounded-[1.25rem] sm:rounded-[1.35rem] border border-border/60 bg-card/55 backdrop-blur-sm transition-all focus-within:border-primary/30 h-11 sm:h-[3.05rem] items-center">
                    <Popover open={isTemplatePopoverOpen} onOpenChange={setIsTemplatePopoverOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex-1 h-full min-w-0 bg-transparent border-none focus:outline-none text-[11px] sm:text-[12px] font-bold pl-3 pr-4 sm:pr-7 appearance-none cursor-pointer hover:bg-muted/10 rounded-xl transition-all text-left flex items-center justify-between group/select">
                          <span className="truncate">
                            {selectedTemplate ? formatTemplateLabel('UME Fusion Template', selectedTemplate) : 'Select Template...'}
                          </span>
                          <ChevronDown className={cn("size-3.5 text-muted-foreground/50 group-hover/select:text-primary transition-all shrink-0", isTemplatePopoverOpen && "rotate-180 text-primary")} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1 rounded-2xl border-border/40 bg-card/95 backdrop-blur-xl shadow-2xl" align="start">
                        <div className="flex flex-col gap-0.5 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/40 scrollbar-track-transparent">
                          {githubTemplates.map((template) => (
                            <button
                              key={template.rawUrl}
                              onClick={() => {
                                setSelectedTemplateUrl(template.rawUrl);
                                setIsTemplatePopoverOpen(false);
                              }}
                              className={cn(
                                "w-full px-4 py-3 rounded-xl text-[12px] font-bold text-left transition-all flex items-center justify-between group",
                                selectedTemplateUrl === template.rawUrl
                                  ? "bg-primary/10 text-primary"
                                  : "hover:bg-muted/50 text-muted-foreground/70 hover:text-foreground"
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
                      data-testid="welcome-load-template"
                      onClick={handleLoadTemplate}
                      disabled={isLoadingTemplates || !selectedTemplateUrl}
                      size="sm"
                      className="h-11 sm:h-[2.7rem] min-w-[118px] sm:min-w-[120px] px-4 sm:px-5 rounded-[1.05rem] sm:rounded-xl font-bold uppercase tracking-[0.14em] text-[10px] sm:text-[10px] shadow-sm shrink-0"
                    >
                      {isLoadingTemplates ? (
                        <RotateCcw className="size-3.5 animate-spin" />
                      ) : (
                        <>
                          <Download className="size-3.5 mr-1.5 sm:mr-2" />
                          Load
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  className="h-12 w-full max-w-sm rounded-2xl border border-dashed border-border/60 bg-muted/10 hover:bg-muted/20 hover:border-primary/40 transition-all flex items-center justify-center gap-2"
                  disabled={isLoadingTemplates}
                >
                  <Github className={cn("size-4 text-primary/80", isLoadingTemplates && "animate-pulse")} />
                  <div className="flex flex-col items-start gap-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80">
                      {isLoadingTemplates ? 'Fetching Templates...' : 'UME Templates'}
                    </span>
                    <span className="text-[8px] text-muted-foreground/60 font-medium leading-none">
                      {isLoadingTemplates ? 'Checking template sources...' : 'No templates available'}
                    </span>
                  </div>
                </Button>
              )}
            </div>
          </div>
          <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
          <input type="file" ref={omniFileInputRef} onChange={handleOmniImport} className="hidden" accept=".json" />


          {/* Footer removed from here to be placed at the very bottom of the page */}
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
      {/* Decorative background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] size-[500px] bg-primary/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] size-[500px] bg-indigo-500/5 rounded-full blur-[120px] animate-pulse delay-700" />
      </div>

      <main className="flex-1 flex flex-col min-w-0 relative z-10">
        <header className="sticky top-0 z-50 w-full px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-2 sm:hidden">
          <div className="rounded-[1.6rem] border border-border/60 bg-background/80 px-4 py-3 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            {view === 'welcome' ? (
              <div className="flex items-center justify-between gap-3">
                <ManagerSwitcher
                  currentManager="fusion"
                  className="h-9 min-w-0 rounded-2xl px-3 text-xs shadow-none"
                />

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg border border-border/50 bg-background/30 text-primary/80 hover:bg-primary/5 hover:text-primary"
                    onClick={() => setShowHowToUse(true)}
                    title="How To Use"
                  >
                    <Book className="size-3.5" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg border border-border/50 bg-background/30 text-red-500/75 hover:bg-red-500/5 hover:text-red-500"
                    onClick={() => window.open('https://ko-fi.com/botbidraiser', '_blank')}
                    title="Support My Work"
                  >
                    <Heart className="size-3.5 fill-current" />
                  </Button>

                  <ThemeToggle className="size-8 rounded-lg bg-background/30 dark:bg-black/20 border-border/50 shadow-none" />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <div className="relative size-11 shrink-0 overflow-hidden">
                    <Image src={LogoImage} alt="Logo" fill className="object-contain drop-shadow-sm" priority />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col -space-y-px">
                    <h1 className="truncate text-[12px] font-black leading-none tracking-[-0.03em]">Fusion Widget</h1>
                    <span className="truncate pt-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-primary/90 leading-none">
                      Manager
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg border border-border/50 bg-background/30 text-primary/80 hover:bg-primary/5 hover:text-primary"
                    onClick={() => setShowHowToUse(true)}
                    title="How To Use"
                  >
                    <Book className="size-3.5" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg border border-border/50 bg-background/30 text-red-500/75 hover:bg-red-500/5 hover:text-red-500"
                    onClick={() => window.open('https://ko-fi.com/botbidraiser', '_blank')}
                    title="Support My Work"
                  >
                    <Heart className="size-3.5 fill-current" />
                  </Button>

                  <ThemeToggle className="size-8 rounded-lg bg-background/30 dark:bg-black/20 border-border/50 shadow-none" />

                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg border border-border/50 bg-background/30 text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground"
                    onClick={() => setShowRestartConfirm(true)}
                    title="Start over"
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Modern Header - Omni Style */}
        {view !== 'welcome' && (
          <header className="sticky top-0 z-50 hidden sm:block w-full px-4 sm:px-6 py-4">
            <div className="max-w-[1400px] mx-auto">
              <div className="flex items-center justify-between gap-4 lg:gap-6 h-20 px-4 lg:px-8 rounded-3xl bg-background/60 backdrop-blur-xl border border-border shadow-md transition-all overflow-hidden">
                <div className="flex min-w-0 items-center gap-3 lg:gap-6 group/logo">
                  <div className="size-14 lg:size-20 relative flex shrink-0 items-center justify-center overflow-hidden transition-all duration-500 group-hover/logo:scale-110 group-hover/logo:rotate-3">
                    <Image src={LogoImage} alt="Logo" fill className="object-contain drop-shadow-sm" priority />
                  </div>
                  <div className="flex min-w-[9.5rem] shrink-0 flex-col -space-y-1">
                    <h1 className="whitespace-nowrap text-sm lg:text-base font-black tracking-tight leading-none">Fusion Widget</h1>
                    <span className="whitespace-nowrap text-[11px] lg:text-[12px] font-black tracking-[0.16em] lg:tracking-[0.2em] text-primary uppercase opacity-90">Manager</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-0.5 lg:gap-1">
                  <div className="hidden xl:block w-px h-4 bg-border/60 mx-1" />

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-auto px-3.5 rounded-xl border border-transparent bg-background/0 text-[10px] font-bold uppercase tracking-wider text-primary/70 transition-all hover:border-primary/10 hover:bg-primary/5 hover:text-primary shrink-0"
                    onClick={() => setShowHowToUse(true)}
                  >
                    <Book className="size-3.5 mr-2" />
                    <span>How To Use</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-auto px-3.5 rounded-xl border border-transparent bg-background/0 text-[10px] font-bold uppercase tracking-wider text-red-500/70 transition-all hover:border-red-500/10 hover:bg-red-500/5 hover:text-red-500 shrink-0"
                    onClick={() => window.open('https://ko-fi.com/botbidraiser', '_blank')}
                  >
                    <Heart className="size-3.5 mr-2 fill-current" />
                    <span>Support My Work</span>
                  </Button>

                  <div className="w-[1px] h-4 bg-border mx-1 lg:mx-2" />

                  <ThemeToggle className="size-8 lg:size-10 rounded-lg lg:rounded-2xl" />

                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg border border-transparent bg-background/0 text-muted-foreground/65 hover:border-border/40 hover:bg-background/30 hover:text-foreground transition-all shrink-0"
                    onClick={() => setShowRestartConfirm(true)}
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </header>
        )}

        <div className="flex-1">
          {renderContent()}
        </div>

        {/* Global Subtle Footer at the very bottom */}
        <footer className="w-full py-8 sm:py-12 pb-[calc(env(safe-area-inset-bottom)+2rem)] sm:pb-12 flex flex-col items-center gap-4 mt-auto">
          <a 
            href="https://github.com/nobnobz/fusion-widget-manager" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/30 hover:text-primary hover:opacity-100 transition-all group/link"
          >
            <Github className="size-3.5 opacity-40 group-hover/link:opacity-100 transition-opacity" />
            Project Repository
          </a>
          
          <div className="flex flex-col items-center gap-1 opacity-20 select-none hover:opacity-50 transition-opacity">
            <div className="flex items-center gap-2 text-[8px] font-mono tracking-[0.2em] font-medium uppercase text-muted-foreground/80">
              <span>V0.3.0</span>
              <span className="size-1 rounded-full bg-foreground/20" />
              <span>BY BOT-BID-RAISER</span>
            </div>
            <div className="text-[7px] font-mono tracking-[0.3em] uppercase opacity-60">
              BUILT WITH ANTIGRAVITY
            </div>
          </div>
        </footer>
      </main>


      <ManifestModal
        isOpen={showManifestModal}
        onOpenChange={setShowManifestModal}
      />
      <NewWidgetDialog
        isOpen={showNewWidgetDialog}
        onOpenChange={setShowNewWidgetDialog}
        onCreated={() => onWidgetCreated()}
      />

      <ConfirmationDialog
        isOpen={showRestartConfirm}
        onOpenChange={setShowRestartConfirm}
        title="Clear & Restart?"
        variant="danger"
        description="Are you sure you want to start over? All current widgets will be permanently cleared from temporary storage."
        confirmText="START OVER"
        onConfirm={() => {
          clearConfig();
          setView('welcome');
        }}
      />

      <ConfirmationDialog
        isOpen={alertDialog.isOpen}
        onOpenChange={(open) => setAlertDialog(prev => ({ ...prev, isOpen: open }))}
        title={alertDialog.title}
        description={alertDialog.message}
        details={alertDialog.details}
        variant={alertDialog.variant}
        confirmText={alertDialog.confirmText || "CONTINUE"}
        contentClassName={alertDialog.contentClassName}
        cancelText={undefined}
        onConfirm={() => { }}
      />

      <Dialog open={showAiometadataActions} onOpenChange={setShowAiometadataActions}>
        <DialogContent
          overlayClassName="z-[70]"
          className="z-[71] sm:max-w-[460px] rounded-[2.25rem] border border-border/40 bg-card/95 p-0 backdrop-blur-2xl shadow-2xl overflow-hidden max-sm:w-[calc(100vw-1.25rem)] max-sm:max-w-[calc(100vw-1.25rem)] max-sm:rounded-[2rem]"
        >
          <div className="p-8 pt-10 max-sm:px-4 max-sm:pb-4 max-sm:pt-4">
            <DialogHeader className="space-y-4 items-start pr-12 text-left max-sm:space-y-3">
              <div className="size-14 rounded-2xl border border-primary/10 bg-primary/5 text-primary shadow-sm flex items-center justify-center max-sm:size-11 max-sm:rounded-[1rem]">
                <Download className="size-7 max-sm:size-6" />
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-2xl font-bold tracking-tight max-sm:text-[1.75rem] max-sm:leading-none">
                  AIOMetadata Download
                </DialogTitle>
                <DialogDescription className="max-w-[34ch] text-xs font-medium leading-relaxed text-muted-foreground/60 max-sm:max-w-none max-sm:text-[11px]">
                  Use Full Template for your first AIOMetadata setup. Use Catalogs Only for later catalog updates, then paste that JSON into AIOMetadata under Catalogs and choose Import Setup.
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="mt-8 grid gap-3 max-sm:mt-6 max-sm:gap-2.5">
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-[5.25rem] w-full rounded-[1.5rem] border-border/50 bg-background/55 px-4 py-3 text-left shadow-[0_12px_30px_-24px_rgba(15,23,42,0.28)] transition-all hover:border-primary/35 hover:bg-primary/[0.04] hover:shadow-[0_18px_40px_-28px_rgba(37,99,235,0.28)] max-sm:min-h-[4.5rem] max-sm:rounded-[1.35rem] max-sm:px-3.5 max-sm:py-2.5"
                onClick={async () => {
                  await downloadTemplateFile(aiometadataTemplate);
                  setShowAiometadataActions(false);
                }}
                disabled={!aiometadataTemplate}
              >
                <div className="flex w-full items-center gap-3">
                  <div className="flex min-w-0 flex-1 flex-col items-start">
                    <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">
                      Full Template
                    </span>
                    <span className="pt-1 text-[10px] font-medium text-muted-foreground/58 normal-case">
                      {aiometadataTemplate?.filename ?? 'ume-aiometadata-config not available'}
                    </span>
                  </div>
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/12 bg-primary/6 text-primary max-sm:size-10 max-sm:rounded-[1rem]">
                    <Download className="size-4.5 max-sm:size-4" />
                  </div>
                </div>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-[5.25rem] w-full rounded-[1.5rem] border-border/50 bg-background/55 px-4 py-3 text-left shadow-[0_12px_30px_-24px_rgba(15,23,42,0.28)] transition-all hover:border-primary/35 hover:bg-primary/[0.04] hover:shadow-[0_18px_40px_-28px_rgba(37,99,235,0.28)] max-sm:min-h-[4.5rem] max-sm:rounded-[1.35rem] max-sm:px-3.5 max-sm:py-2.5"
                onClick={async () => {
                  await downloadTemplateFile(aiometadataCatalogsOnlyTemplate);
                  setShowAiometadataActions(false);
                }}
                disabled={!aiometadataCatalogsOnlyTemplate}
              >
                <div className="flex w-full items-center gap-3">
                  <div className="flex min-w-0 flex-1 flex-col items-start">
                    <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">
                      Catalogs Only
                    </span>
                    <span className="pt-1 text-[10px] font-medium text-muted-foreground/58 normal-case">
                      {aiometadataCatalogsOnlyTemplate?.filename ?? 'ume-aiometadata-catalogs-only not available'}
                    </span>
                  </div>
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/12 bg-primary/6 text-primary max-sm:size-10 max-sm:rounded-[1rem]">
                    <Download className="size-4.5 max-sm:size-4" />
                  </div>
                </div>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAiostreamsActions} onOpenChange={setShowAiostreamsActions}>
        <DialogContent
          overlayClassName="z-[70]"
          className="z-[71] sm:max-w-[420px] rounded-[2.25rem] border border-border/40 bg-card/95 p-0 backdrop-blur-2xl shadow-2xl overflow-hidden max-sm:w-[calc(100vw-1rem)] max-sm:max-w-[calc(100vw-1rem)] [&>button:last-child]:hidden"
        >
          <div className="p-8 pt-10 max-sm:p-5 max-sm:pt-6">
            <DialogHeader className="space-y-4 items-start text-left">
              <div className="size-14 rounded-2xl border border-primary/10 bg-primary/5 text-primary shadow-sm flex items-center justify-center max-sm:size-12 max-sm:rounded-[1rem]">
                <Download className="size-7 max-sm:size-6" />
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-2xl font-bold tracking-tight max-sm:text-xl">
                  {formatTemplateLabel('UME AIOStreams Template', aiostreamsTemplate ?? undefined)}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground/60 text-xs font-medium leading-relaxed max-sm:text-[11px]">
                  Choose whether you want to copy the template URL or download the JSON file directly.
                </DialogDescription>
              </div>
            </DialogHeader>

            <DialogFooter className="flex-col gap-3 mt-8">
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 rounded-xl font-bold uppercase tracking-wider text-xs border-border/40 bg-transparent hover:border-primary/30 hover:bg-primary/5"
                onClick={handleCopyAiostreamsUrl}
                disabled={!aiostreamsTemplate?.rawUrl}
              >
                <Copy className="size-4 mr-2" />
                Copy URL
              </Button>
              <Button
                type="button"
                className="w-full h-11 rounded-xl font-bold uppercase tracking-wider text-xs shadow-lg shadow-primary/20"
                onClick={async () => {
                  await downloadTemplateFile(aiostreamsTemplate);
                  setShowAiostreamsActions(false);
                }}
                disabled={!aiostreamsTemplate}
              >
                <Download className="size-4 mr-2" />
                Download
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* How To Use Dialog */}
      <Dialog open={showHowToUse} onOpenChange={setShowHowToUse}>
        <DialogContent className="max-w-2xl bg-white/95 dark:bg-black/90 backdrop-blur-2xl border-border/40 rounded-[2.5rem] p-0 shadow-2xl max-sm:w-[calc(100vw-1.25rem)] max-sm:max-w-[calc(100vw-1.25rem)] max-sm:rounded-[2rem]">
          <div className="max-h-[85vh] overflow-y-auto custom-scrollbar">
          <DialogHeader className="space-y-3 p-8 pb-4 max-sm:px-4 max-sm:pb-3 max-sm:pt-4">
            <div className="size-12 rounded-[1.15rem] bg-primary/5 border border-primary/10 flex items-center justify-center text-primary shadow-sm max-sm:size-10 max-sm:rounded-[0.95rem]">
              <Book className="size-6 max-sm:size-5" />
            </div>
            <div className="space-y-1.5">
              <DialogTitle className="text-[1.85rem] font-black tracking-tight text-foreground/96 max-sm:text-[1.7rem] max-sm:leading-none">
                How To Use
              </DialogTitle>
              <DialogDescription className="max-w-[520px] text-[13px] font-medium leading-relaxed text-muted-foreground/58 max-sm:max-w-none max-sm:text-[11px]">
                Step-by-step setup for Fusion Widget Manager.
              </DialogDescription>
            </div>
          </DialogHeader>
          
          <div className="px-8 pb-8 max-sm:px-4 max-sm:pb-4">
            <div className="mx-auto max-w-[680px] space-y-3.5 max-sm:space-y-3">
              <section className="rounded-[1.55rem] border border-border/45 bg-background/78 p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.22)] max-sm:rounded-[1.2rem] max-sm:px-4 max-sm:py-3.5">
                <div className="flex items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/12 bg-primary/10 text-[12px] font-black text-primary shadow-sm max-sm:size-8 max-sm:text-[11px]">
                    1
                  </div>
                  <div className="min-w-0 flex-1 space-y-3 max-sm:space-y-2.5">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary/70">Get started</p>
                      <h3 className="text-[1.1rem] font-bold tracking-tight max-sm:text-[1rem]">AIOMetadata Setup</h3>
                    </div>
                    <p className="text-[14px] font-medium leading-7 text-muted-foreground/78 max-sm:text-[13px] max-sm:leading-6">
                      First, download the template and upload it to your AIOMetadata instance. Then add the addon to Fusion.
                    </p>
                    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.1] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] max-sm:px-4 max-sm:py-3">
                      <p className="text-[12px] font-semibold leading-6 text-blue-500/90 max-sm:text-[11px]">
                        <strong>Note:</strong> Add your <span className="font-semibold">MDBList API key</span> in AIOMetadata so the catalogs show up in Fusion.
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      className="h-11 w-full justify-start rounded-[1.1rem] border-border/45 bg-background/72 px-3.5 text-[11px] font-semibold text-foreground/78 hover:text-primary hover:border-primary/30 hover:bg-primary/5 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.22)]"
                      onClick={handleDownloadMetadata}
                      disabled={!aiometadataTemplate}
                    >
                      <span className="mr-3 flex size-8 shrink-0 items-center justify-center rounded-xl border border-primary/12 bg-primary/6 text-primary">
                        <Download className="size-3.5" />
                      </span>
                      <span className="truncate text-left">
                        {formatTemplateLabel('Download AIOMetadata', aiometadataTemplate ?? undefined)}
                      </span>
                    </Button>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                      <Button 
                        variant="outline" 
                        className="h-11 rounded-[1.1rem] justify-start border-border/45 bg-background/72 px-3.5 text-[11px] font-semibold text-foreground/78 hover:text-primary hover:border-primary/30 hover:bg-primary/5 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.22)]"
                        onClick={() => window.open('https://aiometadatafortheweebs.midnightignite.me/configure/', '_blank')}
                      >
                        <span className="mr-3 flex size-8 shrink-0 items-center justify-center rounded-xl border border-primary/12 bg-primary/6 text-primary">
                          <Globe className="size-3.5" />
                        </span>
                        <span className="truncate text-left">AIOMetadata (Midnight)</span>
                      </Button>
                      <Button 
                        variant="outline" 
                        className="h-11 rounded-[1.1rem] justify-start border-border/45 bg-background/72 px-3.5 text-[11px] font-semibold text-foreground/78 hover:text-primary hover:border-primary/30 hover:bg-primary/5 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.22)]"
                        onClick={() => window.open('https://aiometadata.fortheweak.cloud/configure/', '_blank')}
                      >
                        <span className="mr-3 flex size-8 shrink-0 items-center justify-center rounded-xl border border-primary/12 bg-primary/6 text-primary">
                          <Globe className="size-3.5" />
                        </span>
                        <span className="truncate text-left">AIOMetadata (Yeb)</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.55rem] border border-border/45 bg-background/78 p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.22)] max-sm:rounded-[1.2rem] max-sm:px-4 max-sm:py-3.5">
                <div className="flex items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/12 bg-primary/10 text-[12px] font-black text-primary shadow-sm max-sm:size-8 max-sm:text-[11px]">
                    2
                  </div>
                  <div className="min-w-0 flex-1 space-y-3 max-sm:space-y-2.5">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary/70">Bring data in</p>
                      <h3 className="text-[1.1rem] font-bold tracking-tight max-sm:text-[1rem]">Import Configuration</h3>
                    </div>
                    <p className="text-[14px] font-medium leading-7 text-muted-foreground/78 max-sm:text-[13px] max-sm:leading-6">
                      Start by dragging in an Omni or Fusion snapshot, pasting existing Fusion JSON, selecting a <strong>UME Template</strong>, or starting from scratch.
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.55rem] border border-border/45 bg-background/78 p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.22)] max-sm:rounded-[1.2rem] max-sm:px-4 max-sm:py-3.5">
                <div className="flex items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/12 bg-primary/10 text-[12px] font-black text-primary shadow-sm max-sm:size-8 max-sm:text-[11px]">
                    3
                  </div>
                  <div className="min-w-0 flex-1 space-y-3 max-sm:space-y-2.5">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary/70">Connect catalogs</p>
                      <h3 className="text-[1.1rem] font-bold tracking-tight max-sm:text-[1rem]">Sync Catalogs</h3>
                    </div>
                    <p className="text-[14px] font-medium leading-7 text-muted-foreground/78 max-sm:text-[13px] max-sm:leading-6">
                      Paste your <strong>AIOMetadata Manifest URL</strong> when prompted. This ensures your catalogs are correctly mapped to your widgets.
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.55rem] border border-border/45 bg-background/78 p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.22)] max-sm:rounded-[1.2rem] max-sm:px-4 max-sm:py-3.5">
                <div className="flex items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/12 bg-primary/10 text-[12px] font-black text-primary shadow-sm max-sm:size-8 max-sm:text-[11px]">
                    4
                  </div>
                  <div className="min-w-0 flex-1 space-y-3 max-sm:space-y-2.5">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary/70">Finish up</p>
                      <h3 className="text-[1.1rem] font-bold tracking-tight max-sm:text-[1rem]">Personalize &amp; Export</h3>
                    </div>
                    <p className="text-[14px] font-medium leading-7 text-muted-foreground/78 max-sm:text-[13px] max-sm:leading-6">
                      Edit your widgets, then use <strong>Export</strong> and <strong>Copy the widget to your clipboard</strong>. You can paste the text of the .JSON in Fusion under <strong>Widgets → Import Widgets</strong> to import the new widgets.
                    </p>
                    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.1] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] max-sm:px-4 max-sm:py-3">
                      <p className="text-[12px] font-semibold leading-6 text-blue-500/90 max-sm:text-[11px]">
                        <strong>Note:</strong> You can also export configurations for Omni snapshots if needed.
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div className="flex justify-end border-t border-border/40 bg-muted/5 p-8 max-sm:px-4 max-sm:py-4">
            <Button 
              className="h-12 px-10 rounded-xl font-bold uppercase tracking-widest text-[11px] shadow-lg shadow-primary/20 max-sm:w-full max-sm:rounded-[1rem]"
              onClick={() => setShowHowToUse(false)}
            >
              Understood
            </Button>
          </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>

  );
}
