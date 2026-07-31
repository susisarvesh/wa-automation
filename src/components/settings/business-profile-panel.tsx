'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function BusinessProfilePanel() {
  const { account, refreshProfile } = useAuth();
  const [name, setName] = useState(account?.name ?? 'My Business');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Could not save');
      }
      toast.success('Business name saved');
      await refreshProfile();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-2xl border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Business profile</CardTitle>
        <CardDescription>
          This name appears in your workspace. Keep it simple — your shop or brand.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="business-name">Business name</Label>
          <Input
            id="business-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Business"
            className="max-w-md"
          />
        </div>
        <Button onClick={save} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
