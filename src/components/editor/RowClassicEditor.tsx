import { DataSourceEditor } from './DataSourceEditor';
import { useConfig } from '@/context/ConfigContext';
import { AIOMetadataDataSource, NativeTraktDataSource, RowClassicWidget } from '@/lib/types/widget';
import { Layers } from 'lucide-react';

import { isNativeTraktDataSource } from '@/lib/widget-domain';
import { TraktSourceCard } from './TraktSourceCard';
import { cn } from '@/lib/utils';
import { editorPanelClass } from './editorSurfaceStyles';

export function RowClassicEditor({ widget }: { widget: RowClassicWidget }) {
  const { updateWidgetMeta } = useConfig();
  const isNativeTrakt = isNativeTraktDataSource(widget.dataSource);
  const nativeTraktDataSource: NativeTraktDataSource | null = isNativeTrakt
    ? (widget.dataSource as NativeTraktDataSource)
    : null;
  const aiometadataDataSource: AIOMetadataDataSource | null = !isNativeTrakt
    ? (widget.dataSource as AIOMetadataDataSource)
    : null;

  const handleDataSourceUpdate = (updates: Partial<RowClassicWidget['dataSource']['payload']>) => {
    if (isNativeTraktDataSource(widget.dataSource)) {
      return;
    }

    updateWidgetMeta(widget.id, {
      dataSource: {
        ...widget.dataSource,
        payload: {
          ...widget.dataSource.payload,
          ...updates,
        }
      }
    });
  };

  return (
    <div className="space-y-6 max-sm:space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
      {/* Data Source Configuration */}
      <div className={cn(editorPanelClass, "flex flex-col gap-6 max-sm:gap-4 p-5 max-sm:p-3.5 bg-white dark:bg-black/10 max-sm:rounded-[1.15rem] dark:border-white/5")}>
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-2">
            <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 flex items-center gap-2">
              <Layers className="size-3.5" /> {isNativeTrakt ? 'Native Trakt Source' : 'Catalogs'}
            </h4>
          </div>
          
          <div className="space-y-1.5">
            {isNativeTrakt ? (
              <TraktSourceCard
                dataSource={nativeTraktDataSource!}
                helperText="Imported native Trakt source. It can be reordered, renamed, and deleted, but not newly added from the manager."
              />
            ) : (
              <DataSourceEditor 
                dataSource={aiometadataDataSource!}
                onUpdate={(updates) => handleDataSourceUpdate(updates)}
                onDelete={() => {}} // Classic row must have one DS
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
