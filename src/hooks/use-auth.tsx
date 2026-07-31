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

function isOpenDemoClient(): boolean {
  return (
    (process.env.NEXT_PUBLIC_AUTH_PROVIDER || "google").toLowerCase() ===
    "none"
  );
}

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

function roleFlags(role: AccountRole | null) {
  const isOwner = role === "owner";
  const isAdmin = role === "admin";
  const isAgent = role === "agent";
  const isViewer = role === "viewer";
  return {
    isOwner,
    isAdmin,
    isAgent,
    isViewer,
    canManageMembers: isOwner || isAdmin,
    canEditSettings: isOwner || isAdmin,
    canSendMessages: isOwner || isAdmin || isAgent,
  };
}

/**
 * AuthProvider — Google session (default) or open-demo MVP bootstrap.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const fixedAccountId = getPublicSingleTenantAccountId();
  const openDemo = isOpenDemoClient();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(
    async (u: User) => {
      const supabase = createClient();
      const { data: prof } = await supabase
        .from("profiles")
        .select(
          "id, full_name, email, avatar_url, role, beta_features, account_id, account_role",
        )
        .eq("user_id", u.id)
        .maybeSingle();

      if (!prof) {
        setProfile(null);
        setAccount({
          id: fixedAccountId,
          name: "My Business",
          default_currency: DEFAULT_CURRENCY,
        });
        return;
      }

      const p: Profile = {
        id: prof.id as string,
        full_name: (prof.full_name as string) ?? null,
        email: (prof.email as string) || u.email || "",
        avatar_url: (prof.avatar_url as string) ?? null,
        role: (prof.role as string) ?? null,
        beta_features: (prof.beta_features as string[]) ?? [],
        account_id: (prof.account_id as string) ?? fixedAccountId,
        account_role: (prof.account_role as AccountRole) ?? "owner",
      };
      setProfile(p);

      const acctId = p.account_id ?? fixedAccountId;
      const { data: acct } = await supabase
        .from("accounts")
        .select("id, name, default_currency")
        .eq("id", acctId)
        .maybeSingle();

      setAccount({
        id: acctId,
        name: (acct?.name as string) || "My Business",
        default_currency:
          (acct?.default_currency as string) || DEFAULT_CURRENCY,
      });
    },
    [fixedAccountId],
  );

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    (async () => {
      try {
        if (openDemo) {
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
            await loadProfile(data.user);
          }
        } else {
          const {
            data: { user: u },
          } = await supabase.auth.getUser();
          if (mounted) {
            setUser(u);
            if (u) await loadProfile(u);
          }
        }
      } catch (err) {
        console.warn("[AuthProvider] bootstrap:", err);
        if (openDemo && mounted) {
          const syn = syntheticOwner(fixedAccountId);
          setUser(syn.user);
          setProfile(syn.profile);
          setAccount(syn.account);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      if (u) await loadProfile(u);
      else {
        setProfile(null);
        if (!openDemo) setAccount(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [openDemo, fixedAccountId, loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user);
  }, [user, loadProfile]);

  const signOut = useCallback(async () => {
    if (openDemo) return;
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, [openDemo]);

  const value = useMemo<AuthContextValue>(() => {
    if (openDemo && !profile) {
      const syn = syntheticOwner(fixedAccountId, account?.name);
      return {
        ...syn,
        user: user ?? syn.user,
        account: account ?? syn.account,
        loading,
        profileLoading: loading,
        signOut,
        refreshProfile,
      };
    }

    const role = profile?.account_role ?? null;
    const flags = roleFlags(role);

    return {
      user,
      profile,
      loading,
      profileLoading: loading,
      signOut,
      refreshProfile,
      accountId: account?.id ?? profile?.account_id ?? null,
      accountRole: role,
      account,
      defaultCurrency: account?.default_currency ?? DEFAULT_CURRENCY,
      ...flags,
    };
  }, [
    openDemo,
    fixedAccountId,
    user,
    profile,
    account,
    loading,
    signOut,
    refreshProfile,
  ]);

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
