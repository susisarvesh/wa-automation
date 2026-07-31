"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import type { AccountRole } from "@/lib/auth/roles";
import {
  getPublicSingleTenantAccountId,
  type AccessGrantStatus,
} from "@/lib/auth/single-tenant";

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
  accessStatus: AccessGrantStatus | null;
  isAccessApproved: boolean;
  isPlatformAdmin: boolean;
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

function workspaceAccount(accountId: string, name = "My Business"): AccountSummary {
  return {
    id: accountId,
    name,
    default_currency: DEFAULT_CURRENCY,
  };
}

function syntheticOwner(accountId: string, accountName = "My Business") {
  const account = workspaceAccount(accountId, accountName);
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
    accessStatus: "approved" as const,
    isAccessApproved: true,
    isPlatformAdmin: false,
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

function clientIsPlatformAdmin(email: string | undefined | null): boolean {
  const raw =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS ||
    "vsmarttechindia@gmail.com";
  if (!email) return false;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

/**
 * AuthProvider — Google session (default) or open-demo MVP bootstrap.
 * Never await profile fetches inside onAuthStateChange (holds auth lock).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const demoAccountId = getPublicSingleTenantAccountId();
  const openDemo = isOpenDemoClient();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [accessStatus, setAccessStatus] = useState<AccessGrantStatus | null>(
    openDemo ? "approved" : null,
  );
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const profileReq = useRef(0);

  const loadProfile = useCallback(async (u: User) => {
    const req = ++profileReq.current;
    setProfileLoading(true);
    try {
      const supabase = createClient();
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select(
          "id, full_name, email, avatar_url, role, beta_features, account_id, account_role",
        )
        .eq("user_id", u.id)
        .maybeSingle();

      if (req !== profileReq.current) return;

      if (profErr) {
        console.warn("[AuthProvider] profile:", profErr.message);
      }

      const { data: grant } = await supabase
        .from("access_grants")
        .select("status")
        .eq("user_id", u.id)
        .maybeSingle();

      if (req !== profileReq.current) return;

      if (grant?.status) {
        setAccessStatus(grant.status as AccessGrantStatus);
      } else if (clientIsPlatformAdmin(u.email)) {
        setAccessStatus("approved");
      } else {
        setAccessStatus("pending");
      }

      if (!prof?.account_id) {
        setProfile(null);
        setAccount(null);
        return;
      }

      const p: Profile = {
        id: prof.id as string,
        full_name: (prof.full_name as string) ?? null,
        email: (prof.email as string) || u.email || "",
        avatar_url: (prof.avatar_url as string) ?? null,
        role: (prof.role as string) ?? null,
        beta_features: (prof.beta_features as string[]) ?? [],
        account_id: prof.account_id as string,
        account_role: (prof.account_role as AccountRole) ?? "owner",
      };
      setProfile(p);

      const { data: acct } = await supabase
        .from("accounts")
        .select("id, name, default_currency")
        .eq("id", p.account_id!)
        .maybeSingle();

      if (req !== profileReq.current) return;

      setAccount({
        id: p.account_id!,
        name: (acct?.name as string) || "My Business",
        default_currency:
          (acct?.default_currency as string) || DEFAULT_CURRENCY,
      });
    } catch (err) {
      console.warn("[AuthProvider] loadProfile:", err);
    } finally {
      if (req === profileReq.current) setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    if (openDemo) {
      (async () => {
        try {
          await supabase.auth.signOut({ scope: "local" }).catch(() => {});
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
        } catch (err) {
          console.warn("[AuthProvider] bootstrap:", err);
          if (mounted) {
            const syn = syntheticOwner(demoAccountId);
            setUser(syn.user);
            setProfile(syn.profile);
            setAccount(syn.account);
            setAccessStatus("approved");
            setProfileLoading(false);
          }
        } finally {
          if (mounted) setLoading(false);
        }
      })();
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      if (!openDemo) setLoading(false);
      if (u) {
        void loadProfile(u);
      } else {
        setProfile(null);
        setAccount(null);
        setAccessStatus(null);
        setProfileLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [openDemo, demoAccountId, loadProfile]);

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
      const syn = syntheticOwner(demoAccountId, account?.name);
      return {
        ...syn,
        user: user ?? syn.user,
        account: account ?? syn.account,
        loading,
        profileLoading: loading || profileLoading,
        signOut,
        refreshProfile,
      };
    }

    const role = profile?.account_role ?? (user ? "owner" : null);
    const flags = roleFlags(role);
    const approved = accessStatus === "approved" || openDemo;
    const email = profile?.email || user?.email;

    return {
      user,
      profile,
      loading,
      profileLoading,
      signOut,
      refreshProfile,
      accountId: account?.id ?? profile?.account_id ?? null,
      accountRole: role,
      account,
      defaultCurrency: account?.default_currency ?? DEFAULT_CURRENCY,
      accessStatus,
      isAccessApproved: approved,
      isPlatformAdmin: clientIsPlatformAdmin(email),
      ...flags,
      // Product writes also need grant — expose capability flags accordingly
      canEditSettings: flags.canEditSettings && approved,
      canSendMessages: flags.canSendMessages && approved,
    };
  }, [
    openDemo,
    demoAccountId,
    user,
    profile,
    account,
    loading,
    profileLoading,
    accessStatus,
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
