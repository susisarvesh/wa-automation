'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Step = 1 | 2 | 3;

export default function ConnectPage() {
  const { accountId, loading: authLoading, profileLoading } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alreadyConnected, setAlreadyConnected] = useState(false);

  const [businessNumber, setBusinessNumber] = useState('');
  const [businessAccount, setBusinessAccount] = useState('');
  const [connectionCode, setConnectionCode] = useState('');
  const [verifyPhrase, setVerifyPhrase] = useState('');

  const load = useCallback(async (acctId: string) => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id, waba_id, verify_token')
      .eq('account_id', acctId)
      .maybeSingle();
    if (data?.phone_number_id) {
      setBusinessNumber(data.phone_number_id);
      setBusinessAccount(data.waba_id ?? '');
      setVerifyPhrase(data.verify_token ?? '');
      setAlreadyConnected(true);
      setStep(3);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading || profileLoading || !accountId) return;
    load(accountId);
  }, [accountId, authLoading, profileLoading, load]);

  async function saveAndConnect() {
    if (!accountId) return;
    if (!businessNumber.trim() || !connectionCode.trim() || !verifyPhrase.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          phone_number_id: businessNumber.trim(),
          waba_id: businessAccount.trim() || undefined,
          access_token: connectionCode.trim(),
          verify_token: verifyPhrase.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? 'Could not connect');
      }
      setAlreadyConnected(true);
      setStep(3);
      toast.success('WhatsApp connected');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not connect');
    } finally {
      setSaving(false);
    }
  }

  if (loading || authLoading || profileLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <MessageSquare className="h-6 w-6" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Connect WhatsApp</h1>
        <p className="text-muted-foreground">
          Three simple steps. You only need the details from your WhatsApp Business account.
        </p>
      </div>

      <ol className="flex items-center justify-center gap-2">
        {[1, 2, 3].map((n) => (
          <li key={n} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
                step >= n
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {step > n ? <CheckCircle2 className="h-4 w-4" /> : n}
            </span>
            {n < 3 && <span className="h-px w-8 bg-border" />}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Card className="rounded-3xl border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Ready to connect?</CardTitle>
            <CardDescription>
              We will link your WhatsApp Business number so automations can reply for you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl bg-primary/5 p-4 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Your connection details stay private to this workspace.
            </div>
            <Button size="lg" className="w-full rounded-xl" onClick={() => setStep(2)}>
              Connect WhatsApp
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="rounded-3xl border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Enter your business details</CardTitle>
            <CardDescription>
              Paste the values from your WhatsApp Business setup. We use plain language — no jargon.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="business-number">Business number ID</Label>
              <Input
                id="business-number"
                value={businessNumber}
                onChange={(e) => setBusinessNumber(e.target.value)}
                placeholder="Your WhatsApp business number ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="business-account">Business account ID (optional)</Label>
              <Input
                id="business-account"
                value={businessAccount}
                onChange={(e) => setBusinessAccount(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="connection-code">Connection code</Label>
              <Input
                id="connection-code"
                type="password"
                value={connectionCode}
                onChange={(e) => setConnectionCode(e.target.value)}
                placeholder="Your private connection code"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="verify-phrase">Secret phrase</Label>
              <Input
                id="verify-phrase"
                value={verifyPhrase}
                onChange={(e) => setVerifyPhrase(e.target.value)}
                placeholder="A secret phrase you choose"
              />
              <p className="text-xs text-muted-foreground">
                Pick any phrase — you will use the same one when confirming the connection.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                className="flex-1 rounded-xl"
                onClick={saveAndConnect}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Finish connecting
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card className="rounded-3xl border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <CardTitle className="text-2xl">
              {alreadyConnected ? "You're connected" : 'Connected'}
            </CardTitle>
            <CardDescription className="text-base">
              WhatsApp is ready. Pick an automation and go live.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              href="/automations"
              className={cn(buttonVariants({ size: 'lg' }), 'rounded-xl')}
            >
              Browse automations
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Button
              variant="outline"
              size="lg"
              className="rounded-xl"
              onClick={() => setStep(2)}
            >
              Update connection
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
