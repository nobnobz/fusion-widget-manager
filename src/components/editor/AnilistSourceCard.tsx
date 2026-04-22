"use client";

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { NativeAnilistDataSource } from '@/lib/types/widget';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { editorDeleteButtonClass } from './editorActionButtonStyles';

interface AnilistSourceCardProps {
  dataSource: NativeAnilistDataSource;
  helperText?: string;
  compact?: boolean;
  onDelete?: () => void;
  deleteTitle?: string;
}

function formatCatalogType(value: string) {
  return value
    .trim()
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase()) || 'Current';
}

export function AnilistSourceCard({
  dataSource,
  helperText,
  compact = false,
  onDelete,
  deleteTitle = 'Delete native AniList catalog',
}: AnilistSourceCardProps) {
  return (
    <div className="relative rounded-xl border border-sky-200/50 bg-sky-50/60 p-3 pr-14 dark:border-sky-500/20 dark:bg-sky-500/[0.08]">
      <div className="flex flex-wrap items-start gap-2">
        <Badge className="bg-sky-600/10 text-sky-700 hover:bg-sky-600/15 dark:text-sky-300">
          Native AniList
        </Badge>
      </div>

      <dl className={`mt-3 grid gap-2 text-xs ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
        <div className="min-w-0">
          <dt className="font-bold uppercase tracking-wider text-muted-foreground/60">Catalog</dt>
          <dd className="mt-1 text-foreground/85 truncate">{formatCatalogType(dataSource.payload.catalogType)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="font-bold uppercase tracking-wider text-muted-foreground/60">Limit</dt>
          <dd className="mt-1 text-foreground/85">{dataSource.payload.limit}</dd>
        </div>
      </dl>

      {helperText ? (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">{helperText}</p>
      ) : null}

      {onDelete ? (
        <Button
          variant="ghost"
          size="icon"
          className={cn(editorDeleteButtonClass, "absolute right-3 top-3 size-8.5")}
          onClick={onDelete}
          title={deleteTitle}
        >
          <Trash2 className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
