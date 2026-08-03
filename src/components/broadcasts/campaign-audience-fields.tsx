"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseContactCsv } from "@/lib/contacts/parse-contact-csv";
import { resolveContactIdsFromCsvRows } from "@/lib/broadcasts/csv-audience";
import type { Tag } from "@/types";
import type { BroadcastAudienceFilter } from "@/lib/broadcasts/audience";

export type AudienceMode = "all" | "tags" | "csv";

type Props = {
  mode: AudienceMode;
  onModeChange: (mode: AudienceMode) => void;
  tags: Tag[];
  selectedTagIds: string[];
  onSelectedTagIdsChange: (ids: string[]) => void;
  tagMatch: "any" | "all";
  onTagMatchChange: (m: "any" | "all") => void;
  excludeTagIds: string[];
  onExcludeTagIdsChange: (ids: string[]) => void;
  csvContactIds: string[];
  onCsvContactIdsChange: (ids: string[]) => void;
  previewCount: number | null;
  previewLoading: boolean;
};

export function buildAudienceFilter(props: {
  mode: AudienceMode;
  selectedTagIds: string[];
  tagMatch: "any" | "all";
  excludeTagIds: string[];
  csvContactIds: string[];
}): BroadcastAudienceFilter | null {
  if (props.mode === "all") return { mode: "all" };
  if (props.mode === "csv") {
    if (props.csvContactIds.length === 0) return null;
    return { mode: "contacts", contact_ids: props.csvContactIds };
  }
  if (props.selectedTagIds.length === 0) return null;
  return {
    mode: "tags",
    tag_ids: props.selectedTagIds,
    tag_match: props.tagMatch,
    ...(props.excludeTagIds.length
      ? { exclude_tag_ids: props.excludeTagIds }
      : {}),
  };
}

export function CampaignAudienceFields({
  mode,
  onModeChange,
  tags,
  selectedTagIds,
  onSelectedTagIdsChange,
  tagMatch,
  onTagMatchChange,
  excludeTagIds,
  onExcludeTagIdsChange,
  csvContactIds,
  onCsvContactIdsChange,
  previewCount,
  previewLoading,
}: Props) {
  const { accountId, canEditSettings } = useAuth();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileLabel, setFileLabel] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !accountId) return;
    setUploading(true);
    setFileLabel(file.name);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const text = await file.text();
      const { rows } = parseContactCsv(text);
      if (rows.length === 0) {
        toast.error("No valid rows (need a phone column)");
        onCsvContactIdsChange([]);
        return;
      }

      const result = await resolveContactIdsFromCsvRows(supabase, {
        accountId,
        userId: user.id,
        rows,
        canCreateTags: canEditSettings,
      });
      onCsvContactIdsChange(result.contactIds);
      toast.success(
        `Audience ready: ${result.contactIds.length} contacts (${result.created} new, ${result.matched} matched)`,
      );
      if (result.failed > 0) {
        toast.warning(`${result.failed} rows failed`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "CSV upload failed");
      onCsvContactIdsChange([]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <Label>Audience</Label>
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="audience-mode"
            checked={mode === "all"}
            onChange={() => onModeChange("all")}
          />
          All customers
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="audience-mode"
            checked={mode === "tags"}
            onChange={() => onModeChange("tags")}
          />
          By tags
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="audience-mode"
            checked={mode === "csv"}
            onChange={() => onModeChange("csv")}
          />
          Upload CSV
        </label>
      </div>

      {mode === "tags" ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="flex flex-wrap gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="tag-match"
                checked={tagMatch === "any"}
                onChange={() => onTagMatchChange("any")}
              />
              Match any tag
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="tag-match"
                checked={tagMatch === "all"}
                onChange={() => onTagMatchChange("all")}
              />
              Match all tags
            </label>
          </div>

          {tags.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Create tags on Customers first, then assign them to contacts.
            </p>
          ) : (
            <>
              <p className="text-xs font-medium text-muted-foreground">
                Include tags
              </p>
              <ul className="max-h-40 space-y-2 overflow-y-auto">
                {tags.map((tag) => {
                  const checked = selectedTagIds.includes(tag.id);
                  return (
                    <li key={tag.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`inc-${tag.id}`}
                        checked={checked}
                        onCheckedChange={(v) => {
                          onSelectedTagIdsChange(
                            v
                              ? [...selectedTagIds, tag.id]
                              : selectedTagIds.filter((id) => id !== tag.id),
                          );
                        }}
                      />
                      <label htmlFor={`inc-${tag.id}`} className="text-sm">
                        {tag.name}
                      </label>
                    </li>
                  );
                })}
              </ul>

              <p className="text-xs font-medium text-muted-foreground">
                Exclude tags (optional)
              </p>
              <ul className="max-h-32 space-y-2 overflow-y-auto">
                {tags.map((tag) => {
                  const checked = excludeTagIds.includes(tag.id);
                  return (
                    <li key={`ex-${tag.id}`} className="flex items-center gap-2">
                      <Checkbox
                        id={`ex-${tag.id}`}
                        checked={checked}
                        onCheckedChange={(v) => {
                          onExcludeTagIdsChange(
                            v
                              ? [...excludeTagIds, tag.id]
                              : excludeTagIds.filter((id) => id !== tag.id),
                          );
                        }}
                      />
                      <label htmlFor={`ex-${tag.id}`} className="text-sm">
                        {tag.name}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      ) : null}

      {mode === "csv" ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">
            Columns: <code>phone</code> (required), optional{" "}
            <code>name,email,company,tags</code>. Existing phones are matched;
            new contacts are created.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => void onFile(e)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading || !accountId}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {fileLabel ? "Replace CSV" : "Choose CSV"}
          </Button>
          {fileLabel ? (
            <p className="text-xs text-muted-foreground">
              {fileLabel} · {csvContactIds.length} contact
              {csvContactIds.length === 1 ? "" : "s"} loaded
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="text-sm tabular-nums text-muted-foreground">
        {previewLoading
          ? "Counting recipients…"
          : previewCount === null
            ? "Select an audience to preview count"
            : `${previewCount} recipient${previewCount === 1 ? "" : "s"} (valid phones)`}
      </p>
    </div>
  );
}
