"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  AccessLockedPanel,
  AccessWaitingBanner,
} from "@/components/auth/access-locked";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Employee } from "@/types";

export default function EmployeesPage() {
  const { isAccessApproved, loading: authLoading, canEditSettings } = useAuth();
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/employees", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error || "Failed to load employees");
      setEmployees([]);
      return;
    }
    setEmployees((body.employees ?? []) as Employee[]);
  }, []);

  useEffect(() => {
    if (!authLoading && isAccessApproved) void load();
  }, [authLoading, isAccessApproved, load]);

  async function addEmployee() {
    if (!name.trim() || !phone.trim()) {
      toast.error("Name and phone are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not add employee");
        return;
      }
      toast.success("Employee added");
      setName("");
      setPhone("");
      setEmail("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(emp: Employee, next: boolean) {
    const res = await fetch(`/api/employees/${emp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error || "Update failed");
      return;
    }
    setEmployees((prev) =>
      (prev ?? []).map((e) =>
        e.id === emp.id ? { ...e, is_active: next } : e,
      ),
    );
  }

  async function remove(emp: Employee) {
    if (!confirm(`Remove ${emp.name}?`)) return;
    const res = await fetch(`/api/employees/${emp.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error || "Delete failed");
      return;
    }
    toast.success("Removed");
    await load();
  }

  async function setupAutomations() {
    setSetupBusy(true);
    try {
      const res = await fetch("/api/employees/setup-automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Setup failed");
        return;
      }
      toast.success(body.message || "Automations ready");
    } finally {
      setSetupBusy(false);
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
          title="Employees are locked"
          description="Ask an admin to approve your access before managing the team directory."
        />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Employees
          </h1>
          <p className="text-sm text-muted-foreground">
            Staff directory for vSmart. Customers message your{" "}
            <span className="font-medium text-foreground">
              company WhatsApp number
            </span>
            ; automations reply with services/FAQ. Assign chats to employees in
            Inbox.
          </p>
        </div>
        {canEditSettings ? (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={setupBusy}
            onClick={() => void setupAutomations()}
          >
            {setupBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Setup services automations
          </Button>
        ) : null}
      </div>

      {canEditSettings ? (
        <div className="space-y-4 border-y border-border py-6">
          <h2 className="text-sm font-semibold">Add employee</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="emp-name">Name</Label>
              <Input
                id="emp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sarvesh"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-phone">Phone</Label>
              <Input
                id="emp-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+919790985447"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-email">Email (optional)</Label>
              <Input
                id="emp-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@vsmarttec.com"
              />
            </div>
          </div>
          <Button size="sm" disabled={saving} onClick={() => void addEmployee()}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add
          </Button>
        </div>
      ) : null}

      {employees === null ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            No employees yet. Add your team so Inbox can assign conversations.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {employees.map((emp) => (
            <li
              key={emp.id}
              className="flex items-center justify-between gap-3 py-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{emp.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {emp.phone}
                  {emp.email ? ` · ${emp.email}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {canEditSettings ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={emp.is_active}
                        onCheckedChange={(v) => void toggleActive(emp, !!v)}
                        aria-label={`Active ${emp.name}`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {emp.is_active ? "Active" : "Off"}
                      </span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => void remove(emp)}
                      aria-label={`Remove ${emp.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {emp.is_active ? "Active" : "Inactive"}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
