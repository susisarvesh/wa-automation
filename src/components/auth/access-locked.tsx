"use client";

import { Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function AccessWaitingBanner() {
  const { isAccessApproved, loading, accessStatus } = useAuth();
  if (loading || isAccessApproved) return null;

  const revoked = accessStatus === "revoked";
  return (
    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
      <p className="font-medium">
        {revoked ? "Access revoked" : "Waiting for access"}
      </p>
      <p className="mt-1 text-muted-foreground">
        {revoked
          ? "An admin revoked your workspace access. You can still browse what’s available."
          : "You can browse what’s available. An admin must approve before you can connect WhatsApp or create automations."}
      </p>
    </div>
  );
}

export function AccessLockedPanel({
  title = "Access required",
  description = "Ask the platform admin to approve your account. Until then you can explore Home and the automation catalog.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
