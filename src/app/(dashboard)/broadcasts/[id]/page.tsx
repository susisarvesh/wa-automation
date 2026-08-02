"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  AccessLockedPanel,
  AccessWaitingBanner,
} from "@/components/auth/access-locked";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type {
  Broadcast,
  BroadcastRecipient,
  BroadcastStatus,
  MessageTemplate,
  RecipientStatus,
  Tag,
} from "@/types";
import {
  CampaignAudienceFields,
  buildAudienceFilter,
  type AudienceMode,
} from "@/components/broadcasts/campaign-audience-fields";
import { parseAudienceFilter } from "@/lib/broadcasts/audience";
import {
  buttonSlots,
  countBodyVars,
  fillBodyPreview,
  needsHeaderText,
  requiredVarsFilled,
} from "@/lib/broadcasts/template-fields";
import {
  humanizeMetaError,
  isWorkspaceVisibleTemplateName,
} from "@/lib/whatsapp/meta-errors";

type RecipientRow = BroadcastRecipient & {
  contact?: { id: string; name?: string; phone?: string } | null;
};

const STATUS_LABEL: Record<BroadcastStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
};

const RECIPIENT_FILTERS: Array<RecipientStatus | ""> = [
  "",
  "pending",
  "sent",
  "delivered",
  "read",
  "replied",
  "failed",
  "cancelled",
];

function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function BroadcastDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAccessApproved, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [recipientsTotal, setRecipientsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<RecipientStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Draft edit state
  const [name, setName] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateKey, setTemplateKey] = useState("");
  const [bodyParams, setBodyParams] = useState<string[]>([]);
  const [headerText, setHeaderText] = useState("");
  const [buttonParams, setButtonParams] = useState<Record<number, string>>({});
  const [scheduledAt, setScheduledAt] = useState("");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("all");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagMatch, setTagMatch] = useState<"any" | "all">("any");
  const [excludeTagIds, setExcludeTagIds] = useState<string[]>([]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const limit = 50;

  const load = useCallback(async () => {
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (statusFilter) qs.set("status", statusFilter);
    const res = await fetch(`/api/broadcasts/${id}?${qs}`, {
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error || "Failed to load");
      setLoading(false);
      return;
    }
    const b = body.broadcast as Broadcast;
    setBroadcast(b);
    setRecipients((body.recipients ?? []) as RecipientRow[]);
    setRecipientsTotal(Number(body.recipients_total ?? 0));
    setLoading(false);

    if (b.status === "draft") {
      setName(b.name);
      setScheduledAt(toLocalInput(b.scheduled_at));
      setTemplateKey(`${b.template_name}::${b.template_language}`);
      const vars = (b.template_variables ?? {}) as {
        body?: string[];
        headerText?: string;
        buttonParams?: Record<string, string>;
      };
      setBodyParams((vars.body ?? []).map(String));
      setHeaderText(vars.headerText ?? "");
      const bp: Record<number, string> = {};
      if (vars.buttonParams) {
        for (const [k, v] of Object.entries(vars.buttonParams)) {
          bp[Number(k)] = String(v);
        }
      }
      setButtonParams(bp);

      const af = parseAudienceFilter(b.audience_filter);
      if (af?.mode === "all") {
        setAudienceMode("all");
      } else if (af?.mode === "tags") {
        setAudienceMode("tags");
        setSelectedTagIds(af.tag_ids);
        setTagMatch(af.tag_match ?? "any");
        setExcludeTagIds(af.exclude_tag_ids ?? []);
      } else if (af?.mode === "contacts") {
        // Retry drafts — show as fixed contact list; keep mode tags UI disabled via preview only
        setAudienceMode("all");
        setPreviewCount(af.contact_ids.length);
      }
    }
  }, [id, page, statusFilter]);

  useEffect(() => {
    if (!authLoading && isAccessApproved) void load();
  }, [authLoading, isAccessApproved, load]);

  useEffect(() => {
    if (!broadcast || broadcast.status !== "sending") return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [broadcast, load]);

  useEffect(() => {
    if (!isAccessApproved || broadcast?.status !== "draft") return;
    void (async () => {
      const [{ data: tagRows }, { data: tmplRows }] = await Promise.all([
        supabase.from("tags").select("*").order("name"),
        supabase
          .from("message_templates")
          .select("*")
          .eq("status", "APPROVED")
          .order("name"),
      ]);
      setTags((tagRows ?? []) as Tag[]);
      setTemplates(
        ((tmplRows ?? []) as MessageTemplate[]).filter((row) =>
          isWorkspaceVisibleTemplateName(row.name),
        ),
      );
    })();
  }, [isAccessApproved, broadcast?.status, supabase]);

  const audienceFilter = useMemo(() => {
    if (broadcast?.status !== "draft") return null;
    const af = parseAudienceFilter(broadcast.audience_filter);
    if (af?.mode === "contacts") return af;
    return buildAudienceFilter({
      mode: audienceMode,
      selectedTagIds,
      tagMatch,
      excludeTagIds,
    });
  }, [
    broadcast,
    audienceMode,
    selectedTagIds,
    tagMatch,
    excludeTagIds,
  ]);

  useEffect(() => {
    if (broadcast?.status !== "draft" || !audienceFilter) {
      if (broadcast?.status === "draft") setPreviewCount(null);
      return;
    }
    if (audienceFilter.mode === "contacts") {
      setPreviewCount(audienceFilter.contact_ids.length);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/broadcasts/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audience_filter: audienceFilter }),
          });
          const body = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (res.ok) setPreviewCount(Number(body.count ?? 0));
        } finally {
          if (!cancelled) setPreviewLoading(false);
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [audienceFilter, broadcast?.status]);

  const selectedTemplate = useMemo(() => {
    if (!templateKey) return null;
    return (
      templates.find((t) => `${t.name}::${t.language}` === templateKey) ?? null
    );
  }, [templateKey, templates]);

  const slots = useMemo(
    () => buttonSlots(selectedTemplate),
    [selectedTemplate],
  );
  const needsHeader = needsHeaderText(selectedTemplate);

  useEffect(() => {
    if (broadcast?.status !== "draft") return;
    const n = countBodyVars(selectedTemplate);
    setBodyParams((prev) =>
      Array.from({ length: n }, (_, i) => prev[i] ?? ""),
    );
  }, [selectedTemplate, broadcast?.status]);

  async function syncTemplates() {
    setSyncing(true);
    try {
      const res = await fetch("/api/whatsapp/templates/sync", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(humanizeMetaError(body.error) || "Sync failed");
        return;
      }
      const { data: tmplRows } = await supabase
        .from("message_templates")
        .select("*")
        .eq("status", "APPROVED")
        .order("name");
      setTemplates(
        ((tmplRows ?? []) as MessageTemplate[]).filter((row) =>
          isWorkspaceVisibleTemplateName(row.name),
        ),
      );
      toast.success("Templates synced");
    } finally {
      setSyncing(false);
    }
  }

  async function saveDraft() {
    if (!broadcast || broadcast.status !== "draft") return;
    const af = audienceFilter;
    if (!af) {
      toast.error("Invalid audience");
      return;
    }
    if (!selectedTemplate && !templateKey) {
      toast.error("Pick a template");
      return;
    }
    const [tName, tLang] = templateKey.split("::");
    const tmpl =
      selectedTemplate ??
      templates.find((t) => t.name === tName && t.language === tLang) ??
      null;
    if (tmpl && !requiredVarsFilled(tmpl, bodyParams, headerText, buttonParams)) {
      toast.error("Fill all required template variables");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/broadcasts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          template_name: tName,
          template_language: tLang,
          audience_filter: af,
          template_variables: {
            body: bodyParams,
            ...(needsHeader ? { headerText } : {}),
            ...(slots.length
              ? {
                  buttonParams: Object.fromEntries(
                    slots.map((s) => [s.index, buttonParams[s.index] ?? ""]),
                  ),
                }
              : {}),
          },
          scheduled_at: scheduledAt
            ? new Date(scheduledAt).toISOString()
            : null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Save failed");
        return;
      }
      toast.success("Draft saved");
      setBroadcast(body.broadcast);
    } finally {
      setBusy(false);
    }
  }

  async function send(mode: "now" | "schedule") {
    if (broadcast?.status === "draft") {
      await saveDraft();
    }
    if ((previewCount ?? 0) <= 0 && broadcast?.status === "draft") {
      const af = parseAudienceFilter(broadcast.audience_filter);
      if (af?.mode !== "contacts") {
        toast.error("Audience has 0 sendable recipients");
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/broadcasts/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Failed");
        return;
      }
      toast.success(mode === "schedule" ? "Scheduled" : "Sending started");
      setBroadcast(body.broadcast);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      const res = await fetch(`/api/broadcasts/${id}/cancel`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Cancel failed");
        return;
      }
      toast.success(
        broadcast?.status === "sending"
          ? "Sending stopped"
          : "Schedule cancelled",
      );
      setBroadcast(body.broadcast);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function retryFailed() {
    setBusy(true);
    try {
      const res = await fetch(`/api/broadcasts/${id}/retry-failed`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Retry failed");
        return;
      }
      toast.success("Draft created with failed recipients");
      router.push(`/broadcasts/${body.broadcast.id}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this draft?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/broadcasts/${id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Delete failed");
        return;
      }
      toast.success("Deleted");
      router.push("/broadcasts");
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    const qs = new URLSearchParams({ export: "csv" });
    if (statusFilter) qs.set("status", statusFilter);
    window.open(`/api/broadcasts/${id}?${qs}`, "_blank");
  }

  if (authLoading || (isAccessApproved && loading)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAccessApproved) {
    return (
      <>
        <AccessWaitingBanner />
        <AccessLockedPanel title="Campaigns are locked" />
      </>
    );
  }

  if (!broadcast) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Campaign not found.</p>
        <Link
          href="/broadcasts"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Back
        </Link>
      </div>
    );
  }

  const isDraft = broadcast.status === "draft";
  const isContactsAudience =
    parseAudienceFilter(broadcast.audience_filter)?.mode === "contacts";
  const totalPages = Math.max(1, Math.ceil(recipientsTotal / limit));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/broadcasts"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Campaigns
          </Link>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {isDraft ? name || broadcast.name : broadcast.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {broadcast.template_name} · {broadcast.template_language} ·{" "}
            {STATUS_LABEL[broadcast.status]}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {isDraft ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void saveDraft()}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void remove()}
              >
                Delete
              </Button>
              {scheduledAt ? (
                <Button
                  size="sm"
                  disabled={busy || (previewCount ?? 0) <= 0}
                  onClick={() => void send("schedule")}
                >
                  Confirm schedule
                </Button>
              ) : null}
              <Button
                size="sm"
                disabled={busy || (previewCount ?? 0) <= 0}
                onClick={() => void send("now")}
              >
                Send now
              </Button>
            </>
          ) : null}
          {broadcast.status === "scheduled" || broadcast.status === "sending" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void cancel()}
            >
              {broadcast.status === "sending"
                ? "Stop sending"
                : "Cancel schedule"}
            </Button>
          ) : null}
          {(broadcast.status === "sent" || broadcast.status === "failed") &&
          broadcast.failed_count > 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void retryFailed()}
            >
              Retry failed as new
            </Button>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Recipients", broadcast.total_recipients],
          ["Sent", broadcast.sent_count],
          ["Delivered", broadcast.delivered_count],
          ["Read", broadcast.read_count],
          ["Replied", broadcast.replied_count],
          ["Failed", broadcast.failed_count],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="space-y-1 border-t border-border pt-3"
          >
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {isDraft ? (
        <div className="space-y-5 rounded-lg border border-border p-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {!isContactsAudience ? (
            <>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="edit-template">Template</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={syncing}
                    onClick={() => void syncTemplates()}
                  >
                    {syncing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Sync
                  </Button>
                </div>
                <select
                  id="edit-template"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={templateKey}
                  onChange={(e) => setTemplateKey(e.target.value)}
                >
                  <option value="">Select approved template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={`${t.name}::${t.language}`}>
                      {t.name} ({t.language})
                    </option>
                  ))}
                </select>
                {templates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No APPROVED templates.{" "}
                    <Link href="/templates" className="underline">
                      Go to Templates
                    </Link>
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Template variables</Label>
                <p className="text-xs text-muted-foreground">
                  Merge tokens: {"{{contact.name}}"}, {"{{contact.phone}}"}
                </p>
                {needsHeader ? (
                  <Input
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    placeholder="Header {{1}}"
                  />
                ) : null}
                {bodyParams.map((v, i) => (
                  <Input
                    key={i}
                    value={v}
                    onChange={(e) => {
                      const next = [...bodyParams];
                      next[i] = e.target.value;
                      setBodyParams(next);
                    }}
                    placeholder={`Body {{${i + 1}}}`}
                  />
                ))}
                {slots.map((s) => (
                  <Input
                    key={s.index}
                    value={buttonParams[s.index] ?? ""}
                    onChange={(e) =>
                      setButtonParams((prev) => ({
                        ...prev,
                        [s.index]: e.target.value,
                      }))
                    }
                    placeholder={s.label}
                  />
                ))}
                {selectedTemplate?.body_text ? (
                  <div className="rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                    {fillBodyPreview(selectedTemplate.body_text, bodyParams)}
                  </div>
                ) : null}
              </div>

              <CampaignAudienceFields
                mode={audienceMode}
                onModeChange={setAudienceMode}
                tags={tags}
                selectedTagIds={selectedTagIds}
                onSelectedTagIdsChange={setSelectedTagIds}
                tagMatch={tagMatch}
                onTagMatchChange={setTagMatch}
                excludeTagIds={excludeTagIds}
                onExcludeTagIdsChange={setExcludeTagIds}
                previewCount={previewCount}
                previewLoading={previewLoading}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This draft targets {previewCount ?? "—"} failed contacts from a
              previous campaign. Save and send when ready.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-scheduled">Schedule (optional)</Label>
            <Input
              id="edit-scheduled"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      {broadcast.scheduled_at && broadcast.status !== "draft" ? (
        <p className="text-sm text-muted-foreground">
          Scheduled for {new Date(broadcast.scheduled_at).toLocaleString()}
        </p>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Recipients ({recipientsTotal})
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value as RecipientStatus | "");
              }}
            >
              {RECIPIENT_FILTERS.map((s) => (
                <option key={s || "all"} value={s}>
                  {s ? s : "All statuses"}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={recipientsTotal === 0}
              onClick={() => void exportCsv()}
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          </div>
        </div>

        {recipients.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Recipients appear after you send or schedule.
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {recipients.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {r.contact?.name || "Unknown"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.contact?.phone || "—"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      r.status === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {r.status}
                  </span>
                  {r.error_message ? (
                    <p className="max-w-[12rem] truncate text-[11px] text-destructive">
                      {r.error_message}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span>
              Page {page} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
