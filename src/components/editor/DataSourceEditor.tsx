"use client";

import { useConfig } from '@/context/ConfigContext';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { resolveFusionCatalogType } from '@/lib/config-utils';
import { AIOMetadataDataSource } from '@/lib/types/widget';
import { CatalogCombobox } from './CatalogCombobox';

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
  const hasCatalogId = Boolean(dataSource.payload.catalogId.trim());

  return (
    <div className="flex items-center gap-2 max-sm:gap-2.5 p-1.5 max-sm:p-2 rounded-xl max-sm:rounded-[1rem] bg-muted/30 border border-border group/ds hover:border-primary/30 transition-all">
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
                />
              </div>
            ) : (
              hasCatalogId ? (
                <div className="flex-1 rounded-lg border border-border/50 bg-background/75 px-3 py-2 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-bold tracking-tight text-foreground/85">
                        {dataSource.payload.catalogId}
                      </p>
                      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/55">
                        Sync manifest to change this catalog
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center gap-2 px-3 h-8 rounded-lg bg-amber-500/5 border border-amber-500/10 text-[9px] font-bold text-amber-500/60 uppercase tracking-widest">
                  <AlertTriangle className="size-3 shrink-0" />
                  <span>Sync manifest first</span>
                </div>
              )
            )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="size-8 max-sm:size-9 rounded-lg max-sm:rounded-xl border border-border/40 bg-background/55 text-destructive/55 shadow-sm transition-all hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive dark:border-white/10 dark:bg-zinc-950/70 dark:text-destructive/75 dark:hover:border-destructive/20 dark:hover:bg-destructive/12"
        onClick={onDelete}
        title="Delete data source"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
