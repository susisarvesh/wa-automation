"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  AccessLockedPanel,
  AccessWaitingBanner,
} from "@/components/auth/access-locked";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { MessageTemplate, Tag } from "@/types";
import { cn } from "@/lib/utils";

function countBodyVars(template: MessageTemplate | null): number {
  if (!template?.body_text) return 0;
  const matches = template.body_text.match(/\{\{\d+\}\}/g);
  return matches?.length ?? 0;
}

export default function NewBroadcastPage() {
  const router = useRouter();
  const { isAccessApproved, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [name, setName] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateKey, setTemplateKey] = useState("");
  const [bodyParams, setBodyParams] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAccessApproved) return;
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
      setTemplates((tmplRows ?? []) as MessageTemplate[]);
    })();
  }, [isAccessApproved, supabase]);

  const selectedTemplate = useMemo(() => {
    if (!templateKey) return null;
    return templates.find((t) => `${t.name}::${t.language}` === templateKey) ?? null;
  }, [templateKey, templates]);

  useEffect(() => {
    const n = countBodyVars(selectedTemplate);
    setBodyParams((prev) => {
      const next = Array.from({ length: n }, (_, i) => prev[i] ?? "");
      return next;
    });
  }, [selectedTemplate]);

  async function save(andSend: "draft" | "now" | "schedule") {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!selectedTemplate) {
      toast.error("Pick an approved template");
      return;
    }
    if (selectedTagIds.length === 0) {
      toast.error("Select at least one tag");
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
          body_params: bodyParams,
          audience_filter: { tag_ids: selectedTagIds },
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
          Choose a template and tag audience, then send or schedule.
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
          <Label htmlFor="template">Template</Label>
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
            <p className="text-xs text-muted-foreground">
              No approved templates yet. Sync them from Connect / Settings.
            </p>
          ) : null}
        </div>

        {bodyParams.length > 0 ? (
          <div className="space-y-2">
            <Label>Body variables</Label>
            <div className="space-y-2">
              {bodyParams.map((v, i) => (
                <Input
                  key={i}
                  value={v}
                  onChange={(e) => {
                    const next = [...bodyParams];
                    next[i] = e.target.value;
                    setBodyParams(next);
                  }}
                  placeholder={`{{${i + 1}}}`}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label>Audience tags (any match)</Label>
          {tags.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Create tags on Customers first, then assign them to contacts.
            </p>
          ) : (
            <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border p-3">
              {tags.map((tag) => {
                const checked = selectedTagIds.includes(tag.id);
                return (
                  <li key={tag.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`tag-${tag.id}`}
                      checked={checked}
                      onCheckedChange={(v) => {
                        setSelectedTagIds((prev) =>
                          v
                            ? [...prev, tag.id]
                            : prev.filter((id) => id !== tag.id),
                        );
                      }}
                    />
                    <label
                      htmlFor={`tag-${tag.id}`}
                      className="text-sm leading-none"
                    >
                      {tag.name}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

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
            disabled={saving}
            onClick={() => void save("draft")}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save draft
          </Button>
          {scheduledAt ? (
            <Button disabled={saving} onClick={() => void save("schedule")}>
              Schedule
            </Button>
          ) : (
            <Button disabled={saving} onClick={() => void save("now")}>
              Send now
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
