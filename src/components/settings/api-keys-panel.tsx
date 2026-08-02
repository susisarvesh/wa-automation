"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
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
import { SettingsPanelHead } from "@/components/settings/settings-panel-head";

type ApiKeyRow = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [name, setName] = useState("CRM integration");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/api-keys", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error || "Failed to load API keys");
      setKeys([]);
      return;
    }
    setKeys((body.keys ?? []) as ApiKeyRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createKey() {
    setCreating(true);
    setRevealedToken(null);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "API key",
          scopes: ["messages:send", "account:read"],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not create key");
        return;
      }
      setRevealedToken(body.token as string);
      toast.success("API key created — copy it now");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this API key? Integrations using it will stop working.")) {
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/settings/api-keys/${id}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Revoke failed");
        return;
      }
      toast.success("Key revoked");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function copyToken() {
    if (!revealedToken) return;
    try {
      await navigator.clipboard.writeText(revealedToken);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy — select and copy manually");
    }
  }

  const active = (keys ?? []).filter((k) => !k.revoked_at);
  const revoked = (keys ?? []).filter((k) => k.revoked_at);

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="API keys"
        description="Issue tokens so Vsmart CRM or your own software can send WhatsApp messages through this workspace."
      />

      <Card className="rounded-2xl border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="h-5 w-5" />
            Create key
          </CardTitle>
          <CardDescription>
            Scopes: <code className="text-xs">messages:send</code>,{" "}
            <code className="text-xs">account:read</code>. The secret is shown
            once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="CRM production"
            />
          </div>
          <Button disabled={creating} onClick={() => void createKey()}>
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Create API key
          </Button>

          {revealedToken ? (
            <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-xs font-medium text-foreground">
                Copy this token now — it will not be shown again.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="max-w-full flex-1 break-all rounded-md bg-background px-2 py-1.5 text-xs">
                  {revealedToken}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void copyToken()}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Base URL:{" "}
                <code className="text-[11px]">
                  https://wa-automation-one.vercel.app/api/v1
                </code>
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Active keys</CardTitle>
        </CardHeader>
        <CardContent>
          {keys === null ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : active.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active keys yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {active.map((k) => (
                <li
                  key={k.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{k.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {k.token_prefix}… · {k.scopes.join(", ")}
                      {k.last_used_at
                        ? ` · last used ${new Date(k.last_used_at).toLocaleString()}`
                        : " · never used"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={busyId === k.id}
                    onClick={() => void revoke(k.id)}
                  >
                    {busyId === k.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {revoked.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {revoked.length} revoked key{revoked.length === 1 ? "" : "s"} kept for
          audit history.
        </p>
      ) : null}
    </div>
  );
}
