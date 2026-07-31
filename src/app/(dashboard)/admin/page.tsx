'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Shield } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';

type AdminUser = {
  userId: string;
  email: string;
  fullName: string | null;
  accountId: string | null;
  joinedAt: string | null;
  accessStatus: string;
  decidedAt: string | null;
};

export default function AdminPage() {
  const router = useRouter();
  const { isPlatformAdmin, loading: authLoading, user } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/users', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? 'Could not load users');
      setUsers([]);
      return;
    }
    setUsers(body.users ?? []);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isPlatformAdmin) {
      router.replace('/home');
      return;
    }
    void load();
  }, [authLoading, isPlatformAdmin, router, load]);

  async function setGrant(userId: string, action: 'approve' | 'revoke') {
    setBusyId(userId);
    try {
      const res = await fetch('/api/admin/grants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed');
      toast.success(action === 'approve' ? 'Access approved' : 'Access revoked');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || !isPlatformAdmin) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Access admin
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Approve or revoke Google users. Approved users get their own
            independent dashboard.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users === null && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                </td>
              </tr>
            )}
            {users?.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  No users yet
                </td>
              </tr>
            )}
            {users?.map((u) => {
              const isSelf = u.userId === user?.id;
              const busy = busyId === u.userId;
              return (
                <tr
                  key={u.userId}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {u.fullName || u.email || 'User'}
                    </p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.accessStatus === 'approved'
                          ? 'rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400'
                          : u.accessStatus === 'revoked'
                            ? 'rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400'
                            : 'rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-400'
                      }
                    >
                      {u.accessStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {u.accessStatus !== 'approved' && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void setGrant(u.userId, 'approve')}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            'Approve'
                          )}
                        </Button>
                      )}
                      {u.accessStatus === 'approved' && !isSelf && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void setGrant(u.userId, 'revoke')}
                        >
                          Revoke
                        </Button>
                      )}
                      {isSelf && (
                        <span className="text-xs text-muted-foreground">You</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
