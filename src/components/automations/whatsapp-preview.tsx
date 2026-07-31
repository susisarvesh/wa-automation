"use client";

import { cn } from "@/lib/utils";

export type PreviewKind = "text" | "buttons" | "list" | "template";

/**
 * Phone-frame preview of the WhatsApp message customers will see.
 * Supports free text, reply buttons, list rows, and template-style chrome.
 */
export function WhatsAppPreview({
  text,
  businessName = "Your business",
  kind = "text",
  header,
  footer,
  buttons,
  listRows,
  className,
}: {
  text: string;
  businessName?: string;
  kind?: PreviewKind;
  header?: string;
  footer?: string;
  /** Reply-button titles (max 3 on WhatsApp). */
  buttons?: string[];
  /** List row titles. */
  listRows?: string[];
  className?: string;
}) {
  const body = text.trim() || "Your message will appear here…";
  const showButtons =
    (kind === "buttons" || (buttons && buttons.length > 0)) &&
    (buttons?.length ?? 0) > 0;
  const showList =
    (kind === "list" || (listRows && listRows.length > 0)) &&
    (listRows?.length ?? 0) > 0;
  const isTemplate = kind === "template";

  return (
    <div
      className={cn(
        "vsmart-shape overflow-hidden border border-border bg-[#0b141a] shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#202c33] px-3 py-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {businessName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{businessName}</p>
          <p className="text-[11px] text-white/55">WhatsApp Business</p>
        </div>
        {isTemplate ? (
          <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/70">
            Template
          </span>
        ) : null}
      </div>
      <div
        className="min-h-[160px] bg-[#0b141a] px-3 py-4"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(54,89,201,0.12), transparent 40%)",
        }}
      >
        <div className="ml-auto max-w-[88%] overflow-hidden rounded-xl rounded-tr-sm bg-[#005c4b] text-[13px] leading-relaxed text-white shadow-sm">
          {header ? (
            <div className="border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white/80">
              {header}
            </div>
          ) : null}
          <div className="whitespace-pre-wrap px-3 py-2">{body}</div>
          {footer ? (
            <div className="border-t border-white/10 px-3 py-1.5 text-[11px] text-white/55">
              {footer}
            </div>
          ) : null}
          <div className="px-3 pb-1.5 text-right text-[10px] text-white/60">
            just now ✓✓
          </div>
          {showButtons ? (
            <div className="border-t border-white/15">
              {(buttons ?? []).slice(0, 3).map((label) => (
                <div
                  key={label}
                  className="border-t border-white/10 px-3 py-2.5 text-center text-[13px] font-medium text-[#53bdeb]"
                >
                  {label}
                </div>
              ))}
            </div>
          ) : null}
          {showList ? (
            <div className="border-t border-white/15">
              <div className="px-3 py-2 text-center text-[12px] font-medium text-[#53bdeb]">
                View options
              </div>
              <ul className="border-t border-white/10 bg-[#004c3f]/80 px-3 py-2">
                {(listRows ?? []).slice(0, 6).map((row) => (
                  <li
                    key={row}
                    className="border-b border-white/5 py-1.5 text-[12px] text-white/90 last:border-0"
                  >
                    {row}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
      <p className="border-t border-white/10 bg-[#202c33] px-3 py-2 text-[11px] text-white/55">
        {isTemplate
          ? "Approved Meta template look — body text may use variables at send time"
          : showButtons || showList
            ? "Interactive message — customers tap a button or list row"
            : "Exact text customers will receive when this automation fires"}
      </p>
    </div>
  );
}
