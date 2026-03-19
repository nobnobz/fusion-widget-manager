"use client";

import { useConfig } from '@/context/ConfigContext';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { resolveFusionCatalogType } from '@/lib/config-utils';
import { AddonCatalogDataSource } from '@/lib/types/widget';
import { CatalogCombobox } from './CatalogCombobox';

export function DataSourceEditor({ 
  dataSource, 
  onUpdate, 
  onDelete 
}: { 
  dataSource: AddonCatalogDataSource,
  onUpdate: (updates: Partial<AddonCatalogDataSource['payload']>) => void,
  onDelete: () => void
}) {
  const { manifestCatalogs } = useConfig();

  const availableCatalogsForType = manifestCatalogs.filter(c => 
    dataSource.payload.catalogType === 'all' || 
    c.type === dataSource.payload.catalogType || 
    c.displayType === dataSource.payload.catalogType ||
    !dataSource.payload.catalogType
  );

  return (
    <div className="flex items-center gap-2 max-sm:gap-2.5 p-1.5 max-sm:p-2 rounded-xl max-sm:rounded-[1rem] bg-muted/30 border border-border group/ds hover:border-primary/30 transition-all">
      <div className="flex-1 min-w-0">
        <div className="relative flex items-center min-w-0">
            {manifestCatalogs.length > 0 ? (
              <div className="flex-1 flex items-center min-w-0">
                <CatalogCombobox 
                  options={availableCatalogsForType}
                  value={dataSource.payload.catalogId}
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
              <div className="flex-1 flex items-center gap-2 px-3 h-8 rounded-lg bg-amber-500/5 border border-amber-500/10 text-[9px] font-bold text-amber-500/60 uppercase tracking-widest">
                <AlertTriangle className="size-3 shrink-0" />
                <span>Sync manifest first</span>
              </div>
            )}
        </div>
      </div>

      <Button variant="ghost" size="icon" className="size-8 max-sm:size-9 opacity-0 group-hover/ds:opacity-100 max-sm:opacity-100 transition-opacity rounded-lg max-sm:rounded-xl hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
