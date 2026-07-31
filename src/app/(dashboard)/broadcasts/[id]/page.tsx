"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  AccessLockedPanel,
  AccessWaitingBanner,
} from "@/components/auth/access-locked";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Broadcast, BroadcastRecipient, BroadcastStatus } from "@/types";

type RecipientRow = BroadcastRecipient & {
  contact?: { id: string; name?: string; phone?: string } | null;
};

const STATUS_LABEL: Record<BroadcastStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
};

export default function BroadcastDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAccessApproved, loading: authLoading } = useAuth();
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/broadcasts/${id}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error || "Failed to load");
      setLoading(false);
      return;
    }
    setBroadcast(body.broadcast as Broadcast);
    setRecipients((body.recipients ?? []) as RecipientRow[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!authLoading && isAccessApproved) void load();
  }, [authLoading, isAccessApproved, load]);

  useEffect(() => {
    if (!broadcast || broadcast.status !== "sending") return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [broadcast, load]);

  async function send(mode: "now" | "schedule") {
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
      toast.success("Schedule cancelled");
      setBroadcast(body.broadcast);
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
        <Link href="/broadcasts" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Back
        </Link>
      </div>
    );
  }

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
            {broadcast.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {broadcast.template_name} · {broadcast.template_language} ·{" "}
            {STATUS_LABEL[broadcast.status]}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {broadcast.status === "draft" ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void remove()}
              >
                Delete
              </Button>
              {broadcast.scheduled_at ? (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void send("schedule")}
                >
                  Confirm schedule
                </Button>
              ) : null}
              <Button size="sm" disabled={busy} onClick={() => void send("now")}>
                Send now
              </Button>
            </>
          ) : null}
          {broadcast.status === "scheduled" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void cancel()}
            >
              Cancel schedule
            </Button>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Recipients", broadcast.total_recipients],
          ["Sent", broadcast.sent_count],
          ["Delivered", broadcast.delivered_count],
          ["Failed", broadcast.failed_count],
        ].map(([label, value]) => (
          <div key={String(label)} className="space-y-1 border-t border-border pt-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {broadcast.scheduled_at ? (
        <p className="text-sm text-muted-foreground">
          Scheduled for {new Date(broadcast.scheduled_at).toLocaleString()}
        </p>
      ) : null}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Recipients</h2>
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
      </div>
    </div>
  );
}
