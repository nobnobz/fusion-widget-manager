import { DataSourceEditor } from './DataSourceEditor';
import { useConfig } from '@/context/ConfigContext';
import { RowClassicWidget } from '@/lib/types/widget';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Layers } from 'lucide-react';

export function RowClassicEditor({ widget }: { widget: RowClassicWidget }) {
  const { updateWidgetMeta } = useConfig();

  const handleDataSourceUpdate = (updates: Partial<RowClassicWidget['dataSource']['payload']>) => {
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
    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="h-px bg-border w-full mb-2 opacity-50" />

      <div className="grid grid-cols-1 gap-6">
        {/* General Settings */}
        <Card className="bg-card border border-zinc-200/80 dark:border-border shadow-sm dark:shadow-none">
          <CardHeader className="bg-muted/30 border-b py-3 px-6">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">General Settings</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2.5">
              <Label htmlFor="title" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60 ml-0.5">Widget Title</Label>
              <Input 
                id="title" 
                value={widget.title} 
                onChange={(e) => updateWidgetMeta(widget.id, { title: e.target.value })} 
                className="bg-muted/20 dark:bg-muted/10 border-zinc-200 dark:border-border/40 focus:border-primary/50 transition-all flex-1 h-10 rounded-xl backdrop-blur-sm shadow-sm dark:shadow-none"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Source */}
      <div className="max-w-3xl">
        <Card className="bg-card border border-zinc-200/80 dark:border-border shadow-sm dark:shadow-none">
          <CardHeader className="bg-muted/30 border-b py-3 px-6">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">Addon Source Configuration</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/40 flex items-center gap-1.5 mb-2">
                <Layers className="size-3" /> Data Source
              </h4>
              <DataSourceEditor 
                dataSource={widget.dataSource}
                onUpdate={(updates) => handleDataSourceUpdate(updates)}
                onDelete={() => {}} // Classic row must have one DS
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
