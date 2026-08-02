"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type WaNumber = {
  id: string;
  phone_number_id: string;
  waba_id: string | null;
  status: string;
  label: string | null;
  is_primary: boolean;
  registered_at: string | null;
  connected_at: string | null;
};

type MetaAvailable = {
  phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  already_linked: boolean;
};

export function MultiNumbersPanel() {
  const [numbers, setNumbers] = useState<WaNumber[] | null>(null);
  const [available, setAvailable] = useState<MetaAvailable[] | null>(null);
  const [availableError, setAvailableError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualPhoneId, setManualPhoneId] = useState("");
  const [manualLabel, setManualLabel] = useState("");

  const loadLinked = useCallback(async () => {
    const numRes = await fetch("/api/whatsapp/numbers", { cache: "no-store" });
    const numBody = await numRes.json().catch(() => ({}));
    if (numRes.ok) {
      setNumbers((numBody.numbers ?? []) as WaNumber[]);
    } else {
      toast.error(numBody.error || "Could not load WhatsApp numbers");
      setNumbers([]);
    }
  }, []);

  const loadAvailable = useCallback(async () => {
    setLoadingMeta(true);
    setAvailableError(null);
    try {
      const res = await fetch("/api/whatsapp/numbers/available", {
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAvailable([]);
        setAvailableError(body.error || "Could not load numbers from Meta");
        return;
      }
      setAvailable((body.numbers ?? []) as MetaAvailable[]);
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  useEffect(() => {
    void loadLinked();
    void loadAvailable();
  }, [loadLinked, loadAvailable]);

  async function addFromMeta(n: MetaAvailable) {
    setAddingId(n.phone_number_id);
    try {
      const label =
        n.verified_name ||
        n.display_phone_number ||
        undefined;
      const res = await fetch("/api/whatsapp/numbers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone_number_id: n.phone_number_id,
          label,
          pin: pin.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not add number");
        return;
      }
      if (body.registration_error) {
        toast.warning(
          `Added — Meta registration may need a PIN: ${body.registration_error}`,
        );
      } else {
        toast.success(
          label ? `Added ${label}` : "Number added to this workspace",
        );
      }
      await Promise.all([loadLinked(), loadAvailable()]);
    } finally {
      setAddingId(null);
    }
  }

  async function addManual() {
    if (!manualPhoneId.trim()) {
      toast.error("Phone number ID is required");
      return;
    }
    setAddingId("manual");
    try {
      const res = await fetch("/api/whatsapp/numbers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone_number_id: manualPhoneId.trim(),
          label: manualLabel.trim() || undefined,
          pin: pin.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not add number");
        return;
      }
      toast.success("Number added");
      setManualPhoneId("");
      setManualLabel("");
      setShowManual(false);
      await Promise.all([loadLinked(), loadAvailable()]);
    } finally {
      setAddingId(null);
    }
  }

  async function setPrimary(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/whatsapp/numbers/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_primary: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not set primary");
        return;
      }
      toast.success("Primary number updated");
      await loadLinked();
    } finally {
      setBusyId(null);
    }
  }

  async function removeNumber(id: string) {
    if (!confirm("Remove this Meta phone number from the workspace?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/whatsapp/numbers/${id}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not remove number");
        return;
      }
      toast.success("Number removed");
      await Promise.all([loadLinked(), loadAvailable()]);
    } finally {
      setBusyId(null);
    }
  }

  if (numbers === null) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const unlinked = (available ?? []).filter((n) => !n.already_linked);

  return (
    <Card className="vsmart-shape border-border shadow-sm">
      <CardHeader>
        <CardTitle className="font-heading text-lg">Company Meta numbers</CardTitle>
        <CardDescription>
          Pick a line from your WhatsApp Business Account — one click adds it.
          These are Cloud API numbers, not personal WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="space-y-3">
          {numbers.map((n) => (
            <li
              key={n.id}
              className="rounded-xl border border-border bg-card/80 p-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-foreground">
                    {n.label || "WhatsApp line"}
                    {n.is_primary ? (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-primary">
                        <Star className="h-3 w-3 fill-current" />
                        Primary
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {n.phone_number_id}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {!n.is_primary ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
                      disabled={busyId === n.id}
                      onClick={() => void setPrimary(n.id)}
                    >
                      Set primary
                    </Button>
                  ) : null}
                  {!n.is_primary ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="rounded-lg text-destructive"
                      disabled={busyId === n.id}
                      onClick={() => void removeNumber(n.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-heading text-sm font-semibold">
              Add from your Meta account
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-lg"
              disabled={loadingMeta}
              onClick={() => void loadAvailable()}
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${loadingMeta ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="add-pin" className="text-xs">
              2FA PIN for production lines (optional)
            </Label>
            <Input
              id="add-pin"
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="Only if Meta asks for two-step PIN"
              inputMode="numeric"
              autoComplete="off"
              className="rounded-xl"
            />
          </div>

          {loadingMeta && available === null ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : availableError ? (
            <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
              {availableError}
            </p>
          ) : unlinked.length === 0 ? (
            <div className="space-y-2 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
              <p>
                {(available ?? []).length === 0
                  ? "No phone numbers found on this WhatsApp Business Account yet."
                  : "Every Meta line on this account is already linked here."}
              </p>
              <p className="text-xs">
                To get another line: create it once in{" "}
                <a
                  href="https://business.facebook.com/latest/whatsapp_manager/phone_numbers"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  Meta WhatsApp Manager
                </a>
                , then tap Refresh — it will show up here to add in one click.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {unlinked.map((n) => (
                <li
                  key={n.phone_number_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {n.verified_name || "WhatsApp Business"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {n.display_phone_number || n.phone_number_id}
                      {n.quality_rating
                        ? ` · Quality ${n.quality_rating}`
                        : null}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl shrink-0"
                    disabled={addingId === n.phone_number_id}
                    onClick={() => void addFromMeta(n)}
                  >
                    {addingId === n.phone_number_id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowManual((v) => !v)}
          >
            {showManual ? "Hide manual ID entry" : "Add by Phone number ID instead"}
          </button>

          {showManual ? (
            <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
              <Input
                value={manualPhoneId}
                onChange={(e) => setManualPhoneId(e.target.value)}
                placeholder="Phone number ID"
                className="rounded-xl"
                autoComplete="off"
              />
              <Input
                value={manualLabel}
                onChange={(e) => setManualLabel(e.target.value)}
                placeholder="Label (optional)"
                className="rounded-xl"
                autoComplete="off"
              />
              <Button
                type="button"
                className="w-full rounded-xl"
                disabled={addingId === "manual"}
                onClick={() => void addManual()}
              >
                {addingId === "manual" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Add by ID
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
