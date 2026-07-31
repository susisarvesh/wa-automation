'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  Save,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WhatsAppPreview } from '@/components/automations/whatsapp-preview';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import type { Automation } from '@/types';

type StepRow = {
  id?: string;
  step_type: string;
  step_config: Record<string, unknown>;
  position?: number;
  branches?: { yes?: StepRow[]; no?: StepRow[] };
};

function readFirstMessage(steps: StepRow[]): string {
  for (const s of steps) {
    if (
      s.step_type === 'send_message' &&
      typeof s.step_config?.text === 'string'
    ) {
      return s.step_config.text;
    }
    const fromYes = s.branches?.yes ? readFirstMessage(s.branches.yes) : '';
    if (fromYes) return fromYes;
    const fromNo = s.branches?.no ? readFirstMessage(s.branches.no) : '';
    if (fromNo) return fromNo;
  }
  return '';
}

function updateFirstMessage(steps: StepRow[], text: string): StepRow[] {
  const clone = structuredClone(steps) as StepRow[];
  const walk = (list: StepRow[]): boolean => {
    for (const s of list) {
      if (s.step_type === 'send_message') {
        s.step_config = { ...s.step_config, text };
        return true;
      }
      if (s.branches?.yes && walk(s.branches.yes)) return true;
      if (s.branches?.no && walk(s.branches.no)) return true;
    }
    return false;
  };
  walk(clone);
  return clone;
}

export default function ManageAutomationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { account } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [name, setName] = useState('');
  const [messageText, setMessageText] = useState('');
  const [runs, setRuns] = useState<
    Array<{
      id: string;
      status: string;
      created_at: string;
      contact_name: string | null;
      inbox_href: string | null;
    }>
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/automations/${id}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Not found');
      const a = body.automation as Automation;
      const st = (body.steps ?? []) as StepRow[];
      setAutomation(a);
      setSteps(st);
      setName(a.name);
      setMessageText(readFirstMessage(st));

      const runsRes = await fetch(`/api/automations/${id}/runs`, {
        cache: 'no-store',
      });
      const runsBody = await runsRes.json().catch(() => ({}));
      if (runsRes.ok) setRuns(runsBody.runs ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load');
      router.push('/automations');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  const previewText = useMemo(() => messageText, [messageText]);

  async function save() {
    if (!automation) return;
    setSaving(true);
    try {
      const nextSteps = updateFirstMessage(steps, messageText);
      const res = await fetch(`/api/automations/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || automation.name,
          steps: nextSteps,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Save failed');
      toast.success('Saved');
      setSteps(nextSteps);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function setActive(next: boolean) {
    if (!automation) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/automations/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ is_active: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Could not update');
      setAutomation({ ...automation, is_active: next });
      toast.success(next ? 'Automation is live' : 'Automation paused');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update');
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    setSaving(true);
    try {
      const res = await fetch(`/api/automations/${id}/duplicate`, {
        method: 'POST',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Duplicate failed');
      toast.success('Paused copy created');
      router.push(`/automations/${body.automation.id}/manage`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Duplicate failed');
      setSaving(false);
    }
  }

  if (loading || !automation) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => router.push('/automations')}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Automations
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {automation.is_active ? 'Live' : 'Paused'}
          </p>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Manage automation
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit the WhatsApp message customers receive — no flowchart builder.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={saving}
            onClick={() => setActive(!automation.is_active)}
          >
            {automation.is_active ? (
              <>
                <Pause className="mr-2 h-4 w-4" /> Pause
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" /> Go live
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={saving}
            onClick={duplicate}
          >
            <Copy className="mr-2 h-4 w-4" /> Duplicate
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="vsmart-shape space-y-4 border border-border bg-card p-5 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="msg">WhatsApp message</Label>
            <Textarea
              id="msg"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={6}
              className="rounded-xl"
              placeholder="Message text sent via Meta Cloud API"
            />
            <p className="text-xs text-muted-foreground">
              This is the exact text Meta will send when the automation fires.
            </p>
          </div>
          <Button
            className="w-full rounded-xl"
            onClick={save}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save changes
          </Button>
          <Link
            href={`/automations/${id}/logs`}
            className={cn(buttonVariants({ variant: 'link' }), 'px-0')}
          >
            View run history
          </Link>
        </div>

        <WhatsAppPreview
          text={previewText}
          businessName={account?.name ?? 'Your business'}
        />
      </div>

      <div className="vsmart-shape space-y-3 border border-border bg-card p-5 shadow-sm">
        <div>
          <h2 className="font-heading text-lg font-semibold">Recent runs</h2>
          <p className="text-sm text-muted-foreground">
            Jump from a log into the inbox conversation that fired.
          </p>
        </div>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No runs yet — once Meta delivers a message, they show up here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {runs.map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {run.contact_name ?? 'Unknown contact'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(run.created_at).toLocaleString()} · {run.status}
                  </p>
                </div>
                {run.inbox_href ? (
                  <Link
                    href={run.inbox_href}
                    className={cn(
                      buttonVariants({ variant: 'outline', size: 'sm' }),
                      'rounded-xl',
                    )}
                  >
                    Open inbox
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No conversation yet
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
