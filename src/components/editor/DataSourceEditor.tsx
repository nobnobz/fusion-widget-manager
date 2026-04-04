"use client";

import { useConfig } from '@/context/ConfigContext';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Trash2, ChevronDown } from 'lucide-react';
import { resolveFusionCatalogType } from '@/lib/config-utils';
import { AIOMetadataDataSource } from '@/lib/types/widget';
import { CatalogCombobox } from './CatalogCombobox';
import { cn } from '@/lib/utils';
import { editorDeleteButtonClass } from './editorActionButtonStyles';

export function DataSourceEditor({ 
  dataSource, 
  onUpdate, 
  onDelete,
  disabledCatalogIds = []
}: { 
  dataSource: AIOMetadataDataSource,
  onUpdate: (updates: Partial<AIOMetadataDataSource['payload']>) => void,
  onDelete: () => void,
  disabledCatalogIds?: string[]
}) {
  const { manifestCatalogs } = useConfig();
  const selectedCatalog = manifestCatalogs.find(c => `${c.type}::${c.id}` === dataSource.payload.catalogId);
  const hasCatalogId = Boolean(dataSource.payload.catalogId.trim());
  const isSynced = !!selectedCatalog;
  const primaryName = selectedCatalog ? selectedCatalog.name : (dataSource.payload.catalogId || "Select catalog...");

  return (
    <div 
      className="flex items-center gap-1.5 w-full"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex-1 min-w-0">
        <div className="relative flex items-center min-w-0">
            {manifestCatalogs.length > 0 ? (
              <div className="flex-1 flex items-center min-w-0">
                <CatalogCombobox 
                  options={manifestCatalogs}
                  value={dataSource.payload.catalogId}
                  disabledValues={disabledCatalogIds}
                  onChange={(combinedId) => {
                      const selected = manifestCatalogs.find(c => `${c.type}::${c.id}` === combinedId);
                      if (selected) {
                        const newType = resolveFusionCatalogType(combinedId, selected.displayType || selected.type || dataSource.payload.catalogType);
                        onUpdate({ 
                          catalogId: combinedId,
                          catalogType: newType
                        });
                      } else {
                        const newType = resolveFusionCatalogType(combinedId, dataSource.payload.catalogType);
                        onUpdate({ 
                          catalogId: combinedId, 
                          catalogType: newType
                        });
                      }
                  }}
                  trigger={
                    <button
                      type="button"
                      className="flex-1 min-w-0 flex items-center justify-between gap-3 px-3.5 h-11 rounded-xl border border-zinc-200/80 bg-white/70 dark:border-white/10 dark:bg-zinc-900/40 hover:border-primary/30 hover:bg-primary/[0.03] dark:hover:bg-primary/[0.05] transition-all text-left outline-none group/source shadow-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {isSynced ? null : (
                          <AlertTriangle className="size-3 text-amber-500 shrink-0" />
                        )}
                        <div className="flex flex-col min-w-0 leading-tight justify-center">
                          <p className={cn(
                            "truncate text-[12px] font-bold tracking-tight transition-colors",
                            !isSynced && "py-0.5",
                            isSynced 
                              ? "text-foreground/90 group-hover/source:text-primary mb-0.5" 
                              : "text-amber-600/90 group-hover/source:text-amber-600"
                          )}>
                            {primaryName}
                          </p>
                          {isSynced && (
                            <p className="truncate text-[9.5px] font-medium text-muted-foreground/65">
                              {dataSource.payload.catalogId}
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronDown className="size-3 text-muted-foreground/30 group-hover/source:text-primary transition-colors shrink-0" />
                    </button>
                  }
                />
              </div>
            ) : (
              hasCatalogId ? (
                <div className="flex-1 min-w-0 rounded-xl border border-zinc-200 dark:border-border/10 bg-zinc-100 dark:bg-zinc-900/30 px-3 h-9 flex items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold tracking-tight text-foreground/85">
                      {dataSource.payload.catalogId}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center gap-2 px-3 h-9 rounded-xl bg-amber-500/5 border border-amber-500/10 text-[8px] font-bold text-amber-500/60 uppercase tracking-widest">
                  <AlertTriangle className="size-2.5 shrink-0" />
                  <span>Sync manifest first</span>
                </div>
              )
            )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className={cn(editorDeleteButtonClass)}
        onClick={onDelete}
        title="Delete data source"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
