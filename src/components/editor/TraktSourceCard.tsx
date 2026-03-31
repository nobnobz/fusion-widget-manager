"use client";

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { NativeTraktDataSource } from '@/lib/types/widget';
import { getTraktValidationIssues } from '@/lib/catalog-validation';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface TraktSourceCardProps {
  dataSource: NativeTraktDataSource;
  helperText?: string;
  compact?: boolean;
  onDelete?: () => void;
  deleteTitle?: string;
}

function renderValue(value: number | string | null) {
  if (value === null || value === '') {
    return 'Missing';
  }
  return String(value);
}

export function TraktSourceCard({
  dataSource,
  helperText,
  compact = false,
  onDelete,
  deleteTitle = 'Delete native Trakt catalog',
}: TraktSourceCardProps) {
  const issues = getTraktValidationIssues(dataSource);

  return (
    <div className="relative rounded-xl border border-emerald-200/50 bg-emerald-50/60 p-3 pr-14  dark:border-emerald-500/20 dark:bg-emerald-500/[0.08]">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/15 dark:text-emerald-300">
            Native Trakt
          </Badge>
          {issues.length > 0 && (
            <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-300">
              <AlertTriangle className="size-3" />
              <span>{issues.length} warning{issues.length === 1 ? '' : 's'}</span>
            </div>
          )}
        </div>
      </div>

      <dl className={`mt-3 grid gap-2 text-xs ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
        <div>
          <dt className="font-bold uppercase tracking-wider text-muted-foreground/60">List Name</dt>
          <dd className="mt-1 text-foreground/85">{dataSource.payload.listName || 'Missing'}</dd>
        </div>
        <div>
          <dt className="font-bold uppercase tracking-wider text-muted-foreground/60">Trakt ID</dt>
          <dd className="mt-1 text-foreground/85">{renderValue(dataSource.payload.traktId)}</dd>
        </div>
      </dl>

      {helperText ? (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">{helperText}</p>
      ) : null}

      {issues.length > 0 ? (
        <ul className="mt-3 space-y-1 text-[11px] text-amber-700 dark:text-amber-300">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}

      {onDelete ? (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 size-8 max-sm:size-9 rounded-lg max-sm:rounded-xl border border-border/40 bg-background/55 text-destructive/55  transition-all hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive dark:border-white/10 dark:bg-zinc-950/70 dark:text-destructive/75 dark:hover:border-destructive/20 dark:hover:bg-destructive/12"
          onClick={onDelete}
          title={deleteTitle}
        >
          <Trash2 className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
