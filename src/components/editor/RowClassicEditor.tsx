import { DataSourceEditor } from './DataSourceEditor';
import { useConfig } from '@/context/ConfigContext';
import { AIOMetadataDataSource, NativeTraktDataSource, RowClassicWidget } from '@/lib/types/widget';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Layers } from 'lucide-react';
import { isNativeTraktDataSource } from '@/lib/widget-domain';
import { TraktSourceCard } from './TraktSourceCard';

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
      <div className="grid grid-cols-1 gap-6 max-sm:gap-4">
      </div>

      {/* Data Source */}
      <div className="max-w-3xl max-sm:max-w-none">
        <Card className="bg-card border border-zinc-200/80 dark:border-border shadow-sm dark:shadow-none max-sm:rounded-[1.15rem]">
          <CardHeader className="bg-muted/30 border-b py-3 px-6 max-sm:px-4 max-sm:py-3">
            <CardTitle className="text-xs max-sm:text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
              {isNativeTrakt ? 'Native Trakt Source' : 'Addon Source Configuration'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 max-sm:p-4 space-y-4 max-sm:space-y-3">
            <div className="space-y-1.5">
              <h4 className="text-xs max-sm:text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40 flex items-center gap-1.5 mb-2">
                <Layers className="size-3" /> Data Source
              </h4>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
