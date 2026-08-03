"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Loader2, MessageSquareText, Sparkles, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

function LoginForm() {
  const search = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const e = search.get("error");
    if (!e) return null;
    if (e === "oauth_failed") return "Google sign-in failed. Try again.";
    if (e === "missing_code") return "Sign-in was cancelled.";
    return decodeURIComponent(e);
  });

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const next = search.get("next") || "/home";
      const origin = window.location.origin;
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (oauthErr) throw oauthErr;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not start Google sign-in. Please try again.",
      );
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-12 px-6 py-12 lg:flex-row lg:items-center lg:gap-20 lg:px-10 lg:py-16">
      {/* Brand column — hero signal */}
      <section className="login-rise flex-1 space-y-8 lg:max-w-xl">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/vsmart-mark.png"
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 object-contain"
            priority
          />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Vsmart Technologies
            </p>
            <p className="text-sm text-muted-foreground">Taking future ahead</p>
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="font-heading text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem]">
            WhatsApp Studio
          </h1>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
            Campaigns, inbox, and automations for teams that live on WhatsApp —
            built for Vsmart CRM.
          </p>
        </div>

        <ul className="hidden gap-6 sm:flex">
          {[
            { icon: MessageSquareText, label: "Shared inbox" },
            { icon: Users, label: "CSV campaigns" },
            { icon: Sparkles, label: "Automations" },
          ].map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center gap-2 text-sm text-foreground/80"
            >
              <span className="vsmart-shape flex h-8 w-8 items-center justify-center bg-primary/10 text-primary">
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </section>

      {/* Sign-in — interaction container */}
      <section className="login-rise-delay w-full max-w-md shrink-0">
        <div className="vsmart-shape border border-border/80 bg-card/90 p-8 backdrop-blur-sm sm:p-9">
          <div className="mb-7 space-y-2">
            <h2 className="font-heading text-xl font-semibold tracking-tight">
              Sign in
            </h2>
            <p className="text-sm text-muted-foreground">
              Use your Google work account. No password to manage.
            </p>
          </div>

          {error ? (
            <p
              role="alert"
              className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <Button
            size="lg"
            className="h-12 w-full gap-2.5 text-[15px] font-medium"
            onClick={signInWithGoogle}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GoogleIcon className="h-4 w-4" />
            )}
            Continue with Google
          </Button>

          <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
            By continuing you agree to access WhatsApp Studio for your
            workspace. Need access? Ask a Vsmart admin.
          </p>
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
