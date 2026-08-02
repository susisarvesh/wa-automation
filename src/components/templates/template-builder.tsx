'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { MessageTemplate, TemplateButton } from '@/types';
import {
  extractVariableIndices,
  TEMPLATE_LIMITS,
  validateTemplatePayload,
} from '@/lib/whatsapp/template-validators';
import {
  humanizeMetaError,
  isLikelyMetaSampleTemplateName,
} from '@/lib/whatsapp/meta-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { HeaderMediaField } from './header-media-field';
import { TemplatePhonePreview } from './template-phone-preview';
import { nextCloneTemplateName } from '@/lib/whatsapp/meta-sample-templates';
import {
  buildSubmitPayload,
  CATEGORIES,
  COMMON_LANGUAGE_CODES,
  emptyButton,
  formFromTemplate,
  HEADER_FORMATS,
  vsmartStarterTemplateForm,
  type HeaderFormat,
  type TemplateFormData,
} from './template-form';
import { cn } from '@/lib/utils';

function initialForm(editing: MessageTemplate | null): TemplateFormData {
  if (!editing) return { ...vsmartStarterTemplateForm };
  const form = formFromTemplate(editing);
  if (isLikelyMetaSampleTemplateName(editing.name)) {
    form.name = nextCloneTemplateName(editing.name, [editing.name]);
  }
  return form;
}

const selectClass = cn(
  'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm',
);

type ButtonPatch = {
  text?: string;
  url?: string;
  phone_number?: string;
  example?: string;
};

export function TemplateBuilder({
  editing,
  onCancel,
  onSaved,
}: {
  editing: MessageTemplate | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('Settings.templates');
  const [form, setForm] = useState<TemplateFormData>(() =>
    initialForm(editing),
  );
  const [submitting, setSubmitting] = useState(false);
  const isEdit = editing !== null;
  const isSample =
    isEdit &&
    !!editing &&
    isLikelyMetaSampleTemplateName(editing.name);
  // Meta locks name/language on real templates; samples are cloned to a new name.
  const nameLocked =
    isEdit && Boolean(editing?.meta_template_id) && !isSample;

  const bodyVarCount = useMemo(
    () => extractVariableIndices(form.body_text).length,
    [form.body_text],
  );

  useEffect(() => {
    setForm((prev) => {
      if (prev.body_samples.length === bodyVarCount) return prev;
      const next = prev.body_samples.slice(0, bodyVarCount);
      while (next.length < bodyVarCount) next.push('');
      return { ...prev, body_samples: next };
    });
  }, [bodyVarCount]);

  function updateButton(index: number, patch: ButtonPatch) {
    setForm((prev) => {
      const current = prev.buttons[index];
      if (!current) return prev;
      const next = [...prev.buttons];
      switch (current.type) {
        case 'QUICK_REPLY':
          next[index] = {
            ...current,
            ...(patch.text !== undefined && { text: patch.text }),
          };
          break;
        case 'URL':
          next[index] = {
            ...current,
            ...(patch.text !== undefined && { text: patch.text }),
            ...(patch.url !== undefined && { url: patch.url }),
            ...(patch.example !== undefined && { example: patch.example }),
          };
          break;
        case 'PHONE_NUMBER':
          next[index] = {
            ...current,
            ...(patch.text !== undefined && { text: patch.text }),
            ...(patch.phone_number !== undefined && {
              phone_number: patch.phone_number,
            }),
          };
          break;
        case 'COPY_CODE':
          next[index] = {
            ...current,
            ...(patch.text !== undefined && { text: patch.text }),
            ...(patch.example !== undefined && { example: patch.example }),
          };
          break;
      }
      return { ...prev, buttons: next };
    });
  }

  async function handleSubmit() {
    if (form.category === 'Authentication') return;
    try {
      const payload = buildSubmitPayload(form);
      validateTemplatePayload(payload);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toastSubmitFailed'));
      return;
    }

    setSubmitting(true);
    try {
      const url = isEdit
        ? `/api/whatsapp/templates/${editing!.id}`
        : '/api/whatsapp/templates/submit';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSubmitPayload(form)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          humanizeMetaError(data?.error) ||
            `${isEdit ? 'Edit' : 'Submit'} failed (HTTP ${res.status})`,
        );
      }
      if (data.cloned) {
        toast.success(
          data.message ||
            `Created your own template “${data.clone_name ?? 'copy'}” and submitted it for approval.`,
          { duration: 8000 },
        );
      } else {
        toast.success(
          data.dry_run
            ? isEdit
              ? t('toastSaveEditDry')
              : t('toastSaveNewDry')
            : isEdit
              ? t('toastSubmitEditSuccess')
              : t('toastSubmitNewSuccess'),
        );
      }
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('toastSubmitFailed'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const headerNeedsMedia =
    form.header_format !== 'none' && form.header_format !== 'text';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={onCancel}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to catalog
          </Button>
          <h2 className="font-heading text-xl font-semibold tracking-tight">
            {isEdit ? t('dialogEditTitle') : t('dialogNewTitle')}
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            {isSample
              ? 'This is a Meta sample template — it can’t be changed on Meta. Saving creates your own copy for approval.'
              : isEdit
                ? t('dialogEditDesc')
                : 'Prefilled with a Vsmart Technologies service-update style (from vsmarttec.com). Edit the copy, then submit to Meta for approval.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isEdit ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setForm({ ...vsmartStarterTemplateForm })}
            >
              Reset Vsmart starter
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={submitting || form.category === 'Authentication'}
            onClick={() => void handleSubmit()}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {isSample
              ? 'Save as new template'
              : isEdit
                ? t('saveResubmit')
                : t('submitApproval')}
          </Button>
        </div>
      </div>

      {isSample ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          Meta sample templates (like jaspers_* / hello_world) are read-only on
          Meta. Choose a new template name below, then save — we’ll submit your
          copy. Delete removes it from this app only.
        </div>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6 rounded-2xl border border-border/80 bg-card p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="tmpl-name">{t('templateName')}</Label>
              <Input
                id="tmpl-name"
                value={form.name}
                disabled={nameLocked}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                  }))
                }
                placeholder={t('namePlaceholder')}
              />
              <p className="text-xs text-muted-foreground">
                {nameLocked ? t('nameFixed') : t('nameHint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tmpl-category">{t('category')}</Label>
              <select
                id="tmpl-category"
                className={selectClass}
                value={form.category}
                disabled={nameLocked}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    category: e.target.value as TemplateFormData['category'],
                  }))
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tmpl-lang">{t('language')}</Label>
              <Input
                id="tmpl-lang"
                list="tmpl-lang-list"
                value={form.language}
                disabled={nameLocked}
                onChange={(e) =>
                  setForm((f) => ({ ...f, language: e.target.value }))
                }
              />
              <datalist id="tmpl-lang-list">
                {COMMON_LANGUAGE_CODES.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                {nameLocked
                  ? t('langFixed')
                  : 'Must match the exact code on Meta — en_US and en are distinct.'}
              </p>
            </div>
          </div>

          <div className="space-y-3 border-t border-border/60 pt-5">
            <Label>{t('header')}</Label>
            <div className="flex flex-wrap gap-2">
              {HEADER_FORMATS.map((fmt) => (
                <Button
                  key={fmt}
                  type="button"
                  size="sm"
                  variant={form.header_format === fmt ? 'default' : 'outline'}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      header_format: fmt as HeaderFormat,
                      ...(fmt === 'none' || fmt === 'text'
                        ? { header_media_url: '' }
                        : {}),
                      ...(fmt !== 'text'
                        ? { header_content: '', header_sample: '' }
                        : {}),
                    }))
                  }
                >
                  {fmt === 'none'
                    ? t('headerNone')
                    : fmt === 'text'
                      ? t('headerText')
                      : fmt === 'image'
                        ? t('headerImage')
                        : fmt === 'video'
                          ? t('headerVideo')
                          : t('headerDocument')}
                </Button>
              ))}
            </div>

            {form.header_format === 'text' ? (
              <div className="space-y-2">
                <Input
                  value={form.header_content}
                  maxLength={TEMPLATE_LIMITS.headerTextMaxLength}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, header_content: e.target.value }))
                  }
                  placeholder={t('headerTextPlaceholder')}
                />
                {extractVariableIndices(form.header_content).length > 0 ? (
                  <Input
                    value={form.header_sample}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, header_sample: e.target.value }))
                    }
                    placeholder={t('headerSamplePlaceholder')}
                    aria-label={t('headerSampleAria')}
                  />
                ) : null}
              </div>
            ) : null}

            {headerNeedsMedia ? (
              <HeaderMediaField
                format={form.header_format as 'image' | 'video' | 'document'}
                url={form.header_media_url}
                onUrlChange={(header_media_url) =>
                  setForm((f) => ({ ...f, header_media_url }))
                }
                disabled={submitting}
              />
            ) : null}
          </div>

          <div className="space-y-2 border-t border-border/60 pt-5">
            <Label htmlFor="tmpl-body">{t('bodyText')}</Label>
            <Textarea
              id="tmpl-body"
              rows={5}
              value={form.body_text}
              onChange={(e) =>
                setForm((f) => ({ ...f, body_text: e.target.value }))
              }
              placeholder={t('bodyPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('bodyHint')}</p>
            {bodyVarCount > 0 ? (
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('sampleValues')}
                </p>
                {form.body_samples.map((sample, i) => (
                  <Input
                    key={i}
                    value={sample}
                    onChange={(e) => {
                      const body_samples = [...form.body_samples];
                      body_samples[i] = e.target.value;
                      setForm((f) => ({ ...f, body_samples }));
                    }}
                    placeholder={t('samplePlaceholder', { var: `{{${i + 1}}}` })}
                    aria-label={t('sampleAria', { var: `{{${i + 1}}}` })}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-2 border-t border-border/60 pt-5">
            <Label htmlFor="tmpl-footer">{t('footer')}</Label>
            <Input
              id="tmpl-footer"
              value={form.footer_text}
              maxLength={TEMPLATE_LIMITS.footerMaxLength}
              onChange={(e) =>
                setForm((f) => ({ ...f, footer_text: e.target.value }))
              }
              placeholder={t('footerPlaceholder')}
            />
          </div>

          <div className="space-y-3 border-t border-border/60 pt-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label>{t('buttons')}</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('buttonsLimit', { max: TEMPLATE_LIMITS.maxButtonsTotal })}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  form.buttons.length >= TEMPLATE_LIMITS.maxButtonsTotal
                }
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    buttons: [...f.buttons, emptyButton('QUICK_REPLY')],
                  }))
                }
              >
                <Plus className="h-3.5 w-3.5" />
                {t('addButton')}
              </Button>
            </div>

            <ul className="space-y-3">
              {form.buttons.map((btn, index) => (
                <li
                  key={index}
                  className="space-y-2 rounded-xl border border-border/70 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className={cn(selectClass, 'w-[160px]')}
                      value={btn.type}
                      onChange={(e) =>
                        setForm((f) => {
                          const buttons = [...f.buttons];
                          buttons[index] = emptyButton(
                            e.target.value as TemplateButton['type'],
                          );
                          return { ...f, buttons };
                        })
                      }
                    >
                      <option value="QUICK_REPLY">{t('btnQuickReply')}</option>
                      <option value="URL">{t('btnUrl')}</option>
                      <option value="PHONE_NUMBER">{t('btnPhone')}</option>
                      <option value="COPY_CODE">{t('btnCopyCode')}</option>
                    </select>
                    <Input
                      className="min-w-[140px] flex-1"
                      value={btn.text}
                      maxLength={TEMPLATE_LIMITS.buttonTextMaxLength}
                      onChange={(e) =>
                        updateButton(index, { text: e.target.value })
                      }
                      placeholder={t('btnLabelPlaceholder')}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          buttons: f.buttons.filter((_, i) => i !== index),
                        }))
                      }
                      aria-label="Remove button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {btn.type === 'URL' ? (
                    <>
                      <Input
                        value={btn.url}
                        onChange={(e) =>
                          updateButton(index, { url: e.target.value })
                        }
                        placeholder={t('urlPlaceholder')}
                      />
                      {/\{\{\d+\}\}/.test(btn.url) ? (
                        <Input
                          value={btn.example ?? ''}
                          onChange={(e) =>
                            updateButton(index, { example: e.target.value })
                          }
                          placeholder={t('urlSamplePlaceholder')}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {btn.type === 'PHONE_NUMBER' ? (
                    <Input
                      value={btn.phone_number}
                      onChange={(e) =>
                        updateButton(index, { phone_number: e.target.value })
                      }
                      placeholder={t('phonePlaceholder')}
                    />
                  ) : null}
                  {btn.type === 'COPY_CODE' ? (
                    <Input
                      value={btn.example}
                      onChange={(e) =>
                        updateButton(index, { example: e.target.value })
                      }
                      placeholder={t('codePlaceholder')}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <TemplatePhonePreview form={form} />
      </div>
    </div>
  );
}
