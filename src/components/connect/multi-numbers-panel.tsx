"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Star, Trash2 } from "lucide-react";
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
import type { Employee } from "@/types";

type WaNumber = {
  id: string;
  phone_number_id: string;
  waba_id: string | null;
  status: string;
  label: string | null;
  employee_id: string | null;
  is_primary: boolean;
  registered_at: string | null;
  connected_at: string | null;
};

export function MultiNumbersPanel() {
  const [numbers, setNumbers] = useState<WaNumber[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [label, setLabel] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [numRes, empRes] = await Promise.all([
      fetch("/api/whatsapp/numbers", { cache: "no-store" }),
      fetch("/api/employees", { cache: "no-store" }),
    ]);
    const numBody = await numRes.json().catch(() => ({}));
    const empBody = await empRes.json().catch(() => ({}));
    if (numRes.ok) {
      setNumbers((numBody.numbers ?? []) as WaNumber[]);
    } else {
      toast.error(numBody.error || "Could not load WhatsApp numbers");
      setNumbers([]);
    }
    if (empRes.ok) {
      setEmployees((empBody.employees ?? []) as Employee[]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addNumber() {
    if (!phoneNumberId.trim()) {
      toast.error("Phone number ID is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/numbers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone_number_id: phoneNumberId.trim(),
          label: label.trim() || undefined,
          employee_id: employeeId || undefined,
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
          `Number saved, but Meta registration needs attention: ${body.registration_error}`,
        );
      } else {
        toast.success("Meta number added");
      }
      setPhoneNumberId("");
      setLabel("");
      setEmployeeId("");
      setPin("");
      await load();
    } finally {
      setSaving(false);
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
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function linkEmployee(id: string, nextEmployeeId: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/whatsapp/numbers/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employee_id: nextEmployeeId || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not update link");
        return;
      }
      await load();
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
      await load();
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

  return (
    <Card className="vsmart-shape border-border shadow-sm">
      <CardHeader>
        <CardTitle className="font-heading text-lg">Company Meta numbers</CardTitle>
        <CardDescription>
          Automations and inbox run on these Cloud API lines — not personal
          WhatsApp. Add each Phone number ID from the same WABA; the primary
          System User token is reused.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
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
                  <p className="text-xs text-muted-foreground">
                    Status · {n.status}
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
              <div className="mt-3 space-y-1">
                <Label className="text-xs">Link to employee (optional)</Label>
                <select
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                  value={n.employee_id ?? ""}
                  disabled={busyId === n.id}
                  onChange={(e) => void linkEmployee(n.id, e.target.value)}
                >
                  <option value="">None</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>

        <div className="space-y-3 border-t border-border pt-4">
          <p className="font-heading text-sm font-semibold">Add another Meta line</p>
          <p className="text-xs text-muted-foreground">
            In Meta WhatsApp Manager → Phone numbers → copy the Phone number ID
            for a Cloud API number already under your WABA.
          </p>
          <div className="space-y-2">
            <Label htmlFor="add-phone-id">Phone number ID</Label>
            <Input
              id="add-phone-id"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="e.g. 109876543210987"
              autoComplete="off"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-label">Label (optional)</Label>
            <Input
              id="add-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Sales, Support…"
              autoComplete="off"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-employee">Link employee (optional)</Label>
            <select
              id="add-employee"
              className="flex h-9 w-full rounded-xl border border-input bg-background px-2 text-sm"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">None</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-pin">2FA PIN (optional, 6 digits)</Label>
            <Input
              id="add-pin"
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="Production /register only"
              inputMode="numeric"
              autoComplete="off"
              className="rounded-xl"
            />
          </div>
          <Button
            type="button"
            className="w-full rounded-xl"
            disabled={saving}
            onClick={() => void addNumber()}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add Meta number
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
