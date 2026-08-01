'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { templateStatusConfig } from '@/lib/template-status';
import { humanizeMetaError } from '@/lib/whatsapp/meta-errors';
import type { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TemplateBuilder } from './template-builder';
import { cn } from '@/lib/utils';

type View =
  | { mode: 'list' }
  | { mode: 'create' }
  | { mode: 'edit'; template: MessageTemplate };

export function TemplateCatalog() {
  const t = useTranslations('Settings.templates');
  const { accountId, canEditSettings, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [view, setView] = useState<View>({ mode: 'list' });
  const [templateToDelete, setTemplateToDelete] =
    useState<MessageTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTemplates((data ?? []) as MessageTemplate[]);
    } catch (err) {
      console.error(err);
      toast.error(t('toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase, t]);

  useEffect(() => {
    if (authLoading) return;
    if (!accountId) {
      setLoading(false);
      return;
    }
    void fetchTemplates();
  }, [authLoading, accountId, fetchTemplates]);

  // Deep-link: /settings?tab=templates&new=1
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    if (!canEditSettings) return;
    setView({ mode: 'create' });
    const params = new URLSearchParams(searchParams.toString());
    params.delete('new');
    const qs = params.toString();
    router.replace(qs ? `/settings?${qs}` : '/settings?tab=templates', {
      scroll: false,
    });
  }, [searchParams, canEditSettings, router]);

  async function handleSyncFromMeta() {
    setSyncing(true);
    try {
      const res = await fetch('/api/whatsapp/templates/sync', {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          humanizeMetaError(data?.error) || t('toastSyncError'),
        );
      }
      const total = Number(data.total ?? 0);
      toast.success(
        t('toastSyncCount', { total }) +
          (data.inserted || data.updated
            ? t('toastSyncDetails', {
                inserted: data.inserted ?? 0,
                updated: data.updated ?? 0,
              })
            : ''),
      );
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        const preview = data.errors
          .slice(0, 3)
          .map(
            (e: { name: string; language: string }) =>
              `${e.name} (${e.language})`,
          )
          .join(', ');
        toast.error(t('toastSyncFailed', { preview }));
      }
      if (data.truncated) {
        toast.error(t('toastSyncTruncated'), { duration: 10000 });
      }
      await fetchTemplates();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('toastSyncError'),
      );
    } finally {
      setSyncing(false);
    }
  }

  async function confirmDelete() {
    const target = templateToDelete;
    if (!target || deletingId) return;
    setDeletingId(target.id);
    try {
      const res = await fetch(`/api/whatsapp/templates/${target.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          humanizeMetaError(data?.error) || t('toastDeleteError'),
        );
      }
      toast.success(
        data.message || t('toastDeleteSuccess'),
        data.meta_skipped ? { duration: 7000 } : undefined,
      );
      setTemplates((prev) => prev.filter((row) => row.id !== target.id));
      setTemplateToDelete(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('toastDeleteError'),
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (view.mode === 'create' || view.mode === 'edit') {
    return (
      <TemplateBuilder
        editing={view.mode === 'edit' ? view.template : null}
        onCancel={() => setView({ mode: 'list' })}
        onSaved={async () => {
          setView({ mode: 'list' });
          await fetchTemplates();
        }}
      />
    );
  }

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-heading text-xl font-semibold tracking-tight">
            {t('title')}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={syncing || !canEditSettings}
            title={t('syncTitle')}
            onClick={() => void handleSyncFromMeta()}
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {syncing ? t('syncing') : t('syncFromMeta')}
          </Button>
          <Button
            type="button"
            disabled={!canEditSettings}
            onClick={() => setView({ mode: 'create' })}
          >
            <Plus className="h-4 w-4" />
            {t('newTemplate')}
          </Button>
        </div>
      </div>

      {!canEditSettings ? (
        <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Viewing only — owners and admins can create or sync templates.
        </p>
      ) : null}

      {templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 px-6 py-14 text-center">
          <p className="text-sm font-medium">{t('noTemplates')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('createFirst')}
          </p>
          {canEditSettings ? (
            <Button
              className="mt-4"
              onClick={() => setView({ mode: 'create' })}
            >
              <Plus className="h-4 w-4" />
              {t('newTemplate')}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/80">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border/70 bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">
                  Language
                </th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">
                  Category
                </th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tmpl) => {
                const status = tmpl.status ?? 'DRAFT';
                const statusCfg =
                  templateStatusConfig[status] ?? templateStatusConfig.DRAFT;
                return (
                  <tr
                    key={tmpl.id}
                    className="border-b border-border/50 last:border-b-0"
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium">{tmpl.name}</div>
                      {(tmpl.rejection_reason || tmpl.submission_error) && (
                        <p className="mt-1 flex items-start gap-1 text-xs text-destructive">
                          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>
                            {tmpl.rejection_reason || tmpl.submission_error}
                          </span>
                        </p>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 align-top text-muted-foreground sm:table-cell">
                      {tmpl.language ?? '—'}
                    </td>
                    <td className="hidden px-4 py-3 align-top text-muted-foreground md:table-cell">
                      {tmpl.category}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge
                        variant="outline"
                        className={cn('border font-normal', statusCfg.classes)}
                      >
                        {statusCfg.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={!canEditSettings}
                          title={
                            status === 'APPROVED' || status === 'REJECTED'
                              ? t('resubmitTitle')
                              : t('editTitle')
                          }
                          aria-label={
                            status === 'APPROVED' || status === 'REJECTED'
                              ? t('resubmitLabel')
                              : t('editLabel')
                          }
                          onClick={() =>
                            setView({ mode: 'edit', template: tmpl })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={!canEditSettings}
                          title={
                            tmpl.meta_template_id
                              ? t('deleteMetaLocallyTitle')
                              : t('deleteLocallyTitle')
                          }
                          aria-label={
                            tmpl.meta_template_id
                              ? t('deleteMetaLocallyAria')
                              : t('deleteLocallyAria')
                          }
                          onClick={() => setTemplateToDelete(tmpl)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={!!templateToDelete}
        onOpenChange={(open) => {
          if (!open) setTemplateToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteDialogTitle')}</DialogTitle>
            <DialogDescription>
              {templateToDelete?.meta_template_id
                ? t('deleteMetaDesc', { name: templateToDelete.name })
                : t('deleteLocalDesc', {
                    name: templateToDelete?.name ?? '',
                  })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTemplateToDelete(null)}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={!!deletingId}
              onClick={() => void confirmDelete()}
            >
              {deletingId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {deletingId ? t('deleting') : t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
