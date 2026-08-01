"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  AccessLockedPanel,
  AccessWaitingBanner,
} from "@/components/auth/access-locked";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Employee } from "@/types";

type WizardStep = "confirm" | "otp";

export default function EmployeesPage() {
  const { isAccessApproved, loading: authLoading, canEditSettings } = useAuth();
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [businessNumber, setBusinessNumber] = useState<string | null>(null);
  const [companyConnected, setCompanyConnected] = useState(false);

  const [wizardEmp, setWizardEmp] = useState<Employee | null>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>("confirm");
  const [verifiedName, setVerifiedName] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [pin, setPin] = useState("");
  const [wizardBusy, setWizardBusy] = useState(false);
  const [displayHint, setDisplayHint] = useState<string | null>(null);

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

  const loadBusinessNumber = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/config", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      setCompanyConnected(Boolean(body.configured || body.phone_number_id));
      if (body.phone_info?.display_phone_number) {
        setBusinessNumber(String(body.phone_info.display_phone_number));
      } else if (body.phone_number_id) {
        setBusinessNumber(`Meta ID ${body.phone_number_id}`);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAccessApproved) {
      void load();
      void loadBusinessNumber();
    }
  }, [authLoading, isAccessApproved, load, loadBusinessNumber]);

  function openWizard(emp: Employee) {
    setWizardEmp(emp);
    setVerifiedName(emp.name);
    setOtpCode("");
    setPin("");
    setDisplayHint(null);
    setWizardStep(
      emp.whatsapp?.status === "pending_verification" ? "otp" : "confirm",
    );
  }

  function closeWizard() {
    setWizardEmp(null);
    setWizardBusy(false);
  }

  async function startWhatsApp() {
    if (!wizardEmp) return;
    setWizardBusy(true);
    try {
      const res = await fetch(
        `/api/employees/${wizardEmp.id}/whatsapp/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verified_name: verifiedName.trim() }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not start WhatsApp setup");
        if (body.tip) toast.message(body.tip, { duration: 7000 });
        return;
      }
      setDisplayHint(
        typeof body.display_hint === "string" ? body.display_hint : null,
      );
      setWizardStep("otp");
      toast.success(body.message || "SMS code sent");
      await load();
    } finally {
      setWizardBusy(false);
    }
  }

  async function resendCode() {
    if (!wizardEmp) return;
    setWizardBusy(true);
    try {
      const res = await fetch(
        `/api/employees/${wizardEmp.id}/whatsapp/resend-code`,
        { method: "POST" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not resend code");
        return;
      }
      toast.success(body.message || "Code resent");
    } finally {
      setWizardBusy(false);
    }
  }

  async function verifyWhatsApp() {
    if (!wizardEmp) return;
    setWizardBusy(true);
    try {
      const res = await fetch(
        `/api/employees/${wizardEmp.id}/whatsapp/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: otpCode.trim(), pin: pin.trim() }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Verification failed");
        return;
      }
      toast.success(body.message || "WhatsApp connected");
      if (body.how_to_test) toast.message(body.how_to_test, { duration: 8000 });
      if (body.display_phone_number) {
        setTestTo((prev) => prev || wizardEmp.phone);
      }
      closeWizard();
      await load();
    } finally {
      setWizardBusy(false);
    }
  }

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
      toast.success("Employee added — enable WhatsApp when ready");
      setName("");
      setPhone("");
      setEmail("");
      await load();
      if (body.employee) openWizard(body.employee as Employee);
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
      if (body.business_number) setBusinessNumber(String(body.business_number));
      toast.success(body.message || "Automations ready");
      if (body.how_to_test) toast.message(body.how_to_test, { duration: 8000 });
    } finally {
      setSetupBusy(false);
    }
  }

  async function runTest() {
    const to = testTo.trim() || employees?.[0]?.phone || "";
    if (!to) {
      toast.error("Enter a phone to receive the test reply");
      return;
    }
    setTestBusy(true);
    try {
      const res = await fetch("/api/employees/test-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Test failed");
        return;
      }
      toast.success(body.message || "Test sent — check WhatsApp");
    } finally {
      setTestBusy(false);
    }
  }

  function statusChip(emp: Employee) {
    const st = emp.whatsapp?.status;
    if (st === "connected") {
      return (
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          WhatsApp connected
        </span>
      );
    }
    if (st === "pending_verification") {
      return (
        <span className="rounded-md bg-brand-orange-soft px-2 py-0.5 text-xs font-medium text-brand-orange">
          Awaiting SMS code
        </span>
      );
    }
    return (
      <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        No WhatsApp line
      </span>
    );
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
            Add a teammate, then enable WhatsApp with an SMS code — no Meta
            Manager or Phone number ID paste.
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

      <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4 text-sm">
        <p className="font-medium text-foreground">WhatsApp for employees</p>
        <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
          <li>
            Connect your company WABA once on{" "}
            <Link href="/connect" className="underline underline-offset-2">
              Connect
            </Link>
            {businessNumber ? (
              <>
                {" "}
                (primary ·{" "}
                <span className="text-foreground">{businessNumber}</span>)
              </>
            ) : null}
            .
          </li>
          <li>
            Employee numbers must receive SMS and usually{" "}
            <span className="text-foreground">cannot</span> already be on
            personal WhatsApp.
          </li>
          <li>
            After OTP, customers message that business line; automations reply
            on it.
          </li>
        </ul>
        {canEditSettings ? (
          <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="test-to" className="text-xs">
                Send a test auto-reply to this phone
              </Label>
              <Input
                id="test-to"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="+919790985447"
                className="rounded-xl"
              />
            </div>
            <Button
              size="sm"
              className="rounded-xl"
              disabled={testBusy}
              onClick={() => void runTest()}
            >
              {testBusy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              Test auto-reply
            </Button>
          </div>
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
              <Label htmlFor="emp-phone">Phone (SMS-capable)</Label>
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
            No employees yet. Add a teammate to enable WhatsApp with SMS.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {employees.map((emp) => (
            <li
              key={emp.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{emp.name}</p>
                  {statusChip(emp)}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {emp.phone}
                  {emp.email ? ` · ${emp.email}` : ""}
                </p>
                {emp.whatsapp?.last_registration_error ? (
                  <p className="text-xs text-destructive">
                    {emp.whatsapp.last_registration_error.slice(0, 160)}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {canEditSettings ? (
                  <>
                    <Button
                      size="sm"
                      variant={
                        emp.whatsapp?.status === "connected"
                          ? "outline"
                          : "default"
                      }
                      className="rounded-lg gap-1.5"
                      disabled={!companyConnected || !emp.is_active}
                      onClick={() => openWizard(emp)}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      {emp.whatsapp?.status === "connected"
                        ? "WhatsApp"
                        : emp.whatsapp?.status === "pending_verification"
                          ? "Enter SMS code"
                          : "Enable WhatsApp"}
                    </Button>
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

      {!companyConnected && canEditSettings ? (
        <Link
          href="/connect"
          className={cn(buttonVariants({ variant: "link" }), "px-0")}
        >
          Connect company WhatsApp first →
        </Link>
      ) : null}

      <Dialog
        open={Boolean(wizardEmp)}
        onOpenChange={(open) => {
          if (!open) closeWizard();
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>
              {wizardStep === "confirm"
                ? `Enable WhatsApp for ${wizardEmp?.name ?? ""}`
                : "Enter SMS code"}
            </DialogTitle>
            <DialogDescription>
              {wizardStep === "confirm"
                ? "Meta will text a code to this number. It must receive SMS and usually cannot already be on personal WhatsApp."
                : `Code sent to ${wizardEmp?.phone ?? "the phone"}${
                    displayHint ? ` (${displayHint})` : ""
                  }. Choose a 6-digit PIN you will remember.`}
            </DialogDescription>
          </DialogHeader>

          {wizardStep === "confirm" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={wizardEmp?.phone ?? ""} disabled className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="verified-name">WhatsApp display name</Label>
                <Input
                  id="verified-name"
                  value={verifiedName}
                  onChange={(e) => setVerifiedName(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="otp">SMS verification code</Label>
                <Input
                  id="otp"
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="rounded-xl"
                  placeholder="123456"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pin">Two-step PIN (6 digits)</Label>
                <Input
                  id="pin"
                  value={pin}
                  onChange={(e) =>
                    setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  inputMode="numeric"
                  className="rounded-xl"
                  placeholder="Choose & save this PIN"
                />
                <p className="text-xs text-muted-foreground">
                  Meta requires this PIN to register the number for Cloud API.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {wizardStep === "otp" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={wizardBusy}
                onClick={() => void resendCode()}
              >
                Resend SMS
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={wizardBusy}
                onClick={closeWizard}
              >
                Cancel
              </Button>
              {wizardStep === "confirm" ? (
                <Button
                  type="button"
                  disabled={wizardBusy || !verifiedName.trim()}
                  onClick={() => void startWhatsApp()}
                >
                  {wizardBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Send SMS code
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={wizardBusy || otpCode.length < 4 || pin.length !== 6}
                  onClick={() => void verifyWhatsApp()}
                >
                  {wizardBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Verify &amp; activate
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
