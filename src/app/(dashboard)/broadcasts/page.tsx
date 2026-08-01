"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Megaphone, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  AccessLockedPanel,
  AccessWaitingBanner,
} from "@/components/auth/access-locked";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Broadcast, BroadcastStatus } from "@/types";

const STATUS_LABEL: Record<BroadcastStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
};

function statusClass(status: BroadcastStatus) {
  switch (status) {
    case "sent":
      return "bg-emerald-500/10 text-emerald-700";
    case "sending":
      return "bg-sky-500/10 text-sky-700";
    case "scheduled":
      return "bg-amber-500/10 text-amber-800";
    case "failed":
    case "cancelled":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function BroadcastsPage() {
  const router = useRouter();
  const { isAccessApproved, loading: authLoading } = useAuth();
  const [broadcasts, setBroadcasts] = useState<Broadcast[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/broadcasts", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error || "Failed to load campaigns");
      setBroadcasts([]);
      return;
    }
    setBroadcasts((body.broadcasts ?? []) as Broadcast[]);
  }, []);

  useEffect(() => {
    if (!authLoading && isAccessApproved) void load();
  }, [authLoading, isAccessApproved, load]);

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
          description="Ask an admin to approve your access before sending broadcast campaigns."
        />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Campaigns
          </h1>
          <p className="text-sm text-muted-foreground">
            Send approved WhatsApp templates to contacts by tag.
          </p>
        </div>
        <Link
          href="/broadcasts/new"
          className={cn(buttonVariants({ size: "sm" }), "shrink-0 gap-1.5")}
        >
          <Plus className="h-4 w-4" />
          New
        </Link>
      </div>

      {broadcasts === null ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : broadcasts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Megaphone className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No campaigns yet.</p>
          <Button size="sm" onClick={() => router.push("/broadcasts/new")}>
            Create campaign
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {broadcasts.map((b) => (
            <li key={b.id}>
              <Link
                href={`/broadcasts/${b.id}`}
                className="flex items-center justify-between gap-3 py-4 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium">{b.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {b.template_name} · {b.template_language}
                    {b.total_recipients
                      ? ` · ${b.total_recipients} recipients`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-medium",
                      statusClass(b.status),
                    )}
                  >
                    {STATUS_LABEL[b.status]}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {b.sent_count}/{b.total_recipients || 0} sent
                    {b.failed_count ? ` · ${b.failed_count} failed` : ""}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
