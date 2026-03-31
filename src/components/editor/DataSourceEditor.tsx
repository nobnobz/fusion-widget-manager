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
    <div className="flex items-center gap-1.5 w-full">
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
                <div className="flex-1 min-w-0 rounded-xl border border-zinc-200 dark:border-white/5 bg-zinc-100/40 dark:bg-zinc-950/20 px-3.5 h-10 max-sm:h-11 flex items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold tracking-tight text-foreground/85">
                      {dataSource.payload.catalogId}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center gap-2 px-3.5 h-10 max-sm:h-11 rounded-xl bg-amber-500/5 border border-amber-500/10 text-[9px] font-bold text-amber-500/60 uppercase tracking-widest">
                  <AlertTriangle className="size-3 shrink-0" />
                  <span>Sync manifest first</span>
                </div>
              )
            )}
        </div>
      </div>

      <div className="flex items-center justify-center size-10 max-sm:size-11 shrink-0 rounded-xl bg-zinc-100/40 dark:bg-zinc-950/20 border border-zinc-200 dark:border-white/5">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 max-sm:size-9 rounded-xl text-destructive/55 transition-all hover:bg-destructive/8 hover:text-destructive hover:border-destructive/20 dark:text-destructive/75 dark:hover:bg-destructive/12"
          onClick={onDelete}
          title="Delete data source"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
