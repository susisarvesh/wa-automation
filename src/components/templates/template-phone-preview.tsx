'use client';

import { FileText, Video } from 'lucide-react';
import { fillTemplateVars, type TemplateFormData } from './template-form';

export function TemplatePhonePreview({ form }: { form: TemplateFormData }) {
  const body = fillTemplateVars(form.body_text, form.body_samples);
  const headerText =
    form.header_format === 'text'
      ? fillTemplateVars(
          form.header_content,
          form.header_sample ? [form.header_sample] : undefined,
        )
      : '';

  return (
    <div className="sticky top-4 mx-auto w-full max-w-[300px]">
      <div className="rounded-[2rem] border border-border bg-zinc-900 p-3 shadow-xl">
        <div className="mb-2 flex items-center justify-center">
          <div className="h-1.5 w-16 rounded-full bg-zinc-700" />
        </div>
        <div className="overflow-hidden rounded-[1.35rem] bg-[#0b141a]">
          <div className="flex items-center gap-2 bg-[#1f2c34] px-3 py-2.5">
            <div className="h-8 w-8 rounded-full bg-emerald-700/80" />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">
                Vsmart Technologies
              </p>
              <p className="text-[10px] text-zinc-400">WhatsApp Business</p>
            </div>
          </div>

          <div
            className="min-h-[340px] bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><rect fill=%22%230b141a%22 width=%2240%22 height=%2240%22/><circle cx=%222%22 cy=%222%22 r=%221%22 fill=%22%23182229%22/></svg>')] bg-repeat px-3 py-4"
          >
            <div className="ml-auto max-w-[92%] overflow-hidden rounded-lg bg-[#005c4b] text-white shadow-sm">
              {form.header_format === 'image' && form.header_media_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.header_media_url}
                  alt=""
                  className="aspect-[1.91/1] w-full object-cover"
                />
              ) : null}
              {form.header_format === 'video' ? (
                <div className="flex aspect-video items-center justify-center bg-zinc-800/80">
                  <Video className="h-8 w-8 text-zinc-300" />
                </div>
              ) : null}
              {form.header_format === 'document' ? (
                <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
                  <FileText className="h-5 w-5 shrink-0" />
                  <span className="truncate text-xs">Document.pdf</span>
                </div>
              ) : null}
              {headerText ? (
                <p className="px-3 pt-2.5 text-[13px] font-semibold leading-snug">
                  {headerText}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap px-3 py-2.5 text-[13px] leading-snug">
                {body || (
                  <span className="text-white/50">
                    Body text appears here…
                  </span>
                )}
              </p>
              {form.footer_text.trim() ? (
                <p className="px-3 pb-2 text-[11px] text-white/60">
                  {form.footer_text.trim()}
                </p>
              ) : null}
              {form.buttons.length > 0 ? (
                <div className="border-t border-white/10">
                  {form.buttons.map((btn, i) => (
                    <div
                      key={i}
                      className="border-b border-white/10 px-3 py-2 text-center text-[12px] font-medium text-sky-200 last:border-b-0"
                    >
                      {btn.text.trim() || 'Button'}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Approximate preview — Meta review uses your sample values.
      </p>
    </div>
  );
}
