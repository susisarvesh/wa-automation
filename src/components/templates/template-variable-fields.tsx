'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { fillBodyPreview } from '@/lib/broadcasts/template-fields';
import type { CampaignButtonSlot } from '@/lib/broadcasts/template-fields';
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

  const hasFields =
    showHeader || bodyParams.length > 0 || buttonSlots.length > 0;
  if (!hasFields) return null;

  function applyChip(chip: (typeof CONTACT_FIELD_CHIPS)[number]) {
    const value =
      mode === 'merge'
        ? chip.token
        : String(contact?.[chip.key] ?? '').trim();
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
            ? 'Fill each {{n}} slot. Click a chip to personalize per customer (name, company, …).'
            : 'Fill each {{n}} slot for this customer. Use chips to insert their saved fields.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CONTACT_FIELD_CHIPS.map((chip) => {
          const literal = String(contact?.[chip.key] ?? '').trim();
          const disabled = mode === 'literal' && !literal;
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
              s.kind === 'url' ? 'URL suffix / path' : 'Copy code value'
            }
          />
        </div>
      ))}

      {bodyText ? (
        <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">Preview</p>
          <p className="whitespace-pre-wrap text-sm">
            {fillBodyPreview(bodyText, bodyParams)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
