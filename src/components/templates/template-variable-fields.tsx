'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { fillBodyPreview } from '@/lib/broadcasts/template-fields';
import type { CampaignButtonSlot } from '@/lib/broadcasts/template-fields';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

export type ContactFieldHints = {
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  email?: string | null;
};

export const CONTACT_FIELD_CHIPS = [
  { key: 'name', label: 'Name', token: '{{contact.name}}' },
  { key: 'company', label: 'Company', token: '{{contact.company}}' },
  { key: 'phone', label: 'Phone', token: '{{contact.phone}}' },
  { key: 'email', label: 'Email', token: '{{contact.email}}' },
] as const;

export type MergeChip = {
  key: string;
  label: string;
  token: string;
};

type FocusTarget =
  | { kind: 'header' }
  | { kind: 'body'; index: number }
  | { kind: 'button'; index: number };

/**
 * Meta-style {{1}} / {{2}} / {{3}} inputs for campaigns (merge tokens)
 * or inbox sends (literal contact values).
 */
export function TemplateVariableFields({
  mode,
  contact,
  bodyText,
  bodyParams,
  onBodyParamsChange,
  showHeader = false,
  headerText = '',
  onHeaderTextChange,
  buttonSlots = [],
  buttonParams = {},
  onButtonParamsChange,
  className,
}: {
  mode: 'merge' | 'literal';
  contact?: ContactFieldHints | null;
  bodyText?: string;
  bodyParams: string[];
  onBodyParamsChange: (next: string[]) => void;
  showHeader?: boolean;
  headerText?: string;
  onHeaderTextChange?: (value: string) => void;
  buttonSlots?: CampaignButtonSlot[];
  buttonParams?: Record<number, string>;
  onButtonParamsChange?: (next: Record<number, string>) => void;
  className?: string;
}) {
  const [focus, setFocus] = useState<FocusTarget | null>(
    bodyParams.length > 0 ? { kind: 'body', index: 0 } : showHeader ? { kind: 'header' } : null,
  );
  const [customChips, setCustomChips] = useState<MergeChip[]>([]);

  useEffect(() => {
    if (mode !== 'merge') {
      setCustomChips([]);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const { data } = await supabase
        .from('custom_fields')
        .select('field_name, field_key')
        .order('field_name');
      if (cancelled) return;
      const chips: MergeChip[] = [];
      for (const row of data ?? []) {
        const key = String(row.field_key ?? '').trim();
        if (!key) continue;
        chips.push({
          key: `custom.${key}`,
          label: String(row.field_name ?? key),
          token: `{{contact.custom.${key}}}`,
        });
      }
      setCustomChips(chips);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const hasFields =
    showHeader || bodyParams.length > 0 || buttonSlots.length > 0;
  if (!hasFields) return null;

  const chips: MergeChip[] = [
    ...CONTACT_FIELD_CHIPS.map((c) => ({
      key: c.key,
      label: c.label,
      token: c.token,
    })),
    ...customChips,
  ];

  function applyChip(chip: MergeChip) {
    const builtinKey = chip.key as keyof ContactFieldHints;
    const value =
      mode === 'merge'
        ? chip.token
        : String(contact?.[builtinKey] ?? '').trim();
    if (mode === 'literal' && !value) return;

    const target = focus ?? (bodyParams.length > 0 ? { kind: 'body' as const, index: 0 } : null);
    if (!target) return;

    if (target.kind === 'header' && onHeaderTextChange) {
      onHeaderTextChange(value);
      return;
    }
    if (target.kind === 'body') {
      const next = [...bodyParams];
      next[target.index] = value;
      onBodyParamsChange(next);
      return;
    }
    if (target.kind === 'button' && onButtonParamsChange) {
      onButtonParamsChange({ ...buttonParams, [target.index]: value });
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="space-y-1">
        <Label>Template variables</Label>
        <p className="text-xs text-muted-foreground">
          {mode === 'merge'
            ? 'Fill each {{n}} slot. Click a chip to personalize per customer (name, company, custom fields…).'
            : 'Fill each {{n}} slot for this customer. Use chips to insert their saved fields.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => {
          const builtinKey = chip.key as keyof ContactFieldHints;
          const literal = String(contact?.[builtinKey] ?? '').trim();
          const disabled =
            mode === 'literal' &&
            (chip.key.startsWith('custom.') || !literal);
          return (
            <Button
              key={chip.key}
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              className="h-7 px-2 text-xs"
              title={
                mode === 'merge'
                  ? `Insert ${chip.token}`
                  : literal
                    ? `Insert “${literal}”`
                    : `No ${chip.label.toLowerCase()} on this contact`
              }
              onClick={() => applyChip(chip)}
            >
              {chip.label}
              {mode === 'merge' ? (
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  {chip.token}
                </span>
              ) : null}
            </Button>
          );
        })}
      </div>

      {showHeader && onHeaderTextChange ? (
        <div className="space-y-1">
          <Label className="text-xs">Header {'{{1}}'}</Label>
          <Input
            value={headerText}
            onFocus={() => setFocus({ kind: 'header' })}
            onChange={(e) => onHeaderTextChange(e.target.value)}
            placeholder={
              mode === 'merge' ? '{{contact.company}}' : 'Header value'
            }
          />
        </div>
      ) : null}

      {bodyParams.map((v, i) => (
        <div key={i} className="space-y-1">
          <Label className="text-xs">{`Body {{${i + 1}}}`}</Label>
          <Input
            value={v}
            onFocus={() => setFocus({ kind: 'body', index: i })}
            onChange={(e) => {
              const next = [...bodyParams];
              next[i] = e.target.value;
              onBodyParamsChange(next);
            }}
            placeholder={
              i === 0
                ? mode === 'merge'
                  ? '{{contact.name}}'
                  : 'e.g. customer name'
                : i === 1
                  ? mode === 'merge'
                    ? '{{contact.company}}'
                    : 'e.g. company name'
                  : `Value for {{${i + 1}}}`
            }
          />
        </div>
      ))}

      {buttonSlots.map((s) => (
        <div key={s.index} className="space-y-1">
          <Label className="text-xs">
            {s.kind === 'url'
              ? `${s.label} — URL {{1}}`
              : `${s.label} — code`}
          </Label>
          <Input
            value={buttonParams[s.index] ?? ''}
            onFocus={() => setFocus({ kind: 'button', index: s.index })}
            onChange={(e) =>
              onButtonParamsChange?.({
                ...buttonParams,
                [s.index]: e.target.value,
              })
            }
            placeholder={
              s.kind === 'url'
                ? mode === 'merge'
                  ? 'https://… (tracked if template URL is /r/{{1}})'
                  : 'URL suffix / path'
                : 'Copy code value'
            }
          />
        </div>
      ))}

      {mode === 'merge' && bodyText ? (
        <p className="text-xs text-muted-foreground">
          Preview: {fillBodyPreview(bodyText, bodyParams)}
        </p>
      ) : null}
    </div>
  );
}
