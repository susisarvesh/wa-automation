"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import type { AccountRole } from "@/lib/auth/roles";
import { getPublicSingleTenantAccountId } from "@/lib/auth/single-tenant";

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role: string | null;
  beta_features: string[];
  account_id: string | null;
  account_role: AccountRole | null;
}

interface AccountSummary {
  id: string;
  name: string;
  default_currency: string;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  accountId: string | null;
  accountRole: AccountRole | null;
  account: AccountSummary | null;
  defaultCurrency: string;
  isOwner: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isViewer: boolean;
  canManageMembers: boolean;
  canEditSettings: boolean;
  canSendMessages: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function syntheticOwner(accountId: string, accountName = "My Business") {
  const account: AccountSummary = {
    id: accountId,
    name: accountName,
    default_currency: DEFAULT_CURRENCY,
  };
  const profile: Profile = {
    id: accountId,
    full_name: "Business Owner",
    email: "owner@business.local",
    avatar_url: null,
    role: "owner",
    beta_features: [],
    account_id: accountId,
    account_role: "owner",
  };
  const user = {
    id: "a0000000-0000-4000-8000-000000000002",
    email: "owner@business.local",
    app_metadata: {},
    user_metadata: { full_name: "Business Owner" },
    aud: "authenticated",
    created_at: new Date(0).toISOString(),
  } as User;

  return {
    user,
    profile,
    account,
    accountId,
    accountRole: "owner" as const,
    isOwner: true,
    isAdmin: false,
    isAgent: false,
    isViewer: false,
    canManageMembers: true,
    canEditSettings: true,
    canSendMessages: true,
    defaultCurrency: DEFAULT_CURRENCY,
  };
}

/**
 * Single-tenant AuthProvider — no login UI. Bootstraps an invisible
 * Supabase session so RLS still works for inbox/contacts.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const accountId = getPublicSingleTenantAccountId();
  const base = syntheticOwner(accountId);
  const [user, setUser] = useState<User | null>(base.user);
  const [loading, setLoading] = useState(true);
  const [accountName, setAccountName] = useState("My Business");

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    (async () => {
      try {
        const res = await fetch("/api/mvp/session");
        if (!res.ok) throw new Error("session bootstrap failed");
        const body = (await res.json()) as {
          access_token: string;
          refresh_token: string;
        };
        const { data, error } = await supabase.auth.setSession({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
        });
        if (error) throw error;
        if (mounted && data.user) {
          setUser(data.user);
          const { data: acct } = await supabase
            .from("accounts")
            .select("name")
            .eq("id", accountId)
            .maybeSingle();
          if (acct?.name) setAccountName(acct.name);
        }
      } catch (err) {
        console.warn("[AuthProvider] MVP session bootstrap:", err);
        // Keep synthetic owner so the UI still renders.
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [accountId]);

  const refreshProfile = useCallback(async () => {}, []);
  const signOut = useCallback(async () => {}, []);

  const value = useMemo<AuthContextValue>(() => {
    const syn = syntheticOwner(accountId, accountName);
    return {
      ...syn,
      user: user ?? syn.user,
      loading,
      profileLoading: loading,
      signOut,
      refreshProfile,
    };
  }, [accountId, accountName, user, loading, signOut, refreshProfile]);

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    const syn = syntheticOwner(getPublicSingleTenantAccountId());
    return {
      ...syn,
      loading: false,
      profileLoading: false,
      signOut: async () => {},
      refreshProfile: async () => {},
    };
  }
  return ctx;
}
