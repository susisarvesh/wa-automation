'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Webhook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsPanelHead } from '@/components/settings/settings-panel-head';

type Endpoint = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
};

export function WebhooksPanel() {
  const [loading, setLoading] = useState(true);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [url, setUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [secretOnce, setSecretOnce] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/webhooks', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load');
      setEndpoints(body.endpoints ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setCreating(true);
    setSecretOnce(null);
    try {
      const res = await fetch('/api/settings/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          events: ['message.status_updated', 'message.received'],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Create failed');
      setSecretOnce(body.secret ?? null);
      setUrl('');
      toast.success('Webhook endpoint created — copy the secret now');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/settings/webhooks/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Delete failed');
      return;
    }
    toast.success('Endpoint removed');
    await load();
  }

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Outbound webhooks"
        description="Push message delivery status to CRM (signed with HMAC)."
      />

      <div className="space-y-3 rounded-xl border border-border p-4">
        <Label htmlFor="wh-url">HTTPS endpoint URL</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="wh-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.vsmarttec.net/webhooks/wa-studio"
            className="min-w-[240px] flex-1"
          />
          <Button
            type="button"
            disabled={creating || !url.trim()}
            onClick={() => void create()}
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </Button>
        </div>
        {secretOnce ? (
          <p className="rounded-md bg-muted p-3 text-xs break-all">
            Signing secret (shown once): <code>{secretOnce}</code>
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Verify with header <code>X-Wacrm-Signature</code> = HMAC-SHA256 of{' '}
          <code>timestamp.body</code> using the secret. Timestamp in{' '}
          <code>X-Wacrm-Timestamp</code>.
        </p>
      </div>

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : endpoints.length === 0 ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Webhook className="h-4 w-4" /> No endpoints yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {endpoints.map((ep) => (
            <li
              key={ep.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{ep.url}</p>
                <p className="text-xs text-muted-foreground">
                  {(ep.events ?? []).join(', ')} · {ep.active ? 'active' : 'off'}
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => void remove(ep.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
