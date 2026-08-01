'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { humanizeMetaError } from '@/lib/whatsapp/meta-errors';
import { AccessLockedPanel } from '@/components/auth/access-locked';
import { MultiNumbersPanel } from '@/components/connect/multi-numbers-panel';

type Step = 1 | 2 | 3;

type PhoneInfo = {
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  id?: string;
};

type LiveStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'live'; phone: PhoneInfo }
  | { state: 'offline'; message: string };

export default function ConnectPage() {
  const { accountId, loading: authLoading, isAccessApproved } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [alreadyConnected, setAlreadyConnected] = useState(false);
  const [live, setLive] = useState<LiveStatus>({ state: 'idle' });

  const [businessNumber, setBusinessNumber] = useState('');
  const [businessAccount, setBusinessAccount] = useState('');
  const [connectionCode, setConnectionCode] = useState('');
  const [verifyPhrase, setVerifyPhrase] = useState('');
  const [pin, setPin] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [lastTestOk, setLastTestOk] = useState<string | null>(null);

  const webhookUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/api/whatsapp/webhook`;
  }, []);

  const testMetaLive = useCallback(async () => {
    setLive({ state: 'checking' });
    try {
      const res = await fetch('/api/whatsapp/config', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));

      if (body.configured || body.phone_number_id) {
        setAlreadyConnected(true);
        setStep(3);
        if (body.phone_number_id) {
          setBusinessNumber(String(body.phone_number_id));
        }
        if (body.waba_id) setBusinessAccount(String(body.waba_id));
      }

      if (body.live && body.phone_info) {
        setLive({ state: 'live', phone: body.phone_info as PhoneInfo });
        return true;
      }

      // Saved credentials stay linked even if Meta health check fails.
      if (body.configured || body.connected) {
        const detail =
          typeof body.detail === 'string' && body.detail
            ? ` (${body.detail.slice(0, 160)})`
            : '';
        setLive({
          state: 'offline',
          message:
            humanizeMetaError(
              body.message ??
                'Meta health check failed. Your saved connection is still stored — you do not need to re-enter keys unless you Disconnect.',
            ) + detail,
        });
        return false;
      }

      setLive({
        state: 'offline',
        message: humanizeMetaError(
          body.message ?? 'Meta did not accept the saved credentials.',
        ),
      });
      return false;
    } catch {
      setLive({
        state: 'offline',
        message: 'Could not reach the server to verify Meta.',
      });
      return false;
    }
  }, []);

  async function sendTestMessage() {
    if (!testTo.trim()) {
      toast.error('Enter a recipient phone in international format (+91…)');
      return;
    }
    setTestSending(true);
    setLastTestOk(null);
    try {
      const res = await fetch('/api/whatsapp/test-send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: testTo.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          humanizeMetaError(body.error ?? 'Could not send test message'),
        );
      }
      setLastTestOk(body.message_id as string);
      toast.success(
        body.kind === 'template'
          ? 'hello_world template sent — check WhatsApp'
          : 'Test message sent via Meta — check the phone',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setTestSending(false);
    }
  }

  const load = useCallback(
    async (acctId: string) => {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('whatsapp_config')
          .select('phone_number_id, waba_id, status')
          .eq('account_id', acctId)
          .order('is_primary', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (data?.phone_number_id) {
          setBusinessNumber(data.phone_number_id);
          setBusinessAccount(data.waba_id ?? '');
          setVerifyPhrase('');
          setConnectionCode('');
          setAlreadyConnected(true);
          setStep(3);
          // Don't block the page on Meta Graph — show Connected, then health-check.
          void testMetaLive();
        } else {
          setAlreadyConnected(false);
          setStep(1);
        }
      } finally {
        setLoading(false);
      }
    },
    [testMetaLive],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!accountId) {
      setLoading(false);
      return;
    }
    void load(accountId);
  }, [accountId, authLoading, load]);

  async function saveAndConnect() {
    if (!accountId) return;
    if (!businessNumber.trim() || !connectionCode.trim() || !verifyPhrase.trim()) {
      toast.error('Please fill in Business number ID, Connection code, and Secret phrase');
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
          pin: pin.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error(
            body.error ??
              'Your account role cannot save WhatsApp settings. Sign out and sign back in as the business owner, then try again.',
          );
        }
        throw new Error(body.error ?? 'Could not connect to Meta');
      }

      setConnectionCode('');
      setVerifyPhrase('');
      setPin('');
      setAlreadyConnected(true);
      setStep(3);

      const ok = await testMetaLive();
      if (ok) {
        toast.success(
          body.phone_info?.verified_name
            ? `Connected — stays linked until you Disconnect (${body.phone_info.verified_name})`
            : 'Connected — credentials saved. You won’t need to paste keys again.',
        );
      } else if (body.saved) {
        toast.warning(
          body.registration_error
            ? `Saved, but Meta registration needs attention: ${body.registration_error}`
            : 'Credentials saved. Meta health check failed — use a permanent System User token if this persists.',
        );
      }
    } catch (err) {
      toast.error(
        humanizeMetaError(
          err instanceof Error ? err.message : 'Could not connect',
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (
      !confirm(
        'Disconnect WhatsApp for this workspace? Automations and campaigns will stop sending until you connect again.',
      )
    ) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await fetch('/api/whatsapp/config', { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? 'Could not disconnect');
      }
      setAlreadyConnected(false);
      setBusinessNumber('');
      setBusinessAccount('');
      setConnectionCode('');
      setVerifyPhrase('');
      setPin('');
      setLive({ state: 'idle' });
      setStep(1);
      toast.success('WhatsApp disconnected');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setDisconnecting(false);
    }
  }

  async function copyWebhook() {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied');
  }

  if (loading || authLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAccessApproved) {
    return (
      <AccessLockedPanel
        title="Connect is locked"
        description="Ask the admin to approve your access before linking a WhatsApp Business number."
      />
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-8 pb-10">
      <div className="space-y-2 text-center">
        <div className="vsmart-shape mx-auto flex h-12 w-12 items-center justify-center bg-primary text-primary-foreground">
          <MessageSquare className="h-6 w-6" />
        </div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Connect WhatsApp
        </h1>
        <p className="text-muted-foreground">
          Connect once with a permanent System User token. It stays linked until
          you Disconnect — no daily key paste.
        </p>
      </div>

      {!alreadyConnected && (
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
      )}

      {step === 1 && !alreadyConnected && (
        <Card className="vsmart-shape border-border shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading">Ready to connect Meta?</CardTitle>
            <CardDescription>
              Use a WhatsApp Cloud API phone number ID, a{' '}
              <span className="font-medium text-foreground">
                permanent System User access token
              </span>{' '}
              (not the 24-hour temp token from API Setup), and a verify token for
              the webhook.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 rounded-xl bg-muted/60 p-3 text-sm">
              <p className="font-medium text-foreground">Webhook URL (Meta → App)</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg bg-card px-2 py-1.5 text-xs">
                  {webhookUrl || '/api/whatsapp/webhook'}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={copyWebhook}
                  className="shrink-0"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste this in Meta Developer → WhatsApp → Configuration →
                Callback URL. Use the same secret phrase as Verify token.
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-primary/5 p-4 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Credentials are encrypted at rest and reused for every send. You
              only reconnect if you Disconnect or rotate the Meta token.
            </div>
            <Button
              size="lg"
              className="w-full rounded-xl"
              onClick={() => setStep(2)}
            >
              Enter Meta credentials
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="vsmart-shape border-border shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading">
              {alreadyConnected ? 'Update credentials' : 'Meta Cloud API details'}
            </CardTitle>
            <CardDescription>
              From Meta Business Settings → System users → Generate token
              (whatsapp_business_messaging + whatsapp_business_management).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="business-number">Phone number ID</Label>
              <Input
                id="business-number"
                value={businessNumber}
                onChange={(e) => setBusinessNumber(e.target.value)}
                placeholder="e.g. 109876543210987"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="business-account">WhatsApp Business Account ID</Label>
              <Input
                id="business-account"
                value={businessAccount}
                onChange={(e) => setBusinessAccount(e.target.value)}
                placeholder="WABA ID (recommended)"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="connection-code">Access token</Label>
              <Input
                id="connection-code"
                type="password"
                value={connectionCode}
                onChange={(e) => setConnectionCode(e.target.value)}
                placeholder="Permanent system user token"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="verify-phrase">Webhook verify token</Label>
              <Input
                id="verify-phrase"
                value={verifyPhrase}
                onChange={(e) => setVerifyPhrase(e.target.value)}
                placeholder="Any secret phrase you choose"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Must match the Verify Token you set in Meta for the webhook.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">2FA PIN (optional, 6 digits)</Label>
              <Input
                id="pin"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="For production number /register"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setStep(alreadyConnected ? 3 : 1)}
              >
                Back
              </Button>
              <Button
                className="flex-1 rounded-xl"
                onClick={saveAndConnect}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Verify with Meta &amp; save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && alreadyConnected && (
        <Card className="vsmart-shape border-primary/20 bg-gradient-to-br from-primary/10 via-card to-brand-orange-soft/40 shadow-sm">
          <CardHeader className="text-center">
            <div
              className={cn(
                'vsmart-shape mx-auto mb-2 flex h-14 w-14 items-center justify-center text-white',
                live.state === 'live' ? 'bg-brand-orange' : 'bg-muted-foreground',
              )}
            >
              {live.state === 'checking' ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : (
                <CheckCircle2 className="h-7 w-7" />
              )}
            </div>
            <CardTitle className="font-heading text-2xl">
              {live.state === 'live' ? 'Connected to Meta' : 'WhatsApp linked'}
            </CardTitle>
            <CardDescription className="text-base">
              {live.state === 'live' && (
                <>
                  <span className="font-medium text-foreground">
                    {live.phone.verified_name ?? 'WhatsApp Business'}
                  </span>
                  {live.phone.display_phone_number
                    ? ` · ${live.phone.display_phone_number}`
                    : null}
                  {live.phone.quality_rating
                    ? ` · Quality ${live.phone.quality_rating}`
                    : null}
                </>
              )}
              {live.state === 'offline' && (
                <>
                  Credentials are saved. Meta health check failed for now:{' '}
                  {live.message}
                  {live.message.toLowerCase().includes('rate-limited') ||
                  live.message.toLowerCase().includes('rate limit') ? (
                    <span className="mt-2 block text-foreground">
                      Wait 5–10 minutes with no more Save/PIN attempts, then
                      click Re-check credentials.
                    </span>
                  ) : null}
                </>
              )}
              {live.state === 'checking' && 'Checking Meta…'}
              {live.state === 'idle' &&
                'Saved connection stays active. No need to paste keys again.'}
            </CardDescription>
            {businessNumber ? (
              <p className="pt-1 text-xs text-muted-foreground">
                Phone number ID ·{' '}
                <code className="rounded bg-muted px-1">{businessNumber}</code>
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-xl border border-border bg-card/80 p-4 text-left">
              <div>
                <p className="font-heading text-sm font-semibold">
                  Send a test WhatsApp
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Sends Meta&apos;s <code className="rounded bg-muted px-1">hello_world</code>{' '}
                  template. Use international format, e.g.{' '}
                  <code className="rounded bg-muted px-1">+919790985447</code>.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="test-to">Recipient phone (E.164)</Label>
                <Input
                  id="test-to"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="+919790985447"
                  inputMode="tel"
                  autoComplete="tel"
                  className="rounded-xl"
                />
              </div>
              <Button
                size="lg"
                className="w-full rounded-xl"
                onClick={sendTestMessage}
                disabled={testSending}
              >
                {testSending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send test template
              </Button>
              {lastTestOk ? (
                <p className="text-xs text-muted-foreground">
                  Accepted by Meta · message id{' '}
                  <code className="rounded bg-muted px-1">{lastTestOk}</code>
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button
                variant="outline"
                size="lg"
                className="rounded-xl"
                onClick={() => testMetaLive()}
                disabled={live.state === 'checking'}
              >
                <RefreshCw
                  className={cn(
                    'mr-2 h-4 w-4',
                    live.state === 'checking' && 'animate-spin',
                  )}
                />
                Check status
              </Button>
              <Link
                href="/automations"
                className={cn(buttonVariants({ size: 'lg' }), 'rounded-xl')}
              >
                Browse automations
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl text-muted-foreground"
                onClick={() => setStep(2)}
              >
                Update credentials
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => void disconnect()}
                disabled={disconnecting}
              >
                {disconnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Unplug className="mr-2 h-4 w-4" />
                )}
                Disconnect
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {alreadyConnected && step === 3 ? <MultiNumbersPanel /> : null}
    </div>
  );
}
