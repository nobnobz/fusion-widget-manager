/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { FusionWidgetsConfig, Widget } from '@/lib/types/widget';
import { processConfigWithManifest, processWidgetWithManifest, exportConfigToFusion, MANIFEST_PLACEHOLDER } from '@/lib/config-utils';
import { AIOMetadataCatalog } from '@/lib/types/widget';
import { convertFusionToOmni } from '@/lib/omni-converter';


interface ConfigContextType {
  widgets: Widget[];
  manifestUrl: string;
  setManifestUrl: (url: string) => void;
  replacePlaceholder: boolean;
  setReplacePlaceholder: (replace: boolean) => void;
  importConfig: (config: FusionWidgetsConfig) => void;
  mergeConfig: (config: FusionWidgetsConfig) => { added: number; skipped: number };
  exportConfig: () => FusionWidgetsConfig;
  addWidget: (widget: Widget) => void;
  updateWidget: (id: string, updates: Partial<Widget>) => void;
  deleteWidget: (id: string) => void;
  duplicateWidget: (id: string) => void;
  reorderWidgets: (startIndex: number, endIndex: number) => void;
  bulkUpdateManifest: (providedCatalogs?: AIOMetadataCatalog[], providedUrl?: string, providedReplace?: boolean) => void;
  clearConfig: () => void;
  isDragging: boolean;
  setIsDragging: (isDragging: boolean) => void;
  manifestCatalogs: AIOMetadataCatalog[];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  importManifest: (json: any) => AIOMetadataCatalog[];
  manifestContent: string;
  setManifestContent: (content: string) => void;
  fetchManifest: (url: string) => Promise<AIOMetadataCatalog[]>;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  exportOmniConfig: () => any;
  view: 'welcome' | 'selection' | 'editor';

  setView: (view: 'welcome' | 'selection' | 'editor') => void;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [manifestUrl, setManifestUrl] = useState<string>('');
  const [replacePlaceholder, setReplacePlaceholder] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState(false);
  const [manifestCatalogs, setManifestCatalogs] = useState<AIOMetadataCatalog[]>([]);
  const [manifestContent, setManifestContent] = useState<string>('');
  const [view, setView] = useState<'welcome' | 'selection' | 'editor'>('welcome');

  // Load state from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('fusion-widgets-config');
    if (saved) {
      try {
        const config = JSON.parse(saved);
        setWidgets(config.widgets);
        setManifestUrl(config.manifestUrl || '');
        setReplacePlaceholder(config.replacePlaceholder || false);
        if (config.widgets.length > 0) setView('selection');
      } catch (err) {
        console.error('Failed to parse config from storage:', err);
      }
    }
    
    const savedReplace = localStorage.getItem('fusion-widget-replace-placeholder');
    if (savedReplace) setReplacePlaceholder(savedReplace === 'true');

    const savedCatalogs = localStorage.getItem('fusion-widget-manifest-catalogs');
    if (savedCatalogs) {
      try {
        setManifestCatalogs(JSON.parse(savedCatalogs));
      } catch (err) {
        console.error('Failed to load catalogs from storage:', err);
      }
    }
    const savedContent = localStorage.getItem('fusion-widget-manifest-content');
    if (savedContent) setManifestContent(savedContent);
  }, []);

  // Save to local storage on change
  useEffect(() => {
    localStorage.setItem('fusion-widgets-config', JSON.stringify({
      widgets,
      manifestUrl,
      replacePlaceholder
    }));
  }, [widgets, manifestUrl, replacePlaceholder]);

  useEffect(() => {
    localStorage.setItem('fusion-widget-manifest-url', manifestUrl);
  }, [manifestUrl]);

  useEffect(() => {
    localStorage.setItem('fusion-widget-replace-placeholder', String(replacePlaceholder));
  }, [replacePlaceholder]);

  useEffect(() => {
    localStorage.setItem('fusion-widget-manifest-catalogs', JSON.stringify(manifestCatalogs));
  }, [manifestCatalogs]);

  useEffect(() => {
    localStorage.setItem('fusion-widget-manifest-content', manifestContent);
  }, [manifestContent]);

  const importConfig = useCallback(
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    (config: any) => {
    try {
      if (!config || typeof config !== 'object') {
        throw new Error('Import data is null or not an object.');
      }

      // Check for widgets array
      const rawWidgets = Array.isArray(config.widgets) ? config.widgets : [];
      if (rawWidgets.length === 0 && config.exportType === 'fusionWidgets') {
        // This might be a valid but empty export
      }

      // We store the "natural" version but processed for compatibility
      const processedWidgets = rawWidgets.map((w: any) => 
        processWidgetWithManifest(w, manifestUrl, replacePlaceholder, manifestCatalogs, true)
      );
      
      setWidgets(processedWidgets);
      if (processedWidgets.length > 0) {
        setView('selection');
      }
    } catch (err) {
      console.error('Failed to import config:', err);
      // Re-throw so the UI can handle it with an alert
      throw err;
    }
  }, [manifestUrl, manifestCatalogs, replacePlaceholder, setView]);

  const mergeConfig = useCallback((config: FusionWidgetsConfig) => {
    let added = 0;
    let skipped = 0;

    setWidgets((prev) => {
      const newWidgets = [...prev];
      
      (config.widgets || []).forEach((incomingRaw) => {
        const incoming = processWidgetWithManifest(incomingRaw, manifestUrl, replacePlaceholder, manifestCatalogs, true);
        
        // Check for duplicate by title and type
        const isDuplicate = prev.some(
          (existing) => 
            existing.title.toLowerCase() === incoming.title.toLowerCase() && 
            existing.type === incoming.type
        );

        if (isDuplicate) {
          skipped++;
        } else {
          // Add with new UUID just in case to avoid ID collisions
          newWidgets.push({
            ...incoming,
            id: crypto.randomUUID()
          });
          added++;
        }
      });

      return newWidgets;
    });

    return { added, skipped };
  }, [manifestUrl, manifestCatalogs, replacePlaceholder]);

  const exportConfig = useCallback((): FusionWidgetsConfig => {
    const config: FusionWidgetsConfig = {
      exportType: 'fusionWidgets',
      exportVersion: 1,
      widgets: widgets,
    };

    // 1. Initial normalization/sync
    const normalized = processConfigWithManifest(config, manifestUrl, replacePlaceholder, manifestCatalogs, true);
    
    // 2. Strict Fusion transformation
    return exportConfigToFusion(normalized, manifestUrl);
  }, [widgets, manifestUrl, replacePlaceholder, manifestCatalogs]);

  const exportOmniConfig = useCallback(
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    () => {
    const config = exportConfig();
    return convertFusionToOmni(config);
  }, [exportConfig]);

  const addWidget = useCallback((widget: Widget) => {

    setWidgets((prev) => [...prev, widget]);
  }, []);

  const updateWidget = useCallback((id: string, updates: Partial<Widget>) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? ({ ...w, ...updates } as Widget) : w))
    );
  }, []);

  const deleteWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const duplicateWidget = useCallback((id: string) => {
    setWidgets((prev) => {
      const index = prev.findIndex((w) => w.id === id);
      if (index === -1) return prev;
      const original = prev[index];
      const copy = {
        ...original,
        id: crypto.randomUUID(),
        title: `${original.title} (Copy)`,
      };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }, []);

  const reorderWidgets = useCallback((startIndex: number, endIndex: number) => {
    setWidgets((prev) => {
      const result = [...prev];
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return result;
    });
  }, []);

  const bulkUpdateManifest = useCallback((providedCatalogs?: AIOMetadataCatalog[], providedUrl?: string, providedReplace?: boolean) => {
    const catalogsToUse = providedCatalogs || manifestCatalogs;
    const urlToUse = providedUrl !== undefined ? providedUrl : manifestUrl;
    const replaceToUse = providedReplace !== undefined ? providedReplace : replacePlaceholder;

    if (catalogsToUse.length === 0) {
      throw new Error('No AIOMetadata manifest loaded. Please sync a manifest first.');
    }
    setWidgets((prev) => 
      prev.map(w => processWidgetWithManifest(w, urlToUse, replaceToUse, catalogsToUse, true))
    );
  }, [manifestCatalogs, manifestUrl, replacePlaceholder]);


  const fetchManifest = useCallback(async (url: string) => {
    if (!url) return [];
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
      const json = await resp.json();
      setManifestContent(JSON.stringify(json, null, 2));
      return importManifest(json);
    } catch (err) {
      console.error('Failed to fetch manifest:', err);
      throw err;
    }
  }, []);


  const importManifest = useCallback(
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    (data: any) => {
    let json = data;
    if (typeof data === 'string') {
      try {
        json = JSON.parse(data);
      } catch (e) {
        throw new Error('The manifest content is not valid JSON.');
      }
    }


    if (json && Array.isArray(json.catalogs)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const catalogs = json.catalogs.map((c: any) => ({
        id: c.id,
        name: c.name || c.id,
        type: c.type || 'movie',
        displayType: c.displayType || c.type || 'movie'
      }));
      setManifestCatalogs(catalogs);
      if (typeof data !== 'string') {
        setManifestContent(JSON.stringify(json, null, 2));
      }
      return catalogs;
    } else {
      throw new Error('Invalid AIOMetadata manifest. Could not find catalogs array.');
    }
  }, []);


  const clearConfig = useCallback(() => {
    setWidgets([]);
    // We preserve manifestUrl and manifestCatalogs for a better UX across loads
    setReplacePlaceholder(false);
    setManifestContent('');
    setView('welcome');
  }, []);


  return (
    <ConfigContext.Provider
      value={{
        widgets,
        manifestUrl,
        setManifestUrl,
        replacePlaceholder,
        setReplacePlaceholder,
        importConfig,
        mergeConfig,
        exportConfig,
        addWidget,
        updateWidget,
        deleteWidget,
        duplicateWidget,
        reorderWidgets,
        bulkUpdateManifest,
        clearConfig,
        isDragging,
        setIsDragging,
        manifestCatalogs,
        importManifest,
        manifestContent,
        setManifestContent,
        fetchManifest,
        exportOmniConfig,
        view,
        setView,
      }}

    >
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}
