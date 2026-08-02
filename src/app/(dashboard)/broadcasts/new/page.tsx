"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  AccessLockedPanel,
  AccessWaitingBanner,
} from "@/components/auth/access-locked";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MessageTemplate, Tag } from "@/types";
import { cn } from "@/lib/utils";
import {
  humanizeMetaError,
  isWorkspaceVisibleTemplateName,
} from "@/lib/whatsapp/meta-errors";
import {
  CampaignAudienceFields,
  buildAudienceFilter,
  type AudienceMode,
} from "@/components/broadcasts/campaign-audience-fields";
import {
  buttonSlots,
  countBodyVars,
  needsHeaderText,
  requiredVarsFilled,
} from "@/lib/broadcasts/template-fields";
import { TemplateVariableFields } from "@/components/templates/template-variable-fields";

export default function NewBroadcastPage() {
  const router = useRouter();
  const { isAccessApproved, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [name, setName] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("all");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagMatch, setTagMatch] = useState<"any" | "all">("any");
  const [excludeTagIds, setExcludeTagIds] = useState<string[]>([]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateKey, setTemplateKey] = useState("");
  const [bodyParams, setBodyParams] = useState<string[]>([]);
  const [headerText, setHeaderText] = useState("");
  const [buttonParams, setButtonParams] = useState<Record<number, string>>({});
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadTemplates = useCallback(async () => {
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
  }, [supabase]);

  useEffect(() => {
    if (!isAccessApproved) return;
    void (async () => {
      const { data: tagRows } = await supabase
        .from("tags")
        .select("*")
        .order("name");
      setTags((tagRows ?? []) as Tag[]);
      await loadTemplates();
    })();
  }, [isAccessApproved, supabase, loadTemplates]);

  const audienceFilter = useMemo(
    () =>
      buildAudienceFilter({
        mode: audienceMode,
        selectedTagIds,
        tagMatch,
        excludeTagIds,
      }),
    [audienceMode, selectedTagIds, tagMatch, excludeTagIds],
  );

  useEffect(() => {
    if (!isAccessApproved || !audienceFilter) {
      setPreviewCount(null);
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
          if (res.ok) {
            setPreviewCount(Number(body.count ?? 0));
          } else {
            setPreviewCount(null);
          }
        } finally {
          if (!cancelled) setPreviewLoading(false);
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [audienceFilter, isAccessApproved]);

  async function syncTemplates() {
    setSyncing(true);
    try {
      const res = await fetch("/api/whatsapp/templates/sync", {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          humanizeMetaError(body.error) || "Could not sync templates from Meta",
        );
        return;
      }
      await loadTemplates();
      const total = Number(body.total ?? 0);
      toast.success(
        total > 0
          ? `Synced — check approved templates below`
          : "Sync complete — no templates on Meta yet",
      );
    } finally {
      setSyncing(false);
    }
  }

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
    const n = countBodyVars(selectedTemplate);
    setBodyParams((prev) =>
      Array.from({ length: n }, (_, i) => {
        if (prev[i]?.trim()) return prev[i];
        if (i === 0) return "{{contact.name}}";
        if (i === 1) return "{{contact.company}}";
        return "";
      }),
    );
    if (!needsHeaderText(selectedTemplate)) setHeaderText("");
    const nextSlots = buttonSlots(selectedTemplate);
    setButtonParams((prev) => {
      const next: Record<number, string> = {};
      for (const s of nextSlots) next[s.index] = prev[s.index] ?? "";
      return next;
    });
  }, [selectedTemplate]);

  const varsOk = requiredVarsFilled(
    selectedTemplate,
    bodyParams,
    headerText,
    buttonParams,
  );
  const canSend =
    !!name.trim() &&
    !!selectedTemplate &&
    !!audienceFilter &&
    (previewCount ?? 0) > 0 &&
    varsOk;

  async function save(andSend: "draft" | "now" | "schedule") {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!selectedTemplate) {
      toast.error("Pick an approved template");
      return;
    }
    if (!audienceFilter) {
      toast.error(
        audienceMode === "tags"
          ? "Select at least one include tag"
          : "Invalid audience",
      );
      return;
    }
    if ((previewCount ?? 0) <= 0 && andSend !== "draft") {
      toast.error("Audience has 0 sendable recipients");
      return;
    }
    if (!varsOk) {
      toast.error("Fill all required template variables");
      return;
    }
    if (andSend === "schedule" && !scheduledAt) {
      toast.error("Pick a schedule time");
      return;
    }

    setSaving(true);
    try {
      const scheduledIso = scheduledAt
        ? new Date(scheduledAt).toISOString()
        : null;

      const createRes = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          template_name: selectedTemplate.name,
          template_language: selectedTemplate.language,
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
          audience_filter: audienceFilter,
          scheduled_at: scheduledIso,
        }),
      });
      const created = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        toast.error(created.error || "Failed to create");
        return;
      }

      const id = created.broadcast?.id as string;
      if (andSend === "draft") {
        toast.success("Draft saved");
        router.push(`/broadcasts/${id}`);
        return;
      }

      const sendRes = await fetch(`/api/broadcasts/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: andSend === "schedule" ? "schedule" : "now",
          scheduled_at: scheduledIso || undefined,
        }),
      });
      const sendBody = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) {
        toast.error(sendBody.error || "Failed to send");
        router.push(`/broadcasts/${id}`);
        return;
      }
      toast.success(andSend === "schedule" ? "Scheduled" : "Sending started");
      router.push(`/broadcasts/${id}`);
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
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
        <AccessLockedPanel
          title="Campaigns are locked"
          description="Ask an admin to approve your access before creating campaigns."
        />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div className="space-y-1">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          New campaign
        </h1>
        <p className="text-sm text-muted-foreground">
          Choose a template and audience, then send or schedule.
        </p>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="July promo"
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="template">Template</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={syncing}
                onClick={() => void syncTemplates()}
              >
                {syncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Sync from Meta
              </Button>
              <Link
                href="/templates?new=1"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "gap-1",
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                Create template
              </Link>
            </div>
          </div>
          <select
            id="template"
            className={cn(
              "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm",
            )}
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
            <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-2">
              <p>
                No APPROVED templates yet. Create one on Templates, wait for
                Meta approval, then Sync — or open Templates to check Pending
                status.
              </p>
              <Link
                href="/templates"
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                Go to Templates
              </Link>
            </div>
          ) : null}
        </div>

        <TemplateVariableFields
          mode="merge"
          bodyText={selectedTemplate?.body_text}
          bodyParams={bodyParams}
          onBodyParamsChange={setBodyParams}
          showHeader={needsHeader}
          headerText={headerText}
          onHeaderTextChange={setHeaderText}
          buttonSlots={slots}
          buttonParams={buttonParams}
          onButtonParamsChange={setButtonParams}
        />

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

        <div className="space-y-2">
          <Label htmlFor="scheduled">Schedule (optional)</Label>
          <Input
            id="scheduled"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            variant="outline"
            disabled={saving || !name.trim() || !selectedTemplate || !audienceFilter}
            onClick={() => void save("draft")}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save draft
          </Button>
          {scheduledAt ? (
            <Button
              disabled={saving || !canSend}
              onClick={() => void save("schedule")}
            >
              Schedule
            </Button>
          ) : (
            <Button
              disabled={saving || !canSend}
              onClick={() => void save("now")}
            >
              Send now
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
