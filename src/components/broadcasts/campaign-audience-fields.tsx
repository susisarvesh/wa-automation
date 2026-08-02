"use client";

import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { Tag } from "@/types";
import type { BroadcastAudienceFilter } from "@/lib/broadcasts/audience";

export type AudienceMode = "all" | "tags";

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
  previewCount: number | null;
  previewLoading: boolean;
};

export function buildAudienceFilter(props: {
  mode: AudienceMode;
  selectedTagIds: string[];
  tagMatch: "any" | "all";
  excludeTagIds: string[];
}): BroadcastAudienceFilter | null {
  if (props.mode === "all") return { mode: "all" };
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
  previewCount,
  previewLoading,
}: Props) {
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
